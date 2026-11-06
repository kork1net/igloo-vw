# Settings

The `settings-button.png` control in the bottom chat bar opens the shared framed
settings dialog. Two styled toggle buttons separately enable or mute background
music and sound effects. There is no volume slider. Muting music keeps its
playback position; effects remain independent, including new sounds and room changes.

Preferences are stored under `vw.audio` in browser local storage and restored when the
game starts, including on the login screen. An old `vw.volume` value of zero migrates
to both categories muted. Preferences persist across rooms and logins
on that browser. Settings uses the shared modal input lock and closes with X,
Escape or a click on the backdrop.

`AudioSettings.js` installs once per sound manager and applies category mute before
playback, preserving each sound's configured volume. Keys containing `music` belong
to background music; other keys belong to effects. Tests: `node tests/audio-settings.cjs`.
