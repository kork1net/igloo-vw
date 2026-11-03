// Different groups of overlapping puffs give each cloud its own silhouette.
// Sample on a small pixel grid so the curves retain the game's pixel-art edges.
const profiles = [
    { width: 228, height: 84, puffs: [
        [37, 53, 31, 18], [67, 36, 29, 27], [100, 32, 36, 28],
        [136, 40, 27, 24], [174, 47, 36, 24], [204, 58, 20, 15], [112, 56, 80, 19]
    ] },
    { width: 186, height: 90, puffs: [
        [29, 62, 24, 17], [50, 47, 29, 25], [86, 33, 32, 30],
        [116, 47, 26, 23], [150, 57, 29, 20], [89, 64, 60, 18]
    ] },
    { width: 258, height: 72, puffs: [
        [28, 48, 23, 14], [58, 39, 31, 21], [93, 31, 33, 25],
        [127, 36, 26, 23], [163, 40, 33, 19], [204, 45, 28, 18],
        [237, 51, 17, 12], [133, 51, 85, 15]
    ] }
];

function cloudTexture(scene, profile, index) {
    const key = `square-cloud-puffs-${index}`;
    if (!scene.textures.exists(key)) {
        const pixel = 3;
        const columns = Math.ceil(profile.width / pixel), rows = Math.ceil(profile.height / pixel);
        const mask = Array.from({ length: rows }, (_, row) =>
            Array.from({ length: columns }, (_, column) => profile.puffs.some(([x, y, rx, ry]) =>
                (((column + 0.5) * pixel - x) / rx) ** 2
                + (((row + 0.5) * pixel - y) / ry) ** 2 <= 1)));
        const filled = (x, y) => mask[y]?.[x] === true;
        const bottoms = Array.from({ length: columns }, (_, column) =>
            mask.reduce((last, row, index) => row[column] ? index : last, -1));
        const graphics = scene.add.graphics();
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                if (!filled(column, row)) continue;
                const edge = !filled(column - 1, row) || !filled(column + 1, row)
                    || !filled(column, row - 1) || !filled(column, row + 1);
                const fromBottom = bottoms[column] - row;
                const color = edge ? 0xc0d9e9 : fromBottom < 3 ? 0xdeedf7
                    : fromBottom < 5 ? 0xedf6fc : 0xfbfdff;
                graphics.fillStyle(color).fillRect(column * pixel, row * pixel, pixel, pixel);
            }
        }
        graphics.generateTexture(key, profile.width, profile.height);
        graphics.destroy();
    }
    return key;
}

export function createClouds(scene) {
    const width = scene.scale.width;
    const clouds = [
        { x: width * 0.12, y: -2, speed: 7 },
        { x: width * 0.48, y: 1, speed: 5 },
        { x: width * 0.84, y: -4, speed: 9 }
    ].map(({ x, y, speed }, index) => scene.add.image(x, y, cloudTexture(scene, profiles[index], index))
        .setOrigin(0.5, 0).setAlpha(0.92).setDepth(0).setData('driftSpeed', speed));

    const drift = (time, delta) => {
        for (const cloud of clouds) {
            cloud.x += cloud.getData('driftSpeed') * Math.min(delta, 100) / 1000;
            const halfWidth = cloud.displayWidth / 2;
            if (cloud.x - halfWidth > width) cloud.x = -halfWidth;
        }
    };
    const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) scene.events.on('update', drift);
    scene.events.once('shutdown', () => {
        scene.events.off('update', drift);
        clouds.forEach(cloud => cloud.destroy());
    });
    return clouds;
}
