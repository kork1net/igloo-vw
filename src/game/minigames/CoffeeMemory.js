import config from '../../../shared/coffee-memory.json';
import { mountModal } from '../ui/AdminGrants';
import { createCoinIcon } from '../ui/CoinIcon';
import { createRankingIcon } from '../ui/RankingIcon';
import { createMinigameBadge } from '../objects/MinigameBadge';
import { addButtonHover } from '../ui/ButtonHover';
import { setWorldDepth } from '../objects/WorldDepth';
import { setPixelCounter } from '../ui/PixelCounter';

function fillCoffeeCup(element, choices, total) {
    if (!choices.length) { element.style.background = '#e9f5ff'; return; }
    const stops = [];
    choices.forEach((id, index) => {
        const color = config.ingredients.find(ingredient => ingredient.id === id).color;
        const start = index === 0 ? '0%' : `calc(${index / total * 100}% + 1px)`;
        const boundary = (index + 1) / total * 100;
        const end = index < choices.length - 1 ? `calc(${boundary}% - 1px)` : `${boundary}%`;
        stops.push(`${color} ${start} ${end}`);
        if (index < choices.length - 1) {
            const lighter = '#' + color.slice(1).match(/../g).map(channel =>
                Math.round(parseInt(channel, 16) * 0.65 + 255 * 0.35).toString(16).padStart(2, '0')).join('');
            stops.push(`${lighter} ${end} calc(${boundary}% + 1px)`);
        }
    });
    if (choices.length < total) stops.push(`#e9f5ff ${choices.length / total * 100}% 100%`);
    element.style.background = stops.length === 1
        ? config.ingredients.find(ingredient => ingredient.id === choices[0]).color
        : `linear-gradient(to top, ${stops.join(', ')})`;
}

export function createCoffeeGameEntry(scene) {
    const container = scene.add.container(scene.scale.width - 260, 355);
    const shadow = scene.add.ellipse(0, 2, 72, 15, 0x543b30, 0.25);
    const cup = scene.add.graphics();
    cup.fillStyle(0x543b30); cup.fillRect(-27, -53, 54, 48); cup.fillRect(22, -44, 17, 29);
    cup.fillStyle(0xe7f3f5); cup.fillRect(-22, -49, 44, 38); cup.fillRect(27, -39, 7, 19);
    cup.fillStyle(0x8f5c3c); cup.fillRect(-19, -47, 38, 9);
    cup.fillStyle(0xa6d0e5); cup.fillRect(-18, -15, 36, 5);
    cup.fillStyle(0xf3faff); cup.fillRect(-34, -4, 68, 5);
    const label = scene.add.text(0, 20, 'ההזמנה של מיה', {
        fontFamily: 'Rubik, Arial, sans-serif', fontSize: '18px', fontStyle: 'bold',
        color: '#543b30', stroke: '#fff6e7', strokeThickness: 3, resolution: 2
    }).setOrigin(0.5);
    const hit = scene.add.rectangle(0, -25, 90, 72, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
    container.add([shadow, cup, label, hit]);
    const badge = createMinigameBadge(scene, container).setVisible(true); badge.y = -78;
    const float = scene.tweens.add({ targets: badge, y: -84, duration: 1100, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    badge.once('destroy', () => float.stop());
    addButtonHover(scene, hit, [cup]);
    hit.on('pointerdown', (pointer, x, y, event) => {
        event.stopPropagation(); scene.sound.play('wood-tap-ui'); openCoffeeMemory(scene);
    });
    setWorldDepth(container, container.y, scene.scale.height);
    return container;
}

export function openCoffeeMemory(scene) {
    if (scene.coffeeGame) return;
    scene.activeResident?.closeDialogue(false); scene.closePlayerCard(false);
    scene.inventoryWindow?.destroy(); scene.inventoryWindow = null; scene.catalogOpen = false;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen coffee-game-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue coffee-game-dialogue" role="dialog" aria-modal="true" aria-label="משחק בית הקפה">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <div class="coffee-stage"><div class="coffee-board">
            <div class="coffee-hud">
                <div class="coffee-metric"><span class="coffee-metric-caption">ניקוד:</span><div class="coffee-metric-value"><span class="coffee-score" aria-label="ניקוד"></span></div></div>
                <div class="coffee-metric"><span class="coffee-metric-caption">חיים:</span><div class="coffee-metric-value"><span class="coffee-lives" aria-label="חיים"></span></div></div>
            </div>
            <div class="coffee-tickets" aria-label="הזמנות ממתינות"></div>
            <p class="coffee-prompt" role="status" aria-live="polite" hidden></p>
            <div class="coffee-counter"><div class="coffee-cup"><div class="coffee-drink"></div><div class="coffee-steam" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="coffee-success" aria-hidden="true"></div><div class="coffee-cup-actions"><button class="coffee-clear" type="button"><span class="coffee-clear-icon" aria-hidden="true">↺</span><span>ריקון הספל</span></button></div></div>
            <div class="coffee-ingredients"></div>
        </div>
        <div class="coffee-message"><div class="coffee-message-card">
        <div class="coffee-intro">
            <h3>מיה צריכה עזרה בבית הקפה!</h3><p>הכינו בספל כל אחת מההזמנות הפתוחות לפי סדר המרכיבים שלה.</p>
            <p>לכל הזמנה פס זמן. כשהוא נגמר מאבדים חיים.<br />עם הזמן מגיעות יותר הזמנות והזמן להכנה מתקצר. יש לכם 3 חיים!</p></div>
        <div class="coffee-summary" hidden></div>
        <p class="coffee-status" role="status" aria-live="polite"></p>
        <div class="coffee-actions"><button class="coffee-play" type="button" aria-label="התחלת משחק"><img src="assets/ui/play-button.png" alt="שחקו" /></button>
        <button class="coffee-done" type="button" aria-label="סיום" hidden><img src="assets/ui/v-button.png" alt="סיום" /></button>
        <button class="coffee-retry" type="button" hidden>נסו שוב</button></div></div></div></div>
    </section>`;
    const $ = selector => overlay.querySelector(selector);
    const buttons = config.ingredients.map((ingredient, frameIndex) => {
        const button = document.createElement('button'); button.type = 'button';
        button.disabled = true;
        button.dataset.ingredient = ingredient.id; button.style.setProperty('--ingredient', ingredient.color);
        const icon = document.createElement('span'); icon.className = 'coffee-ingredient-icon'; icon.setAttribute('aria-hidden', 'true');
        icon.style.backgroundPosition = `${frameIndex * 100 / (config.ingredients.length - 1)}% center`;
        const name = document.createElement('strong'); name.textContent = ingredient.name;
        button.append(icon, name); $('.coffee-ingredients').append(button);
        button.addEventListener('click', () => {
            scene.sound.play('wood-tap-ui'); void update('coffee:choose', { ingredient: ingredient.id });
        }); return button;
    });
    let state, active = true, pending = false, ending = false, closeModal, timer, lastFeedback, lastLayout, frame, lastScore = 0, receivedAt = performance.now();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const queuedActions = [];
    const successAnimations = new Set();
    const celebrate = points => {
        const host = $('.coffee-success'); host.replaceChildren();
        for (const animation of successAnimations) animation.cancel();
        successAnimations.clear();
        const label = document.createElement('strong'); label.textContent = `+${points}`;
        label.className = 'coffee-success-label'; host.append(label);
        const animate = (element, frames, duration) => {
            const animation = element.animate(frames, { duration, easing: 'ease-out', fill: 'forwards' });
            successAnimations.add(animation);
            animation.onfinish = () => { successAnimations.delete(animation); element.remove(); };
        };
        animate(label, [{ opacity: 1, transform: 'translate(-50%, 0) scale(0.9)' },
            { opacity: 0, transform: `translate(-50%, ${reducedMotion ? 0 : -45}px) scale(1.15)` }], 1100);
        if (reducedMotion) return;
        for (let i = 0; i < 14; i++) {
            const spark = document.createElement('i'); spark.className = 'coffee-success-spark';
            spark.style.background = ['#fff2a5', '#73c6ee', '#f2b45f'][i % 3]; host.append(spark);
            const angle = Math.PI * 2 * i / 14;
            const distance = 65 + (i % 3) * 20;
            animate(spark, [{ opacity: 1, transform: 'translate(-50%, 0) scale(0.5)' },
                { opacity: 0, transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance - 35}px) scale(1.2) rotate(90deg)` }], 700 + i % 3 * 100);
        }
    };
    const controller = { close: () => dismiss() };
    scene.coffeeGame = controller;
    const render = next => {
        const signature = JSON.stringify([next.phase, next.orders, next.lives, next.choices,
            next.tickets.map(ticket => [ticket.id, ticket.recipe]), next.feedbackId, next.feedback]);
        setPixelCounter($('.coffee-score'), next.score.toLocaleString());
        setPixelCounter($('.coffee-lives'), String(next.lives));
        $('.coffee-message').hidden = next.phase !== 'finished';
        if (signature === lastLayout) return;
        lastLayout = signature;
        $('.coffee-intro').hidden = true;
        $('.coffee-summary').hidden = next.phase !== 'finished';
        $('.coffee-play').hidden = next.phase !== 'finished';
        $('.coffee-done').hidden = next.phase !== 'finished';
        overlay.dataset.phase = next.phase;
        overlay.dataset.feedback = next.feedback || '';
        $('.coffee-prompt').textContent = next.feedback === 'correct' ? 'ההזמנה מוכנה! כל הכבוד!'
            : next.feedback === 'wrong' ? 'המרכיבים לא התאימו. הכינו שוב לפני שהזמן נגמר'
            : next.feedback === 'expired' ? 'הזמנה לא הוכנה בזמן. איבדתם חיים'
            : next.tickets.length ? ''
            : 'הזמנות חדשות בדרך...';
        $('.coffee-prompt').hidden = !$('.coffee-prompt').textContent;
        if (next.feedback && next.feedbackId !== lastFeedback) {
            scene.sound.play(next.feedback === 'correct' ? 'coin-sfx' : 'hurt-sfx', { volume: 0.5 });
            if (next.feedback === 'correct' && next.score > lastScore) celebrate(next.score - lastScore);
            lastFeedback = next.feedbackId;
        }
        lastScore = next.score;
        const oldNotes = new Map([...$('.coffee-tickets').children].map(note => [Number(note.dataset.orderId), note]));
        for (const ticket of next.tickets) {
            const existing = oldNotes.get(ticket.id);
            const recipeKey = JSON.stringify(ticket.recipe);
            if (existing && existing.dataset.recipe === recipeKey) {
                oldNotes.delete(ticket.id);
                continue;
            }
            if (existing) { existing.remove(); oldNotes.delete(ticket.id); }
            const note = document.createElement('article'); note.className = 'coffee-ticket';
            note.dataset.orderId = ticket.id;
            note.dataset.recipe = recipeKey;
            const heading = document.createElement('strong'); heading.textContent = `הזמנה #${ticket.id}`;
            const cup = document.createElement('div'); cup.className = 'coffee-cup coffee-ticket-cup';
            const drink = document.createElement('div'); drink.className = 'coffee-drink';
            fillCoffeeCup(drink, ticket.recipe, config.maxIngredients);
            cup.append(drink);
            const list = document.createElement('div'); list.className = 'coffee-ticket-recipe';
            ticket.recipe.forEach((id, index) => {
                const entry = document.createElement('span');
                entry.textContent = `${index + 1}. ${config.ingredients.find(item => item.id === id).name}`;
                list.append(entry);
            });
            const bar = document.createElement('div'); bar.className = 'coffee-ticket-time';
            bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'זמן שנותר להזמנה');
            bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
            bar.append(document.createElement('i'));
            note.append(heading, cup, list, bar); $('.coffee-tickets').append(note);
        }
        for (const note of oldNotes.values()) note.remove();
        fillCoffeeCup($('.coffee-counter .coffee-drink'), next.choices || [], config.maxIngredients);
        if (next.phase === 'finished' && next.result) {
            $('.coffee-summary').replaceChildren();
            const title = document.createElement('h3'); title.textContent = 'מיה מודה לכם על העזרה!';
            const score = document.createElement('p'); score.className = 'coffee-final-score'; score.textContent = next.score.toLocaleString();
            const orders = document.createElement('p'); orders.textContent = `הכנתם ${next.orders} הזמנות נכונות`;
            const rewards = document.createElement('div'); rewards.className = 'snow-prizes';
            for (const [icon, amount] of [[createCoinIcon(36), next.result.coins], [createRankingIcon(36), next.result.rankingPoints]]) {
                const prize = document.createElement('div'), value = document.createElement('strong');
                value.textContent = `+${amount}`; prize.append(icon, value); rewards.append(prize);
            }
            $('.coffee-summary').append(title, score, orders, rewards);
            $('.coffee-status').textContent = 'הפרסים נוספו לחשבון שלכם';
            $('.coffee-play').setAttribute('aria-label', 'שחקו שוב');
        }
    };
    const update = async (action, data = {}) => {
        if (!active) return;
        if (pending) {
            if (action !== 'coffee:state' && queuedActions.length < 20) queuedActions.push({ action, data });
            return;
        }
        pending = true;
        if (action === 'coffee:start') $('.coffee-play').disabled = true;
        try {
            const result = await scene.multiplayer.requestInventory(action, { id: state?.id, ...data });
            if (!active) return;
            state = result.state; receivedAt = performance.now();
            $('.coffee-retry').hidden = true; $('.coffee-status').textContent = '';
            render(state);
        } catch (error) {
            queuedActions.length = 0;
            if (active) {
                $('.coffee-status').textContent = error.message; $('.coffee-retry').hidden = false;
                $('.coffee-message').hidden = false;
            }
        } finally {
            pending = false;
            if (active) {
                buttons.forEach(button => { button.disabled = state?.phase !== 'prepare' || !state?.tickets.length || ending; });
                $('.coffee-play').disabled = false;
                if (ending && state?.phase !== 'finished') {
                    ending = false; queuedActions.length = 0; void update('coffee:finish');
                } else {
                    ending = false;
                    const next = queuedActions.shift();
                    if (next) void update(next.action, next.data);
                }
            }
        }
    };
    $('.coffee-play').addEventListener('click', () => {
        if (pending) return; scene.sound.play('wood-tap-ui'); lastFeedback = null; lastLayout = null;
        void update('coffee:start');
    });
    $('.coffee-retry').addEventListener('click', () => void update(state ? 'coffee:state' : 'coffee:start'));
    $('.coffee-clear').addEventListener('click', () => {
        void update('coffee:clear');
    });
    const cleanup = () => {
        if (!active) return;
        active = false; clearInterval(timer); cancelAnimationFrame(frame); scene.events.off('shutdown', cleanup);
        queuedActions.length = 0;
        for (const animation of successAnimations) animation.cancel();
        successAnimations.clear();
        scene.multiplayer.socket.off('disconnect', disconnected);
        if (scene.coffeeGame === controller) scene.coffeeGame = null;
        void scene.multiplayer.requestInventory('coffee:cancel', {}).catch(() => {});
    };
    const dismiss = () => {
        if (pending) { ending = true; return; }
        if (state && state.phase !== 'finished') { void update('coffee:finish'); return; }
        scene.sound.play('ui-close'); cleanup(); closeModal();
    };
    const disconnected = () => {
        queuedActions.length = 0;
        state = null; lastLayout = null;
        $('.coffee-message').hidden = false; $('.coffee-summary').hidden = true;
        $('.coffee-intro').hidden = false; $('.coffee-play').hidden = false;
        $('.coffee-status').textContent = 'החיבור נותק. אפשר להתחיל משחק חדש אחרי ההתחברות מחדש.';
    };
    $('.coffee-done').addEventListener('click', dismiss);
    overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
    closeModal = mountModal(scene, overlay, dismiss, 'coffeeModal');
    render({ phase: 'preview', score: 0, orders: 0, lives: config.lives, choices: [],
        tickets: [{ id: 1, recipe: ['coffee', 'milk'], remaining: config.orderTime, lifetime: config.orderTime }], feedbackId: 0 });
    $('.coffee-message').hidden = false; $('.coffee-intro').hidden = false; $('.coffee-play').hidden = false;
    const animateBars = () => {
        if (!active) return;
        const elapsed = performance.now() - receivedAt;
        for (const ticket of state?.tickets || []) {
            const bar = overlay.querySelector(`[data-order-id="${ticket.id}"] .coffee-ticket-time`);
            if (!bar) continue;
            const fraction = Math.max(0, (ticket.remaining - elapsed) / ticket.lifetime);
            bar.firstElementChild.style.transform = `scaleX(${fraction})`;
            bar.classList.toggle('coffee-ticket-urgent', fraction < 0.25);
            bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        }
        frame = requestAnimationFrame(animateBars);
    };
    frame = requestAnimationFrame(animateBars);
    scene.multiplayer.socket.on('disconnect', disconnected);
    scene.events.once('shutdown', cleanup);
    timer = setInterval(() => { if (state && state.phase !== 'finished' && !pending) void update('coffee:state'); }, 250);
    return controller;
}
