const assert = require('node:assert/strict');
const { getShopColliders, resolveMovement } = require('../shared/collision.js');
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
