const { Inventories, InventoryError } = require('../../server/inventory.cjs');
// Keep rendering/chat/movement tests independent of on-disk account data.
class MemoryInventories extends Inventories {
    load(user) {
        if (!this.profiles.has(user.id)) this.persist(user, {
            version: 1, items: ['body-color/white'], equipped: { bodyColor: 'body-color/white' },
            currency: 1000, revision: 0
        });
        return this.profiles.get(user.id);
    }
    persist(user, profile) { this.profiles.set(user.id, profile); }
}
module.exports = { Inventories: MemoryInventories, InventoryError };
