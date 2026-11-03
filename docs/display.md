# Display and fullscreen

F11 toggles fullscreen for the entire game container, including HTML chat and
dialogs. F11 again or Escape exits fullscreen. Holding F11 does not toggle repeatedly.

The logical game, camera and input coordinates stay at 1280 × 720.
`src/game/ui/Fullscreen.js` uses the largest display scale that fits the container,
preserving the aspect ratio and leaving margins on screens with a different ratio.
For example, a 1920 × 1080 viewport enlarges the game to 1.5×, while 2560 × 1440
uses 2×. The canvas origin and HTML chat remain aligned to the same grid.

In fullscreen, `RenderDensity.js` increases only the backing canvas pixel count
to match the physical display density. WebGL viewports/scissors and Canvas drawing
transforms account for this, while world coordinates and offscreen textures stay
unchanged. This draws text at native detail instead of enlarging a low-resolution
finished frame. The adapter is scoped to this game instance, with GPU viewport
limits respected. Exiting fullscreen restores the original 1280 × 720 buffer.

`TextDensity.js` raises text texture resolution when needed and enables linear
sampling for text alone; pixel-art sprites keep nearest-neighbor sampling. New
text objects and nested labels receive the same treatment. The previous text
resolution and filter are restored when leaving fullscreen.

The existing sharp integer fitting behavior returns when leaving fullscreen.
Pixelated rendering remains enabled. Fractional fullscreen scales can produce
uneven source pixel widths, which is the tradeoff for filling a screen that cannot
fit a whole-number enlargement. Windows scaling and browser zoom affect this too.

Verification:

```
node tests/fullscreen.cjs
node tests/render-density.cjs
node tests/menu-browser.cjs --fullscreen
```

The browser check requires Chrome and the Vite development server on port 8080;
it starts an isolated multiplayer server and does not modify player accounts.

## Window input

`openHtmlWindow` isolates pointer, compatibility mouse/touch, wheel and keyboard
events inside HTML game windows, including their closing animation. Native form
controls retain their normal behavior. Nonmodal trade requests only intercept
events inside their card, leaving the rest of the map interactive.

Use `mountModal` for blocking HTML dialogs. Its per-scene stack restores input,
chat visibility and parent focus only when the relevant dialog layer is closed;
closing an underlying layer does not unlock the world beneath an active dialog.
Check stack restoration with `node tests/modal-input.cjs`.
