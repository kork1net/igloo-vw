const chains = require('../shared/resident-quests.json');
const legacySteps = require('../shared/resident-quest-legacy-steps.json');
const { rankForPoints } = require('./ranks.cjs');
const residentRooms = { leo: 'Game', rani: 'Shop', mia: 'Cafe' };

function claimedIds(saved, chain) {
    const known = chain.steps.map(step => step.id);
    if (Array.isArray(saved?.claimedIds)) return [...new Set(saved.claimedIds.filter(id => known.includes(id)))];
    const previous = legacySteps[chain.id] || known;
    const count = Number.isSafeInteger(saved?.claimed) ? Math.max(0, saved.claimed) : 0;
    // Preserve completed chains. Removed stages never shift progress onto another task.
    if (count >= previous.length) return known;
    return previous.slice(0, count).filter(id => known.includes(id));
}

function currentStage(profile, chain) {
    const saved = profile.quests?.[chain.id];
    const ids = claimedIds(saved, chain);
    return saved?.started ? chain.steps.find(step => !ids.includes(step.id)) || null : null;
}

function views(profile, user) {
    const level = rankForPoints(profile.rankingPoints || 0, user.isAdmin).level;
    return Object.fromEntries(chains.filter(chain => level >= chain.level || profile.quests?.[chain.id]?.started).map(chain => {
        const saved = profile.quests?.[chain.id] || {};
        const ids = claimedIds(saved, chain);
        const next = chain.steps.findIndex(step => !ids.includes(step.id));
        const index = next < 0 ? chain.steps.length : next;
        const current = currentStage(profile, chain);
        return [chain.id, { ...chain, residentId: current?.residentId || (index >= chain.steps.length
            ? chain.steps.at(-1).residentId : chain.residentId), started: Boolean(saved.started),
            completed: index >= chain.steps.length, claimedSteps: index,
            claimedIds: ids,
            steps: chain.steps.map((step, i) => {
                const value = step.rule === 'talk' ? 1 : step.rule === 'purchaseNew' && user.isAdmin
                    ? step.target : saved.progress?.[step.id] || 0;
                return { ...step, ready: Boolean(saved.started && i === index && value >= step.target),
                    status: i < index ? 'claimed' : saved.started && i === index ? 'active' : 'locked',
                    progressText: step.rule === 'talk' ? 'דברו עם התושב כדי להמשיך.' : `${Math.min(value, step.target)} / ${step.target}` };
            }) }];
    }));
}

function capture(profile) {
    return Object.fromEntries(chains.map(chain => [chain.id, currentStage(profile, chain)?.id]).filter(([, id]) => id));
}

// Only stages active when an activity began receive its progress.
function advance(profile, rule, amount, captured) {
    const quests = { ...profile.quests };
    for (const chain of chains) {
        const step = currentStage(profile, chain);
        if (!step || step.rule !== rule || captured?.[chain.id] !== step.id) continue;
        const saved = quests[chain.id];
        quests[chain.id] = { ...saved, progress: { ...saved.progress,
            [step.id]: Math.min(step.target, (saved.progress?.[step.id] || 0) + amount) } };
    }
    return quests;
}

function assertResident(view, room) {
    if (!view || residentRooms[view.residentId] !== room) throw new Error('גשו לתושב שמטפל כרגע במשימה.');
}

module.exports = { chains, views, currentStage, capture, advance, assertResident, residentRooms, claimedIds };
