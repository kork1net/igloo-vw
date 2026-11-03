# Settings

The `settings-button.png` control in the bottom chat bar opens the shared framed
settings dialog. Its volume slider controls the global Phaser sound manager,
including music and effects. Zero mutes all sounds.

Volume is stored under `vw.volume` in browser local storage and restored when the
game starts, including on the login screen. It persists across rooms and logins
on that browser. Settings uses the shared modal input lock and closes with X,
Escape or a click on the backdrop.
