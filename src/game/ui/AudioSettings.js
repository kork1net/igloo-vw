const KEY = 'vw.audio';
const managers = new WeakMap();

export function audioSettings(manager) {
    if (managers.has(manager)) return managers.get(manager);
    let preferences = { music: true, effects: true };
    try {
        const stored = localStorage.getItem(KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            for (const category of ['music', 'effects']) {
                if (typeof parsed?.[category] === 'boolean') preferences[category] = parsed[category];
            }
        } else if (localStorage.getItem('vw.volume') === '0') preferences = { music: false, effects: false };
    } catch { /* Audio controls also work without browser storage. */ }
    const category = sound => sound.key.includes('music') ? 'music' : 'effects';
    const state = {
        preferences,
        toggle(group) {
            preferences[group] = !preferences[group];
            for (const sound of manager.sounds || []) sound.setMute(!preferences[category(sound)]);
            try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Optional persistence. */ }
        }
    };
    managers.set(manager, state);
    manager.setVolume(1);
    const add = manager.add;
    manager.add = function (...args) {
        const sound = add.apply(this, args);
        const play = sound.play;
        sound.setMute(!preferences[category(sound)]);
        sound.play = function (marker, config) {
            const mute = !preferences[category(this)];
            if (marker && typeof marker === 'object') return play.call(this, { ...marker, mute });
            return play.call(this, marker, { ...config, mute });
        };
        return sound;
    };
    for (const sound of manager.sounds || []) sound.setMute(!preferences[category(sound)]);
    return state;
}
