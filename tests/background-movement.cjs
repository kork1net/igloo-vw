const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let connect;
let tick;
let now = 0;
let timerCleared = false;
const broadcasts = [];
class Server {
    on(event, callback) { connect = callback; }
    to(room) { return { emit: (event, data) => broadcasts.push({ room, event, data }) }; }
}
vm.runInNewContext(fs.readFileSync('server/index.cjs', 'utf8'), {
    require: name => name === 'socket.io' ? { Server }
        : name === './inventory.cjs' ? require('./helpers/inventory-memory.cjs')
        : name === './rarities.cjs' ? { Rarities: class { snapshot() { return {}; } } }
        : name === './accounts.cjs' ? { Accounts: class {
            authenticate() { return { id: 'test-user', username: 'Walker', isAdmin: true }; }
        } } : { ...require('../scripts/item-catalog.cjs'),
            buildCatalog: () => ({ items: [{ id: 'black-shirt', slot: 'shirt' }] }) },
    process: { env: {} }, module: { exports: {} },
    console: { log() {} },
    performance: { now: () => now },
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => { timerCleared = true; }
});
const handlers = {};
const socket = {
    id: 'walker', handshake: { auth: { room: 'Game' } },
    join() {}, use() {}, emit() {},
    to: room => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }),
    on: (event, callback) => { handlers[event] = callback; }
};
connect(socket);
handlers['inventory:equip']({ itemId: 'black-shirt', equip: true }, () => {});
const state = { x: 100, y: 100, direction: 6, facingLeft: false,
    username: 'Walker', shirt: 'black-shirt', isMoving: true, isRunning: false };
const lastState = () => broadcasts.at(-1).data;

// Advance the server clock without running any browser frames.
handlers.playerBackground({ hidden: true, state, target: { x: 540, y: 100 } });
now = 1000;
tick();
assert.equal(lastState().x, 320);
assert.equal(lastState().isMoving, true);
assert.equal(lastState().shirt, 'black-shirt');
handlers.playerMove({ ...state, x: 101 }); // Ignore stale local updates during handoff.
assert.equal(lastState().x, 320);
now = 2500;
tick();
assert.equal(lastState().x, 540);
assert.equal(lastState().isMoving, false);
assert.equal(lastState().isRunning, false);
let resumed;
handlers.playerBackground({ hidden: false }, value => { resumed = value; });
assert.equal(resumed.x, 540);
handlers.playerMove({ ...state, x: 550 });
assert.equal(lastState().x, 550);

// Running retains its speed, stops exactly at the target and resumes mid-route.
handlers.playerBackground({ hidden: true, state: { ...state, isRunning: true },
    target: { x: 860, y: 100 } });
now += 1000;
tick();
assert.equal(lastState().x, 480);
assert.equal(lastState().isRunning, true);
handlers.playerBackground({ hidden: false }, value => { resumed = value; });
assert.equal(resumed.x, 480);
assert.equal(resumed.isMoving, true);

// A released keyboard without a click destination must not walk forever.
handlers.playerBackground({ hidden: true, state, target: null });
now += 1000;
tick();
assert.equal(lastState().x, 100);
assert.equal(lastState().isMoving, false);
handlers.disconnect();
assert.equal(timerCleared, true);
console.log('PASS: background walk/run, arrival, resume, stale updates, released keys, cleanup');
