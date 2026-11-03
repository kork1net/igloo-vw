import config from '../../../shared/emojis.json';

export function registerEmojiFrames(scene) {
    const texture = scene.textures.get('emojis');
    config.frames.forEach((frame, index) => {
        if (!texture.has(String(index))) texture.add(String(index), 0, frame.x, 0, frame.width, 32);
    });
}

export function showPlayerEmoji(owner, index) {
    if (!owner || !Number.isInteger(index) || !config.frames[index]) return;
    registerEmojiFrames(owner.scene);
    owner.emojiCleanup?.();
    const scene = owner.scene;
    const image = scene.add.image(0, 0, 'emojis', String(index)).setDepth(21).setScale(1.1);
    image.setData('playerEmoji', index);
    const motion = { offset: 0 };
    const update = () => image.setPosition(Math.round(owner.container.x), Math.round(owner.container.y - 84 + motion.offset));
    update();
    scene.events.on('postupdate', update);
    const tweens = [];
    let timer;
    const cleanup = () => {
        timer?.remove();
        tweens.forEach(tween => tween.stop());
        scene.events.off('postupdate', update);
        scene.events.off('shutdown', cleanup);
        owner.container.off('destroy', cleanup);
        image.destroy();
        if (owner.emojiCleanup === cleanup) owner.emojiCleanup = null;
    };
    owner.emojiCleanup = cleanup;
    owner.container.once('destroy', cleanup);
    scene.events.once('shutdown', cleanup);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
        image.setScale(0.2).setAlpha(0);
        tweens.push(scene.tweens.add({ targets: image, scaleX: 1.1, scaleY: 1.1, alpha: 1,
            duration: 280, ease: 'Back.easeOut' }));
        tweens.push(scene.tweens.add({ targets: motion, offset: -4, duration: 850,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1 }));
    }
    timer = scene.time.delayedCall(config.duration, () => {
        if (reduced) cleanup();
        else tweens.push(scene.tweens.add({ targets: image, alpha: 0, scaleX: 0.75, scaleY: 0.75,
            duration: 250, ease: 'Sine.easeIn', onComplete: cleanup }));
    });
}
