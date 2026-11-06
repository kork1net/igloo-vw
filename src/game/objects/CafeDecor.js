import { TintModes } from 'phaser';
import { addHoverOutline } from '../ui/HoverOutline';
import { addButtonHover } from '../ui/ButtonHover';
import { showSecretReward } from '../ui/SecretReward';

// Draw on a small canvas so every edge follows the same pixel grid.
export function createCafeDecor(scene) {
    const key = 'cafe-interior';
    if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, 640, 360);
        const ctx = texture.context;
        const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
        // Exact wood palette sampled from cafe-table.png.
        const wood = { outline: '#592f0d', dark: '#8c460f',
            middle: '#d38e57', light: '#ffbd89' };
        // One pixel-grid contour for every part, including the lower corners.
        const roundedPanel = (x, y, w, h, radius, fill, border = 2) => {
            const inside = (px, py, inset) => {
                const r = Math.max(0, radius - inset);
                if (px < inset || py < inset || px >= w - inset || py >= h - inset) return false;
                const dx = Math.max(inset + r - px, 0, px - (w - inset - r));
                const dy = Math.max(inset + r - py, 0, py - (h - inset - r));
                return dx * dx + dy * dy <= r * r;
            };
            for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
                if (inside(px + 0.5, py + 0.5, 0)) {
                    rect(x + px, y + py, 1, 1,
                        inside(px + 0.5, py + 0.5, border) ? fill : wood.outline);
                }
            }
        };
        // Original decorative cups: curved bowl, open handle and an oval rim.
        const drawCup = (x, y, width, height, filled = false, porcelain = '#f6fbff', baseline, paint = rect) => {
            const ellipse = (u, v, cx, cy, rx, ry) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
            const coords = (px, py) => [(px + 0.5) * 30 / width, (py + 0.5) * 26 / height];
            const bowl = (px, py) => {
                const [u, v] = coords(px, py);
                return u >= 2 && u <= 22 && v >= 5 && v <= 25
                    && (v <= 13 || ellipse(u, v, 12, 13, 10, 12));
            };
            const handle = (px, py) => {
                const [u, v] = coords(px, py);
                return ellipse(u, v, 22, 12.5, 7.5, 8) && !ellipse(u, v, 22, 12.5, 3.2, 4.3);
            };
            // Erode each silhouette by exactly one canvas pixel for a uniform outline.
            const interior = (mask, px, py) => mask(px - 1, py) && mask(px + 1, py)
                && mask(px, py - 1) && mask(px, py + 1);
            if (baseline !== undefined) {
                let bottom = 0;
                for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
                    if (bowl(px, py) || handle(px, py)) bottom = Math.max(bottom, py);
                }
                y = baseline - bottom - 1;
            }
            for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
                const [u, v] = coords(px, py);
                let color;
                if (handle(px, py)) color = interior(handle, px, py) ? '#ffffff' : '#5286b9';
                if (bowl(px, py)) {
                    const inner = interior(bowl, px, py);
                    const shadow = !ellipse(u, v, 8, 9, 11, 13);
                    color = inner ? (shadow ? '#b4d2ed' : porcelain) : '#5286b9';
                    if (inner && u < 6 && v > 9 && v < 17) color = '#ffffff';
                }
                if (ellipse(u, v, 12, 5, 10.5, 3.5)) {
                    color = '#5286b9';
                    if (ellipse(u, v, 12, 5, 10.5 - 30 / width, 3.5 - 26 / height)) {
                        color = filled ? '#905832' : '#c5def1';
                    }
                    if (filled && ellipse(u, v, 10, 4.5, 3.8, 0.7)) color = '#e7bb80';
                }
                if (color) paint(x + px, y + py, 1, 1, color);
            }
        };
        // Rounded shelves with small, individually drawn porcelain cups.
        for (const y of [40, 82]) {
            for (const x of [41, 130]) roundedPanel(x, y + 5, 9, 11, 3, wood.dark);
            roundedPanel(28, y, 126, 9, 4, wood.middle);
            for (const x of [34, 64, 94, 124]) {
                drawCup(x, 0, 27, 27 * 34 / 45, false, '#f6fbff', y);
            }
        }
        // Soft-cornered wood frame with a matching latte cup and simple steam.
        roundedPanel(515, 12, 70, 76, 7, wood.middle, 3);
        roundedPanel(520, 17, 60, 66, 4, '#f4e4c7', 0);
        roundedPanel(525, 22, 50, 56, 3, '#c4d9da', 0);
        roundedPanel(529, 73, 43, 4, 2, '#a7bec4', 0);
        const secretCupTexture = scene.textures.createCanvas('cafe-picture-cup', 45, 34);
        drawCup(0, 0, 45, 34, true, '#f6fbff', undefined, (x, y, w, h, color) => {
            secretCupTexture.context.fillStyle = color;
            secretCupTexture.context.fillRect(x, y, w, h);
        });
        secretCupTexture.refresh();
        for (const x of [542, 552]) {
            roundedPanel(x, 32, 3, 7, 1, '#f4e4c7', 0);
            roundedPanel(x + 2, 28, 3, 6, 1, '#f4e4c7', 0);
        }
        for (const x of [246, 413]) {
            roundedPanel(x, 117, 12, 44, 4, wood.dark);
            roundedPanel(x - 3, 156, 18, 7, 3, wood.dark);
        }
        roundedPanel(234, 116, 202, 16, 5, wood.dark);
        // The darker rounded front edge gives the pale top a little depth.
        roundedPanel(218, 106, 234, 18, 6, wood.dark);
        roundedPanel(218, 92, 234, 25, 7, wood.middle);
        roundedPanel(225, 97, 220, 14, 5, wood.light, 0);
        // Keep the counter separate so it can cover characters walking behind it.
        const counterTexture = scene.textures.createCanvas('cafe-counter', 250, 76);
        counterTexture.context.drawImage(ctx.canvas, 210, 89, 250, 76, 0, 0, 250, 76);
        counterTexture.refresh();
        ctx.clearRect(210, 89, 250, 76);
        texture.refresh();
    }
    const { width, height } = scene.scale;
    const background = scene.add.image(width / 2, height / 2, 'cafe-shop-background')
        .setDepth(-1);
    background.setScale(Math.max(width / background.width, height / background.height));
    // A translucent pale layer lightens the original artwork without dark tinting.
    const light = scene.add.image(background.x, background.y, 'cafe-shop-background')
        .setScale(background.scaleX).setTint(0xfff8ee).setTintMode(TintModes.FILL)
        .setAlpha(0.16).setDepth(-0.95);
    const wallKey = 'cafe-stone-wall';
    if (!scene.textures.exists(wallKey)) {
        const stone = scene.textures.createCanvas(wallKey, 640, 98);
        const context = stone.context;
        context.fillStyle = '#888e8c';
        context.fillRect(0, 0, 640, 98);
        const colors = ['#b4b6b4', '#bcbdba', '#aeb1af', '#b8bab7'];
        for (let row = 0; row < 5; row++) {
            for (let column = -1; column < 9; column++) {
                const x = column * 84 + (row % 2 ? 42 : 0), y = row * 24;
                context.fillStyle = colors[((column + row * 3) % colors.length + colors.length) % colors.length];
                context.fillRect(x + 1, y + 1, 82, 22);
                context.fillStyle = '#c8c9c5';
                context.fillRect(x + 2, y + 1, 80, 1);
            }
        }
        stone.refresh();
    }
    // Cover only the painted wall, retaining the wooden skirting and floor.
    const wallHeight = 256 * background.scaleY;
    const wall = scene.add.image(background.x, background.y - background.displayHeight / 2 + wallHeight / 2, wallKey)
        .setDisplaySize(background.displayWidth, wallHeight).setDepth(-0.9);
    const decorations = scene.add.image(width / 2, height / 2, key)
        .setDisplaySize(width, height).setDepth(-0.75);
    const lamps = [175, 465].map(x => {
        const lamp = scene.add.image(width * (x / 640), 0, 'cafe-light').setOrigin(0.5, 0).setDepth(-0.7);
        lamp.setScale((70 * width / 1280) / lamp.width);
        return lamp;
    });
    const secretCup = scene.add.image(width * (550.5 / 640), height * (75 / 360), 'cafe-picture-cup')
        .setOrigin(0.5, 1).setScale(width / 640, height / 360).setDepth(12.04)
        .setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
    const secretCupOutline = addHoverOutline(scene, secretCup);
    addButtonHover(scene, secretCup, [secretCup, secretCupOutline]);
    let secretClaimed;
    const refreshSecretCup = () => {
        const claimed = scene.registry.get('inventory')?.secrets?.cafePictureCup === true;
        if (claimed === secretClaimed) return;
        secretClaimed = claimed;
        scene.tweens.killTweensOf([secretCup, secretCupOutline]);
        secretCup.setScale(width / 640, height / 360).setDepth(claimed ? -0.7 : 12.04);
        secretCupOutline.setAlpha(0).setVisible(!claimed);
        if (claimed) secretCup.disableInteractive();
        else secretCup.setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
    };
    refreshSecretCup();
    scene.registry.events.on('changedata-inventory', refreshSecretCup);
    scene.events.once('shutdown', () => scene.registry.events.off('changedata-inventory', refreshSecretCup));
    let claimingSecret = false;
    secretCup.on('pointerdown', async (pointer, x, y, event) => {
        event.stopPropagation();
        if (claimingSecret || secretClaimed || scene.adminModal) return;
        claimingSecret = true;
        scene.sound.play('wood-tap-ui');
        try {
            const result = await scene.multiplayer.requestInventory('cafe:secretCup', {});
            if (scene.sys.isActive()) showSecretReward(scene, result.secretReward);
        } catch (error) {
            if (scene.sys.isActive()) { scene.sound.play('hurt-sfx'); scene.showItemNotice(error.message); }
        } finally { claimingSecret = false; }
    });
    const menu = scene.add.image(width * (362.5 / 640), height * (6 / 360), 'cafe-menu')
        .setOrigin(0.5, 0).setDepth(-0.74);
    menu.setScale((height / 720 * 174) / menu.height);
    const counterX = width * (335 / 640), counterBottom = height * (165 / 360);
    const groupScale = 0.82;
    const counterScale = width / 640 * 0.88 * groupScale;
    const counterShadow = scene.add.ellipse(counterX, counterBottom - 7,
        224 * counterScale, 23 * counterScale, 0x543b30, 0.18).setDepth(-0.8);
    const counter = scene.add.image(counterX, counterBottom, 'cafe-counter')
        .setOrigin(0.5, 1).setScale(counterScale).setDepth(12);
    const cashboxX = counterX - 72 * counterScale;
    const cashboxY = counterBottom - 57 * counterScale;
    const cashboxShadow = scene.add.ellipse(cashboxX, cashboxY,
        66 * groupScale, 11 * groupScale, 0x543b30, 0.24).setDepth(12.01);
    const cashbox = scene.add.image(cashboxX, cashboxY, 'cafe-cashbox')
        .setOrigin(0.5, 1).setDepth(12.02);
    cashbox.setScale(60 * groupScale / cashbox.width);
    const gamePosition = { x: counterX + 65 * counterScale, y: cashboxY, depth: 12.03, scale: groupScale };
    const furniture = [[0.17, 0.60], [0.35, 0.78], [0.78, 0.76], [0.83, 0.46]].map(([x, y]) => {
        scene.add.ellipse(width * x, height * y - 7, 245, 32, 0x543b30, 0.18)
            .setDepth(-0.5);
        const table = scene.add.image(width * x, height * y, 'cafe-table').setOrigin(0.5, 1);
        table.setScale(260 / table.width);
        table.setDepth(0);
        return table;
    });
    return { background, light, wall, decorations, lamps, secretCup, secretCupOutline, menu, counterShadow, counter, cashboxShadow, cashbox,
        gamePosition, furniture };
}
