const fs = require('node:fs');
const path = require('node:path');
const { normalizeEquipment } = require('../scripts/item-catalog.cjs');
const economy = require('./economy.json');
const shopItems = require('./shop-catalog.json');
const { starterColors } = require('../shared/registration.json');
const WHITE = 'body-color/white';

class InventoryError extends Error {}

class Inventories {
    constructor(directory = path.join(__dirname, 'data/players')) {
        this.directory = path.resolve(directory);
        this.profiles = new Map();
    }

    filename(user) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(user.id)) throw new Error('Invalid player ID');
        return path.join(this.directory, `${user.id}.json`);
    }

    load(user) {
        if (this.profiles.has(user.id)) return this.profiles.get(user.id);
        const filename = this.filename(user);
        let profile;
        if (fs.existsSync(filename)) {
            profile = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (!Array.isArray(profile.items) || !profile.equipped
                || !Number.isSafeInteger(profile.currency) || profile.currency < 0) {
                throw new Error('Invalid saved player inventory');
            }
        } else {
            const starterColor = starterColors.includes(user.starterColor) ? user.starterColor : WHITE;
            profile = { version: 1, items: [starterColor], equipped: { bodyColor: starterColor },
                currency: economy.startingCurrency, revision: 0 };
            this.persist(user, profile);
        }
        this.profiles.set(user.id, profile);
        return profile;
    }

    persist(user, profile) {
        const filename = this.filename(user);
        fs.mkdirSync(this.directory, { recursive: true });
        fs.writeFileSync(filename + '.tmp', JSON.stringify(profile, null, 2));
        fs.renameSync(filename + '.tmp', filename);
        // Publish only after the atomic file replacement succeeds.
        this.profiles.set(user.id, profile);
    }

    snapshot(user, catalog) {
        const profile = this.load(user);
        const known = new Set(catalog.items.map(item => item.id));
        const items = user.isAdmin ? [...known]
            : [...new Set(profile.items)].filter(id => known.has(id));
        const owned = new Set(items);
        const equipped = normalizeEquipment(profile.equipped, catalog);
        for (const slot of Object.keys(equipped)) {
            if (!owned.has(equipped[slot])) equipped[slot] = null;
        }
        if (!equipped.bodyColor) {
            equipped.bodyColor = owned.has(WHITE) ? WHITE
                : catalog.items.find(item => item.slot === 'bodyColor' && owned.has(item.id))?.id || null;
        }
        return { items, equipped, currency: profile.currency, revision: profile.revision || 0 };
    }

    equip(user, itemId, shouldEquip, catalog) {
        const item = catalog.items.find(item => item.id === itemId);
        const inventory = this.snapshot(user, catalog);
        if (!item || !inventory.items.includes(itemId)) {
            throw new InventoryError('הפריט אינו בבעלותך.');
        }
        const equipped = { ...inventory.equipped,
            [item.slot]: shouldEquip ? itemId : item.slot === 'bodyColor' ? inventory.equipped.bodyColor : null };
        if (JSON.stringify(equipped) === JSON.stringify(inventory.equipped)) return inventory;
        const profile = this.load(user);
        this.persist(user, { ...profile, equipped, revision: inventory.revision + 1 });
        return this.snapshot(user, catalog);
    }

    purchase(user, itemId, catalog) {
        if (!this.shopCatalog(catalog).some(item => item.id === itemId)) {
            throw new InventoryError('הפריט אינו זמין לרכישה.');
        }
        const inventory = this.snapshot(user, catalog);
        if (inventory.items.includes(itemId)) throw new InventoryError('הפריט כבר נמצא בתיק שלך.');
        if (inventory.currency < economy.itemPrice) throw new InventoryError('אין לך מספיק מטבעות.');
        const profile = this.load(user);
        this.persist(user, { ...profile, items: [...new Set([...profile.items, itemId])],
            currency: inventory.currency - economy.itemPrice, revision: inventory.revision + 1 });
        return this.snapshot(user, catalog);
    }

    shopCatalog(catalog) {
        return catalog.items.filter(item => shopItems.includes(item.id))
            .map(item => ({ id: item.id, price: economy.itemPrice }));
    }
}

module.exports = { Inventories, InventoryError };
