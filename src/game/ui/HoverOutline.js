// A solid alpha silhouette, rather than a blurred glow. Source artwork is untouched.
export function addHoverOutline(scene, sprite) {
    const frame = sprite.frame;
    const radius = Math.max(1, Math.ceil(2 / Math.abs(sprite.scaleX)));
    const key = `outline:${sprite.texture.key}:${frame.name}:${radius}`;
    const width = frame.cutWidth, height = frame.cutHeight;
    if (!scene.textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = width + radius * 2;
        canvas.height = height + radius * 2;
        const context = canvas.getContext('2d');
        const draw = (x, y) => context.drawImage(frame.source.image,
            frame.cutX, frame.cutY, width, height, x, y, width, height);
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                if (x * x + y * y <= radius * radius) draw(radius + x, radius + y);
            }
        }
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'destination-out';
        draw(radius, radius);
        scene.textures.addCanvas(key, canvas);
    }
    const outline = scene.add.image(sprite.x, sprite.y, key)
        .setOrigin((radius + sprite.originX * width) / (width + radius * 2),
            (radius + sprite.originY * height) / (height + radius * 2))
        .setScale(sprite.scaleX, sprite.scaleY)
        .setFlipX(sprite.flipX).setFlipY(sprite.flipY)
        .setDepth(sprite.depth).setAlpha(0);
    if (sprite.parentContainer) {
        sprite.parentContainer.addAt(outline, sprite.parentContainer.getIndex(sprite));
    }
    let tween;
    const fade = alpha => {
        tween?.stop();
        tween = scene.tweens.add({ targets: outline, alpha, duration: 180, ease: 'Sine.easeInOut' });
    };
    sprite.on('pointerover', () => fade(1));
    sprite.on('pointerout', () => fade(0));
    sprite.once('destroy', () => { tween?.stop(); outline.destroy(); });
    return outline;
}
