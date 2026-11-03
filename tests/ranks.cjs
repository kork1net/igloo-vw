const assert = require('node:assert/strict');
const { maxLevel } = require('../shared/rank-settings.json');
const ranks = require('../shared/ranks.json').slice(0, maxLevel);
const { rankForPoints } = require('../server/ranks.cjs');
assert.equal(ranks.length, 5);
assert.equal(rankForPoints(0).level, 1);
assert.deepEqual(rankForPoints(0, true), { level: 5, nextLevelPoints: null, pointsToNextLevel: 0 });
assert.equal(rankForPoints(100, true).level, 5);
for (let i = 1; i < ranks.length; i++) {
    const points = ranks[i].minPoints;
    assert.equal(rankForPoints(points - 1).level, ranks[i - 1].level);
    assert.equal(rankForPoints(points).level, ranks[i].level);
    if (i > 1) assert.ok(points - ranks[i - 1].minPoints > ranks[i - 1].minPoints - ranks[i - 2].minPoints);
}
assert.equal(rankForPoints(100).pointsToNextLevel, 160);
assert.equal(rankForPoints(520).level, 4);
assert.equal(rankForPoints(260).nextLevelPoints, 520);
assert.equal(rankForPoints(1e9).level, 5);
assert.equal(rankForPoints(1e9).nextLevelPoints, null);
assert.equal(rankForPoints(1e9).pointsToNextLevel, 0);
console.log('PASS: 5 available ranks, exact boundaries, increasing gaps, next-rank progress and capped maximum');
