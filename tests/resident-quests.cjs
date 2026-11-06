const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Inventories } = require('../server/inventory.cjs');
const { chains, capture, advance, assertResident } = require('../server/resident-quests.cjs');
const { QuestGround } = require('../server/quest-ground.cjs');
const { getSquareColliders, resolveMovement } = require('../shared/collision.js');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-resident-quests-'));
try {
    const store = new Inventories(directory), catalog = buildCatalog();
    const user = { id: 'quest-test', username: 'QuestTest' };
    const snapshot = () => store.snapshot(user, catalog);
    const level = points => store.persist(user, { ...store.load(user), rankingPoints: points });
    assert.equal(Object.keys(snapshot().quests).length, 1);
    assert.throws(() => store.acceptQuest(user, chains[0].id, catalog));
    assert.throws(() => store.claimQuest(user, 'leo-welcome', 'first-purchase', catalog, true));
    level(100); assert.equal(Object.keys(snapshot().quests).length, 2);
    level(260); assert.equal(Object.keys(snapshot().quests).length, 3);
    level(520); assert.equal(Object.keys(snapshot().quests).length, 5);
    level(940); assert.equal(Object.keys(snapshot().quests).length, 5);
    for (const chain of chains) {
        assert.ok(chain.steps.length >= 2);
        assert.ok(!JSON.stringify(chain).includes('\u2013'));
    }
    const delivery = chains[0];
    store.acceptQuest(user, delivery.id, catalog);
    const accepted = snapshot();
    assert.throws(() => store.claimQuest(user, delivery.id, 'parcels', catalog, true));
    store.acceptQuest(user, delivery.id, catalog); assert.deepEqual(snapshot(), accepted);
    assert.throws(() => store.claimQuest(user, delivery.id, 'parcels', catalog));
    const walls = getSquareColliders(require('../shared/square.json'));
    let now = 0;
    const ground = new QuestGround(walls, resolveMovement, () => now);
    assert.equal(ground.list(snapshot().quests).length, 0, 'First spawn must wait');
    now = 10001;
    assert.equal(ground.list(snapshot().quests).length, 1);
    assert.equal(ground.list(snapshot().quests).length, 1, 'Polling cannot accelerate spawns');
    now += 10001; ground.list(snapshot().quests);
    now += 10001; ground.list(snapshot().quests);
    now += 999999;
    assert.equal(ground.list(snapshot().quests).length, 3, 'Cap and no background catch-up');
    const batch = ground.list(snapshot().quests);
    assert.equal(batch.length, 3);
    assert.deepEqual(ground.list(snapshot().quests), batch);
    assert.throws(() => ground.collect(batch[0].id, { x: 0, y: 0 }, snapshot().quests, () => {}));
    assert.throws(() => ground.collect('invented', batch[0], snapshot().quests, () => {}));
    assert.throws(() => ground.collect(batch[0].id, batch[0], snapshot().quests, () => { throw Error('disk failure'); }));
    assert.equal(ground.list(snapshot().quests).length, 3);
    const save = item => store.collectQuestItem(user, item.chainId, item.stepId, catalog);
    ground.collect(batch[0].id, batch[0], snapshot().quests, save);
    assert.throws(() => ground.collect(batch[0].id, batch[0], snapshot().quests, save));
    assert.equal(snapshot().quests[delivery.id].steps[0].progressText, '1 / 12');
    for (let i = 1; i < 12; i++) store.collectQuestItem(user, delivery.id, 'parcels', catalog);
    assert.equal(ground.list(snapshot().quests).length, 0);
    store.claimQuest(user, delivery.id, 'parcels', catalog);
    let view = snapshot().quests[delivery.id];
    assert.equal(view.residentId, 'rani');
    assert.throws(() => assertResident(view, 'Game'));
    assert.doesNotThrow(() => assertResident(view, 'Shop'));
    assert.throws(() => store.claimQuest(user, delivery.id, 'parcels', catalog));
    store.claimQuest(user, delivery.id, 'rani-delivery', catalog);
    assert.equal(snapshot().quests[delivery.id].steps[2].ready, false);
    store.purchase(user, 'shirt/black-shirt', catalog);
    assert.equal(snapshot().quests[delivery.id].steps[2].ready, true);
    store.claimQuest(user, delivery.id, 'rani-opening', catalog);
    assert.equal(snapshot().quests[delivery.id].completed, true);
    assert.ok(snapshot().items.includes('hands/box-hold'));
    const after = snapshot();
    assert.throws(() => store.claimQuest(user, delivery.id, 'rani-opening', catalog));
    assert.deepEqual(snapshot(), after);
    assert.deepEqual(new Inventories(directory).snapshot(user, catalog), after);
    const mia = chains[1]; store.acceptQuest(user, mia.id, catalog);
    const stages = store.questStages(user);
    store.rewardCoffee(user, { id: 'old-round', finished: true, score: 9999, orders: 100 });
    assert.equal(snapshot().quests[mia.id].steps[0].ready, false);
    store.rewardCoffee(user, { id: 'new-round', finished: true, score: 2800, orders: 140, questStages: stages });
    assert.equal(snapshot().quests[mia.id].steps[0].ready, true);
    const saved = snapshot();
    store.rewardCoffee(user, { id: 'new-round', finished: true, score: 2800, orders: 140, questStages: stages });
    assert.deepEqual(snapshot(), saved);
    store.claimQuest(user, mia.id, 'first-cups', catalog);
    assert.equal(new QuestGround([], resolveMovement).list(snapshot().quests).length, 0, 'New room starts with a delay');
    const profile = store.load(user);
    // A game started at a previous stage cannot advance a later one.
    assert.deepEqual(advance(profile, 'coffeeOrders', 999, stages), profile.quests);
    assert.equal(capture(profile)[mia.id], 'napkins');
    for (let i = 0; i < 45; i++) store.collectQuestItem(user, mia.id, 'napkins', catalog);
    const beforeHat = snapshot();
    const persist = store.persist;
    store.persist = () => { throw Error('disk failure'); };
    assert.throws(() => store.claimQuest(user, mia.id, 'napkins', catalog), /disk failure/);
    assert.deepEqual(snapshot(), beforeHat);
    store.persist = persist;
    store.claimQuest(user, mia.id, 'napkins', catalog);
    assert.ok(snapshot().items.includes('hat/coffee-hat'));
    assert.equal(snapshot().quests[mia.id].completed, true);
    assert.throws(() => store.claimQuest(user, mia.id, 'napkins', catalog));
    const oldUser = { id: 'old-progress', username: 'OldProgress' };
    const old = store.load(oldUser);
    store.persist(oldUser, { ...old, rankingPoints: 940, quests: {
        'mia-first-shift': { started: true, claimed: 1, progress: { napkins: 8 } },
        'square-winter': { started: true, claimed: 1 },
        'mia-big-evening': { started: true, claimed: 2 }
    } });
    const migrated = store.snapshot(oldUser, catalog).quests;
    assert.equal(migrated['mia-first-shift'].steps[migrated['mia-first-shift'].claimedSteps].id, 'napkins');
    assert.equal(migrated['mia-first-shift'].steps[1].progressText, '8 / 45');
    assert.equal(migrated['square-winter'].steps[migrated['square-winter'].claimedSteps].id, 'winter-report');
    assert.equal(migrated['mia-big-evening'], undefined);
    assert.throws(() => store.claimQuest(oldUser, 'square-winter', 'winter-snow', catalog));
    // One objective for each minigame and collectible kind, including the tutorial.
    const allSteps = chains.flatMap(chain => chain.steps).concat(require('../shared/leo-quests.json').steps);
    assert.equal(allSteps.filter(step => step.rule === 'snowTotal').length, 1);
    assert.equal(allSteps.filter(step => step.rule === 'coffeeOrders').length, 1);
    for (const kind of ['parcel', 'napkin', 'ribbon']) {
        assert.equal(allSteps.filter(step => step.rule === 'collect' && step.collectible === kind).length, 1);
    }
    assert.deepEqual(new Inventories(directory).snapshot(user, catalog), snapshot());
    console.log('PASS resident quests: rank unlocks, handoff, cumulative fresh progress, collectibles, proximity, duplicate protection and persistence');
} finally {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
}
