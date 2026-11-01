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
        ...(square.cafe ? getShopColliders({ ...square, shop: square.cafe }) : [])];
}

export function resolveMovement(from, to, colliders = []) {
    if (!colliders.length) return { x: to.x, y: to.y };
    // Test a small footprint around the feet, not the head or the entire sprite.
    const walls = colliders.map(wall => ({ left: wall.left - 12,
        right: wall.right + 12, top: wall.top - 4, bottom: wall.bottom + 4 }));
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
    const dx = to.x - from.x, dy = to.y - from.y;
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2)));
    for (let i = 0; i < steps; i++) {
        const nextX = x + dx / steps;
        if (!walls.some(wall => inside(nextX, y, wall))) x = nextX;
        const nextY = y + dy / steps;
        if (!walls.some(wall => inside(x, nextY, wall))) y = nextY;
    }
    return { x, y: y - 24 };
}
