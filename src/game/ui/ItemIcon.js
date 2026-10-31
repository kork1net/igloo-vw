const boundsByFrame = new WeakMap();

// Clothing sheets align to a full character. Icons instead center the visible art.
export function layoutItemIcon(sprite, slot) {
    const frame = sprite.frame;
    let bounds = boundsByFrame.get(frame);
    if (!bounds) {
        const canvas = document.createElement('canvas');
        canvas.width = frame.cutWidth;
        canvas.height = frame.cutHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(frame.source.image, frame.cutX, frame.cutY,
            canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                if (data[(y * canvas.width + x) * 4 + 3] <= 8) continue;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
        bounds = right < 0 ? { x: 0.5, y: 0.5, width: canvas.width, height: canvas.height }
            : { x: (left + right + 1) / 2 / canvas.width,
                y: (top + bottom + 1) / 2 / canvas.height,
                width: right - left + 1, height: bottom - top + 1 };
        boundsByFrame.set(frame, bounds);
    }
    sprite.setOrigin(bounds.x, bounds.y);
    sprite.setScale(Math.min(slot === 'bodyColor' ? 1.2 : 1.6,
        84 / bounds.width, 84 / bounds.height));
}
