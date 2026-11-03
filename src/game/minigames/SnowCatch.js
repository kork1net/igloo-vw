import config from '../../../shared/snow-catch.json';
import { setPixelCounter } from '../ui/PixelCounter';
import { createCoinIcon } from '../ui/CoinIcon';
import { createRankingIcon } from '../ui/RankingIcon';
import { openHtmlWindow, closeHtmlWindow } from '../ui/WindowTransition';
import { addHoverOutline } from '../ui/HoverOutline';
import { addButtonHover } from '../ui/ButtonHover';
import { setWorldDepth } from '../objects/WorldDepth';
import { createMinigameBadge } from '../objects/MinigameBadge';

const fallingItemFrames = {
    snow: { frame: 0, size: 24 },
    gold: { frame: 1, size: 28 },
    ice: { frame: 2, size: 28 }
};

export function createCatchSoundPlayer(playSound, onCatch = () => {}) {
    const sounds = { snow: 'snowball-sfx', gold: 'coin-sfx', ice: 'hurt-sfx' };
    let roundId;
    const heard = new Set();
    return snapshot => {
        if (snapshot.id !== roundId) {
            roundId = snapshot.id;
            heard.clear();
        }
        const elapsed = config.duration - snapshot.remaining;
        for (const hit of snapshot.hits || []) {
            const sound = sounds[hit.type];
            if (!sound || !Number.isInteger(hit.id) || heard.has(hit.id)) continue;
            heard.add(hit.id);
            // Recovery snapshots contain the round's full history. Do not replay
            // old catches after a disconnected or hidden tab becomes active.
            if (Number.isFinite(hit.at) && elapsed - hit.at > 750) continue;
            playSound(sound);
            onCatch(hit);
        }
    };
}

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
        <div class="snow-stage">
        <canvas class="snow-catch-canvas" tabindex="0" aria-label="מגרש המשחק. הזיזו את הסל בעזרת העכבר או החצים ימינה ושמאלה."></canvas>
        <div class="snow-catch-hud"><span class="snow-score" aria-label="ניקוד">0</span><span class="snow-time" aria-label="זמן שנותר">0:45</span></div>
        <div class="snow-message"><div class="snow-message-card">
            <h2 id="snow-title">תופסים שלג</h2>
            <div class="snow-message-content">
                <div class="snow-rules">
                    <div><span class="snow-rule-icon snow-rule-snow"></span><strong>+10</strong><span>כדור שלג</span></div>
                    <div><span class="snow-rule-icon snow-rule-gold"></span><strong>+30</strong><span>כדור מוזהב</span></div>
                    <div><span class="snow-rule-icon snow-rule-ice"></span><strong>-15</strong><span>התחמקו מקרח</span></div>
                </div>
                <p class="snow-help">הזיזו את הסל עם העכבר או החצים.<br />יש לכם 45 שניות!</p>
            </div>
            <p class="snow-result" role="status" aria-live="polite"></p>
            <div class="snow-actions"><button class="snow-start" type="button" aria-label="התחלת משחק"><img src="assets/ui/play-button.png" alt="שחקו" /></button><button class="snow-finish" type="button" aria-label="סיום" hidden><img src="assets/ui/v-button.png" alt="סיום" /></button><button class="snow-recover" type="button" hidden>בדיקת תוצאה</button></div>
        </div></div></div>
    </section>`;
    const canvas = overlay.querySelector('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = config.width * dpr; canvas.height = config.height * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const itemSheet = scene.textures.get('catching-snow-items').getSourceImage();
    const background = scene.textures.get('catching-snow-background').getSourceImage();
    const basket = scene.textures.get('catching-snow-basket').getSourceImage();
    const message = overlay.querySelector('.snow-message');
    const messageContent = overlay.querySelector('.snow-message-content');
    const title = overlay.querySelector('#snow-title');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const startButton = overlay.querySelector('.snow-start');
    const finishButton = overlay.querySelector('.snow-finish');
    const recoverButton = overlay.querySelector('.snow-recover');
    const resultLabel = overlay.querySelector('.snow-result');
    const scoreLabel = overlay.querySelector('.snow-score');
    const timeLabel = overlay.querySelector('.snow-time');
    setPixelCounter(scoreLabel, '0');
    setPixelCounter(timeLabel, '0:45');
    let state = null, phase = 'intro', receivedAt = performance.now(), lastFrame = receivedAt;
    let targetX = config.width / 2, basketX = targetX, lastSent = 0, frameHandle, active = true, starting = false;
    let finishing = false, finishRequested = false;
    let impactAt = -Infinity, impactType, shownResult;
    const particles = [], floatingPoints = [];
    const playCatchSounds = createCatchSoundPlayer(key => scene.sound.play(key, { volume: 0.6 }), hit => {
        const at = performance.now();
        impactAt = at; impactType = hit.type;
        floatingPoints.push({ x: basketX, at, amount: config.points[hit.type], type: hit.type });
        if (reducedMotion) return;
        const colors = hit.type === 'gold' ? ['#fff1a0', '#ffd052', '#fff9de']
            : hit.type === 'ice' ? ['#a5dbff', '#6b9fda', '#effaff'] : ['#ffffff', '#c9ecff', '#82c8f5'];
        for (let i = 0; i < (hit.type === 'gold' ? 18 : 10); i++) {
            const angle = Math.PI + Math.random() * Math.PI;
            const speed = 45 + Math.random() * 110;
            particles.push({ x: basketX, y: config.basketY, vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed, at, size: 2 + Math.floor(Math.random() * 3), color: colors[i % colors.length] });
        }
    });
    const keys = new Set();
    const controller = {
        get basketX() { return basketX; },
        applyState(next) {
            if (!active || (state && next.id !== state.id)) return;
            playCatchSounds(next);
            // Predict the basket every animation frame. Server snapshots arrive at
            // 10 Hz and must not repeatedly rewind the visible basket.
            if (!state || next.phase === 'finished') basketX = next.basketX;
            state = next; receivedAt = performance.now();
            phase = next.phase;
            if (phase === 'playing') { message.hidden = true; recoverButton.hidden = true; }
            setPixelCounter(scoreLabel, next.score.toLocaleString());
            if (phase === 'finished' && next.result && shownResult !== next.id) {
                shownResult = next.id;
                const r = next.result;
                title.textContent = 'כל הכבוד!';
                messageContent.replaceChildren();
                const score = document.createElement('div'); score.className = 'snow-final-score';
                score.textContent = r.score.toLocaleString();
                const caption = document.createElement('p'); caption.textContent = 'הניקוד שלכם';
                const prizes = document.createElement('div'); prizes.className = 'snow-prizes';
                for (const [icon, amount, label] of [[createCoinIcon(36), r.coins, 'מטבעות שהרווחתם'],
                    [createRankingIcon(36), r.rankingPoints, 'נקודות דירוג שהרווחתם']]) {
                    const prize = document.createElement('div'); prize.setAttribute('aria-label', `${label}: ${amount}`);
                    const value = document.createElement('strong'); value.textContent = `+${amount.toLocaleString()}`;
                    prize.append(icon, value); prizes.append(prize);
                }
                messageContent.append(score, caption, prizes);
                resultLabel.textContent = 'הפרסים נוספו לחשבון שלכם';
                message.hidden = false;
                if (!reducedMotion) messageContent.animate([{ opacity: 0, transform: 'translateY(12px)' },
                    { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'ease-out' });
                startButton.setAttribute('aria-label', 'שחקו שוב');
                startButton.hidden = false; startButton.disabled = false;
                finishButton.hidden = false;
                recoverButton.hidden = true;
                keys.clear();
                startButton.focus();
            }
        },
        error(error) { resultLabel.textContent = error; recoverButton.hidden = false; message.hidden = false; }
    };
    scene.snowGame = controller;
    scene.player.setMinigame('snow-catch');
    scene.multiplayer.requestInventory('minigame:presence', { game: 'snow-catch', active: true }).catch(() => {});
    const requestState = async () => {
        try { const result = await scene.multiplayer.requestInventory('snow:state', {}); controller.applyState(result.state); }
        catch (error) { controller.error(error.message); }
    };
    recoverButton.addEventListener('click', requestState);
    const finishRound = async () => {
        if (starting) { finishRequested = true; return; }
        if (finishing || !state || state.phase === 'finished') return;
        finishing = true; keys.clear(); targetX = basketX;
        resultLabel.textContent = 'שומרים את התוצאה...';
        try {
            const result = await scene.multiplayer.requestInventory('snow:finish', { id: state.id });
            if (active) controller.applyState(result.state);
        } catch (error) { if (active) controller.error(error.message); }
        finally { finishing = false; }
    };
    startButton.addEventListener('click', async () => {
        if (starting || phase === 'playing') return;
        scene.sound.play('wood-tap-ui');
        starting = true; startButton.disabled = true; state = null;
        finishButton.hidden = true;
        particles.length = 0; floatingPoints.length = 0; impactAt = -Infinity;
        resultLabel.textContent = 'מתכוננים...';
        try {
            const result = await scene.multiplayer.requestInventory('snow:start', {});
            if (!active || overlay.windowClosing) { scene.multiplayer.requestInventory('snow:cancel', { id: result.state.id }).catch(() => {}); return; }
            controller.applyState(result.state);
            targetX = result.state.basketX; keys.clear();
            startButton.hidden = true; recoverButton.hidden = true;
            message.hidden = true;
            resultLabel.textContent = ''; canvas.focus();
        } catch (error) {
            resultLabel.textContent = error.message; startButton.disabled = false;
            recoverButton.hidden = false;
        } finally {
            starting = false;
            if (finishRequested) { finishRequested = false; void finishRound(); }
        }
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
            const controls = [...overlay.querySelectorAll('button, canvas')].filter(node => !node.closest('[hidden]')
                && !node.disabled && node.getAttribute('aria-hidden') !== 'true');
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
            message.hidden = false;
            startButton.hidden = false; startButton.disabled = false;
        }
    };
    scene.multiplayer.socket.on('disconnect', disconnected);
    const close = (animate = true) => {
        if (overlay.windowClosing && animate) return;
        if (animate && (starting || finishing || state?.phase === 'playing')) {
            void finishRound();
            return;
        }
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
    finishButton.addEventListener('click', () => close());
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

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
            if (now - receivedAt > 2000) {
                recoverButton.hidden = false; message.hidden = false;
                resultLabel.textContent = 'ממתינים לעדכון מהשרת...';
            }
        }
        const remaining = state ? Math.max(0, state.remaining - (phase === 'playing' ? now - receivedAt : 0)) : config.duration;
        const seconds = Math.ceil(remaining / 1000);
        setPixelCounter(timeLabel, `0:${String(seconds).padStart(2, '0')}`);
        timeLabel.classList.toggle('snow-time-urgent', phase === 'playing' && seconds <= 10);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(background, 0, 0, config.width, config.height);
        if (!reducedMotion && impactType === 'ice' && now - impactAt < 220) {
            ctx.translate(Math.sin((now - impactAt) / 15) * 3, 0);
            ctx.fillStyle = '#b6ddff44'; ctx.fillRect(0, 0, config.width, config.height);
        }
        const age = phase === 'playing' ? Math.min(0.2, (now - receivedAt) / 1000) : 0;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const flake of state?.flakes || []) {
            const y = flake.y + flake.speed * age;
            const { frame, size } = fallingItemFrames[flake.type] || fallingItemFrames.snow;
            ctx.drawImage(itemSheet, frame * 44, 0, 44, 44,
                flake.x - size / 2, y - size / 2, size, size);
            if (flake.type === 'gold' && !reducedMotion) {
                const shimmer = 0.4 + Math.sin(now / 150 + flake.id) * 0.3;
                ctx.fillStyle = `rgba(255,244,164,${shimmer})`;
                ctx.fillRect(flake.x + 15, y - 10, 2, 6); ctx.fillRect(flake.x + 13, y - 8, 6, 2);
            }
        }
        ctx.restore();
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const bounce = reducedMotion ? 0 : Math.sin(Math.min(1, (now - impactAt) / 240) * Math.PI) * 4;
        const basketWidth = 112, basketHeight = basketWidth * basket.height / basket.width;
        ctx.drawImage(basket, Math.round(basketX - basketWidth / 2),
            Math.round(config.basketY + 36 - basketHeight - bounce), basketWidth, basketHeight);
        ctx.restore();
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i], age = (now - p.at) / 1000;
            if (age > 0.65) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = 1 - age / 0.65; ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x + p.vx * age), Math.round(p.y + p.vy * age + 130 * age * age), p.size, p.size);
        }
        ctx.globalAlpha = 1;
        for (let i = floatingPoints.length - 1; i >= 0; i--) {
            const point = floatingPoints[i], progress = (now - point.at) / 750;
            if (progress > 1) { floatingPoints.splice(i, 1); continue; }
            ctx.save(); ctx.globalAlpha = 1 - progress;
            ctx.fillStyle = point.type === 'gold' ? '#ffdc5d' : point.type === 'ice' ? '#b02e57' : '#ffffff';
            ctx.strokeStyle = '#173f80'; ctx.lineWidth = 3;
            ctx.font = '900 25px "Arial Black", Rubik, sans-serif'; ctx.textAlign = 'center';
            const label = `${point.amount > 0 ? '+' : ''}${point.amount}`;
            const y = config.basketY - 48 - progress * 30;
            ctx.strokeText(label, point.x, y); ctx.fillText(label, point.x, y);
            ctx.restore();
        }
        ctx.restore();
        frameHandle = requestAnimationFrame(render);
    };
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay); startButton.focus(); scene.input.keyboard.enabled = false;
    frameHandle = requestAnimationFrame(render);
    return controller;
}
