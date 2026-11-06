const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-quest-network-'));
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json');
process.env.VW_PORT = '0';
process.env.VW_QUESTS_DIR = directory;
for (const file of ['leo-quests.json', 'resident-quests.json']) {
    fs.copyFileSync(path.join(__dirname, '../shared', file), path.join(directory, file));
}
const realNow = Date.now;
let elapsed = 0;
const groundModule = require('../server/quest-ground.cjs');
const OriginalGround = groundModule.QuestGround;
groundModule.QuestGround = class extends OriginalGround {
    constructor(...args) { super(...args, () => realNow() + elapsed); }
};
const { io } = require('../server/index.cjs');
const clients = [];
function client(auth) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, {
        auth, reconnection: false, transports: ['websocket'] });
    clients.push(socket); return socket;
}
function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`Timeout ${name}`)), 4000);
        socket.once(name, data => { clearTimeout(timer); resolve(data); });
    });
}
const request = (socket, name, data) => new Promise((resolve, reject) =>
    socket.timeout(4000).emit(name, data, (error, result) => error ? reject(error) : resolve(result)));
async function room(token, room) {
    const socket = client({ token, room }); await event(socket, 'currentPlayers'); return socket;
}
(async () => {
    const account = client({ account: true }); await event(account, 'connect');
    const registered = await request(account, 'auth:register', { username: 'QuestNetwork', password: 'test-password-123' });
    const admin = await request(account, 'auth:register', { username: 'Koko', password: 'test-password-123' });
    const manager = await room(admin.token, 'Game');
    let square = await room(registered.token, 'Game');
    assert.equal((await request(square, 'admin:quests', { residentId: 'leo' })).ok, false);
    assert.equal((await request(square, 'admin:saveQuest', { residentId: 'leo', chainId: 'leo-welcome' })).ok, false);
    assert.equal((await request(manager, 'admin:quests', { residentId: 'mia' })).ok, false);
    const editable = await request(manager, 'admin:quests', { residentId: 'leo' });
    assert.equal(editable.ok, true);
    const winter = editable.quests.find(chain => chain.id === 'square-winter');
    const edit = { residentId: 'leo', chainId: winter.id, stepId: winter.steps[0].id,
        revision: winter.revision, changes: { title: 'Network edited title' } };
    assert.equal((await request(manager, 'admin:saveQuest', edit)).ok, true);
    assert.equal((await request(manager, 'admin:saveQuest', edit)).ok, false);
    assert.equal((await request(square, 'quest:adminComplete', { chainId: 'leo-welcome', stepId: 'first-purchase' })).ok, false);
    await request(manager, 'quest:accept', { chainId: 'lost-delivery' });
    const automatic = await request(manager, 'quest:adminComplete', { chainId: 'lost-delivery', stepId: 'parcels' });
    assert.equal(automatic.ok, true);
    assert.equal(automatic.questReward.coins, 25);
    assert.equal(automatic.inventory.quests['lost-delivery'].residentId, 'rani');
    assert.equal((await request(manager, 'quest:adminComplete', { chainId: 'lost-delivery', stepId: 'parcels' })).ok, false);
    await request(manager, 'quest:accept', { chainId: 'leo-welcome' });
    for (const step of require('../shared/leo-quests.json').steps) {
        const actor = step.residentId === 'leo' ? manager : await room(admin.token, { rani: 'Shop', mia: 'Cafe' }[step.residentId]);
        assert.equal((await request(actor, 'quest:adminComplete', { chainId: 'leo-welcome', stepId: step.id })).ok, true);
    }
    assert.equal((await request(manager, 'quest:adminComplete', { chainId: 'leo-welcome', stepId: 'ready-for-igloo' })).ok, false);
    assert.equal((await request(square, 'quest:accept', { chainId: 'lost-delivery' })).ok, false);
    const grant = await request(manager, 'admin:grant', {
        id: 'quest-test-grant', username: 'QuestNetwork', kind: 'rankingPoints', amount: 100 });
    assert.equal(grant.ok, true);
    assert.equal((await request(square, 'quest:accept', { chainId: 'lost-delivery' })).ok, true);
    assert.equal((await request(square, 'quest:accept', { chainId: 'mia-first-shift' })).ok, false);
    let count = 0, oldId;
    for (const destination of ['Game', 'Shop', 'Cafe']) {
        const socket = destination === 'Game' ? square : await room(registered.token, destination);
        assert.equal((await request(socket, 'quest:ground', {})).ground.length, 0);
        for (let n = 0; n < 4; n++) {
            elapsed += 10001;
            const ground = await request(socket, 'quest:ground', {});
            assert.equal(ground.ground.length, 1);
            if (oldId) assert.equal((await request(socket, 'quest:collect', { id: oldId })).ok, false);
            const item = ground.ground[0];
            socket.emit('playerMove', { x: 70, y: 650 });
            assert.equal((await request(socket, 'quest:collect', { id: item.id })).ok, false);
            socket.emit('playerMove', { x: item.x, y: item.y });
            assert.equal((await request(socket, 'quest:collect', { id: item.id })).ok, true);
            assert.equal((await request(socket, 'quest:collect', { id: item.id })).ok, false);
            oldId = item.id; count++;
        }
    }
    const claimed = await request(square, 'quest:claim', { chainId: 'lost-delivery', stepId: 'parcels' });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.inventory.quests['lost-delivery'].residentId, 'rani');
    assert.equal((await request(square, 'quest:claim', { chainId: 'lost-delivery', stepId: 'rani-delivery' })).ok, false);
    const shop = await room(registered.token, 'Shop');
    assert.equal((await request(shop, 'quest:claim', { chainId: 'lost-delivery', stepId: 'rani-delivery' })).ok, true);
    assert.equal((await request(manager, 'admin:grant', { id: 'quest-test-level4', username: 'QuestNetwork', kind: 'rankingPoints', amount: 520 })).ok, true);
    const cafe = await room(registered.token, 'Cafe');
    assert.equal((await request(cafe, 'quest:accept', { chainId: 'mia-first-shift' })).ok, true);
    const started = await request(cafe, 'coffee:start', {});
    let state = started.state;
    for (let order = 0; order < 140; order++) {
        const recipe = state.tickets[0].recipe;
        for (const ingredient of recipe) {
            const result = await request(cafe, 'coffee:choose', { id: state.id, ingredient });
            assert.equal(result.ok, true); state = result.state;
        }
    }
    assert.equal(state.orders, 140);
    assert.equal((await request(cafe, 'coffee:finish', { id: state.id })).ok, true);
    const resumed = await request(account, 'auth:resume', registered.token);
    assert.equal(resumed.inventory.quests['mia-first-shift'].steps[0].ready, true);
    const result = await request(cafe, 'quest:claim', { chainId: 'mia-first-shift', stepId: 'first-cups' });
    assert.equal(result.ok, true);
    assert.equal(result.inventory.quests['mia-first-shift'].steps[1].ready, false);
    assert.equal((await request(cafe, 'quest:ground', {})).ground.length, 0);
    console.log('PASS quest network: rank unlock, room validation, collection proximity/replay, handoff, coffee progression, stage rewards');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    groundModule.QuestGround = OriginalGround;
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
});
