import catalog from './catalog.generated.json';

export const clothingItems = catalog.items;
export const clothingSlots = catalog.slots;
export const getClothingItem = id => clothingItems.find(item => item.id === id);
export const inventoryCategories = [
    { id: 'bodyColor', name: 'צבע שחקן', slots: ['bodyColor'] },
    { id: 'hat', name: 'כובעים', slots: ['hat'] },
    { id: 'hair', name: 'שיער', slots: ['hair'] },
    { id: 'accessory', name: 'אקססוריז', slots: ['accessory', 'necklace', 'glasses'] },
    { id: 'shirt', name: 'חולצות', slots: ['shirt', 'jacket'] },
    { id: 'pants', name: 'מכנסיים', slots: ['pants'] },
    { id: 'shoes', name: 'נעליים', slots: ['shoes'] },
    { id: 'hands', name: 'דברים לידיים', slots: ['hands'] }
];

export function normalizeEquipment(equipped) {
    return Object.fromEntries(clothingSlots.map(slot => {
        const legacy = ['necklace', 'glasses'].includes(slot) ? equipped?.accessory : null;
        const id = equipped?.[slot] ?? legacy;
        return [slot, getClothingItem(id)?.slot === slot ? id : null];
    }));
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
    let texture = item.walkTextures?.[bodyTexture]?.texture || item.texture;
    if (item.palette) {
        const key = `${texture}:palette:${JSON.stringify(item.palette)}`;
        if (!scene.textures.exists(key)) {
            const source = scene.textures.get(texture).getSourceImage();
            const canvas = document.createElement('canvas');
            canvas.width = source.width; canvas.height = source.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(source, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const colors = new Map(Object.entries(item.palette).map(([from, to]) => [parseInt(from.slice(1), 16), parseInt(to.slice(1), 16)]));
            for (let i = 0; i < pixels.data.length; i += 4) {
                if (!pixels.data[i + 3]) continue;
                const original = (pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2];
                const pixel = i / 4;
                const color = hanukiaRainbowColor(item, original,
                    (pixel % canvas.width) % item.frameWidth,
                    Math.floor(pixel / canvas.width) % item.frameHeight,
                    Math.floor((pixel % canvas.width) / item.frameWidth)) ?? colors.get(original);
                if (color === undefined) continue;
                pixels.data[i] = color >> 16;
                pixels.data[i + 1] = (color >> 8) & 255;
                pixels.data[i + 2] = color & 255;
            }
            context.putImageData(pixels, 0, 0);
            scene.textures.addSpriteSheet(key, canvas, { frameWidth: item.frameWidth, frameHeight: item.frameHeight });
        }
        texture = key;
    }
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

// Candle tips in the original 64x78 direction frames; the side view overlaps them.
const hanukiaCenters = [32, 31, 24, 35, 22, 33, 26];

// This sheet shares the same gray/white palette across all candles. Recolor by
// candle position as well as source color so each candle gets its own color.
function hanukiaRainbowColor(item, original, x, y, direction) {
    if (item.id !== 'hat/hanukia-bow--colorful' || original === 0x3d3d3d) return undefined;
    if (![0xffffff, 0xaaaaaa, 0x747474, 0x5c5c5c].includes(original)) return undefined;
    const rainbow = [0xf26478, 0xffa64d, 0xf7d65a, 0x73ce66, 0x52cfc1, 0x649cef, 0x9b78e5, 0xe780c3, 0xf26478];
    const center = hanukiaCenters[direction] ?? hanukiaCenters[0];
    const index = Math.max(0, Math.min(8, Math.round((x - center + 8) / 2)));
    const color = y <= 8 ? rainbow[index] : 0xe5b94c;
    const shade = original === 0xffffff ? 1 : (original & 255) / 190;
    return (Math.round((color >> 16) * shade) << 16)
        | (Math.round(((color >> 8) & 255) * shade) << 8)
        | Math.round((color & 255) * shade);
}

function addHanukiaFlames(scene, container, hat) {
    const flames = scene.add.graphics();
    container.add(flames);
    let lastStep = -1;
    const draw = time => {
        const item = getClothingItem(hat.hanukiaItem);
        flames.setVisible(hat.visible && (item?.sourceItem || item?.id) === 'hat/hanukia-bow');
        if (!flames.visible) return;
        flames.setPosition(hat.x, hat.y).setScale(hat.scaleX, hat.scaleY);
        const direction = Number(hat.frame.name) || 0;
        const step = Math.floor(time / 130) % 3;
        const state = `${direction}:${hat.flipX}:${step}`;
        if (state === lastStep) return;
        lastStep = state;
        flames.clear();
        const center = hanukiaCenters[direction] ?? hanukiaCenters[0];
        const offsets = direction === 6 ? [0] : [-8, -6, -4, -2, 0, 2, 4, 6, 8];
        offsets.forEach((offset, index) => {
            const tip = direction === 6 ? 0 : offset === 0 ? 0 : 1;
            const x = center + offset - 32;
            const height = 3 + ((step + index) % 2);
            // Integer rectangles keep the effect crisp, with no glow or blur.
            const pixel = (dx, y, color) => {
                flames.fillStyle(color, 1);
                flames.fillRect(hat.flipX ? -dx - 1 : dx, y - 78, 1, 1);
            };
            for (let row = 1; row <= height; row++) pixel(x, tip - row, row === height ? 0xffa735 : 0xff7734);
            pixel(x, tip - 1, 0xffed91);
            pixel(x + ((step + index) % 2 ? 1 : -1), tip - 2, 0xffbe4d);
        });
    };
    scene.events.on('update', draw);
    flames.once('destroy', () => scene.events.off('update', draw));
    draw(scene.time.now);
    return flames;
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
            if (slot === 'hat') {
                sprite.hanukiaItem = item.id;
                if ((item.sourceItem || item.id) === 'hat/hanukia-bow' && !this.hanukiaFlames) {
                    this.hanukiaFlames = addHanukiaFlames(this.scene, this.container, sprite);
                }
            }
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
        const glasses = this.sprites.get('glasses');
        if (glasses?.visible) this.container.bringToTop(glasses);
        if (this.hanukiaFlames) this.container.bringToTop(this.hanukiaFlames);
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
