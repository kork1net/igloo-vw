const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { io: connect } = require('socket.io-client');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-vanish-'));
process.env.VW_PORT = '0';
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json');
const { io } = require('../server/index.cjs');
const clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function client(auth) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, {
        auth, reconnection: false, transports: ['websocket']
    });
    clients.push(socket);
    return socket;
}
function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), 3000);
        socket.once(name, value => { clearTimeout(timer); resolve(value); });
    });
}
function request(socket, name, data) {
    return new Promise((resolve, reject) => socket.timeout(3000).emit(name, data,
        (error, result) => error ? reject(error) : resolve(result)));
}
(async () => {
    const account = client({ account: true }); await event(account, 'connect');
    const register = username => request(account, 'auth:register', { username, password: 'test-password-123' });
    const admin = await register('Koko'), ordinary = await register('Observer');
    assert.equal(admin.user.isAdmin, true);
    const observer = client({ token: ordinary.token, room: 'Game' }); await event(observer, 'currentPlayers');
    const manager = client({ token: admin.token, room: 'Game' }); await event(manager, 'currentPlayers');
    assert.equal((await request(observer, 'admin:vanish', { active: true })).ok, false);
    const left = event(observer, 'playerLeft');
    assert.equal((await request(manager, 'admin:vanish', { active: true })).ok, true);
    assert.equal(await left, manager.id);
    const leaked = [];
    for (const name of ['playerMoved', 'playerJoined', 'chatMessage', 'playerEmoji']) {
        observer.on(name, data => { if (data.id === manager.id) leaked.push(name); });
    }
    manager.emit('playerMove', { x: 720, y: 500, direction: 6, isMoving: true });
    manager.emit('playerProfile', {});
    manager.emit('chatMessage', 'hidden');
    manager.emit('playerEmoji', { emoji: 0 });
    await request(manager, 'inventory:equip', { itemId: 'hat/green-hat1', equip: true });
    const late = client({ token: ordinary.token, room: 'Game' });
    const snapshot = await event(late, 'currentPlayers');
    assert.equal(snapshot[manager.id], undefined);
    const seen = event(manager, 'playerMoved');
    observer.emit('playerMove', { x: 750, y: 520, direction: 6 });
    assert.equal((await seen).id, observer.id, 'Hidden admin must keep receiving world updates');
    await sleep(100);
    assert.deepEqual(leaked, []);
    const hiddenShop = client({ token: admin.token, room: 'Shop' });
    const ownShop = await event(hiddenShop, 'currentPlayers');
    assert.equal(ownShop[hiddenShop.id].vanished, true, 'Vanish survives room changes');
    const shopObserver = client({ token: ordinary.token, room: 'Shop' });
    assert.equal((await event(shopObserver, 'currentPlayers'))[hiddenShop.id], undefined);
    const joined = event(observer, 'playerJoined');
    assert.equal((await request(hiddenShop, 'admin:vanish', { active: false })).ok, true);
    const restored = await joined;
    assert.equal(restored.id, manager.id);
    assert.ok(Math.abs(restored.x - 720) < 0.001);
    assert.equal(restored.equipped.hat, 'hat/green-hat1');
    assert.equal(restored.vanished, false);
    console.log('PASS: admin-only vanish, no movement/equipment/chat/emoji leaks, late joins, observation, room transitions and restoration');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
});
