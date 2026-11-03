const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SnowGames, SnowRound, rewards, config } = require('../server/snow-game.cjs');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const economy = require('../server/economy.json');
let now = 0;
const clock = () => now;
const games = new SnowGames(clock, () => 0.5);
const round = games.start('alice', 'socket-a');
assert.equal(games.start('alice', 'socket-a'), round);
assert.throws(() => games.start('alice', 'socket-b'));
assert.throws(() => games.get('alice', 'socket-b'));
games.cancel('alice', 'socket-b');
assert.equal(games.get('alice', 'socket-a'), round);
assert.equal(round.snapshot().phase, 'playing');
round.input(Infinity);
assert.equal(round.targetX, config.width / 2);
round.input(99999);
now = 100;
assert.ok(round.snapshot().basketX <= config.width / 2 + 70.001);
round.input(config.width / 2);
now = config.duration;
const finished = round.snapshot();
assert.equal(finished.phase, 'finished');
assert.ok(finished.score > 0 && finished.catches > 0);
assert.deepEqual(rewards(0, 0), { coins: 0, rankingPoints: 0 });
assert.deepEqual(rewards(420, 10), { coins: 4, rankingPoints: 9 });
assert.deepEqual(rewards(100000, 10), { coins: 910, rankingPoints: 1668 });
assert.ok(rewards(200000, 10).coins > rewards(100000, 10).coins);
assert.ok(rewards(200000, 10).rankingPoints > rewards(100000, 10).rankingPoints);
assert.deepEqual(rewards(420, 0), { coins: 0, rankingPoints: 0 });

// Golden flakes give a bonus, ice subtracts points, missed flakes give nothing.
now = 0;
const mixed = new SnowRound('test', clock, () => 0.5);
mixed.flakes = ['snow', 'gold', 'ice'].map((type, id) => ({ id, type, x: 380, at: id * 100, speed: 200, resolved: false }));
mixed.flakes.push({ id: 3, type: 'snow', x: 30, at: 0, speed: 200, resolved: false });
now = config.duration;
assert.equal(mixed.snapshot().score, 25);
assert.equal(mixed.snapshot().catches, 2);
assert.deepEqual(mixed.snapshot().hits.map(({ id, type }) => ({ id, type })), [
    { id: 0, type: 'snow' }, { id: 1, type: 'gold' }, { id: 2, type: 'ice' }
]);
assert.equal(mixed.snapshot().hits.length, 3, 'Repeated snapshots must not create new hit events');
const detached = mixed.snapshot();
detached.hits[0].type = 'ice';
assert.equal(mixed.snapshot().hits[0].type, 'snow', 'Snapshot consumers cannot mutate the catch history');
now = 0;
const iceAtZero = new SnowRound('ice-zero', clock, () => 0.5);
iceAtZero.flakes = [{ id: 0, type: 'ice', x: 380, at: 0, speed: 200, resolved: false }];
now = 3000;
assert.equal(iceAtZero.snapshot().score, 0);
assert.equal(iceAtZero.snapshot().hits[0].type, 'ice', 'An ice hit still needs sound when the score stays zero');

// Exercise the actual client helper without importing Phaser or browser globals.
const vm = require('node:vm');
const client = fs.readFileSync(path.join(__dirname, '../src/game/minigames/SnowCatch.js'), 'utf8');
const helper = client.slice(client.indexOf('export function createCatchSoundPlayer'), client.indexOf('export function createSnowGameEntry'));
const createCatchSoundPlayer = vm.runInNewContext(helper.replace('export ', '') + '\ncreateCatchSoundPlayer', { config });
const played = [];
const visualHits = [];
const playHits = createCatchSoundPlayer(key => played.push(key), hit => visualHits.push(hit.id));
const hits = [
    { id: 0, type: 'snow', at: 100 }, { id: 1, type: 'gold', at: 100 }, { id: 2, type: 'ice', at: 100 }
];
const snapshot = { id: 'round-one', remaining: config.duration - 200, score: 0, hits };
playHits(snapshot);
assert.deepEqual(played, ['snowball-sfx', 'coin-sfx', 'hurt-sfx'], 'All simultaneous catch types must sound even when the score difference cancels out');
playHits(snapshot);
playHits({ ...snapshot, phase: 'finished' });
assert.equal(played.length, 3, 'Repeated recovery or final snapshots must not replay sounds');
assert.deepEqual(visualHits, [0, 1, 2], 'Catch effects trigger once per fresh catch, including ice at zero score');
playHits({ ...snapshot, remaining: config.duration - 5000, hits: [...hits, { id: 3, type: 'gold', at: 500 }] });
assert.equal(played.length, 3, 'Old catch history must stay silent after recovery');
playHits({ ...snapshot, remaining: config.duration - 5000, hits: [...hits, { id: 3, type: 'gold', at: 500 }, { id: 4, type: 'ice', at: 4900 }] });
assert.equal(played.at(-1), 'hurt-sfx');
assert.equal(played.length, 4);
playHits({ ...snapshot, id: 'round-two', hits: [{ id: 0, type: 'snow', at: 100 }] });
assert.equal(played.at(-1), 'snowball-sfx', 'Item IDs may be reused by a new round');
assert.equal(played.length, 5);
console.log('PASS: typed catch events, missed items, zero-score ice, sound mapping, snapshot deduplication and recovery history');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-snow-test-'));
try {
    const catalog = buildCatalog();
    const user = { id: 'test-snow-player', username: 'SnowTester' };
    const store = new Inventories(directory);
    const initial = store.snapshot(user, catalog);
    assert.equal(initial.rankingPoints, 0);
    assert.equal(initial.level, 1);
    assert.throws(() => store.rewardSnow(user, { elapsed: 1000 }));
    const result = store.rewardSnow(user, round);
    assert.equal(result.coins, rewards(round.score, round.catches).coins);
    assert.equal(result.rankingPoints, rewards(round.score, round.catches).rankingPoints);
    assert.equal(store.snapshot(user, catalog).currency, economy.startingCurrency + result.coins);
    const once = store.snapshot(user, catalog);
    assert.deepEqual(store.rewardSnow(user, round), result);
    assert.deepEqual(store.snapshot(user, catalog), once);
    assert.deepEqual(new Inventories(directory).snapshot(user, catalog), once);
    assert.deepEqual(once.equipped, initial.equipped);
    assert.deepEqual(once.items, initial.items);
    const levelTwoPoints = require('../shared/ranks.json')[1].minPoints;
    const roundsToLevelTwo = Math.ceil(levelTwoPoints / result.rankingPoints);
    for (let i = 0; i < roundsToLevelTwo; i++) store.rewardSnow(user, { ...round, id: `round-${i}` });
    assert.ok(store.snapshot(user, catalog).level >= 2);
    const before = store.snapshot(user, catalog);
    const persist = store.persist;
    store.persist = () => { throw new Error('disk failure'); };
    assert.throws(() => store.rewardSnow(user, { ...round, id: 'failed-round' }), /disk failure/);
    assert.deepEqual(store.snapshot(user, catalog), before);
    store.persist = persist;
    let earlyTime = 0;
    const early = new SnowRound('early-owner', () => earlyTime, () => 0.5);
    early.flakes = [
        { id: 0, type: 'snow', x: early.x, at: 0, speed: 200, resolved: false },
        { id: 1, type: 'gold', x: early.x, at: 10000, speed: 200, resolved: false }
    ];
    earlyTime = 2500;
    early.finish();
    assert.equal(early.snapshot().phase, 'finished');
    assert.equal(early.score, 10);
    assert.ok(early.elapsed < config.duration);
    earlyTime = config.duration;
    early.finish();
    assert.equal(early.snapshot().score, 10, 'Early finish cannot catch future items');
    const quitter = { id: 'early-player', username: 'EarlyPlayer' };
    const earlyResult = store.rewardSnow(quitter, early);
    assert.equal(earlyResult.coins, rewards(10, 1).coins);
    const afterEarly = store.snapshot(quitter, catalog);
    assert.deepEqual(store.rewardSnow(quitter, early), earlyResult);
    assert.deepEqual(new Inventories(directory).snapshot(quitter, catalog), afterEarly);
} finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('vw-snow-test-'));
    fs.rmSync(resolved, { recursive: true });
}
round.result = { score: finished.score };
assert.notEqual(games.start('alice', 'socket-b').id, round.id);
games.cancel('alice', 'socket-b');
assert.throws(() => games.get('alice', 'socket-b'));
console.log('PASS: server timer, input speed, ownership, score/ice/bonus, rewards, replay protection, ranks, persistence and save rollback');
