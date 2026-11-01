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
function event(socket, name, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${name}`)), 4000);
        const listener = data => {
            if (!predicate(data)) return;
            clearTimeout(timer); socket.off(name, listener); resolve(data);
        };
        socket.on(name, listener);
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
    const game = await client({ token: login.token, room: 'Game', player: { username: 'Koko', isAdmin: true, level: 3 } });
    const players = await event(game, 'currentPlayers');
    assert.equal(players[game.id].username, 'Alice');
    assert.equal(players[game.id].isAdmin, false);
    assert.equal(players[game.id].level, 1);
    const admin = await request(account, 'auth:register', { username: 'Koko', password });
    assert.equal(admin.user.isAdmin, true);
    assert.equal(admin.inventory.level, 3);
    assert.equal(admin.inventory.rankingPoints, 0);
    assert.equal(admin.inventory.pointsToNextLevel, 0);
    const catalog = require('../scripts/item-catalog.cjs').buildCatalog();
    assert.equal(admin.inventory.items.length, catalog.items.length);
    const adminSocket = await client({ token: admin.token, room: 'Game' });
    const adminPlayers = await event(adminSocket, 'currentPlayers');
    assert.equal(adminPlayers[adminSocket.id].isAdmin, true);
    assert.equal(adminPlayers[adminSocket.id].level, 3);
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
    const cafe = await client({ token: login.token, room: 'Cafe' });
    const cafePlayers = await event(cafe, 'currentPlayers');
    assert.equal(cafePlayers[cafe.id].room, 'Cafe');
    assert.ok(!cafePlayers[game.id] && !cafePlayers[shop.id]);
    const cafeGuest = await client({ token: registered.token, room: 'Cafe' });
    assert.ok((await event(cafeGuest, 'currentPlayers'))[cafe.id]);
    const cafeMove = event(cafeGuest, 'playerMoved');
    cafe.emit('playerMove', { x: 700, y: 500 });
    assert.equal((await cafeMove).id, cafe.id);
    assert.equal((await request(cafe, 'shop:catalog', {})).ok, false);
    assert.equal((await request(cafe, 'snow:start', {})).ok, false);
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
    assert.equal(purchases.filter(result => result.ok).length, 2);
    assert.equal((await synced).currency, economy.startingCurrency - economy.itemPrice);
    const equipped = await request(shop, 'inventory:equip', { itemId: shirt, equip: true });
    assert.equal(equipped.inventory.equipped.shirt, shirt);
    assert.equal(equipped.inventory.currency, economy.startingCurrency - 2 * economy.itemPrice);
    assert.equal(equipped.inventory.quantities[shirt], 2);
    const relogin = await request(account, 'auth:login', { username: 'Alice', password });
    assert.equal(relogin.inventory.equipped.shirt, shirt);
    assert.equal(relogin.inventory.items.includes(shirt), true);
    assert.equal(relogin.inventory.currency, economy.startingCurrency - 2 * economy.itemPrice);
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
    assert.equal((await request(shop, 'snow:start', {})).ok, false);
    assert.equal((await request(shop, 'minigame:presence', { game: 'snow-catch', active: true })).ok, false);
    assert.equal((await request(game, 'minigame:presence', { game: 'unknown', active: true })).ok, false);
    const presence = event(observer, 'playerMoved');
    const snow = await request(game, 'snow:start', {});
    assert.equal((await presence).minigame, 'snow-catch');
    assert.equal(snow.ok, true);
    assert.equal(snow.state.phase, 'playing');
    assert.equal((await request(observer, 'snow:start', {})).ok, false);
    const forged = await request(game, 'snow:state', { score: 1000000, coins: 1000000 });
    assert.equal(forged.state.score, 0);
    assert.equal(forged.state.result, null);
    const leftMinigame = event(observer, 'playerMoved');
    assert.equal((await request(game, 'snow:cancel', { id: snow.state.id })).ok, true);
    assert.equal((await leftMinigame).minigame, null);
    assert.equal((await request(game, 'snow:state', {})).ok, false);
    const afterCancel = await request(account, 'auth:login', { username: 'Alice', password });
    assert.equal(afterCancel.inventory.currency, relogin.inventory.currency);
    assert.equal(afterCancel.inventory.rankingPoints, 0);
    assert.equal((await request(shop, 'quest:accept', { chainId: 'leo-welcome' })).ok, false);
    assert.equal((await request(game, 'quest:claim', { chainId: 'leo-welcome', stepId: 'first-purchase' })).ok, false);
    assert.equal((await request(game, 'quest:accept', { chainId: 'invalid' })).ok, false);
    assert.equal((await request(game, 'quest:accept', { chainId: 'leo-welcome' })).ok, true);
    const questSync = event(observer, 'inventoryUpdated', inventory => inventory.quests?.['leo-welcome']?.claimedSteps === 1);
    const questReward = await request(game, 'quest:claim', { chainId: 'leo-welcome', stepId: 'first-purchase', coins: 999999 });
    assert.equal(questReward.ok, true);
    assert.deepEqual(questReward.questReward, { coins: 5, rankingPoints: 5, itemId: null });
    assert.equal(questReward.inventory.currency, afterCancel.inventory.currency + 5);
    assert.equal(questReward.inventory.rankingPoints, 5);
    assert.equal((await questSync).quests['leo-welcome'].claimedSteps, 1);
    assert.equal((await request(game, 'quest:claim', { chainId: 'leo-welcome', stepId: 'first-purchase' })).ok, false);
    assert.equal((await request(game, 'quest:claim', { chainId: 'leo-welcome', stepId: 'snow-catch' })).ok, false);
    assert.equal((await request(game, 'admin:grant', { id: 'grant-denied-001', username: 'Alice', kind: 'currency', amount: 10 })).ok, false);
    assert.equal((await request(adminSocket, 'admin:grant', { id: 'grant-unknown-001', username: 'MissingPlayer', kind: 'currency', amount: 10 })).ok, false);
    const grantUpdate = event(observer, 'inventoryUpdated');
    const giftRequest = { id: 'grant-live-001', username: 'aLiCe', kind: 'currency', amount: 17, senderName: 'Spoofed' };
    const giftResult = await request(adminSocket, 'admin:grant', giftRequest);
    assert.equal(giftResult.ok, true);
    assert.equal(giftResult.gift.senderName, 'Koko');
    assert.ok(!giftResult.inventory);
    const giftedInventory = await grantUpdate;
    assert.equal(giftedInventory.currency, questReward.inventory.currency + 17);
    assert.equal(giftedInventory.adminGifts[0].id, giftRequest.id);
    assert.equal((await request(adminSocket, 'admin:grant', giftRequest)).ok, true);
    const acknowledgeGift = await request(game, 'admin:ackGift', { id: giftRequest.id, senderId: admin.user.id });
    assert.equal(acknowledgeGift.inventory.adminGifts.length, 0);
    assert.equal(acknowledgeGift.inventory.currency, giftedInventory.currency);
    const offline = await request(account, 'auth:register', { username: 'OfflineGift', password });
    assert.equal((await request(adminSocket, 'admin:grant', { id: 'grant-offline-001', username: offline.user.username, kind: 'rankingPoints', amount: 260 })).ok, true);
    const offlineLogin = await request(account, 'auth:resume', offline.token);
    assert.equal(offlineLogin.inventory.rankingPoints, 260);
    assert.equal(offlineLogin.inventory.level, 3);
    assert.equal(offlineLogin.inventory.adminGifts.length, 1);
    const shopOnly = await request(account, 'auth:register', { username: 'ShopOnly', password });
    const shopOnlySocket = await client({ token: shopOnly.token, room: 'Shop' });
    await event(shopOnlySocket, 'currentPlayers');
    const roomGift = { id: 'grant-room-001', scope: 'room', room: 'Cafe', username: 'MissingPlayer', kind: 'both', amount: 13, rankingAmount: 11 };
    assert.equal((await request(game, 'admin:grant', roomGift)).ok, false);
    const roomGrant = await request(adminSocket, 'admin:grant', roomGift);
    assert.equal(roomGrant.ok, true);
    assert.equal(roomGrant.recipientCount, 3);
    const aliceGifted = await request(account, 'auth:resume', registered.token);
    assert.equal(aliceGifted.inventory.currency, giftedInventory.currency + 13);
    assert.equal(aliceGifted.inventory.rankingPoints, questReward.inventory.rankingPoints + 11);
    assert.equal((await request(account, 'auth:resume', shopOnly.token)).inventory.currency, shopOnly.inventory.currency);
    const latePlayer = await client({ token: offline.token, room: 'Game' });
    await event(latePlayer, 'currentPlayers');
    assert.equal((await request(adminSocket, 'admin:grant', roomGift)).recipientCount, 3);
    assert.equal((await request(account, 'auth:resume', offline.token)).inventory.rankingPoints, 260);
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
