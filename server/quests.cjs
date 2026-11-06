const chain = require('../shared/leo-quests.json');
const legacySteps = ['first-purchase', 'snow-catch', 'ready-for-igloo'];

function claimedIds(saved) {
    const all = chain.steps.map(step => step.id);
    // Completed legacy chains stay completed; inserting a step must not repay old rewards.
    if (saved?.completed || (!Array.isArray(saved?.claimedIds) && saved?.claimed >= legacySteps.length)) return all;
    const ids = Array.isArray(saved?.claimedIds) ? saved.claimedIds
        : legacySteps.slice(0, Number.isSafeInteger(saved?.claimed) ? Math.max(0, saved.claimed) : 0);
    return [...new Set(ids.filter(id => all.includes(id)))];
}

function questView(profile, user, catalog, equipped) {
    const saved = profile.quests?.[chain.id];
    const ids = claimedIds(saved);
    const nextIndex = chain.steps.findIndex(step => !ids.includes(step.id));
    const progress = { started: Boolean(saved?.started), claimed: nextIndex < 0 ? chain.steps.length : nextIndex };
    const known = new Set(catalog.items.map(item => item.id));
    const starter = user.starterColor || 'body-color/white';
    const owned = user.isAdmin ? catalog.items.map(item => item.id) : profile.purchasedItems || profile.items;
    const purchases = new Set(owned.filter(id => id !== starter && known.has(id))).size;
    const wearing = Object.entries(equipped).some(([slot, id]) => slot !== 'bodyColor' && Boolean(id));
    const steps = chain.steps.map((step, index) => {
        const score = (step.rule === 'coffee' ? saved?.coffeeScores : saved?.snowScores)?.[step.id] || 0;
        const fulfilled = step.rule === 'purchase' ? purchases >= step.target
            : ['snow', 'coffee'].includes(step.rule) ? score >= step.target
                : step.rule === 'talk' ? true : purchases >= step.target && wearing;
        const current = progress.started && progress.claimed === index;
        return { ...step, ready: Boolean(current && fulfilled),
            status: ids.includes(step.id) ? 'claimed' : current ? 'active' : 'locked',
            progressText: step.rule === 'purchase' ? `פריטים בבעלות: ${Math.min(purchases, step.target)}/${step.target}`
                : ['snow', 'coffee'].includes(step.rule) ? `ניקוד בבקשה הנוכחית: ${score} / נדרש: ${step.target}`
                    : step.rule === 'talk' ? 'דברו עם התושב כדי להמשיך.'
                    : `פריטים: ${Math.min(purchases, step.target)}/${step.target} · בגד או אביזר לבוש: ${wearing ? 'כן' : 'לא'}` };
    });
    const residentId = progress.started && nextIndex >= 0 ? chain.steps[nextIndex].residentId || chain.residentId : chain.residentId;
    return { id: chain.id, residentId, title: chain.title,
        introduction: chain.introduction, ending: chain.ending,
        started: progress.started, completed: progress.claimed >= chain.steps.length,
        claimedSteps: progress.claimed, claimedIds: ids, steps };
}

function activeQuestStep(profile) {
    if (!profile.quests?.[chain.id]?.started) return null;
    const ids = claimedIds(profile.quests[chain.id]);
    return chain.steps.find(step => !ids.includes(step.id)) || null;
}
module.exports = { chain, questView, activeQuestStep };
