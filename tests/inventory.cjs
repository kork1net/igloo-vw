const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const economy = require('../server/economy.json');
const { Inventories } = require('../server/inventory.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-inventory-'));
try {
    const catalog = buildCatalog();
    const store = new Inventories(directory);
    const user = { id: 'ordinary', username: 'Ordinary', isAdmin: false };
    const other = { id: 'other', username: 'Other', isAdmin: false };
    const admin = { id: 'admin', username: 'Koko', isAdmin: true };
    const white = 'body-color/white';
    const shirt = catalog.items.find(item => item.slot === 'shirt').id;
    const blue = 'body-color/blue';
    const first = store.snapshot(user, catalog);
    assert.deepEqual(first.items, [white]);
    assert.equal(first.currency, economy.startingCurrency);
    assert.equal(first.equipped.bodyColor, white);
    assert.equal(first.equipped.shirt, null);
    assert.throws(() => store.equip(user, shirt, true, catalog), /בבעלותך/);
    assert.equal(first.quantities[white], 1);
    assert.throws(() => store.purchase(user, 'nonexistent', catalog));
    store.purchase(user, shirt, catalog);
    store.purchase(user, blue, catalog);
    assert.equal(store.snapshot(user, catalog).currency, economy.startingCurrency - 2 * economy.itemPrice);
    store.purchase(user, shirt, catalog);
    assert.equal(store.snapshot(user, catalog).quantities[shirt], 2);
    assert.equal(store.snapshot(user, catalog).currency, economy.startingCurrency - 3 * economy.itemPrice);
    store.equip(user, shirt, true, catalog);
    store.equip(user, blue, true, catalog);
    const saved = new Inventories(directory).snapshot(user, catalog);
    assert.equal(saved.equipped.shirt, shirt);
    assert.equal(saved.equipped.bodyColor, blue);
    assert.equal(saved.currency, economy.startingCurrency - 3 * economy.itemPrice);
    assert.equal(saved.quantities[shirt], 2);
    assert.equal(saved.items.length, 3);
    assert.deepEqual(store.snapshot(other, catalog).items, [white]);

    const richerCatalog = { ...catalog, items: [...catalog.items,
        { id: 'shirt/future', slot: 'shirt', name: 'Future shirt' }] };
    assert.equal(store.snapshot(admin, catalog).items.length, catalog.items.length);
    assert.ok(store.snapshot(admin, richerCatalog).items.includes('shirt/future'));
    assert.ok(!store.snapshot(user, richerCatalog).items.includes('shirt/future'));
    store.equip(admin, 'shirt/future', true, richerCatalog);
    assert.equal(new Inventories(directory).snapshot(admin, richerCatalog).equipped.shirt, 'shirt/future');
    // Losing admin status cannot retain unpurchased admin-only items or equipment.
    assert.ok(!store.snapshot({ ...admin, isAdmin: false }, richerCatalog).items.includes('shirt/future'));
    assert.equal(store.snapshot({ ...admin, isAdmin: false }, richerCatalog).equipped.shirt, null);

    const withoutShirt = { ...catalog, items: catalog.items.filter(item => item.id !== shirt) };
    assert.equal(store.snapshot(user, withoutShirt).equipped.shirt, null);
    assert.equal(store.snapshot(user, catalog).equipped.shirt, shirt);
    assert.equal(store.shopCatalog(catalog).length, 34);
    const shopHair = store.shopCatalog(catalog).filter(item => item.id.startsWith('hair/'));
    assert.equal(shopHair.length, 6);
    for (const base of ['eye-cover-girl-hair', 'short-hair']) {
        for (const suffix of ['', '--blonde', '--black']) assert.ok(shopHair.some(item => item.id === `hair/${base}${suffix}`));
    }
    assert.ok(!shopHair.some(item => item.id === 'hair/boy-messy-hair-1'));
    assert.ok(store.shopCatalog(catalog).every(item => item.price === 10));
    assert.ok(store.shopCatalog(catalog).some(item => item.id === white));
    for (const id of ['shirt/red-dress', 'shirt/red-dress--blue', 'shirt/red-dress--green', 'shirt/red-dress--purple']) {
        assert.ok(store.shopCatalog(catalog).some(item => item.id === id));
    }
    assert.ok(!store.shopCatalog(richerCatalog).some(item => item.id === 'shirt/future'));
    assert.throws(() => store.purchase(user, 'shirt/future', richerCatalog));
    const coloredUser = { id: 'colored', username: 'Colored', starterColor: 'body-color/mint' };
    assert.deepEqual(store.snapshot(coloredUser, catalog).items, ['body-color/mint']);
    assert.equal(store.snapshot(coloredUser, catalog).equipped.bodyColor, 'body-color/mint');
    store.purchase(coloredUser, white, catalog);
    assert.equal(store.snapshot(coloredUser, catalog).currency, economy.startingCurrency - economy.itemPrice);
    assert.equal(new Inventories(directory).snapshot(coloredUser, catalog).equipped.bodyColor, 'body-color/mint');

    store.persist(other, { ...store.load(other), currency: 9 });
    assert.throws(() => store.purchase(other, shirt, catalog), /מספיק/);
    assert.equal(store.snapshot(other, catalog).currency, 9);
    const before = store.snapshot(user, catalog);
    const persist = store.persist;
    store.persist = () => { throw new Error('Simulated disk failure'); };
    assert.throws(() => store.purchase(user, 'body-color/pink', catalog), /disk/);
    assert.deepEqual(store.snapshot(user, catalog), before);
    store.persist = persist;
    store.equip(user, shirt, false, catalog);
    assert.equal(new Inventories(directory).snapshot(user, catalog).equipped.shirt, null);
    console.log('PASS: starter inventory, ownership, prices, duplicate/insufficient purchases, persistence, equip/unequip, admin grants, catalog growth and save rollback');
} finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('vw-inventory-'));
    fs.rmSync(resolved, { recursive: true });
}
