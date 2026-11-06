const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const bubbleCode = fs.readFileSync('src/game/objects/ChatBubble.js', 'utf8').replace(/^export /gm, '');
const { showChatMessage, updateChatMessage } = vm.runInNewContext(
    bubbleCode + '\n({ showChatMessage, updateChatMessage })');
const graphics = Object.fromEntries(['fillStyle', 'lineStyle', 'fillRoundedRect',
    'strokeRoundedRect', 'fillTriangle', 'beginPath', 'moveTo', 'lineTo', 'strokePath']
    .map(key => [key, () => {}]));
const timers = [];
const owner = { container: Object.assign(new EventEmitter(), { x: 100, y: 200 }), scene: {
    add: {
        text: (x, y, text) => ({ text, width: 100, height: 20, setOrigin() { return this; } }),
        graphics: () => graphics,
        container: (x, y, children) => ({ x, y, children, setDepth() {},
            setPosition(x, y) { this.x = x; this.y = y; },
            destroy() { this.destroyed = true; } })
    },
    time: { delayedCall: (duration, callback) => {
        const timer = { duration, callback, remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
    } }
} };
showChatMessage(owner, '  hello  ');
assert.equal(owner.chatBubble.children[1].text, 'hello');
assert.equal(timers[0].duration, 4000);
const first = owner.chatBubble;
owner.container.x = 150;
updateChatMessage(owner);
assert.equal(owner.chatBubble.x, 150);
showChatMessage(owner, 'second');
assert.equal(first.destroyed, true);
assert.equal(timers[0].removed, true);
assert.equal(owner.container.listenerCount('destroy'), 1);
const second = owner.chatBubble;
timers[1].callback();
assert.equal(second.destroyed, true);
assert.equal(owner.chatBubble, null);
showChatMessage(owner, 'third');
const third = owner.chatBubble;
owner.container.emit('destroy');
assert.equal(third.destroyed, true);
assert.equal(timers[2].removed, true);

let connect;
const broadcasts = [];
class Server { on(event, callback) { connect = callback; } to() { return { emit() {} }; } }
vm.runInNewContext(fs.readFileSync('server/index.cjs', 'utf8'), {
    require: name => name === 'socket.io' ? { Server }
        : name === '../shared/collision.js' ? require('../shared/collision.js')
        : name === '../shared/square.json' ? require('../shared/square.json')
        : name === './snow-game.cjs' ? require('../server/snow-game.cjs')
        : name === './coffee-game.cjs' ? require('../server/coffee-game.cjs')
        : name === './resident-quests.cjs' ? require('../server/resident-quests.cjs')
        : name === './quest-ground.cjs' ? require('../server/quest-ground.cjs')
        : name === './quest-editor.cjs' ? require('../server/quest-editor.cjs')
        : name === './trades.cjs' ? require('../server/trades.cjs')
        : name === './inventory.cjs' ? require('./helpers/inventory-memory.cjs')
        : name === './rarities.cjs' ? { Rarities: class { snapshot() { return {}; } } }
        : name === './accounts.cjs' ? { Accounts: class {
            authenticate() { return { id: 'test-user', username: 'Walker' }; }
        } } : require('../scripts/item-catalog.cjs'),
    process: { env: {} }, module: { exports: {} },
    console: { log() {} }, performance: { now: () => 0 }, setInterval() {}, clearInterval() {}
});
const handlers = {};
connect({ id: 'sender', handshake: { auth: { room: 'Shop' } }, join() {}, use() {}, emit() {},
    to: room => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }),
    on: (event, callback) => { handlers[event] = callback; } });
broadcasts.length = 0;
for (const invalid of [null, {}, 12, '', '   ']) handlers.chatMessage(invalid);
assert.equal(broadcasts.length, 0);
handlers.chatMessage('  hello  ');
assert.equal(broadcasts[0].room, 'Shop');
assert.equal(broadcasts[0].event, 'chatMessage');
assert.equal(broadcasts[0].data.id, 'sender');
assert.equal(broadcasts[0].data.message, 'hello');
handlers.chatMessage('x'.repeat(200));
assert.equal(broadcasts.at(-1).data.message.length, 100);
console.log('PASS: bubble movement, replacement, timeout, cleanup; chat validation, identity and room scope');
