const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const { chain } = require('../server/quests.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-quests-'));
try {
    const store = new Inventories(directory), catalog = buildCatalog();
    const user = { id: 'quest-player', username: 'QuestPlayer' };
    const view = () => store.snapshot(user, catalog).quests[chain.id];
    const claim = id => store.claimQuest(user, chain.id, id, catalog);
    assert.equal(view().residentId, 'leo');
    assert.throws(() => claim('meet-rani'));
    store.acceptQuest(user, chain.id, catalog);
    const accepted = store.snapshot(user, catalog);
    store.acceptQuest(user, chain.id, catalog);
    assert.deepEqual(store.snapshot(user, catalog), accepted);
    assert.equal(view().residentId, 'rani');
    assert.throws(() => claim('first-purchase'));
    claim('meet-rani');
    assert.throws(() => claim('meet-rani'));
    assert.throws(() => claim('first-purchase'));
    store.purchase(user, 'shirt/black-shirt', catalog);
    claim('first-purchase');
    assert.equal(view().residentId, 'mia');
    claim('meet-mia');
    assert.equal(view().steps[view().claimedSteps].id, 'first-coffee');
    store.rewardCoffee(user, { id: 'old-coffee', finished: true, score: 999, orders: 20 });
    assert.equal(view().steps[3].ready, false);
    const captured = store.questStages(user);
    store.rewardCoffee(user, { id: 'low-coffee', finished: true, score: 40, orders: 2, questStages: captured });
    assert.equal(view().steps[3].ready, false);
    store.rewardCoffee(user, { id: 'good-coffee', finished: true, score: 60, orders: 3, questStages: captured });
    assert.equal(view().steps[3].ready, true);
    claim('first-coffee');
    assert.equal(view().residentId, 'leo');
    store.rewardSnow(user, { id: 'old-snow', elapsed: 45000, score: 1000, catches: 30, questStepId: 'snow-catch' });
    assert.equal(view().steps[4].ready, false);
    store.rewardSnow(user, { id: 'low-snow', elapsed: 45000, score: 90, catches: 9, questStepId: 'first-snow' });
    assert.equal(view().steps[4].ready, false);
    store.rewardSnow(user, { id: 'good-snow', elapsed: 45000, score: 100, catches: 10, questStepId: 'first-snow' });
    claim('first-snow');
    assert.throws(() => claim('ready-for-igloo'));
    store.equip(user, 'shirt/black-shirt', true, catalog);
    assert.equal(view().steps[5].ready, true);
    const before = store.snapshot(user, catalog), persist = store.persist;
    store.persist = () => { throw Error('disk failure'); };
    assert.throws(() => claim('ready-for-igloo'), /disk failure/);
    assert.deepEqual(store.snapshot(user, catalog), before);
    store.persist = persist;
    claim('ready-for-igloo');
    const complete = store.snapshot(user, catalog);
    assert.equal(view().completed, true);
    assert.ok(complete.items.includes('accessory/black-sun-glasses'));
    assert.equal(complete.currency, before.currency + chain.steps[5].coins);
    assert.throws(() => claim('ready-for-igloo'));
    assert.deepEqual(new Inventories(directory).snapshot(user, catalog), complete);
    const legacy = { id: 'legacy-player', username: 'LegacyPlayer' };
    const profile = store.load(legacy);
    for (const saved of [
        { started: true, completed: true, claimedIds: ['first-purchase','ready-for-igloo'] },
        { started: true, claimed: 3 }
    ]) {
        store.persist(legacy, { ...profile, quests: { [chain.id]: saved } });
        assert.equal(store.snapshot(legacy, catalog).quests[chain.id].completed, true);
        assert.throws(() => store.claimQuest(legacy, chain.id, 'ready-for-igloo', catalog));
    }
    store.persist(legacy, { ...profile, quests: { [chain.id]: { started: true, claimedIds: ['first-purchase'] } } });
    store.claimQuest(legacy, chain.id, 'meet-rani', catalog);
    const migrated = store.snapshot(legacy, catalog).quests[chain.id];
    assert.equal(migrated.steps[migrated.claimedSteps].id, 'meet-mia', 'Prior purchase step is not repaid');
    console.log('PASS tutorial: resident handoffs, single purchase, fresh coffee/snow score, outfit, rewards, rollback and legacy progress');
} finally {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
}
