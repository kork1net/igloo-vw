import { clothingSlots, getClothingItem, getClothingTexture } from '../items/Clothing';

const caches = new WeakMap();
function coloredFrame(scene, item, texture) {
    const key = `${texture}:${item.tint ?? 0xffffff}:${item.hue || 0}`;
    let cache = caches.get(scene.game);
    if (!cache) { cache = new Map(); caches.set(scene.game, cache); }
    if (cache.has(key)) return cache.get(key);
    const frame = scene.textures.getFrame(texture, 0);
    const canvas = document.createElement('canvas');
    canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    if (item.tint !== undefined) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
            pixels.data[i] *= ((item.tint >> 16) & 255) / 255;
            pixels.data[i + 1] *= ((item.tint >> 8) & 255) / 255;
            pixels.data[i + 2] *= (item.tint & 255) / 255;
        }
        ctx.putImageData(pixels, 0, 0);
    }
    if (item.hue && scene.game.renderer.gl) {
        const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = `hue-rotate(${item.hue}deg)`; ctx.drawImage(copy, 0, 0);
    }
    cache.set(key, canvas); return canvas;
}

export function createTradeItemImage(scene, id) {
    const item = getClothingItem(id);
    const source = coloredFrame(scene, item, getClothingTexture(scene, item));
    const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    let left = source.width, top = source.height, right = -1, bottom = -1;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        if (pixels[(y * source.width + x) * 4 + 3] > 8) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
    }
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    canvas.setAttribute('aria-label', item.name);
    if (right >= left) {
        const width = right - left + 1, height = bottom - top + 1;
        const scale = Math.min(56 / width, 56 / height);
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, left, top, width, height, (64 - width * scale) / 2, (64 - height * scale) / 2, width * scale, height * scale);
    }
    return canvas;
}

export function createTradeAvatar(scene, player) {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 195;
    canvas.className = 'trade-avatar'; canvas.setAttribute('aria-label', player.username);
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const draw = source => ctx.drawImage(source, (160 - source.width * 2.5) / 2, 195 - source.height * 2.5, source.width * 2.5, source.height * 2.5);
    draw(coloredFrame(scene, getClothingItem(player.equipped.bodyColor) || {}, 'player'));
    for (const slot of clothingSlots) {
        if (slot === 'bodyColor' || slot === 'glasses') continue;
        const item = getClothingItem(player.equipped[slot]);
        if (item) draw(coloredFrame(scene, item, getClothingTexture(scene, item)));
    }
    if (player.gender === 'female') draw(coloredFrame(scene, {}, 'eyelashes'));
    const glasses = getClothingItem(player.equipped.glasses);
    if (glasses) draw(coloredFrame(scene, glasses, getClothingTexture(scene, glasses)));
    return canvas;
}
