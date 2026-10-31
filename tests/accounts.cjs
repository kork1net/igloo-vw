const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const { Accounts } = require('../server/accounts.cjs');
const economy = require('../server/economy.json');

const directory = fs.mkdtempSync(path.join(__dirname, '.accounts-'));
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json');
process.env.VW_PORT = '0';
const { io } = require('../server/index.cjs');
const clients = [];
const password = 'test-password-123';

async function client(auth) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, {
        auth, reconnection: false, timeout: 2000, transports: ['websocket']
    });
    clients.push(socket);
    return socket;
}
function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${name}`)), 4000);
        socket.once(name, data => { clearTimeout(timer); resolve(data); });
    });
}
function request(socket, name, data) {
    return new Promise((resolve, reject) => {
        const reply = (error, response) => error ? reject(error) : resolve(response);
        if (data === undefined) socket.timeout(5000).emit(name, reply);
        else socket.timeout(5000).emit(name, data, reply);
    });
}

(async () => {
    const account = await client({ account: true });
    await event(account, 'connect');
    const registered = await request(account, 'auth:register', { username: 'Alice', password });
    assert.equal(registered.ok, true);
    assert.equal(registered.user.username, 'Alice');
    assert.equal(registered.token.length, 64);
    assert.deepEqual(registered.inventory.items, ['body-color/white']);
    assert.equal(registered.inventory.equipped.bodyColor, 'body-color/white');
    assert.deepEqual(Object.keys(registered.user).sort(), ['gender', 'id', 'isAdmin', 'starterColor', 'username']);
    assert.equal(registered.user.gender, 'male');
    assert.equal((await request(account, 'auth:register', { username: 'BadGender', password, gender: 'invalid' })).ok, false);
    assert.equal(registered.user.isAdmin, false);
    const duplicate = await request(account, 'auth:register', { username: ' alice ', password });
    assert.equal(duplicate.ok, false);
    const wrong = await request(account, 'auth:login', { username: 'Alice', password: 'wrong-password' });
    assert.equal(wrong.ok, false);
    const login = await request(account, 'auth:login', { username: 'ALICE', password });
    assert.equal(login.ok, true);
    const resumed = await request(account, 'auth:resume', login.token);
    assert.equal(resumed.user.username, 'Alice');
    const invalid = await request(account, 'auth:register', { username: '<bad>', password });
    assert.equal(invalid.ok, false);
    assert.equal((await request(account, 'auth:register', {
        username: 'InvalidColor', password, starterColor: 'body-color/purple'
    })).ok, false);
    const concurrent = await Promise.all([
        request(account, 'auth:register', { username: 'Concurrent', password }),
        request(account, 'auth:register', { username: 'concurrent', password })
    ]);
    assert.equal(concurrent.filter(result => result.ok).length, 1);

    const persisted = new Accounts(process.env.VW_ACCOUNTS_FILE);
    assert.equal((await persisted.login({ username: 'alice', password })).user.username, 'Alice');
    const contents = fs.readFileSync(process.env.VW_ACCOUNTS_FILE, 'utf8');
    assert.ok(!contents.includes(password));
    const stored = JSON.parse(contents).users;
    assert.equal(stored.length, 2);
    assert.equal(stored[0].hash.length, 128);

    const anonymous = await client({});
    await event(anonymous, 'authRequired');
    const game = await client({ token: login.token, room: 'Game', player: { username: 'Koko', isAdmin: true } });
    const players = await event(game, 'currentPlayers');
    assert.equal(players[game.id].username, 'Alice');
    assert.equal(players[game.id].isAdmin, false);
    const admin = await request(account, 'auth:register', { username: 'Koko', password });
    assert.equal(admin.user.isAdmin, true);
    const catalog = require('../scripts/item-catalog.cjs').buildCatalog();
    assert.equal(admin.inventory.items.length, catalog.items.length);
    const adminSocket = await client({ token: admin.token, room: 'Game' });
    const adminPlayers = await event(adminSocket, 'currentPlayers');
    assert.equal(adminPlayers[adminSocket.id].isAdmin, true);
    const observer = await client({ token: registered.token, room: 'Game' });
    await event(observer, 'currentPlayers');
    assert.equal((await request(game, 'admin:items', {})).ok, false);
    assert.equal((await request(game, 'admin:setItemRarity', { itemId: 'body-color/blue', rarity: 'S' })).ok, false);
    const adminItems = await request(adminSocket, 'admin:items', {});
    assert.equal(adminItems.ok, true);
    assert.ok(adminItems.items.every(item => item.rarity === 'C'));
    assert.equal((await request(adminSocket, 'admin:setItemRarity', { itemId: 'missing', rarity: 'S' })).ok, false);
    assert.equal((await request(adminSocket, 'admin:setItemRarity', { itemId: 'body-color/blue', rarity: 'X' })).ok, false);
    const rarityUpdate = event(observer, 'itemRaritiesUpdated');
    assert.equal((await request(adminSocket, 'admin:setItemRarity', { itemId: 'body-color/blue', rarity: 'S' })).ok, true);
    assert.equal((await rarityUpdate)['body-color/blue'], 'S');
    const { Rarities } = require('../server/rarities.cjs');
    assert.equal(new Rarities(process.env.VW_ACCOUNTS_FILE + '.rarities.json').snapshot()['body-color/blue'], 'S');
    const moved = event(observer, 'playerMoved');
    game.emit('playerMove', { x: 200, y: 200, username: 'Spoofed' });
    assert.equal((await moved).username, 'Alice');
    const shop = await client({ token: login.token, room: 'Shop' });
    const shopPlayers = await event(shop, 'currentPlayers');
    assert.equal(shopPlayers[shop.id].username, 'Alice');
    assert.ok(!shopPlayers[game.id]);
    const shirt = catalog.items.find(item => item.slot === 'shirt').id;
    assert.equal((await request(game, 'inventory:equip', { itemId: shirt, equip: true })).ok, false);
    assert.equal((await request(game, 'shop:purchase', { itemId: shirt })).ok, false);
    const listing = await request(shop, 'shop:catalog', {});
    assert.equal(listing.ok, true);
    assert.ok(listing.items.every(item => item.price === 10));
    assert.ok(listing.items.some(item => item.id === 'body-color/white'));
    for (const id of ['shirt/red-dress', 'shirt/red-dress--blue', 'shirt/red-dress--green', 'shirt/red-dress--purple']) {
        assert.ok(listing.items.some(item => item.id === id));
    }
    const synced = event(observer, 'inventoryUpdated');
    const purchases = await Promise.all([
        request(shop, 'shop:purchase', { itemId: shirt, price: 0 }),
        request(shop, 'shop:purchase', { itemId: shirt, price: -100 })
    ]);
    assert.equal(purchases.filter(result => result.ok).length, 1);
    assert.equal((await synced).currency, economy.startingCurrency - economy.itemPrice);
    const equipped = await request(shop, 'inventory:equip', { itemId: shirt, equip: true });
    assert.equal(equipped.inventory.equipped.shirt, shirt);
    assert.equal(equipped.inventory.currency, economy.startingCurrency - economy.itemPrice);
    const relogin = await request(account, 'auth:login', { username: 'Alice', password });
    assert.equal(relogin.inventory.equipped.shirt, shirt);
    assert.equal(relogin.inventory.items.includes(shirt), true);
    assert.equal(relogin.inventory.currency, economy.startingCurrency - economy.itemPrice);
    const bob = await request(account, 'auth:register', {
        username: 'OtherPlayer', password, starterColor: 'body-color/pink', gender: 'female'
    });
    assert.deepEqual(bob.inventory.items, ['body-color/pink']);
    assert.equal(bob.inventory.equipped.bodyColor, 'body-color/pink');
    assert.equal((await persisted.login({ username: 'alice', password })).user.starterColor, 'body-color/white');
    const restoredAccounts = new Accounts(process.env.VW_ACCOUNTS_FILE);
    assert.equal((await restoredAccounts.login({ username: 'OtherPlayer', password })).user.starterColor, 'body-color/pink');
    assert.equal((await restoredAccounts.login({ username: 'OtherPlayer', password })).user.gender, 'female');
    const female = await client({ token: bob.token, room: 'Game', player: { gender: 'male' } });
    const femalePlayers = await event(female, 'currentPlayers');
    assert.equal(femalePlayers[female.id].gender, 'female');
    const movedAgain = event(observer, 'playerMoved');
    game.emit('playerMove', { x: 210, y: 210, currency: 999999, equipped: { shirt: null } });
    assert.equal((await movedAgain).equipped.shirt, shirt);
    await request(game, 'auth:logout');
    assert.equal((await request(account, 'auth:resume', login.token)).ok, false);
    console.log('PASS: registration, case-insensitive and concurrent duplicates, login, persistence, hashing, sessions, access control, identity, rooms, logout');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(__dirname).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('.accounts-'));
    fs.rmSync(resolved, { recursive: true });
});
