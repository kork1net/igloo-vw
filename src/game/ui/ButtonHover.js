export function addButtonHover(scene, button, targets = [button]) {
    if (['x-button', 'v-button'].includes(button.texture?.key)
        && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) {
        const floating = scene.tweens.add({
            targets: button, y: button.y - 6, duration: 1000,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1
        });
        button.once('destroy', () => floating.stop());
    }
    const originals = targets.map(target => ({ target, x: target.scaleX, y: target.scaleY }));
    let tweens = [];
    const animate = factor => {
        tweens.forEach(tween => tween.stop());
        tweens = originals.map(({ target, x, y }) => scene.tweens.add({
            targets: target, scaleX: x * factor, scaleY: y * factor,
            duration: 140, ease: 'Sine.easeOut'
        }));
    };
    button.on('pointerover', () => animate(1.1));
    button.on('pointerout', () => animate(1));
    button.once('destroy', () => tweens.forEach(tween => tween.stop()));
}
