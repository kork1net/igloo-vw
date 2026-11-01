import config from '../../../shared/snow-catch.json';
import { createCoinIcon } from '../ui/CoinIcon';
import { createRankingIcon } from '../ui/RankingIcon';
import { openHtmlWindow, closeHtmlWindow } from '../ui/WindowTransition';
import { addHoverOutline } from '../ui/HoverOutline';
import { addButtonHover } from '../ui/ButtonHover';
import { setWorldDepth } from '../objects/WorldDepth';
import { createMinigameBadge } from '../objects/MinigameBadge';

export function createSnowGameEntry(scene) {
    const container = scene.add.container(scene.scale.width * 0.94, scene.scale.height * 0.71);
    const shadow = scene.add.ellipse(0, 0, 96, 16, 0x536b7d, 0.22);
    const snowman = scene.add.image(0, 0, 'snow-game-snowman').setOrigin(0.5, 1)
        .setInteractive({ pixelPerfect: true, useHandCursor: true });
    const label = scene.add.text(0, 23, 'תופסים שלג', { fontFamily: 'Rubik, Arial, sans-serif',
        fontSize: '18px', fontStyle: 'bold', color: '#17324d', stroke: '#ffffff', strokeThickness: 3,
        resolution: 2 }).setOrigin(0.5);
    container.add([shadow, snowman, label]);
    const gameBadge = createMinigameBadge(scene, container).setVisible(true);
    gameBadge.y = -snowman.displayHeight - 10;
    if (!(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) {
        const floating = scene.tweens.add({
            targets: gameBadge, y: gameBadge.y - 6, duration: 1000,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1
        });
        gameBadge.once('destroy', () => floating.stop());
    }
    setWorldDepth(container, container.y, scene.scale.height);
    addHoverOutline(scene, snowman);
    addButtonHover(scene, snowman, [container]);
    snowman.on('pointerdown', (pointer, x, y, event) => {
        event.stopPropagation();
        scene.sound.play('wood-tap-ui');
        openSnowCatch(scene);
    });
    return container;
}

export function openSnowCatch(scene) {
    if (scene.snowGame) return;
    scene.activeResident?.closeDialogue(false);
    scene.closePlayerCard(false);
    scene.inventoryWindow?.destroy(); scene.inventoryWindow = null; scene.catalogOpen = false;
    scene.player.moveTarget = null; scene.player.isMoving = false; scene.player.isRunning = false;
    scene.pendingTransition = null;
    Object.values(scene.player.cursors).forEach(key => key.reset());
    const keyboardEnabled = scene.input.keyboard.enabled || scene.chatInput?.node === document.activeElement;
    scene.chatInput?.setVisible(false);
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen snow-catch-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue snow-catch-dialogue" role="dialog" aria-modal="true" aria-labelledby="snow-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="snow-title">תופסים שלג</h2>
        <div class="snow-catch-hud"><span class="snow-score">ניקוד: 0</span><span class="snow-time">45 שניות</span></div>
        <canvas class="snow-catch-canvas" tabindex="0" aria-label="מגרש המשחק. הזיזו את הסל בעזרת העכבר או החצים ימינה ושמאלה."></canvas>
        <p class="snow-help">תפסו כדורי שלג בסל! פתית זהוב מעניק בונוס, ומגוש קרח צריך להתחמק.<br />זזים עם העכבר או החצים · סיבוב של 45 שניות · סגירה באמצע מבטלת את הסיבוב</p>
        <p class="snow-result" role="status" aria-live="polite"></p>
        <div class="snow-actions"><button class="snow-start" type="button">מתחילים!</button><button class="snow-recover" type="button" hidden>בדיקת תוצאה</button></div>
    </section>`;
    const canvas = overlay.querySelector('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = config.width * dpr; canvas.height = config.height * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const startButton = overlay.querySelector('.snow-start');
    const recoverButton = overlay.querySelector('.snow-recover');
    const resultLabel = overlay.querySelector('.snow-result');
    const scoreLabel = overlay.querySelector('.snow-score');
    const timeLabel = overlay.querySelector('.snow-time');
    let state = null, phase = 'intro', receivedAt = performance.now(), lastFrame = receivedAt;
    let targetX = config.width / 2, basketX = targetX, lastSent = 0, frameHandle, active = true, starting = false;
    let feedback = null;
    const keys = new Set();
    const controller = {
        get basketX() { return basketX; },
        applyState(next) {
            if (!active || (state && next.id !== state.id)) return;
            if (state && next.score !== state.score) {
                feedback = { amount: next.score - state.score, at: performance.now() };
            }
            // Predict the basket every animation frame. Server snapshots arrive at
            // 10 Hz and must not repeatedly rewind the visible basket.
            if (!state || next.phase === 'finished') basketX = next.basketX;
            state = next; receivedAt = performance.now();
            phase = next.phase;
            scoreLabel.textContent = `ניקוד: ${next.score}`;
            timeLabel.textContent = `${Math.ceil(next.remaining / 1000)} שניות`;
            if (phase === 'finished' && next.result) {
                const r = next.result;
                resultLabel.replaceChildren(
                    document.createTextNode(`כל הכבוד! ${r.score} נקודות · הרווחתם ${r.coins} `),
                    createCoinIcon(),
                    document.createTextNode(` ו־${r.rankingPoints} `),
                    createRankingIcon(),
                    document.createTextNode(`. דרגה ${r.level} · שיא אישי: ${r.best}`)
                );
                startButton.textContent = 'שחקו שוב'; startButton.hidden = false; startButton.disabled = false;
                recoverButton.hidden = true;
                keys.clear();
            }
        },
        error(message) { resultLabel.textContent = message; recoverButton.hidden = false; }
    };
    scene.snowGame = controller;
    scene.player.setMinigame('snow-catch');
    scene.multiplayer.requestInventory('minigame:presence', { game: 'snow-catch', active: true }).catch(() => {});
    const requestState = async () => {
        try { const result = await scene.multiplayer.requestInventory('snow:state', {}); controller.applyState(result.state); }
        catch (error) { controller.error(error.message); }
    };
    recoverButton.addEventListener('click', requestState);
    startButton.addEventListener('click', async () => {
        if (starting || phase === 'playing') return;
        starting = true; startButton.disabled = true; state = null;
        resultLabel.textContent = 'מתכוננים...';
        try {
            const result = await scene.multiplayer.requestInventory('snow:start', {});
            if (!active || overlay.windowClosing) { scene.multiplayer.requestInventory('snow:cancel', { id: result.state.id }).catch(() => {}); return; }
            controller.applyState(result.state);
            targetX = result.state.basketX; keys.clear();
            startButton.hidden = true; recoverButton.hidden = true;
            resultLabel.textContent = ''; canvas.focus();
        } catch (error) {
            resultLabel.textContent = error.message; startButton.disabled = false;
            recoverButton.hidden = false;
        } finally { starting = false; }
    });
    const movePointer = event => {
        if (phase !== 'playing') return;
        const bounds = canvas.getBoundingClientRect();
        targetX = Math.max(50, Math.min(config.width - 50, (event.clientX - bounds.left) / bounds.width * config.width));
    };
    canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerdown', event => { canvas.focus(); movePointer(event); });
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); keys.add(event.key); }
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('button, canvas')].filter(node => !node.hidden && !node.disabled);
            const i = controls.indexOf(document.activeElement);
            if ((event.shiftKey && i <= 0) || (!event.shiftKey && i === controls.length - 1)) {
                event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
            }
        }
    });
    overlay.addEventListener('keyup', event => {
        event.stopPropagation(); keys.delete(event.key);
        if (['ArrowLeft', 'ArrowRight'].includes(event.key) && keys.size === 0) targetX = basketX;
    });
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    const blur = () => { keys.clear(); targetX = basketX; };
    window.addEventListener('blur', blur);
    const visibility = () => {
        keys.clear();
        if (!document.hidden && state) basketX = state.basketX;
        targetX = basketX;
    };
    document.addEventListener('visibilitychange', visibility);
    const disconnected = () => {
        if (phase === 'playing') {
            phase = 'error'; resultLabel.textContent = 'החיבור לשרת נותק. הסיבוב בוטל; אפשר להתחיל שוב אחרי החיבור.';
            startButton.hidden = false; startButton.disabled = false;
        }
    };
    scene.multiplayer.socket.on('disconnect', disconnected);
    const close = (animate = true) => {
        if (overlay.windowClosing && animate) return;
        active = false;
        controller.closing = true;
        cancelAnimationFrame(frameHandle); keys.clear();
        window.removeEventListener('blur', blur);
        document.removeEventListener('visibilitychange', visibility);
        scene.multiplayer.socket?.off('disconnect', disconnected);
        if (state || starting) scene.multiplayer.requestInventory('snow:cancel', state ? { id: state.id } : {}).catch(() => {});
        scene.player.setMinigame(null);
        scene.multiplayer.requestInventory('minigame:presence', { game: 'snow-catch', active: false }).catch(() => {});
        closeHtmlWindow(overlay, () => {
            scene.events.off('shutdown', shutdown);
            if (scene.snowGame !== controller) return;
            scene.snowGame = null;
            scene.input.keyboard.enabled = keyboardEnabled;
            scene.chatInput?.setVisible(true);
        }, animate);
        if (animate) scene.sound.play('ui-close');
    };
    const shutdown = () => close(false);
    scene.events.once('shutdown', shutdown);
    overlay.querySelector('.resident-close').addEventListener('click', () => close());
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

    const circle = (x, y, radius, fill, stroke) => {
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    const render = now => {
        if (!active) return;
        const delta = Math.min(50, now - lastFrame); lastFrame = now;
        if (phase === 'playing') {
            const direction = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
            if (direction) targetX = direction > 0 ? config.width - 50 : 50;
            basketX += Math.sign(targetX - basketX) * Math.min(Math.abs(targetX - basketX), config.basketSpeed * delta / 1000);
            if (state && now - lastSent >= 50) {
                scene.multiplayer.socket?.emit('snow:input', { id: state.id, x: targetX }); lastSent = now;
            }
            if (now - receivedAt > 2000) { recoverButton.hidden = false; }
        }
        const sky = ctx.createLinearGradient(0, 0, 0, config.height);
        sky.addColorStop(0, '#467eaf'); sky.addColorStop(1, '#d7efff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, config.width, config.height);
        ctx.fillStyle = '#ecf8ff';
        ctx.beginPath(); ctx.moveTo(0, 420); ctx.quadraticCurveTo(210, 375, 400, 422);
        ctx.quadraticCurveTo(570, 385, 760, 420); ctx.lineTo(760, 500); ctx.lineTo(0, 500); ctx.fill();
        const age = phase === 'playing' ? Math.min(0.2, (now - receivedAt) / 1000) : 0;
        for (const flake of state?.flakes || []) {
            const y = flake.y + flake.speed * age;
            if (flake.type === 'ice') {
                ctx.save(); ctx.translate(flake.x, y); ctx.rotate(Math.PI / 4);
                ctx.fillStyle = '#4662b0'; ctx.strokeStyle = '#d8edff'; ctx.lineWidth = 2;
                ctx.fillRect(-10, -10, 20, 20); ctx.strokeRect(-10, -10, 20, 20); ctx.restore();
            } else if (flake.type === 'gold') {
                circle(flake.x, y, 12, '#ffe586', '#d69d36');
                ctx.fillStyle = '#9a631d'; ctx.font = 'bold 16px Rubik'; ctx.textAlign = 'center'; ctx.fillText('★', flake.x, y + 6);
            } else circle(flake.x, y, 10, '#ffffff', '#87b9dc');
        }
        ctx.strokeStyle = '#796244'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(basketX, config.basketY + 4, 42, 27, Math.PI, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = '#cf9a65'; ctx.strokeStyle = '#73543e'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(basketX - 50, config.basketY); ctx.lineTo(basketX + 50, config.basketY);
        ctx.lineTo(basketX + 38, config.basketY + 35); ctx.lineTo(basketX - 38, config.basketY + 35); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let x = -25; x <= 25; x += 25) { ctx.beginPath(); ctx.moveTo(basketX + x, config.basketY + 5); ctx.lineTo(basketX + x, config.basketY + 30); ctx.stroke(); }
        if (feedback && now - feedback.at < 650) {
            const progress = (now - feedback.at) / 650;
            ctx.save(); ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = feedback.amount > 0 ? '#1c714d' : '#b23450';
            ctx.font = 'bold 24px Rubik'; ctx.textAlign = 'center';
            ctx.fillText(`${feedback.amount > 0 ? '+' : ''}${feedback.amount}`, basketX, config.basketY - 45 - progress * 25);
            ctx.restore();
        }
        frameHandle = requestAnimationFrame(render);
    };
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay); startButton.focus(); scene.input.keyboard.enabled = false;
    frameHandle = requestAnimationFrame(render);
    return controller;
}
