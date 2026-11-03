const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { io: connect } = require('socket.io-client');
const config = require('../shared/emojis.json');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-emojis-'));
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json'); process.env.VW_PORT = '0';
const { io } = require('../server/index.cjs');
const clients = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function client(auth) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, { auth, reconnection: false, autoConnect: false });
    clients.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
    return socket;
}
(async () => {
    try {
        const account = await client({ account: true });
        const result = await new Promise(resolve => account.emit('auth:register', { username: 'EmojiTester', password: 'emoji-test-123' }, resolve));
        assert.equal(result.ok, true); account.disconnect();
        const sender = await client({ token: result.token }), neighbor = await client({ token: result.token }), otherRoom = await client({ token: result.token, room: 'Shop' });
        const own = [], nearby = [], elsewhere = [], chat = [];
        sender.on('playerEmoji', data => own.push(data)); neighbor.on('playerEmoji', data => nearby.push(data));
        otherRoom.on('playerEmoji', data => elsewhere.push(data)); neighbor.on('chatMessage', data => chat.push(data));
        for (const emoji of [-1, config.frames.length, 0.5, '0', null]) sender.emit('playerEmoji', { emoji });
        await wait(60); assert.equal(own.length, 0);
        sender.emit('playerEmoji', { emoji: 3, id: neighbor.id, room: 'Shop' });
        await wait(60);
        assert.deepEqual(own, [{ id: sender.id, emoji: 3 }]); assert.deepEqual(nearby, own); assert.equal(elsewhere.length, 0);
        sender.emit('playerEmoji', { emoji: 2 }); sender.emit('chatMessage', 'still chatting');
        await wait(60); assert.equal(own.length, 1); assert.equal(chat[0].message, 'still chatting');
        await wait(config.cooldown); sender.emit('playerEmoji', { emoji: 6 });
        await wait(60); assert.equal(nearby.at(-1).emoji, 6); assert.equal(elsewhere.length, 0);
        console.log('PASS emojis: valid frames, sender and room broadcast, server identity, room isolation, cooldown and simultaneous chat');
    } finally {
        clients.forEach(socket => socket.disconnect());
        await new Promise(resolve => io.close(resolve));
        assert.equal(path.dirname(fs.realpathSync(directory)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
        fs.rmSync(directory, { recursive: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
