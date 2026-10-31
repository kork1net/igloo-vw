import catalog from './catalog.generated.json';

export const clothingItems = catalog.items;
export const clothingSlots = catalog.slots;
export const getClothingItem = id => clothingItems.find(item => item.id === id);
export const inventoryCategories = [
    { id: 'bodyColor', name: 'צבע שחקן', slots: ['bodyColor'] },
    { id: 'hat', name: 'כובעים', slots: ['hat'] },
    { id: 'hair', name: 'שיער', slots: ['hair'] },
    { id: 'accessory', name: 'אקססוריז', slots: ['accessory'] },
    { id: 'shirt', name: 'חולצות', slots: ['shirt', 'jacket'] },
    { id: 'pants', name: 'מכנסיים', slots: ['pants'] },
    { id: 'shoes', name: 'נעליים', slots: ['shoes'] }
];

export function normalizeEquipment(equipped) {
    return Object.fromEntries(clothingSlots.map(slot => [slot,
        getClothingItem(equipped?.[slot])?.slot === slot ? equipped[slot] : null]));
}

export function loadClothing(scene) {
    const queued = new Set();
    for (const item of clothingItems) {
        if (item.slot === 'bodyColor') continue;
        for (const sheet of [item, ...Object.values(item.walkTextures || {})]) {
            if (!queued.has(sheet.texture) && !scene.textures.exists(sheet.texture)) {
                queued.add(sheet.texture);
                scene.load.spritesheet(sheet.texture, sheet.path, {
                    frameWidth: item.frameWidth, frameHeight: item.frameHeight
                });
            }
        }
    }
}

export function getClothingTexture(scene, item, bodyTexture = 'player') {
    const texture = item.walkTextures?.[bodyTexture]?.texture || item.texture;
    if (!item.hue || scene.game.renderer.gl) return texture;
    // Canvas renderer fallback: recolor once per shared sheet, never on every frame.
    const key = `${texture}:hue:${item.hue}`;
    if (!scene.textures.exists(key)) {
        const source = scene.textures.get(texture).getSourceImage();
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const context = canvas.getContext('2d');
        context.filter = `hue-rotate(${item.hue}deg)`;
        context.drawImage(source, 0, 0);
        scene.textures.addSpriteSheet(key, canvas, {
            frameWidth: item.frameWidth, frameHeight: item.frameHeight
        });
    }
    return key;
}

export function applyClothingColor(scene, sprite, item) {
    if (item.slot === 'bodyColor') { sprite.setTint(item.tint); return; }
    sprite.setTint(item.tint ?? 0xffffff);
    const hue = item.hue || 0;
    if (sprite.clothingHue === hue) return;
    sprite.clothingHue = hue;
    if (!scene.game.renderer.gl) return;
    if (!hue) { sprite.clothingColorFilter?.setActive(false); return; }
    if (!sprite.clothingColorFilter) {
        sprite.enableFilters();
        sprite.clothingColorFilter = sprite.filters.external.addColorMatrix();
    }
    sprite.clothingColorFilter.colorMatrix.reset().hue(hue);
    sprite.clothingColorFilter.setActive(true);
}

// Used by local/remote players and both preview windows.
export class ClothingLayers {
    constructor(scene, container, x = 0, y = 24, scale = 1, body = null, gender = 'male') {
        this.scene = scene;
        this.container = container;
        this.x = x;
        this.y = y;
        this.scale = scale;
        this.body = body;
        this.sprites = new Map();
        this.equipped = normalizeEquipment({});
        if (gender === 'female') {
            this.eyelashes = scene.add.sprite(x, y, 'eyelashes', 0)
                .setOrigin(0.5, 1).setScale(scale);
            container.add(this.eyelashes);
        }
    }

    setEquipment(equipped) {
        this.equipped = normalizeEquipment(equipped);
        this.body?.setTint(getClothingItem(this.equipped.bodyColor)?.tint ?? 0xffffff);
        for (const slot of clothingSlots) {
            if (slot === 'bodyColor') continue;
            const item = getClothingItem(this.equipped[slot]);
            let sprite = this.sprites.get(slot);
            if (!item) { sprite?.setVisible(false); continue; }
            if (!sprite) {
                sprite = this.scene.add.sprite(this.x, this.y, getClothingTexture(this.scene, item), 0)
                    .setOrigin(0.5, 1).setScale(this.scale);
                this.container.add(sprite);
                this.sprites.set(slot, sprite);
            }
            const texture = getClothingTexture(this.scene, item);
            if (sprite.texture.key !== texture) sprite.setTexture(texture, 0);
            applyClothingColor(this.scene, sprite, item);
            sprite.setVisible(true);
        }
        // Restore layer order even when items were equipped in a different order.
        const layerOrder = slot => /necklace\.png$/i.test(getClothingItem(this.equipped[slot])?.path || '')
            ? clothingSlots.indexOf('hair') - 0.5 : clothingSlots.indexOf(slot);
        const drawOrder = [...clothingSlots].sort((a, b) => layerOrder(a) - layerOrder(b));
        for (const slot of drawOrder) {
            const sprite = this.sprites.get(slot);
            if (sprite) this.container.bringToTop(sprite);
        }
        if (this.eyelashes) this.container.bringToTop(this.eyelashes);
    }

    update(direction = 0, facingLeft = false, offsetX = 0, bodyTexture = 'player') {
        if (this.eyelashes) {
            this.eyelashes.setFrame(direction).setFlipX(facingLeft);
            this.eyelashes.x = this.x + offsetX * this.scale;
        }
        for (const [slot, sprite] of this.sprites) {
            const item = getClothingItem(this.equipped[slot]);
            if (!item) continue;
            const texture = getClothingTexture(this.scene, item, bodyTexture);
            if (sprite.texture.key !== texture) sprite.setTexture(texture, direction);
            else sprite.setFrame(direction);
            sprite.setFlipX(facingLeft);
            sprite.x = this.x + offsetX * this.scale;
            sprite.y = this.y;
            sprite.setScale(this.scale);
        }
    }
}
