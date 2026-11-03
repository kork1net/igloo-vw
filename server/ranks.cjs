// Keep future thresholds configured; unlock ranks through the shared limit.
const { maxLevel } = require('../shared/rank-settings.json');
const ranks = require('../shared/ranks.json').slice(0, maxLevel);

function rankForPoints(points, isAdmin = false) {
    let index = isAdmin === true ? ranks.length - 1 : 0;
    for (let i = index + 1; i < ranks.length && points >= ranks[i].minPoints; i++) index = i;
    const nextLevelPoints = ranks[index + 1]?.minPoints ?? null;
    return { level: ranks[index].level, nextLevelPoints,
        pointsToNextLevel: nextLevelPoints === null ? 0 : Math.max(0, nextLevelPoints - points) };
}
module.exports = { rankForPoints };
