const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const catalog = buildCatalog();
const hats = catalog.items.filter(item => (item.sourceItem || item.id) === 'hat/hanukia-bow');
assert.equal(hats.length, 3);
assert.deepEqual(hats.map(item => item.id).sort(), [
    'hat/hanukia-bow', 'hat/hanukia-bow--colorful', 'hat/hanukia-bow--gold'
]);
const code = fs.readFileSync('src/game/items/Clothing.js', 'utf8')
    .replace("import catalog from './catalog.generated.json';", '').replace(/^export /gm, '');
const { ClothingLayers, hanukiaRainbowColor } = vm.runInNewContext(code + '\n({ ClothingLayers, hanukiaRainbowColor })', { catalog });
const colorful = hats.find(item => item.id.endsWith('--colorful'));
for (const [direction, center] of [32, 31, 24, 35, 22, 33].entries()) {
    const colors = [-8, -6, -4, -2, 0, 2, 4, 6, 8].map(offset =>
        hanukiaRainbowColor(colorful, 0xffffff, center + offset, 2, direction));
    assert.ok(new Set(colors).size >= 8, 'Candles must have distinct rainbow colors in every front/back direction');
    assert.equal(hanukiaRainbowColor(colorful, 0x3d3d3d, center, 2, direction), undefined);
}
assert.equal(hanukiaRainbowColor(hats.find(item => item.id.endsWith('--gold')), 0xffffff, 24, 2, 0), undefined);
const listeners = new Map();
let onDestroy;
const pixels = [];
const graphics = {
    setVisible(value) { this.visible = value; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setScale(x, y) { this.scaleX = x; this.scaleY = y; return this; },
    fillStyle() {}, fillRect(x, y) { pixels.push([x, y]); },
    clear() { pixels.length = 0; }, once(event, callback) { onDestroy = callback; }
};
const scene = {
    textures: { exists: () => true }, game: { renderer: { gl: true } }, time: { now: 0 },
    events: { on: (event, callback) => listeners.set(event, callback),
        off: (event, callback) => { assert.equal(listeners.get(event), callback); listeners.delete(event); } },
    add: { graphics: () => graphics, sprite(x, y, key) { return {
        x, y, texture: { key }, frame: { name: 0 },
        setOrigin() { return this; }, setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
        setTexture(key, frame) { this.texture.key = key; return this.setFrame(frame); },
        setFrame(name) { this.frame = { name }; return this; },
        setTint() { return this; }, setVisible(value) { this.visible = value; return this; },
        setFlipX(value) { this.flipX = value; return this; }
    }; } }
};
const layers = new ClothingLayers(scene, { add() {}, bringToTop() {} }, 10, 24, 2);
for (const hat of hats) {
    layers.setEquipment({ hat: hat.id });
    for (let direction = 0; direction < 7; direction++) {
        layers.update(direction, false, 3);
        listeners.get('update')(0);
        assert.equal(graphics.visible, true);
        assert.equal(graphics.x, 16);
        assert.equal(graphics.y, 24);
        assert.equal(graphics.scaleX, 2);
        const unflipped = pixels.map(pixel => [...pixel]);
        assert.ok(unflipped.length > 0);
        assert.ok(unflipped.every(([, y]) => y < -77));
        listeners.get('update')(130);
        assert.notDeepEqual(pixels, unflipped, 'Flames must flicker');
        layers.update(direction, true);
        listeners.get('update')(0);
        assert.deepEqual(pixels, unflipped.map(([x, y]) => [-x - 1, y]));
    }
}
layers.setEquipment({ hat: 'hat/green-hat1' });
listeners.get('update')(260);
assert.equal(graphics.visible, false);
layers.setEquipment({ hat: null });
listeners.get('update')(390);
assert.equal(graphics.visible, false);
onDestroy();
assert.equal(listeners.size, 0, 'Destroying the preview/player must stop its flame listener');
console.log('PASS: Hanukia variants, seven directions, mirroring, flicker, scale, unequip and cleanup');
