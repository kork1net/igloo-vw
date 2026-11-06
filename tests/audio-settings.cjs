const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map();
const source = fs.readFileSync('src/game/ui/AudioSettings.js', 'utf8').replace('export function', 'function');
const settings = vm.runInNewContext(source + '\naudioSettings', { localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
} });
const manager = () => ({ sounds: [], setVolume(value) { this.volume = value; }, add(key, config = {}) {
    const sound = { key, config, setMute(value) { this.mute = value; return this; },
        play(marker, overrides) { this.played = { marker, overrides }; this.mute = typeof marker === 'object' ? marker.mute : overrides.mute; return true; } };
    this.sounds.push(sound); return sound;
} });
const sound = manager(), audio = settings(sound);
assert.equal(settings(sound), audio, 'Install only once');
const music = sound.add('main-room-music', { volume: 0.2 }), effect = sound.add('ui-close');
audio.toggle('music'); assert.equal(music.mute, true); assert.equal(effect.mute, false);
music.play(); assert.equal(music.mute, true);
const nextRoom = sound.add('coffee-shop-music', { volume: 0.2 });
nextRoom.play(); assert.equal(nextRoom.mute, true);
assert.equal(nextRoom.config.volume, 0.2);
audio.toggle('effects'); effect.play({ volume: 0.4, mute: false }); assert.equal(effect.mute, true);
assert.equal(effect.played.marker.volume, 0.4);
audio.toggle('music'); assert.equal(music.mute, false); assert.equal(effect.mute, true);
const reopened = manager(), restored = settings(reopened);
assert.equal(restored.preferences.music, true); assert.equal(restored.preferences.effects, false);
const freshEffect = reopened.add('sfx-buy'); freshEffect.play(); assert.equal(freshEffect.mute, true);
storage.clear(); storage.set('vw.volume', '0');
assert.equal(settings(manager()).preferences.music, false);
assert.equal(settings(manager()).preferences.effects, false);
console.log('PASS audio: separate toggles, active/new sounds, replay, room music, persistence and old mute migration');
