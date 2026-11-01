const fs = require('node:fs');
const path = require('node:path');

// Order is also the order in which clothing is drawn over the body.
const slots = ['bodyColor', 'shoes', 'pants', 'shirt', 'jacket', 'necklace', 'hair', 'hat', 'accessory', 'glasses'];
const itemsDirectory = path.resolve(__dirname, '../public/assets/items');
const catalogFile = path.resolve(__dirname, '../src/game/items/catalog.generated.json');

function buildCatalog(directory = itemsDirectory) {
    const items = [];
    function validateSheet(filename, frameWidth, frameHeight) {
        const relative = path.relative(directory, filename);
        const png = fs.readFileSync(filename);
        if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
            throw new Error(`Invalid PNG: ${relative}`);
        }
        const count = Math.floor(png.readUInt32BE(16) / frameWidth)
            * Math.floor(png.readUInt32BE(20) / frameHeight);
        if (count < 7) throw new Error(`Clothing needs at least 7 direction frames: ${relative}`);
    }
    function scan(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const filename = path.join(folder, entry.name);
            if (entry.isDirectory()) { scan(filename); continue; }
            if (!entry.isFile() || !entry.name.endsWith('.png')) continue;
            if (/-walk-[12]\.png$/.test(entry.name)) continue;
            const relative = path.relative(directory, filename).split(path.sep).join('/');
            const id = relative.slice(0, -4);
            const metadataFile = filename.slice(0, -4) + '.json';
            const metadata = fs.existsSync(metadataFile)
                ? JSON.parse(fs.readFileSync(metadataFile, 'utf8')) : {};
            let slot = metadata.slot || (relative.includes('/') ? relative.split('/')[0] : 'shirt');
            if (slot === 'accessory') {
                if (/necklace$/i.test(id)) slot = 'necklace';
                else if (/glasses$/i.test(id)) slot = 'glasses';
            }
            if (!slots.includes(slot)) throw new Error(`Unknown clothing slot "${slot}": ${relative}`);
            const frameWidth = metadata.frameWidth ?? 64;
            const frameHeight = metadata.frameHeight ?? 78;
            if (![frameWidth, frameHeight].every(n => Number.isInteger(n) && n > 0)) {
                throw new Error(`Invalid frame dimensions: ${relative}`);
            }
            validateSheet(filename, frameWidth, frameHeight);
            const walkTextures = {};
            for (const step of [1, 2]) {
                const stem = filename.slice(0, -4);
                // Preserve legacy IDs such as gray-shoes..png while matching normal walk filenames.
                const variant = [...new Set([stem, stem.replace(/\.+$/, '')])]
                    .map(base => `${base}-walk-${step}.png`).find(file => fs.existsSync(file));
                if (!variant) continue;
                validateSheet(variant, frameWidth, frameHeight);
                walkTextures[`player-walk-${step}`] = {
                    texture: `clothing:${id}:walk-${step}`,
                    path: `assets/items/${path.relative(directory, variant).split(path.sep).join('/')}`
                };
            }
            const item = { id, slot, name: metadata.name || path.basename(id),
                texture: `clothing:${id}`, path: `assets/items/${relative}`,
                frameWidth, frameHeight, walkTextures };
            items.push(item);
            if (metadata.variants !== undefined && !Array.isArray(metadata.variants)) {
                throw new Error(`Clothing variants must be an array: ${relative}`);
            }
            for (const variant of metadata.variants || []) {
                if (!variant || !/^[a-z0-9_-]+$/.test(variant.id || '')
                    || (variant.hue === undefined && variant.tint === undefined && variant.palette === undefined)
                    || (variant.hue !== undefined && (!Number.isFinite(variant.hue) || Math.abs(variant.hue) > 180))
                    || (variant.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(variant.tint))
                    || (variant.palette !== undefined && (!variant.palette || typeof variant.palette !== 'object'
                        || Array.isArray(variant.palette) || !Object.keys(variant.palette).length
                        || Object.entries(variant.palette).some(([from, to]) => !/^#[0-9a-f]{6}$/i.test(from) || typeof to !== 'string' || !/^#[0-9a-f]{6}$/i.test(to))))) {
                    throw new Error(`Invalid color variant: ${relative}`);
                }
                items.push({ ...item, id: `${id}--${variant.id}`,
                    name: variant.name || `${item.name} (${variant.id})`,
                    sourceItem: id, hue: variant.hue || 0,
                    ...(variant.palette !== undefined ? { palette: variant.palette } : {}),
                    ...(variant.tint !== undefined ? { tint: parseInt(variant.tint.slice(1), 16) } : {}) });
            }
        }
    }
    scan(directory);
    const colorsFile = path.join(directory, 'body-colors.json');
    if (fs.existsSync(colorsFile)) {
        const colors = JSON.parse(fs.readFileSync(colorsFile, 'utf8'));
        if (!Array.isArray(colors)) throw new Error('Body colors must be an array');
        colors.forEach((color, order) => {
            if (!color || !/^[a-z0-9_-]+$/.test(color.id || '') || !/^#[0-9a-f]{6}$/i.test(color.tint || '')) {
                throw new Error('Invalid body color');
            }
            items.push({ id: `body-color/${color.id}`, name: color.name || color.id,
                slot: 'bodyColor', texture: 'player', tint: parseInt(color.tint.slice(1), 16), order });
        });
    }
    if (new Set(items.map(item => item.id)).size !== items.length) {
        throw new Error('Duplicate clothing item or color variant ID');
    }
    return { slots, items: items.sort((a, b) => a.id.localeCompare(b.id)) };
}

function writeCatalog() {
    const data = JSON.stringify(buildCatalog(), null, 2) + '\n';
    fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
    if (!fs.existsSync(catalogFile) || fs.readFileSync(catalogFile, 'utf8') !== data) {
        fs.writeFileSync(catalogFile, data);
    }
}

function normalizeEquipment(equipped, catalog) {
    return Object.fromEntries(slots.map(slot => {
        const legacy = ['necklace', 'glasses'].includes(slot) ? equipped?.accessory : null;
        const id = equipped?.[slot] ?? legacy;
        return [slot, catalog.items.some(item => item.id === id && item.slot === slot) ? id : null];
    }));
}

module.exports = { buildCatalog, writeCatalog, normalizeEquipment, itemsDirectory };
if (require.main === module) writeCatalog();
