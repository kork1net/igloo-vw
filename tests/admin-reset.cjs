const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const { chain } = require('../server/quests.cjs');
const economy = require('../server/economy.json');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-admin-reset-'));
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json');
process.env.VW_PORT = '0';
const { io } = require('../server/index.cjs');
const clients = [];
function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`Missing ${name}`)), 4000);
        socket.once(name, value => { clearTimeout(timer); resolve(value); });
    });
}
function request(socket, name, data) {
    return new Promise((resolve, reject) => socket.timeout(4000).emit(name, data, (error, result) => error ? reject(error) : resolve(result)));
}
async function account(action, data) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, { auth: { account: true }, autoConnect: false, reconnection: false });
    clients.push(socket); const ready = event(socket, 'connect'); socket.connect(); await ready;
    const result = await request(socket, `auth:${action}`, data);
    assert.equal(result.ok, true); socket.disconnect(); return result;
}
async function player(auth, room = 'Game') {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, { auth: { token: auth.token, room }, autoConnect: false, reconnection: false });
    clients.push(socket); const initial = event(socket, 'inventoryUpdated'); socket.connect();
    return { socket, inventory: await initial };
}
(async () => {
    try {
        const store = new Inventories(path.join(directory, 'unit')), catalog = buildCatalog();
        const user = { id: 'unit-user', username: 'Player', starterColor: 'body-color/blue' };
        const admin = { id: 'unit-admin', username: 'Koko', isAdmin: true };
        const reset = { id: 'unit-reset-001', confirmUsername: 'Player' };
        const baseline = store.snapshot(user, catalog);
        const oldGift = { id: 'old-gift-receipt', kind: 'currency', amount: 30 };
        store.grant(user, admin, oldGift);
        store.persist(user, { ...store.load(user), currency: 999, rankingPoints: 999, snowBest: 888,
            quests: { old: true }, lastSnowRound: { id: 'old-round' }, futureProgress: true });
        const before = structuredClone(store.load(user));
        assert.throws(() => store.resetPlayer(user, user, reset, catalog));
        assert.throws(() => store.resetPlayer(user, admin, { ...reset, confirmUsername: 'Other' }, catalog));
        const rename = fs.renameSync;
        try {
            fs.renameSync = () => { throw Error('Disk write failed'); };
            assert.throws(() => store.resetPlayer(user, admin, reset, catalog));
        } finally { fs.renameSync = rename; }
        assert.deepEqual(store.load(user), before);
        assert.equal(store.resetPlayer(user, admin, reset, catalog).reset, true);
        const clean = store.snapshot(user, catalog);
        for (const field of ['items', 'quantities', 'equipped', 'currency', 'rankingPoints', 'snowBest', 'quests', 'adminGifts']) {
            assert.deepEqual(clean[field], baseline[field], field);
        }
        assert.equal(store.load(user).futureProgress, undefined);
        store.grant(user, admin, oldGift);
        assert.equal(store.snapshot(user, catalog).currency, baseline.currency);
        assert.deepEqual(store.snapshot(user, catalog).adminGifts, []);
        store.grant(user, admin, { id: 'after-reset-gift', kind: 'currency', amount: 12 });
        const restarted = new Inventories(path.join(directory, 'unit'));
        assert.equal(restarted.resetPlayer(user, admin, reset, catalog).reset, false);
        assert.equal(restarted.snapshot(user, catalog).currency, baseline.currency + 12);

        const credentials = { password: 'reset-test-password-123' };
        const adminAuth = await account('register', { ...credentials, username: 'Koko' });
        const auth = await account('register', { ...credentials, username: 'ResetPlayer', gender: 'female', starterColor: 'body-color/blue' });
        const manager = await player(adminAuth), target = await player(auth), secondTab = await player(auth, 'Shop');
        assert.equal((await request(target.socket, 'admin:resetPlayer', { username: 'Koko', confirmUsername: 'Koko', id: 'forbidden-reset' })).ok, false);
        await request(manager.socket, 'admin:grant', { username: 'ResetPlayer', kind: 'both', amount: 500, rankingAmount: 400, id: 'setup-gift-001' });
        const shop = await request(secondTab.socket, 'shop:catalog', {});
        const item = shop.items.find(entry => !entry.id.startsWith('body-color/'));
        assert.equal((await request(secondTab.socket, 'shop:purchase', { itemId: item.id })).ok, true);
        assert.equal((await request(target.socket, 'quest:accept', { chainId: chain.id })).ok, true);
        const trade = await request(manager.socket, 'trade:request', { targetId: target.socket.id });
        assert.equal(trade.ok, true);
        const cancelled = event(manager.socket, 'trade:closed');
        const disconnected = [event(target.socket, 'disconnect'), event(secondTab.socket, 'disconnect')];
        const requestData = { username: 'resetplayer', confirmUsername: 'ResetPlayer', id: 'reset-player-001' };
        assert.equal((await request(manager.socket, 'admin:resetPlayer', requestData)).ok, true);
        await cancelled; await Promise.all(disconnected);
        const login = await account('login', { ...credentials, username: 'ResetPlayer' });
        assert.equal(login.user.gender, 'female'); assert.equal(login.user.id, auth.user.id);
        const returned = await player(login);
        assert.equal(returned.inventory.currency, economy.startingCurrency);
        assert.deepEqual(returned.inventory.items, ['body-color/blue']);
        assert.equal(returned.inventory.rankingPoints, 0); assert.equal(returned.inventory.snowBest, 0);
        assert.deepEqual(returned.inventory.quests, baseline.quests);
        await request(manager.socket, 'admin:grant', { username: 'ResetPlayer', kind: 'currency', amount: 12, id: 'after-reset-001' });
        assert.equal((await request(manager.socket, 'admin:resetPlayer', requestData)).ok, true);
        assert.equal(returned.socket.connected, true);
        assert.equal((await request(returned.socket, 'shop:catalog', {})).ok, false);
        assert.equal((await request(returned.socket, 'snow:start', {})).ok, true);
        const leftGame = event(returned.socket, 'disconnect');
        assert.equal((await request(manager.socket, 'admin:resetPlayer', { ...requestData, id: 'reset-player-002' })).ok, true);
        await leftGame;
        const finalLogin = await account('login', { ...credentials, username: 'ResetPlayer' });
        const final = await player(finalLogin);
        assert.equal(final.inventory.currency, economy.startingCurrency);
        assert.equal((await request(final.socket, 'snow:start', {})).ok, true);
        console.log('PASS admin reset: permissions, confirmation, fresh profile, write failure rollback, persisted idempotency, offline data, both tabs disconnected, trade/minigame cancelled, identity retained');
    } finally {
        clients.forEach(socket => socket.disconnect());
        await new Promise(resolve => io.close(resolve));
        assert.equal(path.dirname(fs.realpathSync(directory)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
        fs.rmSync(directory, { recursive: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
