import shopInterior from './shop.json' with { type: 'json' };
import squareSkyline from './square-skyline.json' with { type: 'json' };

export function getShopInteriorColliders(width = 1280, height = 720) {
    // Use the same proportional cover as Shop's background. The feet cannot
    // cross the bottom of the wooden baseboard into the wall artwork.
    const scale = Math.max(width / shopInterior.backgroundWidth, height / shopInterior.backgroundHeight);
    const floorY = (height - shopInterior.backgroundHeight * scale) / 2 + shopInterior.floorY * scale;
    return [{ left: -width, right: width * 2, top: -height, bottom: floorY }];
}

export function getShopColliders(square) {
    const shop = square.shop;
    const left = square.width * shop.xRatio - shop.width * shop.scale / 2;
    const top = shop.y - shop.height * shop.scale * (1 - shop.depthRatio);
    // Only the lower wall footprint is solid. Keep the doorway open.
    return [[shop.wallLeft, shop.doorLeft], [shop.doorRight, shop.wallRight]]
        .map(([start, end]) => ({ left: left + start * shop.scale,
            right: left + end * shop.scale, top,
            bottom: shop.y - (shop.height - (shop.floorY ?? shop.height)) * shop.scale }));
}

export function getSquareColliders(square) {
    return [...getShopColliders(square),
        ...(square.cafe ? getShopColliders({ ...square, shop: square.cafe }) : []),
        { type: 'skyline', points: squareSkyline.points.map(([x, y]) => [
            x * square.width / squareSkyline.width,
            y * (square.height ?? squareSkyline.height) / squareSkyline.height
        ]) }];
}

function snowHeight(points, x) {
    let low = 0, high = points.length - 1;
    while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (points[middle][0] <= x) low = middle;
        else high = middle;
    }
    const [leftX, leftY] = points[low], [rightX, rightY] = points[high];
    const t = Math.max(0, Math.min(1, (x - leftX) / (rightX - leftX)));
    return leftY + (rightY - leftY) * t;
}

export function resolveMovement(from, to, colliders = []) {
    if (!colliders.length) return { x: to.x, y: to.y };
    // Test a small footprint around the feet, not the head or the entire sprite.
    const skylines = colliders.filter(wall => wall.type === 'skyline');
    const walls = colliders.filter(wall => wall.type !== 'skyline').map(wall => ({ left: wall.left - 12,
        right: wall.right + 12, top: wall.top - 4, bottom: wall.bottom + 4 }));
    const minimumFeetY = x => {
        let minimum = -Infinity;
        for (const { points } of skylines) {
            let height = Math.max(snowHeight(points, x - 12), snowHeight(points, x + 12));
            for (const [pointX, pointY] of points) {
                if (pointX > x + 12) break;
                if (pointX >= x - 12) height = Math.max(height, pointY);
            }
            // Include the feet footprint and the one-pixel tracing tolerance.
            minimum = Math.max(minimum, height + 5);
        }
        return minimum;
    };
    const inside = (x, y, wall) => x > wall.left && x < wall.right && y > wall.top && y < wall.bottom;
    let x = from.x, y = from.y + 24;
    // Recover safely if a new collider was placed around a standing player.
    for (const wall of walls) {
        if (!inside(x, y, wall)) continue;
        const edges = [
            { distance: x - wall.left, x: wall.left, y },
            { distance: wall.right - x, x: wall.right, y },
            { distance: y - wall.top, x, y: wall.top },
            { distance: wall.bottom - y, x, y: wall.bottom }
        ];
        const edge = edges.sort((a, b) => a.distance - b.distance)[0];
        x = edge.x; y = edge.y;
    }
    y = Math.max(y, minimumFeetY(x));
    const dx = to.x - from.x, dy = to.y - from.y;
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2)));
    for (let i = 0; i < steps; i++) {
        const nextX = x + dx / steps;
        const alongSnow = Math.max(y, minimumFeetY(nextX));
        if (!walls.some(wall => inside(nextX, alongSnow, wall))) {
            x = nextX;
            y = alongSnow;
        }
        const nextY = Math.max(y + dy / steps, minimumFeetY(x));
        if (!walls.some(wall => inside(x, nextY, wall))) y = nextY;
    }
    return { x, y: y - 24 };
}
