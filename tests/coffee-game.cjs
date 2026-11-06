const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const { CoffeeRound, CoffeeGames, coffeeRewards, config } = require('../server/coffee-game.cjs');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const vm = require('node:vm');
const clientCode = fs.readFileSync(path.join(__dirname, '../src/game/minigames/CoffeeMemory.js'), 'utf8');
const fillCode = clientCode.slice(clientCode.indexOf('function fillCoffeeCup'), clientCode.indexOf('export function createCoffeeGameEntry'));
const fillCup = vm.runInNewContext(fillCode + '\nfillCoffeeCup', { config });
const surface = { style: {} };
fillCup(surface, ['coffee', 'milk'], 2);
assert.ok(surface.style.background.includes('calc(50% - 1px)'));
const coffeeDivider = surface.style.background.match(/(#[a-f0-9]{6}) calc\(50% - 1px\) calc\(50% \+ 1px\)/)[1];
const coffeeColor = config.ingredients.find(item => item.id === 'coffee').color;
for (const offset of [1, 3, 5]) {
    assert.ok(parseInt(coffeeDivider.slice(offset, offset + 2), 16) > parseInt(coffeeColor.slice(offset, offset + 2), 16));
}
assert.ok(!surface.style.background.includes('#e9f5ff'), 'A full cup has no white gaps between layers');
fillCup(surface, [], 2);
assert.equal(surface.style.background, '#e9f5ff', 'Emptying the cup removes the previous gradient');

let now = 0;
const round = new CoffeeRound('owner', () => now, () => 0);
assert.equal(round.snapshot().phase, 'prepare');
assert.equal(round.snapshot().tickets.length, 1);
for (let order = 0; order < 2; order++) {
    const ticket = round.snapshot().tickets[0];
    for (const ingredient of ticket.recipe) round.choose(ingredient);
}
assert.equal(round.score, 40); assert.equal(round.orders, 2);
assert.throws(() => round.choose('invalid'));
const wrong = round.snapshot().tickets[0];
for (const ingredient of wrong.recipe) round.choose('milk');
assert.equal(round.lives, 3, 'Only missed deadlines cost a life');
assert.deepEqual(round.snapshot().choices, ['milk', 'milk']);
round.clear();
assert.deepEqual(round.snapshot().choices, []);
now = wrong.expiresAt;
assert.equal(round.snapshot().lives, 2);
assert.equal(round.snapshot().lives, 2, 'An expiration cannot charge a life twice');
now = 3600000;
assert.equal(round.snapshot().phase, 'finished', 'Background time still expires orders');
assert.equal(round.lives, 0); assert.equal(round.score, 40);
assert.deepEqual(coffeeRewards(0, 0), { coins: 0, rankingPoints: 0 });
assert.deepEqual(coffeeRewards(300, 8), { coins: 8, rankingPoints: 14 });
now = 0;
const busy = new CoffeeRound('owner', () => now, () => 0);
now = 19000;
const first = busy.snapshot().tickets[0];
for (const ingredient of first.recipe) busy.choose(ingredient);
now = 28000;
const queue = busy.snapshot().tickets;
assert.equal(queue.length, 2, 'More orders arrive as time passes');
assert.ok(queue[1].lifetime < config.orderTime);
busy.tickets[0].recipe = ['coffee', 'milk'];
busy.tickets[1].recipe = ['cocoa', 'syrup', 'coffee'];
busy.choose('cocoa'); busy.choose('syrup');
assert.equal(busy.orders, 1, 'Partial recipes are not delivered');
busy.choose('coffee');
assert.equal(busy.orders, 2, 'The matching order is delivered automatically without selection');
assert.equal(busy.tickets.some(ticket => ticket.id === queue[1].id), false);
assert.equal(busy.tickets.some(ticket => ticket.id === queue[0].id), true);
assert.deepEqual(busy.snapshot().choices, []);
busy.choose('coffee'); busy.clear(); assert.deepEqual(busy.snapshot().choices, []);
for (let i = 0; i < 20; i++) busy.choose('coffee');
assert.equal(busy.snapshot().choices.length, config.maxIngredients);
busy.clear();
now = queue[0].expiresAt;
assert.equal(busy.snapshot().lives, 2);
assert.ok(busy.difficulty(999999).capacity <= config.maxTickets);
assert.equal(busy.difficulty(999999).lifetime, config.minOrderTime);
now = 0;
const endless = new CoffeeRound('owner', () => now, () => 0);
for (let order = 0; order < 100; order++) {
    now += 1000;
    const ticket = endless.snapshot().tickets[0];
    for (const ingredient of ticket.recipe) endless.choose(ingredient);
}
assert.equal(endless.orders, 100); assert.equal(endless.lives, 3);
assert.equal(endless.finished, false);
assert.equal(endless.snapshot().tickets[0].recipe.length, 5);
const games = new CoffeeGames(); games.start('user', 'owner');
let prefixTime = 0;
const prefixRound = new CoffeeRound('owner', () => prefixTime, () => 0);
prefixTime = config.difficultyStep;
prefixRound.orders = 3; prefixRound.spawn(prefixTime);
assert.equal(prefixRound.tickets.length, 2);
assert.notDeepEqual(prefixRound.tickets[1].recipe.slice(0, 2), prefixRound.tickets[0].recipe,
    'Auto-delivery recipes cannot hide a longer order behind a shorter prefix');
assert.throws(() => games.start('user', 'other'));
assert.throws(() => games.get('user', 'other'));
games.cancel('user', 'other'); assert.ok(games.get('user', 'owner'));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-coffee-'));
process.env.VW_ACCOUNTS_FILE = path.join(directory, 'accounts.json'); process.env.VW_PORT = '0';
const { io } = require('../server/index.cjs');
const clients = [];
function client(auth) {
    const socket = connect(`http://localhost:${io.httpServer.address().port}`, { auth, reconnection: false, transports: ['websocket'] });
    clients.push(socket); return socket;
}
function event(socket, name) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`Timeout ${name}`)), 3000);
        socket.once(name, data => { clearTimeout(timer); resolve(data); });
    });
}
const request = (socket, name, data) => new Promise((resolve, reject) =>
    socket.timeout(3000).emit(name, data, (error, result) => error ? reject(error) : resolve(result)));
(async () => {
    const catalog = buildCatalog(), store = new Inventories(path.join(directory, 'unit-players'));
    const user = { id: 'unit', username: 'Unit' };
    const before = store.snapshot(user, catalog);
    const reward = store.rewardCoffee(user, round);
    assert.equal(store.snapshot(user, catalog).currency, before.currency + reward.coins);
    assert.deepEqual(store.rewardCoffee(user, round), reward);
    assert.equal(new Inventories(store.directory).snapshot(user, catalog).rankingPoints, reward.rankingPoints);
    assert.throws(() => store.rewardCoffee(user, new CoffeeRound('owner')));
    const account = client({ account: true }); await event(account, 'connect');
    const registered = await request(account, 'auth:register', { username: 'CoffeeTest', password: 'test-password-123' });
    const wrongRoom = client({ token: registered.token, room: 'Game' }); await event(wrongRoom, 'currentPlayers');
    assert.equal((await request(wrongRoom, 'coffee:start', {})).ok, false);
    const cafe = client({ token: registered.token, room: 'Cafe' }); await event(cafe, 'currentPlayers');
    assert.equal((await request(wrongRoom, 'cafe:secretCup', {})).ok, false);
    const secret = await request(cafe, 'cafe:secretCup', {});
    assert.equal(secret.ok, true);
    assert.equal(secret.secretReward.claimed, true);
    assert.equal(secret.inventory.quantities['hands/coffee-cup'], 1);
    const repeated = await request(cafe, 'cafe:secretCup', {});
    assert.equal(repeated.secretReward.claimed, false);
    assert.equal(repeated.inventory.quantities['hands/coffee-cup'], 1);
    const started = await request(cafe, 'coffee:start', {});
    assert.equal(started.state.phase, 'prepare');
    const id = started.state.id, ticket = started.state.tickets[0];
    for (const ingredient of ticket.recipe) {
        assert.equal((await request(cafe, 'coffee:choose', { id, ingredient })).ok, true);
    }
    assert.equal((await request(cafe, 'coffee:state', { id })).state.orders, 1);
    assert.equal((await request(cafe, 'coffee:finish', { id: 'stale' })).ok, false);
    const finished = await request(cafe, 'coffee:finish', { id, score: 999999, coins: 999999 });
    assert.equal(finished.state.result.orders, 1); assert.equal(finished.state.result.score, 20);
    assert.deepEqual(finished.state.result, (await request(cafe, 'coffee:finish', { id })).state.result);
    const login = await request(account, 'auth:resume', registered.token);
    assert.equal(login.inventory.currency, registered.inventory.currency + finished.state.result.coins);
    assert.equal(login.inventory.rankingPoints, finished.state.result.rankingPoints);
    console.log('PASS coffee: concurrent timed orders, progressive pressure, expiry/lives, shared cup matching, automatic delivery, five-ingredient cap, authoritative score, rewards and persistence');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    clients.forEach(socket => socket.disconnect()); await new Promise(resolve => io.close(resolve));
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
});
