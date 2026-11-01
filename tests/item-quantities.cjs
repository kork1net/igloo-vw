const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const { chain } = require('../server/quests.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-quantities-'));
try {
    const catalog = buildCatalog(), store = new Inventories(directory);
    const a = { id: 'a', username: 'Alice' }, b = { id: 'b', username: 'Bob' }, admin = { id: 'admin', username: 'Koko', isAdmin: true };
    const shirt = 'shirt/red-shirt', white = 'body-color/white';
    const oldProfile = { version: 1, items: [white, shirt], equipped: { bodyColor: white, shirt }, currency: 100, purchasedItems: [] };
    fs.writeFileSync(store.filename(a), JSON.stringify(oldProfile));
    fs.writeFileSync(store.filename(b), JSON.stringify(oldProfile));
    assert.equal(store.snapshot(a, catalog).quantities[shirt], 1);
    store.exchange([a, b], [[shirt], []], catalog, 'quantity-trade-001');
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 2);
    assert.equal(store.snapshot(b, catalog).items.filter(id => id === shirt).length, 1);
    assert.equal(store.snapshot(a, catalog).equipped.shirt, null);
    store.exchange([b, a], [[shirt], []], catalog, 'quantity-trade-002');
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 1);
    assert.equal(store.snapshot(b, catalog).equipped.shirt, shirt);
    assert.throws(() => store.exchange([b, a], [[shirt, shirt], []], catalog, 'quantity-trade-003'));
    store.exchange([b, a], [[shirt], [shirt]], catalog, 'quantity-trade-004');
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 1);
    assert.equal(store.snapshot(b, catalog).equipped.shirt, shirt);
    store.equip(admin, shirt, true, catalog);
    const originalAdmin = store.load(admin);
    store.exchange([admin, b], [Array(6).fill(shirt), []], catalog, 'quantity-trade-005');
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 7);
    store.exchange([b, admin], [[shirt, shirt], []], catalog, 'quantity-trade-006');
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 5);
    assert.equal(store.snapshot(admin, catalog).quantities[shirt], null);
    assert.equal(store.snapshot(admin, catalog).unlimitedItems, true);
    assert.deepEqual(store.load(admin).items, originalAdmin.items);
    assert.deepEqual(store.load(admin).quantities, originalAdmin.quantities);
    assert.deepEqual(store.load(admin).equipped, originalAdmin.equipped);
    store.purchase(b, shirt, catalog);
    assert.equal(store.snapshot(b, catalog).quantities[shirt], 6);
    assert.equal(new Inventories(directory).snapshot(b, catalog).quantities[shirt], 6);
    const before = [store.snapshot(b, catalog), store.snapshot(a, catalog)];
    const rename = fs.renameSync; let failed = false;
    try {
        fs.renameSync = (from, to) => {
            if (to === store.filename(a) && !failed) { failed = true; throw Error('Disk failure'); }
            return rename(from, to);
        };
        assert.throws(() => store.exchange([b, a], [[shirt, shirt], []], catalog, 'quantity-trade-007'));
    } finally { fs.renameSync = rename; }
    assert.deepEqual([store.snapshot(b, catalog), store.snapshot(a, catalog)], before);
    const glasses = 'accessory/black-sun-glasses', green = 'shirt/green-shirt';
    const profile = store.load(b);
    store.persist(b, { ...profile, items: [...profile.items, glasses, green],
        purchasedItems: [shirt, green], quests: { [chain.id]: {
            started: true, claimed: 3, claimedIds: chain.steps.slice(0, 3).map(step => step.id)
        } } });
    store.claimQuest(b, chain.id, chain.steps[3].id, catalog);
    assert.equal(store.snapshot(b, catalog).quantities[glasses], 2);
    assert.equal(store.snapshot(b, catalog).maxItemQuantity, 20);
    const capUser = { id: 'capped', username: 'Capped' };
    const capProfile = store.load(capUser);
    store.persist(capUser, { ...capProfile, currency: 1000, items: [white, shirt], quantities: { [white]: 1, [shirt]: 19 } });
    store.purchase(capUser, shirt, catalog);
    assert.equal(store.snapshot(capUser, catalog).quantities[shirt], 20);
    const atLimit = store.snapshot(capUser, catalog);
    assert.throws(() => store.purchase(capUser, shirt, catalog), /20/);
    assert.deepEqual(store.snapshot(capUser, catalog), atLimit);
    const beforeAdmin = store.snapshot(admin, catalog);
    assert.throws(() => store.exchange([admin, capUser], [[shirt], []], catalog, 'capped-trade-001'), /20/);
    assert.deepEqual(store.snapshot(capUser, catalog), atLimit);
    assert.deepEqual(store.snapshot(admin, catalog), beforeAdmin);
    store.exchange([capUser, admin], [[shirt], [shirt]], catalog, 'capped-trade-002');
    assert.equal(store.snapshot(capUser, catalog).quantities[shirt], 20);
    store.persist(capUser, { ...store.load(capUser), items: [white, shirt, green, glasses],
        quantities: { [white]: 1, [shirt]: 20, [green]: 1, [glasses]: 20 },
        equipped: { bodyColor: white, shirt }, purchasedItems: [shirt, green],
        quests: { [chain.id]: { started: true, claimed: 3, claimedIds: chain.steps.slice(0, 3).map(step => step.id) } } });
    const cappedQuest = store.snapshot(capUser, catalog);
    assert.throws(() => store.claimQuest(capUser, chain.id, chain.steps[3].id, catalog), /20/);
    assert.deepEqual(store.snapshot(capUser, catalog), cappedQuest);
    console.log('PASS: legacy migration, duplicate ownership, multi-copy/same-item trades, last-copy unequip, unlimited admins, repeat purchases, reward copies, persistence and rollback');
    console.log('PASS: 20-copy cap on purchases, quest rewards and trades; rejected acquisitions preserve balances, progress and both inventories');
} finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('vw-quantities-'));
    fs.rmSync(resolved, { recursive: true });
}
