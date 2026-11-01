const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildCatalog, normalizeEquipment } = require('../scripts/item-catalog.cjs');

const testRoot = fs.mkdtempSync(path.join(__dirname, '.clothing-'));
try {
    // The scanner reads PNG headers; this fixture is independent of game assets.
    const image = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(image);
    image.writeUInt32BE(448, 16);
    image.writeUInt32BE(78, 20);
    fs.mkdirSync(path.join(testRoot, 'hat'));
    fs.mkdirSync(path.join(testRoot, 'hair'));
    fs.writeFileSync(path.join(testRoot, 'hair/short.png'), image);
    fs.writeFileSync(path.join(testRoot, 'black-shirt.png'), image);
    fs.writeFileSync(path.join(testRoot, 'black-shirt-walk-1.png'), image);
    fs.writeFileSync(path.join(testRoot, 'black-shirt-walk-2.png'), image);
    fs.writeFileSync(path.join(testRoot, 'black-shirt.json'), JSON.stringify({
        variants: [{ id: 'green', name: 'Green shirt', hue: -100 },
            { id: 'rose', name: 'Rose shirt', tint: '#cc8299' }]
    }));
    fs.writeFileSync(path.join(testRoot, 'blue-shirt.png'), image);
    fs.writeFileSync(path.join(testRoot, 'hat/cap.png'), image);
    fs.writeFileSync(path.join(testRoot, 'hat/cap.json'), JSON.stringify({ name: 'My cap' }));
    fs.writeFileSync(path.join(testRoot, 'body-colors.json'), JSON.stringify([
        { id: 'white', name: 'White', tint: '#ffffff' },
        { id: 'blue', name: 'Blue', tint: '#91ceff' }
    ]));
    const catalog = buildCatalog(testRoot);
    assert.equal(catalog.items.length, 8);
    assert.equal(normalizeEquipment({ hair: 'hair/short' }, catalog).hair, 'hair/short');
    assert.equal(normalizeEquipment({ hat: 'hair/short' }, catalog).hat, null);
    assert.equal(normalizeEquipment({ bodyColor: 'body-color/blue' }, catalog).bodyColor, 'body-color/blue');
    assert.equal(normalizeEquipment({ shirt: 'body-color/blue' }, catalog).shirt, null);
    const variant = catalog.items.find(item => item.id === 'black-shirt--green');
    assert.equal(variant.texture, 'clothing:black-shirt');
    assert.equal(variant.walkTextures['player-walk-1'].texture, 'clothing:black-shirt:walk-1');
    assert.equal(normalizeEquipment({ shirt: variant.id }, catalog).shirt, variant.id);
    assert.equal(catalog.items.find(item => item.id === 'hat/cap').name, 'My cap');
    const equipped = normalizeEquipment({ shirt: 'blue-shirt', hat: 'hat/cap', pants: 'blue-shirt' }, catalog);
    assert.equal(equipped.shirt, 'blue-shirt');
    assert.equal(equipped.hat, 'hat/cap');
    assert.equal(equipped.pants, null);
    assert.equal(normalizeEquipment({ shirt: 'missing' }, catalog).shirt, null);

    // Run the actual shared rendering code against a small Phaser object adapter.
    const code = fs.readFileSync('src/game/items/Clothing.js', 'utf8')
        .replace("import catalog from './catalog.generated.json';", '')
        .replace(/^export /gm, '');
    const { ClothingLayers, loadClothing, inventoryCategories } = vm.runInNewContext(
        code + '\n({ ClothingLayers, loadClothing, inventoryCategories })', { catalog });
    assert.deepEqual(Array.from(inventoryCategories, category => category.id),
        ['bodyColor', 'hat', 'hair', 'accessory', 'shirt', 'pants', 'shoes']);
    const children = [];
    const scene = { game: { renderer: { gl: true } }, add: { sprite(x, y, texture, frame) {
        return { x, y, texture: { key: texture }, frame,
            enableFilters() {
                const filter = { active: true, setActive(active) { this.active = active; },
                    colorMatrix: { reset() { return this; }, hue(value) { this.value = value; } } };
                this.filters = { external: { addColorMatrix: () => filter } };
            },
            setOrigin() { return this; }, setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
            setTexture(key, frame) { this.texture.key = key; this.frame = frame; return this; },
            setVisible(visible) { this.visible = visible; return this; },
            setTint(color) { this.tint = color; return this; },
            setFrame(frame) { this.frame = frame; return this; },
            setFlipX(flip) { this.flip = flip; return this; } };
    } } };
    const container = { add(child) { children.push(child); }, bringToTop(child) {
        children.splice(children.indexOf(child), 1); children.push(child);
    } };
    const layers = new ClothingLayers(scene, container);
    layers.setEquipment({ hat: 'hat/cap' });
    layers.setEquipment({ shirt: 'blue-shirt', hat: 'hat/cap' });
    assert.equal(children.at(-1).texture.key, 'clothing:hat/cap');
    layers.update(6, true, -6);
    assert.equal(layers.sprites.get('shirt').frame, 6);
    assert.equal(layers.sprites.get('shirt').flip, true);
    assert.equal(layers.sprites.get('hat').x, -6);
    layers.setEquipment({ shirt: 'black-shirt', hat: 'hat/cap' });
    assert.equal(layers.sprites.get('shirt').texture.key, 'clothing:black-shirt');
    layers.update(6, true, -6, 'player-walk-1');
    assert.equal(layers.sprites.get('shirt').texture.key, 'clothing:black-shirt:walk-1');
    assert.equal(layers.sprites.get('shirt').frame, 6);
    assert.equal(layers.sprites.get('shirt').flip, true);
    assert.equal(layers.sprites.get('hat').texture.key, 'clothing:hat/cap');
    layers.update(6, false, 6, 'player-walk-2');
    assert.equal(layers.sprites.get('shirt').texture.key, 'clothing:black-shirt:walk-2');
    layers.update(0);
    assert.equal(layers.sprites.get('shirt').texture.key, 'clothing:black-shirt');
    layers.setEquipment({ shirt: variant.id, hat: 'hat/cap' });
    const colored = layers.sprites.get('shirt');
    assert.equal(colored.clothingColorFilter.colorMatrix.value, -100);
    assert.equal(colored.clothingColorFilter.active, true);
    layers.update(6, true, -6, 'player-walk-2');
    assert.equal(colored.texture.key, 'clothing:black-shirt:walk-2');
    assert.equal(colored.clothingColorFilter.active, true);
    layers.setEquipment({ shirt: 'black-shirt', hat: 'hat/cap' });
    assert.equal(colored.clothingColorFilter.active, false);
    layers.setEquipment({ shirt: 'black-shirt--rose' });
    assert.equal(colored.tint, 0xcc8299);
    layers.update(6, true, -6, 'player-walk-2');
    assert.equal(colored.tint, 0xcc8299);
    assert.equal(colored.texture.key, 'clothing:black-shirt:walk-2');
    layers.setEquipment({ shirt: 'black-shirt', hat: 'hat/cap' });
    assert.equal(colored.tint, 0xffffff);
    layers.setEquipment({ shirt: null, hat: 'hat/cap' });
    assert.equal(layers.sprites.get('shirt').visible, false);
    assert.equal(layers.sprites.get('hat').visible, true);
    const queued = [];
    loadClothing({ textures: { exists: () => false }, load: {
        spritesheet: (...args) => queued.push(args)
    } });
    assert.equal(queued.length, 6);
    const body = scene.add.sprite(0, 24, 'player', 0);
    const bodyLayers = new ClothingLayers(scene, container, 0, 24, 1, body);
    bodyLayers.setEquipment({ bodyColor: 'body-color/blue', shirt: 'blue-shirt' });
    assert.equal(body.tint, 0x91ceff);
    assert.equal(bodyLayers.sprites.has('bodyColor'), false);
    bodyLayers.update(6, true, -6, 'player-walk-2');
    assert.equal(body.tint, 0x91ceff);
    bodyLayers.setEquipment({ bodyColor: 'body-color/white' });
    assert.equal(body.tint, 0xffffff);
    bodyLayers.setEquipment({ hair: 'hair/short', hat: 'hat/cap' });
    assert.ok(children.indexOf(bodyLayers.sprites.get('hair')) < children.indexOf(bodyLayers.sprites.get('hat')));
    bodyLayers.update(6, true, -6, 'player-walk-1');
    assert.equal(bodyLayers.sprites.get('hair').frame, 6);
    assert.equal(bodyLayers.sprites.get('hair').flip, true);
    assert.equal(bodyLayers.eyelashes, undefined);
    const femaleLayers = new ClothingLayers(scene, container, 100, 200, 2.5, body, 'female');
    femaleLayers.setEquipment({ bodyColor: 'body-color/blue', hat: 'hat/cap' });
    assert.equal(femaleLayers.eyelashes.texture.key, 'eyelashes');
    assert.equal(femaleLayers.eyelashes.tint, undefined);
    for (let direction = 0; direction < 7; direction++) {
        femaleLayers.update(direction, direction === 6, -6, 'player-walk-1');
        assert.equal(femaleLayers.eyelashes.frame, direction);
        assert.equal(femaleLayers.eyelashes.flip, direction === 6);
        assert.equal(femaleLayers.eyelashes.x, 85);
        assert.equal(femaleLayers.eyelashes.y, 200);
        assert.equal(femaleLayers.eyelashes.scaleX, 2.5);
    }

    // Validate that the server relays multiple slots and rejects mismatched slot IDs.
    let connect;
    let broadcast;
    class Server {
        on(event, callback) { connect = callback; }
        to() { return { emit: (event, state) => { if (event === 'playerMoved') broadcast = state; } }; }
    }
    vm.runInNewContext(fs.readFileSync('server/index.cjs', 'utf8'), {
        require: name => name === 'socket.io' ? { Server }
        : name === '../shared/collision.js' ? require('../shared/collision.js')
        : name === '../shared/square.json' ? require('../shared/square.json')
        : name === './snow-game.cjs' ? require('../server/snow-game.cjs')
        : name === './inventory.cjs' ? require('./helpers/inventory-memory.cjs')
        : name === './rarities.cjs' ? { Rarities: class { snapshot() { return {}; } } }
            : name === './accounts.cjs' ? { Accounts: class {
                authenticate() { return { id: 'test-user', username: 'Walker', isAdmin: true }; }
            } } : { buildCatalog: () => catalog, normalizeEquipment },
        process: { env: {} }, module: { exports: {} },
        console: { log() {} }, setInterval() {}, clearInterval() {},
        performance: { now: () => 0 }
    });
    const handlers = {};
    connect({ id: 'test', handshake: { auth: { player: { equipped } } },
        join() {}, use() {}, emit() {}, to: () => ({ emit: (event, state) => { broadcast = state; } }),
        on: (event, fn) => { handlers[event] = fn; } });
    assert.equal(broadcast.equipped.hat, null);
    const equip = (itemId, equip = true) => {
        let response;
        handlers['inventory:equip']({ itemId, equip }, result => { response = result; });
        assert.equal(response.ok, true);
    };
    equip('hat/cap');
    equip('hair/short');
    assert.equal(broadcast.equipped.hair, 'hair/short');
    assert.equal(broadcast.equipped.hat, 'hat/cap');
    equip(variant.id);
    assert.equal(broadcast.equipped.shirt, variant.id);
    equip('body-color/blue');
    assert.equal(broadcast.equipped.bodyColor, 'body-color/blue');
    equip('blue-shirt');
    assert.equal(broadcast.equipped.shirt, 'blue-shirt');
    assert.equal(broadcast.equipped.hat, 'hat/cap');
    // Movement/profile payloads must no longer change saved equipment.
    handlers.playerMove({ x: 200, y: 200, equipped: { shirt: null } });
    handlers.playerProfile({ equipped: { shirt: null, hat: 'blue-shirt' } });
    assert.equal(broadcast.equipped.shirt, 'blue-shirt');
    assert.equal(broadcast.equipped.hat, 'hat/cap');
    assert.equal(broadcast.equipped.hair, 'hair/short');
    equip('hair/short', false);
    assert.equal(broadcast.equipped.hair, null);
    assert.equal(broadcast.equipped.hat, 'hat/cap');
    equip('blue-shirt', false);
    assert.equal(broadcast.equipped.shirt, null);

    fs.writeFileSync(path.join(testRoot, 'broken.png'), Buffer.from('invalid'));
    assert.throws(() => buildCatalog(testRoot), /Invalid PNG/);
    fs.unlinkSync(path.join(testRoot, 'broken.png'));
    fs.writeFileSync(path.join(testRoot, 'hat/cap.json'), '{"slot":"unknown"}');
    assert.throws(() => buildCatalog(testRoot), /Unknown clothing slot/);
    console.log('PASS: discovery, metadata, validation, slot replacement, layers, directions, loading, multiplayer');
} finally {
    const resolved = fs.realpathSync(testRoot);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(__dirname).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('.clothing-'));
    fs.rmSync(resolved, { recursive: true });
}
