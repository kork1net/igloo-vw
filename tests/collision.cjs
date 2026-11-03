const assert = require('node:assert/strict');
const { getShopColliders, getSquareColliders, getShopInteriorColliders, resolveMovement } = require('../shared/collision.js');
const square = require('../shared/square.json');
const walls = getShopColliders(square);
const collides = point => walls.some(wall => point.x > wall.left - 12 && point.x < wall.right + 12
    && point.y + 24 > wall.top - 4 && point.y + 24 < wall.bottom + 4);
const wallX = (walls[0].left + walls[0].right) / 2;
const doorX = (walls[0].right + walls[1].left) / 2;

const blocked = resolveMovement({ x: wallX, y: 430 }, { x: wallX, y: 240 }, walls);
assert.ok(blocked.y >= square.shop.y + 4 - 24);
assert.equal(collides(blocked), false);
const behind = resolveMovement({ x: wallX, y: 240 }, { x: wallX, y: 430 }, walls);
assert.ok(behind.y + 24 <= walls[0].top - 4);
const doorway = resolveMovement({ x: doorX, y: 430 }, { x: doorX, y: 240 }, walls);
assert.ok(Math.abs(doorway.y - 240) < 0.001);
const slide = resolveMovement({ x: wallX, y: 410 }, { x: wallX + 30, y: 300 }, walls);
assert.ok(slide.x > wallX + 20);
assert.equal(collides(slide), false);
const recovered = resolveMovement({ x: wallX, y: 330 }, { x: wallX, y: 330 }, walls);
assert.equal(collides(recovered), false);
assert.deepEqual(resolveMovement({ x: 0, y: 0 }, { x: 25, y: 50 }), { x: 25, y: 50 });
console.log('PASS: front/back walls, fast crossing, doorway, sliding, overlap recovery and rooms without collision');
const cafeWalls = getSquareColliders(square).filter(wall => wall.type !== 'skyline').slice(walls.length);
assert.equal(cafeWalls.length, 2);
const cafeWallX = (cafeWalls[0].left + cafeWalls[0].right) / 2;
const cafeDoorX = (cafeWalls[0].right + cafeWalls[1].left) / 2;
const cafeFrom = cafeWalls[0].bottom + 40;
const cafeTo = cafeWalls[0].top - 60;
const cafeBlocked = resolveMovement({ x: cafeWallX, y: cafeFrom }, { x: cafeWallX, y: cafeTo }, cafeWalls);
assert.ok(cafeBlocked.y + 24 >= cafeWalls[0].bottom + 4);
assert.ok(Math.abs(resolveMovement({ x: cafeDoorX, y: cafeFrom }, { x: cafeDoorX, y: cafeTo }, cafeWalls).y - cafeTo) < 0.001);
console.log('PASS: cafe walls and open doorway share client/server collision geometry');

const interior = getShopInteriorColliders(1280, 720);
const minimumY = interior[0].bottom + 4 - 24;
assert.ok(minimumY > 200 && minimumY < 210, 'Interior wall must end at the visible baseboard');
for (const x of [65, 640, 1215]) {
    const stopped = resolveMovement({ x, y: 570 }, { x, y: 65 }, interior);
    assert.ok(stopped.y >= minimumY && stopped.y < minimumY + 2);
    const recovered = resolveMovement({ x, y: 65 }, { x, y: 65 }, interior);
    assert.ok(Math.abs(recovered.y - minimumY) < 0.001);
}
const interiorSlide = resolveMovement({ x: 640, y: 570 }, { x: 800, y: 65 }, interior);
assert.ok(Math.abs(interiorSlide.x - 800) < 0.001);
assert.ok(interiorSlide.y >= minimumY && interiorSlide.y < minimumY + 2);
const doubleInterior = getShopInteriorColliders(2560, 1440);
assert.equal(doubleInterior[0].bottom, interior[0].bottom * 2);
console.log('PASS: shop interior wall blocks the full room width, fast crossing, diagonal sliding and wall spawn recovery');

const skyline = getSquareColliders(square).find(wall => wall.type === 'skyline');
// Expected feet positions sampled independently from the background's snow edge.
const samples = [[25, 114], [95, 94], [335, 115], [590, 96], [840, 120], [1145, 136], [1255, 121]];
const stops = [];
for (const [x, expected] of samples) {
    const stopped = resolveMovement({ x, y: 200 }, { x, y: -500 }, [skyline]);
    assert.ok(stopped.y >= expected && stopped.y <= expected + 3,
        `Snow edge mismatch at x=${x}: ${stopped.y} vs ${expected}`);
    const recovered = resolveMovement({ x, y: 25 }, { x, y: 25 }, [skyline]);
    assert.ok(Math.abs(stopped.y - recovered.y) < 0.001);
    stops.push(stopped.y);
}
assert.ok(Math.max(...stops) - Math.min(...stops) > 30, 'The snow boundary must follow the uneven artwork');
const across = resolveMovement({ x: 25, y: stops[0] }, { x: 1255, y: 25 }, [skyline]);
assert.ok(Math.abs(across.x - 1255) < 0.001, 'Diagonal movement must slide along the snow edge');
assert.ok(across.y >= stops.at(-1));
const clearGround = resolveMovement({ x: 500, y: 200 }, { x: 600, y: 200 }, getSquareColliders(square));
assert.ok(Math.abs(clearGround.x - 600) < 0.001 && Math.abs(clearGround.y - 200) < 0.001);
console.log('PASS: traced snow horizon, uneven heights, fast crossing, sliding, sky recovery and clear ground');
