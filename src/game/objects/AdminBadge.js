import { TintModes } from 'phaser';

export function createAdminBadge(scene, container, isAdmin) {
    const badge = scene.add.image(0, 61, 'admin-symbol');
    badge.setScale(22 / badge.height);
    badge.setVisible(isAdmin === true);
    container.add(badge);
    const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
        const glow = scene.add.container(badge.x, badge.y).setAlpha(0).setVisible(isAdmin === true);
        const halo = [];
        for (const [x, y] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
            const light = scene.add.image(x, y, 'admin-symbol')
                .setTint(0x428dff).setTintMode(TintModes.FILL).setAlpha(0.22);
            glow.add(light); halo.push(light);
        }
        container.addAt(glow, container.getIndex(badge));
        const blueFlash = scene.add.image(badge.x, badge.y, 'admin-symbol')
            .setTint(0x81bcff).setTintMode(TintModes.FILL).setAlpha(0).setVisible(isAdmin === true);
        container.add(blueFlash);
        const sparkles = scene.add.graphics().setVisible(isAdmin === true);
        container.add(sparkles);
        const update = time => {
            sparkles.setVisible(badge.visible);
            glow.setVisible(badge.visible);
            blueFlash.setVisible(badge.visible);
            if (!badge.visible) return;
            const cycle = (time % 3500) / 3500;
            const blue = cycle >= 0.64 && cycle <= 0.94 ? Math.sin((cycle - 0.64) / 0.3 * Math.PI) : 0;
            glow.setAlpha(blue);
            blueFlash.setAlpha(blue * 0.3).setScale(badge.scaleX, badge.scaleY);
            for (const light of halo) light.setScale(badge.scaleX, badge.scaleY);
            sparkles.clear();
            for (let i = 0; i < 4; i++) {
                const phase = time / 2300 + i * Math.PI / 2;
                const intensity = Math.max(0, Math.sin(time / 480 + i * 1.8));
                if (intensity < 0.18) continue;
                const x = Math.round(Math.cos(phase) * 17);
                const y = Math.round(badge.y + Math.sin(phase) * 12);
                const size = intensity > 0.75 ? 3 : 2;
                sparkles.fillStyle(0xffffff, intensity * 0.9);
                sparkles.fillRect(x - size, y, size * 2 + 1, 1);
                sparkles.fillRect(x, y - size, 1, size * 2 + 1);
                sparkles.fillStyle(0xffffff, intensity);
                sparkles.fillRect(x, y, 1, 1);
            }
        };
        scene.events.on('update', update);
        badge.once('destroy', () => {
            scene.events.off('update', update);
            sparkles.destroy();
            glow.destroy();
            blueFlash.destroy();
        });
    }
    if (!reducedMotion) {
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
