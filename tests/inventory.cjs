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
    assert.equal(store.snapshot(user, catalog).lastRoom, 'Game');
    store.rememberRoom(user, 'Shop');
    assert.equal(new Inventories(directory).snapshot(user, catalog).lastRoom, 'Shop');
    store.rememberRoom(user, 'Cafe');
    assert.equal(new Inventories(directory).snapshot(user, catalog).lastRoom, 'Cafe');
    assert.throws(() => store.rememberRoom(user, 'MainMenu'), /Invalid room/);
    assert.equal(store.snapshot(other, catalog).lastRoom, 'Game');
    assert.equal(store.load(user).x, undefined);
    assert.equal(store.load(user).y, undefined);
    const shirtPrice = store.shopCatalog(catalog).find(item => item.id === shirt).price;
    const blue = 'body-color/blue';
    const first = store.snapshot(user, catalog);
    assert.deepEqual(first.items, [white]);
    assert.equal(first.currency, economy.startingCurrency);
    assert.equal(first.equipped.bodyColor, white);
    assert.equal(first.equipped.shirt, null);
    assert.throws(() => store.equip(user, shirt, true, catalog), /בבעלותך/);
    assert.equal(first.quantities[white], 1);
    assert.throws(() => store.purchase(user, 'nonexistent', catalog));
    store.persist(user, { ...store.load(user), currency: 1000 });
    store.purchase(user, shirt, catalog);
    store.purchase(user, blue, catalog, 'colors');
    assert.equal(store.snapshot(user, catalog).currency, 1000 - shirtPrice - economy.colorPrice);
    store.purchase(user, shirt, catalog);
    assert.equal(store.snapshot(user, catalog).quantities[shirt], 2);
    assert.equal(store.snapshot(user, catalog).currency, 1000 - 2 * shirtPrice - economy.colorPrice);
    store.equip(user, shirt, true, catalog);
    store.equip(user, blue, true, catalog);
    const saved = new Inventories(directory).snapshot(user, catalog);
    assert.equal(saved.equipped.shirt, shirt);
    assert.equal(saved.equipped.bodyColor, blue);
    assert.equal(saved.currency, 1000 - 2 * shirtPrice - economy.colorPrice);
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
    assert.equal(store.shopCatalog(catalog).length, 32);
    assert.ok(store.shopCatalog(catalog).some(item => item.id === 'shirt/red-shirt--pink' && item.price === 35));
    for (const suffix of ['', '--green', '--blue', '--black', '--pink']) {
        const id = `shirt/simple-red-shirt${suffix}`;
        assert.ok(catalog.items.some(item => item.id === id && item.slot === 'shirt'));
        assert.ok(store.shopCatalog(catalog).some(item => item.id === id && item.price === (suffix === '--black' ? 55 : 35)));
    }
    const newPants = ['pants/blue-jeans--black', ...['', '--green', '--burgundy', '--purple', '--black']
        .map(suffix => `pants/blue-shorts${suffix}`)];
    for (const id of newPants) {
        assert.ok(catalog.items.some(item => item.id === id && item.slot === 'pants'));
        assert.ok(store.shopCatalog(catalog).some(item => item.id === id && item.price === (id.endsWith('--black') ? 55 : 35)));
    }
    assert.ok(!store.shopCatalog(catalog).some(item => item.id.startsWith('pants/baggy-gray-pants--')));
    assert.ok(!store.shopCatalog(catalog).some(item => item.id.startsWith('hair/')));
    const shopHair = store.shopCatalog(catalog, 'hair');
    assert.ok(shopHair.every(item => item.id.startsWith('hair/')));
    assert.equal(shopHair.length, 6);
    for (const base of ['eye-cover-girl-hair', 'short-hair']) {
        for (const suffix of ['', '--blonde', '--black']) assert.ok(shopHair.some(item => item.id === `hair/${base}${suffix}`));
    }
    assert.ok(!shopHair.some(item => item.id === 'hair/boy-messy-hair-1'));
    for (const suffix of ['--blonde', '--black']) {
        const item = catalog.items.find(item => item.id === `hair/boy-messy-hair-1${suffix}`);
        assert.equal(item?.slot, 'hair');
        assert.equal(item?.sourceItem, 'hair/boy-messy-hair-1');
    }
    const hairBuyer = { id: 'hair-buyer', username: 'HairBuyer' };
    assert.throws(() => store.purchase(hairBuyer, shopHair[0].id, catalog));
    assert.throws(() => store.purchase(hairBuyer, shirt, catalog, 'hair'));
    assert.throws(() => store.shopCatalog(catalog, '__proto__'));
    store.purchase(hairBuyer, shopHair[0].id, catalog, 'hair');
    assert.ok(store.snapshot(hairBuyer, catalog).items.includes(shopHair[0].id));
    assert.equal(store.snapshot(hairBuyer, catalog).currency, economy.startingCurrency - economy.hairPrice);
    const premiumItems = ['shirt/black-shirt', 'shirt/simple-red-shirt--black',
        'pants/blue-jeans--black', 'pants/blue-shorts--black'];
    for (const item of store.shopCatalog(catalog)) {
        assert.equal(item.price, premiumItems.includes(item.id) ? 55 : 35);
    }
    for (const [index, id] of premiumItems.entries()) {
        const buyer = { id: `premium-buyer-${index}`, username: `PremiumBuyer${index}` };
        store.persist(buyer, { ...store.load(buyer), currency: 54 });
        const before = store.snapshot(buyer, catalog);
        assert.throws(() => store.purchase(buyer, id, catalog), /מספיק/);
        assert.deepEqual(store.snapshot(buyer, catalog), before, 'An unaffordable premium item must not change money or items');
        store.persist(buyer, { ...store.load(buyer), currency: 55 });
        const purchased = store.purchase(buyer, id, catalog);
        assert.equal(purchased.currency, 0, 'Black shirts and pants must charge exactly the advertised 55 coins');
        assert.equal(purchased.quantities[id], 1);
        const reloaded = new Inventories(directory).snapshot(buyer, catalog);
        assert.equal(reloaded.currency, 0);
        assert.ok(reloaded.items.includes(id));
    }
    assert.ok(!store.shopCatalog(catalog).some(item => item.id.startsWith('body-color/')));
    const shopColors = store.shopCatalog(catalog, 'colors');
    assert.equal(shopColors.length, 8);
    assert.ok(shopColors.every(item => item.id.startsWith('body-color/') && item.price === 150));
    assert.ok(shopHair.every(item => item.price === 90));
    assert.throws(() => store.purchase(other, blue, catalog, 'colors'));
    assert.equal(store.snapshot(other, catalog).currency, economy.startingCurrency);
    for (const id of ['shirt/red-dress', 'shirt/red-dress--blue', 'shirt/red-dress--green', 'shirt/red-dress--purple']) {
        assert.ok(store.shopCatalog(catalog).some(item => item.id === id));
    }
    assert.ok(!store.shopCatalog(richerCatalog).some(item => item.id === 'shirt/future'));
    assert.throws(() => store.purchase(user, 'shirt/future', richerCatalog));
    const coloredUser = { id: 'colored', username: 'Colored', starterColor: 'body-color/mint' };
    assert.deepEqual(store.snapshot(coloredUser, catalog).items, ['body-color/mint']);
    assert.equal(store.snapshot(coloredUser, catalog).equipped.bodyColor, 'body-color/mint');
    store.persist(coloredUser, { ...store.load(coloredUser), currency: 200 });
    store.purchase(coloredUser, white, catalog, 'colors');
    assert.equal(store.snapshot(coloredUser, catalog).currency, 200 - economy.colorPrice);
    assert.equal(new Inventories(directory).snapshot(coloredUser, catalog).equipped.bodyColor, 'body-color/mint');

    store.persist(other, { ...store.load(other), currency: 9 });
    assert.throws(() => store.purchase(other, shirt, catalog), /מספיק/);
    assert.equal(store.snapshot(other, catalog).currency, 9);
    const before = store.snapshot(user, catalog);
    const persist = store.persist;
    store.persist = () => { throw new Error('Simulated disk failure'); };
    assert.throws(() => store.purchase(user, 'body-color/pink', catalog, 'colors'), /disk/);
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
