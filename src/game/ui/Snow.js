// HTML menus sit above the game canvas, so their snowfall needs its own overlay.
export function createSnowOverlay(parent) {
    const overlay = document.createElement('div');
    overlay.className = 'account-snow';
    overlay.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 80; i++) {
        const flake = document.createElement('span');
        const duration = 20 + Math.random() * 8;
        const size = 3 + Math.random() * 2.5;
        flake.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;` +
            `animation-duration:${duration}s;animation-delay:${-Math.random() * duration}s;`;
        overlay.append(flake);
    }
    parent.append(overlay);
    return overlay;
}

export function createSnow(scene) {
    if (!scene.textures.exists('square-snowflake')) {
        const graphics = scene.add.graphics();
        graphics.fillStyle(0xffffff).fillCircle(3, 3, 2);
        graphics.generateTexture('square-snowflake', 6, 6);
        graphics.destroy();
    }
    // Keep the snowfall behind players and below the interface.
    return scene.add.particles(0, 0, 'square-snowflake', {
        x: { min: 4, max: scene.scale.width - 4 },
        y: -6,
        lifespan: 22000,
        speedY: { min: 34, max: 44 },
        speedX: { min: -5, max: 5 },
        tint: 0x86c9eb,
        scale: { min: 0.8, max: 1.4 },
        alpha: { start: 0.7, end: 0.28 },
        frequency: 280,
        quantity: 1,
        maxAliveParticles: 80,
        advance: 22000
    }).setDepth(2);
}
