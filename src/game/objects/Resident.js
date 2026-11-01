import { addHoverOutline } from '../ui/HoverOutline';
import { renderResidentQuests } from '../ui/ResidentQuests';
import { showChatMessage, clearChatMessage } from './ChatBubble';
import { openHtmlWindow, closeHtmlWindow, closeWindow } from '../ui/WindowTransition';

export class Resident {
    constructor(scene, definition) {
        this.scene = scene;
        this.definition = definition;
        this.id = definition.id;
        this.chatBubbleTop = definition.displayHeight - 5;
        this.chatBubbleFill = 0xffed9e;
        this.chatBubbleBorder = 0xd6ac38;
        const { width, height } = scene.scale;
        this.container = scene.add.container(width * definition.position.x, height * definition.position.y)
            .setDepth(10);
        const shadow = scene.add.ellipse(0, 23, 64, 16, 0x536b7d, 0.4);
        const body = scene.add.image(0, 24, definition.texture).setOrigin(0.5, 1);
        body.setScale(definition.displayHeight / body.height);
        body.setInteractive({ useHandCursor: true });
        const name = scene.add.text(0, 39, definition.name, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '17px', fontStyle: 'bold',
            color: '#17324d', stroke: '#ffffff', strokeThickness: 3
        }).setOrigin(0.5);
        this.container.add([shadow, body, name]);
        this.questReadyBadge = scene.add.image(0, -definition.displayHeight - 12, 'quest-mark')
            .setOrigin(0.5).setVisible(false);
        this.questReadyBadge.setScale(48 / this.questReadyBadge.height);
        if (!(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) {
            const markerFloat = scene.tweens.add({
                targets: this.questReadyBadge,
                y: this.questReadyBadge.y - 6,
                duration: 1000,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            });
            this.questReadyBadge.once('destroy', () => markerFloat.stop());
        }
        this.container.add(this.questReadyBadge);
        this.refreshQuestMarker();
        this.hoverOutline = addHoverOutline(scene, body);
        body.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            scene.sound.play('wood-tap-ui');
            this.openDialogue();
        });
        this.scheduleSpeech(7000, 11000);
        this.container.once('destroy', () => this.speechTimer?.remove());
        scene.events.once('shutdown', () => {
            this.speechTimer?.remove();
            clearChatMessage(this);
            this.closeDialogue(false);
        });
    }

    scheduleSpeech(minDelay = 14000, maxDelay = 24000) {
        const lines = this.definition.speechLines?.filter(line => typeof line === 'string' && line.trim());
        if (!lines?.length) return;
        const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
        this.speechTimer = this.scene.time.delayedCall(delay, () => {
            if (!this.scene.activeResident && !this.scene.inventoryWindow && !this.scene.playerCard && !this.questReadyBadge.visible) {
                const choices = lines.filter(line => line !== this.lastSpeech);
                const available = choices.length ? choices : lines;
                this.lastSpeech = available[Math.floor(Math.random() * available.length)];
                showChatMessage(this, this.lastSpeech);
            }
            this.scheduleSpeech();
        });
    }

    openDialogue() {
        if (this.dialogue) return;
        clearChatMessage(this);
        const scene = this.scene;
        scene.activeResident?.closeDialogue(false);
        scene.closePlayerCard();
        if (scene.inventoryWindow) {
            closeWindow(scene, scene.inventoryWindow);
            scene.inventoryWindow = null;
        }
        scene.player.moveTarget = null;
        scene.player.isMoving = false;
        scene.player.isRunning = false;
        scene.pendingTransition = null;
        Object.values(scene.player.cursors).forEach(key => key.reset());
        this.keyboardEnabled = scene.input.keyboard.enabled;
        this.pointerEnabled = scene.input.enabled;
        scene.input.enabled = false;
        scene.input.keyboard.enabled = false;
        scene.chatInput?.setVisible(false);

        const overlay = document.createElement('div');
        overlay.className = 'resident-screen';
        overlay.dir = 'rtl';
        overlay.innerHTML = `
            <section class="resident-dialogue" role="dialog" aria-modal="true" aria-labelledby="resident-name">
                <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
                <div class="resident-content">
                    <section class="resident-profile">
                        <img class="resident-portrait" alt="" />
                        <span class="resident-label">תושב קבע</span>
                        <h2 id="resident-name"></h2>
                        <p class="resident-greeting"></p>
                    </section>
                    <section class="resident-quests" aria-labelledby="resident-quests-title">
                        <h3 id="resident-quests-title">משימות</h3>
                        <p class="resident-quests-subtitle">כאן יופיעו המשימות שאפשר לקבל מהתושב.</p>
                        <ul class="resident-quest-list" hidden></ul>
                        <p class="resident-quests-empty">אין כרגע משימות זמינות.</p>
                    </section>
                </div>
            </section>`;
        overlay.querySelector('.resident-portrait').src = this.definition.image;
        overlay.querySelector('h2').textContent = this.definition.name;
        if (this.definition.role) overlay.querySelector('.resident-label').textContent = this.definition.role;
        overlay.querySelector('.resident-greeting').textContent = this.definition.greeting;
        const close = () => {
            if (overlay.windowClosing) return;
            scene.sound.play('ui-close');
            this.closeDialogue();
        };
        overlay.querySelector('.resident-close').addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        overlay.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') close();
            if (event.key === 'Tab') {
                const buttons = [...overlay.querySelectorAll('button')].filter(button => !button.disabled && !button.closest('[hidden]'));
                event.preventDefault();
                const next = (buttons.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
                buttons[next].focus();
            }
        });
        overlay.addEventListener('pointerdown', event => event.stopPropagation());
        document.getElementById('game-container').append(overlay);
        this.dialogue = overlay;
        scene.activeResident = this;
        this.refreshQuests();
        openHtmlWindow(overlay);
        overlay.querySelector('.resident-close').focus();
        scene.input.keyboard.enabled = false;
    }

    refreshQuests() {
        this.refreshQuestMarker();
        renderResidentQuests(this);
        this.questConversation?.refresh();
    }

    refreshQuestMarker() {
        const quests = this.scene.registry.get('inventory')?.quests || {};
        const ready = (this.definition.questChainIds || []).some(id => quests[id]?.steps.some(step => step.ready));
        if (ready && !this.questReadyBadge?.visible) clearChatMessage(this);
        this.questReadyBadge?.setVisible(ready);
    }

    closeDialogue(animate = true) {
        this.questConversation?.close(false);
        if (!this.dialogue) return;
        closeHtmlWindow(this.dialogue, () => {
            this.dialogue = null;
            if (this.scene.activeResident !== this) return;
            this.scene.input.keyboard.enabled = this.keyboardEnabled;
            this.scene.input.enabled = this.pointerEnabled;
            this.scene.chatInput?.setVisible(true);
            this.scene.activeResident = null;
        }, animate);
    }
}
