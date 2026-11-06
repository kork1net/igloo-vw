const playedAt = new WeakMap();

export function silenceChatSound(sound) {
    sound.stopByKey('ui-chat');
    playedAt.set(sound, performance.now());
}

export function playChatSound(scene) {
    const sound = scene.sound;
    // Never enqueue notifications into a suspended audio context or a background tab.
    if (document.hidden || sound.locked || (sound.context && sound.context.state !== 'running')) return;
    const now = performance.now();
    if (now - (playedAt.get(sound) ?? -Infinity) < 350) return;
    sound.stopByKey('ui-chat');
    sound.play('ui-chat');
    playedAt.set(sound, now);
}
