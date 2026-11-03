export function createAdminBadge(scene, container, isAdmin) {
    const badge = scene.add.image(0, 61, 'admin-symbol');
    badge.setScale(22 / badge.height);
    badge.setVisible(isAdmin === true);
    container.add(badge);
    if (!(typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) {
        const pulse = scene.tweens.add({
            targets: badge,
            scaleX: badge.scaleX * 1.12,
            scaleY: badge.scaleY * 1.12,
            duration: 1100,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
        badge.once('destroy', () => pulse.stop());
    }
    return badge;
}
