import rankSettings from '../../../shared/rank-settings.json';
import { openSettings } from '../ui/Settings';
import { openActiveQuests } from '../ui/ActiveQuests';
import { getClothingItem, normalizeEquipment, loadClothing, ClothingLayers, getClothingTexture, applyClothingColor, inventoryCategories } from '../items/Clothing';
import { Scene } from 'phaser';
import { Player } from '../objects/Player';
import { createAdminBadge } from '../objects/AdminBadge';
import Multiplayer from '../network/Multiplayer';
import { showLoadingScreen } from '../ui/LoadingScreen';
import { addButtonHover } from '../ui/ButtonHover';
import { openWindow, closeWindow } from '../ui/WindowTransition';
import { openRarityManager } from '../ui/RarityManager';
import { layoutItemIcon } from '../ui/ItemIcon';
import { addInventoryBackdrop } from '../ui/InventoryBackdrop';
import { addGameFrame } from '../ui/GameFrame';
import { addItemRarityEffect } from '../ui/ItemRarityEffect';
import { addRankingEffect, addLevelBadgePulse } from '../ui/RankingEffect';
import { openAdminGrants } from '../ui/AdminGrants';
import { openAdminReset } from '../ui/AdminReset';
import { createEmojiMenu } from '../ui/EmojiMenu';
import { openPurchaseConfirmation } from '../ui/PurchaseConfirmation';
import { createQuestGround } from '../objects/QuestGround';

export class BaseRoom extends Scene {
    constructor(key) {
        super(key);
    }

    createPlayer(x, y, username = 'Player1') {
        username = this.registry.get('auth')?.user?.username || username;

        if (!this.registry.has('inventory')) {
            this.registry.set('inventory', {
                items: ['body-color/white'],
                equipped: {
                    bodyColor: 'body-color/white'
                },
                currency: 0
            });
        }

        const inventory = this.registry.get('inventory');
        inventory.equipped = normalizeEquipment(inventory.equipped);
        if (!inventory.equipped.bodyColor && getClothingItem('body-color/white')) {
            inventory.equipped.bodyColor = 'body-color/white';
        }
        this.registry.set('inventory', inventory);
        this.catalogOpen = false;
        this.inventoryActionPending = false;
        this.catalogLoading = false;

        this.player = new Player(this, x, y, username);
        this.multiplayer = new Multiplayer(this);
        this.multiplayer.connect();
        createQuestGround(this);

        this.player.setEquipment(inventory.equipped);
        this.pendingTransition = null;
        this.lastGroundClickTime = -Infinity;
        this.lastGroundClickX = 0;
        this.lastGroundClickY = 0;

        // Shared mouse movement
        this.input.on('pointerdown', (pointer, gameObjects) => {
            if (this.snowGame || this.activeResident || this.adminModal || this.tradeModal) return;
            if (gameObjects.length > 0) return;

            const now = this.time.now;

            const timeSinceLastClick =
                now - this.lastGroundClickTime;

            const clickDistance = Math.hypot(
                pointer.worldX - this.lastGroundClickX,
                pointer.worldY - this.lastGroundClickY
            );

            // Double-click within 300ms and 25 pixels
            const doubleClick =
                timeSinceLastClick <= 300 &&
                clickDistance <= 25;

            if (doubleClick) {
                this.lastGroundClickTime = -Infinity;
            } else {
                this.lastGroundClickTime = now;
                this.lastGroundClickX = pointer.worldX;
                this.lastGroundClickY = pointer.worldY;
            }

            this.pendingTransition = null;

            this.player.setMoveTarget(
                pointer.worldX,
                pointer.worldY,
                doubleClick
            );

            this.showClickMarker(
                this.player.moveTarget.x,
                this.player.moveTarget.y
            );
        });

        addGameFrame(this);
        this.createChat();
        this.vanished = false;
        if (this.registry.get('auth')?.user?.isAdmin) {
            this.vanishButton = this.add.text(16, this.scale.height - 16, 'VANISH', {
                fontFamily: 'Rubik, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold',
                color: '#173f80', backgroundColor: '#d8efff', padding: { x: 6, y: 4 }
            }).setOrigin(0, 1).setDepth(100).setScrollFactor(0)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(this.vanishButton);
            this.vanishButton.on('pointerdown', async (pointer, localX, localY, event) => {
                event.stopPropagation();
                if (this.vanishPending) return;
                this.vanishPending = true;
                try {
                    const result = await this.multiplayer.requestInventory('admin:vanish', { active: !this.vanished });
                    if (this.sys.isActive()) this.setVanishState(result.active);
                } catch (error) {
                    if (this.sys.isActive()) { this.sound.play('hurt-sfx'); this.showItemNotice(error.message); }
                } finally { this.vanishPending = false; }
            });
        }
        const logoutButton = this.add.image(this.scale.width - 10, 14, 'logout-symbol');
        logoutButton.setScale(76 / logoutButton.height)
            .setOrigin(1, 0).setDepth(100).setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.sound.play('wood-tap-ui');
                this.multiplayer.logout();
            });
        this.addButtonHover(logoutButton);
        const logoutFloat = this.tweens.add({
            targets: logoutButton,
            y: 8,
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
        logoutButton.once('destroy', () => logoutFloat.stop());
        this.events.once('shutdown', () => this.closePlayerCard(false));
        return this.player;
    }

    setVanishState(active) {
        this.vanished = active;
        this.player.container.setAlpha(active ? 0.4 : 1);
        this.vanishButton?.setText(active ? 'VANISH ✓' : 'VANISH');
    }

    showClickMarker(x, y) {
        const marker = this.add.graphics({ x: Math.round(x), y: Math.round(y) });
        const animation = { progress: 0 };
        const draw = () => {
            const radius = 8 + Math.floor(animation.progress * 5) * 2;
            marker.clear();
            marker.setAlpha(1 - animation.progress);
            // Draw on a two-pixel grid so the outline stays crisp throughout the pulse.
            for (let dx = -radius; dx <= radius; dx += 2) {
                const dy = radius - Math.abs(dx);
                marker.fillStyle(0x367ca8, 0.8);
                marker.fillRect(dx - 1, dy, 2, 3);
                marker.fillRect(dx - 1, -dy, 2, 3);
                marker.fillStyle(0xdaf5ff, 1);
                marker.fillRect(dx - 1, dy - 1, 2, 2);
                marker.fillRect(dx - 1, -dy - 1, 2, 2);
            }
            marker.fillStyle(0x83cce9, 1);
            marker.fillRect(-3, -1, 6, 2);
            marker.fillRect(-1, -3, 2, 6);
        };
        draw();
        this.tweens.add({
            targets: animation,
            progress: 1,
            duration: 420,
            ease: 'Sine.easeOut',
            onUpdate: draw,
            onComplete: () => marker.destroy()
        });
    }

    moveToRoom(sceneKey, x, y, run = false) {
        if (this.activeResident || this.snowGame || this.adminModal || this.tradeModal) return;
        this.pendingTransition = {
            sceneKey,
            x,
            y
        };

        this.player.setMoveTarget(x, y, run);
    }

    preload() {
        this.load.spritesheet('eyelashes', 'assets/characters/eyelashes.png', { frameWidth: 64, frameHeight: 78 });
        showLoadingScreen(this, this.sys.settings.key === 'Cafe' ? 'נכנסים לבית הקפה…'
            : this.sys.settings.key === 'Shop' ? 'נכנסים לחנות…' : 'נכנסים לעולם…');
        this.load.spritesheet(
            'player',
            'assets/characters/player.png',
            {
                frameWidth: 64,
                frameHeight: 78
            }
        );
        this.load.spritesheet(
            'player-walk-1',
            'assets/characters/player-walk-1.png',
            {
                frameWidth: 64,
                frameHeight: 78
            }
        );

        this.load.spritesheet(
            'player-walk-2',
            'assets/characters/player-walk-2.png',
            {
                frameWidth: 64,
                frameHeight: 78
            }
        );
        this.load.image(
            'send-button',
            'assets/ui/send-button.png'
        );
        this.load.image('admin-symbol', 'assets/ui/admin-symbol.png');
        this.load.image('emoji-button', 'assets/ui/emoji-button.png');
        this.load.image('emojis', 'assets/ui/emojis.png');
        this.load.image('quest-mark', 'assets/ui/quest-mark.png');
        this.load.image('in-minigame-symbol', 'assets/ui/in-minigame-symbol.png');
        this.load.spritesheet('catching-snow-items', 'assets/ui/catching-snow-items.png', {
            frameWidth: 44, frameHeight: 44
        });
        this.load.image('logout-symbol', 'assets/ui/logout-symbol.png');
        this.load.image('x-button', 'assets/ui/x-button.png');
        this.load.image('page-arrow-left', 'assets/ui/arrowLeft-button.png');
        this.load.image('settings-button', 'assets/ui/settings-button.png');
        this.load.image('quest-button', 'assets/ui/quest-button.png');
        this.load.image('catching-snow-background', 'assets/ui/catching-snow-background.png');
        this.load.image('catching-snow-basket', 'assets/ui/catching-snow-basket.png');
        this.load.image('coin-symbol', 'assets/ui/coin-symbol.png');
        this.load.image('levelup-symbol', 'assets/ui/levelup-symbol.png');
        this.load.spritesheet('levels-symbols', 'assets/ui/levels-symbols.png', {
            frameWidth: 50, frameHeight: 50
        });
        this.load.svg('window-frame', 'assets/ui/window-frame.svg');
        this.load.svg('chat-bar-frame', 'assets/ui/chat-bar-frame.svg');
        this.load.svg('quest-entry-frame', 'assets/ui/quest-entry-frame.svg');
        this.load.svg('inventory-window-frame', 'assets/ui/inventory-window-frame.svg');
        this.load.spritesheet('items-frames', 'assets/ui/items-frames.png', {
            frameWidth: 116, frameHeight: 116
        });
        this.load.spritesheet('inventory-symbols', 'assets/ui/inventory-symbols.png', {
            frameWidth: 54, frameHeight: 54
        });
                this.load.image(
            'inv-button',
            'assets/ui/inv-button.png'
        );

        if (!this.cache.audio.exists('inventory-click')) {
            this.load.audio('inventory-click', 'sfx/open-inv-sfx.mp3');
        }
        if (!this.cache.audio.exists('ui-close')) {
            this.load.audio('ui-close', 'sfx/ui-close-sfx.mp3');
        }
        if (!this.cache.audio.exists('ui-chat')) {
            this.load.audio('ui-chat', 'sfx/ui-chat-sfx.mp3');
        }
        if (!this.cache.audio.exists('sfx-buy')) {
            this.load.audio('sfx-buy', 'sfx/sfx-buy.mp3');
        }
        for (const key of ['coin-sfx', 'hurt-sfx', 'snowball-sfx']) {
            if (!this.cache.audio.exists(key)) this.load.audio(key, `sfx/${key}.mp3`);
        }
        loadClothing(this);
    }
    

    createChat() {
        const { width, height } = this.scale;

        const barY = height - 47;
        const barWidth = Math.min(width - 80, 650);
        const barRight = width / 2 + barWidth / 2;
        const inputWidth = barWidth - 294;
        const inputHeight = 38;
        const buttonWidth = 42;
        const buttonHeight = buttonWidth * 41 / 38;

        // Create HTML input with fixed dimensions
        const input = document.createElement('input');
        input.className = 'game-chat-input';
        input.type = 'text';
        input.placeholder = 'כתוב הודעה...';
        input.maxLength = 100;

        Object.assign(input.style, {
            width: `${inputWidth}px`,
            height: `${inputHeight}px`,
            boxSizing: 'border-box',
            padding: '0 12px',
            fontSize: '16px',
            fontFamily: 'Rubik, Arial, sans-serif',
            outline: 'none',
            direction: 'rtl',
            color: '#17324d'
        });

        // Chat bar background
        this.add.nineslice(width / 2, barY, 'chat-bar-frame', undefined,
            barWidth, 72, 12, 12, 12, 12)
        .setScrollFactor(0)
        .setDepth(100)
        .setInteractive()
        .on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());

        // HTML input
        this.chatInput = this.add.dom(
            width / 2 - 79,
            barY - 3,
            input
        ).setOrigin(0.5)
        .setDepth(101)
        .setScrollFactor(0);

         // Custom send button
        const sendButton = this.add.image(
            barRight - barWidth + 41,
            barY,
            'send-button'
        )
            .setDisplaySize(buttonWidth, buttonHeight)
            .setInteractive({ useHandCursor: true })
            .setDepth(101)
            .setScrollFactor(0);
        // Inventory button

        const inventoryButton = this.add.image(
            barRight - 189,
            barY,
            'inv-button'
        )
        .setDisplaySize(buttonWidth, buttonHeight)
        .setInteractive({ useHandCursor: true })
        .setDepth(101)
        .setScrollFactor(0);

        inventoryButton.on('pointerdown', () => {
            this.sound.play('inventory-click');
            this.toggleInventory();
        });

        this.addButtonHover(sendButton);
        this.addButtonHover(inventoryButton);
        const questButton = this.add.image(barRight - 93, barY, 'quest-button')
            .setScale(buttonHeight / this.textures.get('quest-button').getSourceImage().height)
            .setInteractive({ useHandCursor: true }).setDepth(101).setScrollFactor(0);
        this.addButtonHover(questButton);
        questButton.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.emojiMenu?.setVisible(false);
            this.sound.play('wood-tap-ui');
            openActiveQuests(this);
        });
        const settingsButton = this.add.image(barRight - 45, barY, 'settings-button')
            .setDisplaySize(buttonWidth, buttonHeight).setInteractive({ useHandCursor: true })
            .setDepth(101).setScrollFactor(0);
        this.addButtonHover(settingsButton);
        settingsButton.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.emojiMenu?.setVisible(false);
            this.sound.play('wood-tap-ui');
            openSettings(this);
        });
        this.emojiButton = this.add.image(barRight - 141, barY, 'emoji-button')
            .setDisplaySize(buttonWidth, buttonHeight).setInteractive({ useHandCursor: true })
            .setDepth(101).setScrollFactor(0);
        this.addButtonHover(this.emojiButton);
        this.emojiMenu = createEmojiMenu(this, this.emojiButton, barRight - 165, barY - 124);

        const sendMessage = () => {
            const message = input.value.trim();
            if (!message) return;

            this.player.showMessage(message);
            this.multiplayer?.sendChatMessage(message);
            input.value = '';
            input.blur();
        };

        sendButton.on('pointerdown', sendMessage);

        input.addEventListener('keydown', (event) => {
            event.stopPropagation();

            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });

        input.addEventListener('focus', () => {
            this.input.keyboard.enabled = false;
        });

        input.addEventListener('blur', () => {
            this.input.keyboard.enabled = true;
        });

        // Phaser also listens for compatibility mouse/touch events on window.
        // Stop those too, while preserving normal focus and text selection.
        for (const eventName of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
            input.addEventListener(eventName, event => event.stopPropagation());
        }

        this.events.once('shutdown', () => {
            this.input.keyboard.enabled = true;
        });
    }
    toggleInventory() {
        this.closePlayerCard();
        if (this.inventoryWindow) {
            closeWindow(this, this.inventoryWindow);
            this.inventoryWindow = null;
            this.catalogOpen = false;
            return;
        }

        this.catalogOpen = false;
        this.openInventory();
    }

    openPlayerCard(remotePlayer) {
        this.closePlayerCard();
        if (this.inventoryWindow) {
            closeWindow(this, this.inventoryWindow);
            this.inventoryWindow = null;
        }
        this.catalogOpen = false;

        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2 - 25;
        const panel = this.add.container(0, 0).setDepth(210).setScrollFactor(0);
        const add = object => { panel.add(object); return object; };
        const blockClick = (pointer, localX, localY, event) => event.stopPropagation();

        // Keep clicks on the card from reaching players or room entrances behind it.
        const overlay = add(this.add.rectangle(
            centerX, height / 2, width, height, 0x000000, 0.45
        ).setInteractive());
        overlay.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.closePlayerCard();
        });
        add(this.add.nineslice(centerX, centerY, 'window-frame', undefined, 400, 480, 16, 16, 16, 16));
        const background = add(this.add.rectangle(
            centerX, centerY, 400, 480, 0x000000, 0
        ).setInteractive());
        background.on('pointerdown', blockClick);

        const name = add(this.add.text(centerX, centerY - 155, remotePlayer.username, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '30px',
            fontStyle: 'bold', color: '#244d70', stroke: '#f3faff', strokeThickness: 3,
            shadow: { offsetX: 2, offsetY: 2, color: '#68acd1', blur: 0, fill: true, stroke: false },
            align: 'center', wordWrap: { width: 290, useAdvancedWrap: true }
        }).setOrigin(0.5));
        add(this.add.nineslice(centerX, centerY + 15, 'quest-entry-frame',
            undefined, 250, 250, 4, 4, 4, 4));
        const previewBody = add(this.add.sprite(centerX, centerY + 115, 'player', 0)
            .setOrigin(0.5, 1).setScale(2.5));
        const clothing = new ClothingLayers(this, panel, centerX, centerY + 115, 2.5, previewBody, remotePlayer.gender);
        clothing.setEquipment(remotePlayer.equipped);
        const adminBadgeHolder = add(this.add.container(centerX - 92, centerY + 108 - 61 * 1.6).setScale(1.6));
        const adminBadge = createAdminBadge(this, adminBadgeHolder, remotePlayer.adminBadge?.visible);

        const close = add(this.add.image(centerX + 188, centerY - 228, 'x-button')
            .setInteractive({ useHandCursor: true }));
        close.setScale(48 / close.width);
        close.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('ui-close');
            this.closePlayerCard();
        });
        this.addButtonHover(close);

        const levelBadge = add(this.add.image(centerX, centerY + 184, 'levels-symbols', 0)
            .setDisplaySize(80, 80));
        addLevelBadgePulse(this, levelBadge);
        const trade = add(this.add.container(centerX + 120, centerY + 185)
            .setSize(112, 62).setInteractive({ useHandCursor: true }));
        const tradeFrame = this.add.nineslice(0, 0, 'quest-entry-frame', undefined, 112, 62, 4, 4, 4, 4)
            .setTint(0xa9dcff);
        const tradeIcon = this.add.graphics();
        tradeIcon.fillStyle(0x337ca6);
        tradeIcon.fillRect(-17, -17, 30, 3);
        tradeIcon.fillRect(10, -21, 3, 11);
        tradeIcon.fillRect(13, -19, 3, 7);
        tradeIcon.fillRect(16, -17, 3, 3);
        tradeIcon.fillStyle(0x6eacd0);
        tradeIcon.fillRect(-13, -7, 30, 3);
        tradeIcon.fillRect(-13, -11, 3, 11);
        tradeIcon.fillRect(-16, -9, 3, 7);
        tradeIcon.fillRect(-19, -7, 3, 3);
        const tradeLabel = this.add.text(0, 15, 'החלפה', {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '17px',
            fontStyle: 'bold', color: '#244d70'
        }).setOrigin(0.5);
        trade.add([tradeFrame, tradeIcon, tradeLabel]);
        trade.on('pointerover', () => tradeFrame.setTint(0xffffff));
        trade.on('pointerout', () => tradeFrame.setTint(0xa9dcff));
        trade.setData('tradeRequest', true);
        this.addButtonHover(trade);
        trade.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            const targetId = remotePlayer.id || [...this.multiplayer.remotePlayers].find(([, player]) => player === remotePlayer)?.[0];
            this.closePlayerCard(false);
            this.multiplayer.requestInventory('trade:request', { targetId }).catch(error => {
                if (this.sys.isActive()) this.showItemNotice(error.message);
            });
        });
        this.playerCard = { panel, remotePlayer, name, clothing, levelBadge, adminBadge };
        // Phaser DOM inputs otherwise stay above the canvas modal.
        this.chatInput?.setVisible(false);
        this.refreshPlayerCard();
        openWindow(this, panel, overlay);
    }

    refreshPlayerCard() {
        if (!this.playerCard) return;
        const { remotePlayer, name, clothing, levelBadge, adminBadge } = this.playerCard;
        if (![...this.multiplayer.remotePlayers.values()].includes(remotePlayer)) {
            this.closePlayerCard();
            return;
        }
        name.setText(remotePlayer.username);
        adminBadge.setVisible(remotePlayer.adminBadge?.visible === true);
        const level = Math.max(1, Math.min(rankSettings.maxLevel, remotePlayer.level || 1));
        levelBadge.setFrame(level - 1);
        clothing.setEquipment(remotePlayer.equipped);
    }

    closePlayerCard(animate = true) {
        if (!this.playerCard) return;
        closeWindow(this, this.playerCard.panel, animate);
        this.playerCard = null;
        this.chatInput?.setVisible(true);
    }

    openInventory(page = 0, animate = true) {
        const { width, height } = this.scale;
        const inventory = this.registry.get('inventory');
        const itemIds = this.catalogOpen ? (this.catalogItems || []).map(item => item.id) : inventory.items;
        const categories = this.catalogOpen ? inventoryCategories.filter(entry =>
            itemIds.some(id => entry.slots.includes(getClothingItem(id)?.slot))) : inventoryCategories;
        const category = categories.find(entry => entry.id === this.inventoryCategory)
            || categories[0] || inventoryCategories[0];
        this.inventoryCategory = category.id;
        const items = itemIds.map(getClothingItem)
            .filter(item => item && category.slots.includes(item.slot))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
        const centerX = width / 2;
        const centerY = height / 2 - 25;
        const panel = this.add.container(0, 0).setDepth(200).setScrollFactor(0);
        this.inventoryWindow = panel;
        const add = object => { panel.add(object); return object; };
        const text = (x, y, value, size = 17) => add(this.add.text(x, y, value, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: `${size}px`, color: '#17324d',
            align: 'center'
        }).setOrigin(0.5));
        const reopen = (nextPage = 0) => {
            panel.destroy();
            this.inventoryWindow = null;
            this.openInventory(nextPage, false);
        };
        const stopClick = (pointer, localX, localY, event) => event.stopPropagation();
        const overlay = add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45)
            .setInteractive()).on('pointerdown', stopClick);
        const topTrim = this.catalogOpen ? 70 : 0;
        const panelY = centerY + topTrim / 2;
        const panelHeight = 620 - topTrim;
        add(this.add.nineslice(centerX, panelY, this.catalogOpen ? 'window-frame' : 'inventory-window-frame',
            undefined, 860, panelHeight, 16, 16, 16, 16));
        if (!this.catalogOpen) addInventoryBackdrop(this, panel, centerX, centerY);
        add(this.add.rectangle(centerX, panelY, 860, panelHeight, 0x000000, 0)
            .setInteractive()).on('pointerdown', stopClick);
        if (this.registry.get('auth')?.user?.isAdmin) {
            const reset = text(centerX - 280, centerY - (this.catalogOpen ? 215 : 202), 'איפוס שחקן', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(reset);
            reset.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openAdminReset(this);
            });
            const grants = text(centerX - (this.catalogOpen ? 40 : 280), centerY - (this.catalogOpen ? 215 : 228), 'מתנות לשחקנים', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(grants);
            grants.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openAdminGrants(this);
            });
            const manage = text(centerX + (this.catalogOpen ? 210 : -280), centerY - (this.catalogOpen ? 215 : 260), 'ניהול נדירות', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(manage);
            manage.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openRarityManager(this);
            });
        }
        const close = add(this.add.image(centerX + 418, centerY - 298 + topTrim, 'x-button')
            .setInteractive({ useHandCursor: true }));
        close.setScale(56 / close.width);
        this.addButtonHover(close);
        close.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('ui-close');
            this.toggleInventory();
        });

        const categorySpacing = Math.min(80, 480 / Math.max(1, categories.length - 1));
        const categorySize = Math.min(76, categorySpacing);
        categories.forEach((entry, index) => {
            const frameIndex = inventoryCategories.indexOf(entry);
            const x = centerX + 360 - index * categorySpacing;
            const button = add(this.add.image(x, centerY - (this.catalogOpen ? 153 : 220), 'inventory-symbols', frameIndex)
                .setDisplaySize(categorySize, categorySize).setData('categoryId', entry.id)
                .setInteractive({ useHandCursor: true }));
            if (entry.id === category.id) {
                const selectedColor = { texture: 'inventory-symbols', hue: 180,
                    frameWidth: 54, frameHeight: 54 };
                button.setTexture(getClothingTexture(this, selectedColor), frameIndex);
                applyClothingColor(this, button, selectedColor);
            }
            this.addButtonHover(button);
            button.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('inventory-click');
                this.inventoryCategory = entry.id;
                reopen();
            });
        });

        const previewX = centerX - 280;
        add(this.add.nineslice(previewX, centerY + 20, 'window-frame',
            undefined, 230, 310, 16, 16, 16, 16));
        const previewName = text(previewX, centerY - 105, this.player.username, 24).setStyle({
            fontStyle: 'bold', color: '#244d70', stroke: '#f3faff', strokeThickness: 3,
            shadow: { offsetX: 2, offsetY: 2, color: '#68acd1', blur: 0, fill: true, stroke: false }
        });
        if (previewName.width > 190) previewName.setScale(190 / previewName.width);
        const previewBody = add(this.add.sprite(previewX, centerY + 115, 'player', 0)
            .setOrigin(0.5, 1).setScale(2.5));
        const clothing = new ClothingLayers(this, panel, previewX, centerY + 115, 2.5, previewBody, this.player.gender);
        clothing.setEquipment(this.catalogOpen ? (this.catalogPreviewEquipment || inventory.equipped) : inventory.equipped);
        const previewAdminBadge = add(this.add.container(previewX - 80, centerY + 140 - 61 * 1.6).setScale(1.6));
        createAdminBadge(this, previewAdminBadge, this.registry.get('auth')?.user?.isAdmin);
        if (!this.catalogOpen) {
            for (const [slot, sprite] of clothing.sprites) {
                sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
                sprite.on('pointerdown', (pointer, localX, localY, event) => {
                    event.stopPropagation();
                    this.sound.play('inventory-click');
                    this.toggleItem(clothing.equipped[slot]);
                });
            }
        }
        const metricStyle = { fontStyle: 'bold', color: '#244d70', stroke: '#f3faff', strokeThickness: 2,
            shadow: { offsetX: 1, offsetY: 1, color: '#68acd1', blur: 0, fill: true, stroke: false } };
        const balance = text(previewX + 22, centerY - 174, inventory.currency.toLocaleString(), 34).setStyle(metricStyle);
        if (balance.width > 160) balance.setScale(160 / balance.width);
        add(this.add.image(previewX - balance.displayWidth / 2 - 12, centerY - 174, 'coin-symbol').setDisplaySize(48, 48 * 50 / 48));
        const level = Math.max(1, Math.min(rankSettings.maxLevel, inventory.level || 1));
        if (!this.catalogOpen) addRankingEffect(this, panel, previewX, centerY, level);
        const levelBadge = add(this.add.image(previewX - 84, centerY + 224, 'levels-symbols', level - 1)
            .setDisplaySize(96, 96));
        addLevelBadgePulse(this, levelBadge);
        const rankingText = text(previewX + 70, centerY + 210, (inventory.rankingPoints || 0).toLocaleString(), 32)
            .setStyle(metricStyle);
        if (rankingText.width > 100) rankingText.setScale(100 / rankingText.width);
        add(this.add.image(previewX + 70 - rankingText.displayWidth / 2 - 33, centerY + 210, 'levelup-symbol')
            .setDisplaySize(44, 44 * 56 / 51));
        text(previewX + 54, centerY + 239, level < rankSettings.maxLevel
            ? `עוד ${(inventory.pointsToNextLevel || 0).toLocaleString()} נק׳ לדרגה הבאה`
            : 'הדרגה המרבית', 21).setStyle(metricStyle).setWordWrapWidth(170, true).setOrigin(0.5, 0);

        const pageSize = this.catalogOpen ? 6 : 9;
        const pages = Math.max(1, Math.ceil(items.length / pageSize));
        this.inventoryPage = Math.max(0, Math.min(page, pages - 1));
        if (!items.length) {
            text(centerX + 80, centerY + 10, 'אין כרגע פריטים בקטגוריה זו', 16);
        }
        items.slice(this.inventoryPage * pageSize, (this.inventoryPage + 1) * pageSize)
            .forEach((item, index) => {
                const x = centerX + 250 - (index % 3) * 140;
                const y = centerY - (this.catalogOpen ? 45 : 108) + Math.floor(index / 3) * 145;
                const owned = inventory.items.includes(item.id);
                const selected = (this.catalogOpen ? this.catalogPreviewEquipment : inventory.equipped)?.[item.slot] === item.id;
                const rarity = this.registry.get('itemRarities')?.[item.id] || 'C';
                const frame = Math.max(0, ['C', 'B', 'A', 'S'].indexOf(rarity));
                const slot = add(this.add.image(x, y, 'items-frames', frame)
                    .setInteractive({ useHandCursor: true }));
                slot.setData('itemId', item.id);
                if (selected) {
                    const selectedFrame = { texture: 'items-frames', hue: 180,
                        frameWidth: 116, frameHeight: 116 };
                    slot.setTexture(getClothingTexture(this, selectedFrame), frame);
                    applyClothingColor(this, slot, selectedFrame);
                }
                const rarityEffect = addItemRarityEffect(this, panel, slot, rarity);
                const icon = add(this.add.sprite(x, y, getClothingTexture(this, item), 0));
                icon.setData('itemIconId', item.id);
                layoutItemIcon(icon, item.slot);
                applyClothingColor(this, icon, item);
                const unlimited = inventory.unlimitedItems || this.registry.get('auth')?.user?.isAdmin;
                if ((!this.catalogOpen || owned) && (unlimited || (inventory.quantities?.[item.id] || 1) > 1)) {
                    const quantity = text(x + 50, y + 42, unlimited ? '∞' : `×${inventory.quantities?.[item.id] || 1}`, 18)
                        .setOrigin(1, 0.5).setStyle({ fontStyle: 'bold', color: '#ffffff', stroke: '#17324d', strokeThickness: 3 })
                        .setData('itemQuantityId', item.id);
                    if (quantity.width > 100) quantity.setScale(100 / quantity.width);
                }
                if (this.catalogOpen) {
                    const canBuy = !unlimited && (inventory.quantities?.[item.id] || 0) < (inventory.maxItemQuantity || 20);
                    const price = this.catalogItems.find(entry => entry.id === item.id)?.price;
                    const buyButton = add(this.add.rectangle(x, y + 73, 116, 26,
                        canBuy ? 0x3779a8 : 0x394b60).setStrokeStyle(1, 0x8798ab));
                    buyButton.setData('purchaseItemId', item.id);
                    const buyLabel = text(x + (canBuy ? 10 : 0), y + 73, canBuy ? `קנייה · ${price}` : unlimited ? 'ברשותך' : 'מקסימום 20', 12)
                        .setColor(canBuy ? '#ffffff' : '#b2e49b');
                    const coin = canBuy ? add(this.add.image(x - 43, y + 73, 'coin-symbol').setDisplaySize(20, 20 * 50 / 48)) : null;
                    if (canBuy) {
                        buyButton.setInteractive({ useHandCursor: true });
                        this.addButtonHover(buyButton, [buyButton, buyLabel, coin]);
                        buyButton.on('pointerdown', (pointer, localX, localY, event) => {
                            event.stopPropagation();
                            this.sound.play('inventory-click');
                            this.buyItem(item.id);
                        });
                    }
                }
                this.addButtonHover(slot, [slot, icon, ...(rarityEffect ? [rarityEffect] : [])]);
                slot.on('pointerdown', (pointer, localX, localY, event) => {
                    event.stopPropagation();
                    this.sound.play('inventory-click');
                    if (this.catalogOpen) {
                        this.catalogPreviewEquipment = normalizeEquipment({
                            ...(this.catalogPreviewEquipment || inventory.equipped), [item.slot]: item.id
                        });
                        reopen(this.inventoryPage);
                    } else this.toggleItem(item.id);
                });
            });
        if (pages > 1) {
            const pageY = centerY + (this.catalogOpen ? 222 : 280);
            for (const [offset, change] of [[-32, 1], [32, -1]]) {
                const enabled = this.inventoryPage + change >= 0 && this.inventoryPage + change < pages;
                const control = add(this.add.image(centerX + 110 + offset, pageY, 'page-arrow-left'))
                    .setFlipX(change === -1)
                    .setData('paginationChange', change).setData('paginationEnabled', enabled);
                control.setScale(54 / control.width);
                if (!enabled) {
                    const grayArrow = { texture: 'page-arrow-left',
                        palette: { '#c9ebff': '#d4d4d4' }, frameWidth: 67, frameHeight: 70 };
                    control.setTexture(getClothingTexture(this, grayArrow), 0);
                    control.setTint(0x999999).setAlpha(0.45);
                    continue;
                }
                control.setInteractive({ useHandCursor: true });
                this.addButtonHover(control);
                control.on('pointerdown', (pointer, localX, localY, event) => {
                    event.stopPropagation();
                    this.sound.play('inventory-click');
                    reopen(this.inventoryPage + change);
                });
            }
        }
        openWindow(this, panel, overlay, animate);
    }

    addButtonHover(button, targets) {
        addButtonHover(this, button, targets);
    }

    async toggleItem(itemId) {
        const inventory = this.registry.get('inventory');
        const item = getClothingItem(itemId);
        if (!item || !inventory.items.includes(itemId) || this.inventoryActionPending) return;
        this.inventoryActionPending = true;
        try {
            await this.multiplayer.requestInventory('inventory:equip', { itemId,
                equip: item.slot === 'bodyColor' || inventory.equipped[item.slot] !== itemId });
        } catch (error) { if (this.sys.isActive()) this.showItemNotice(error.message); }
        finally { this.inventoryActionPending = false; }
    }

    async openShopCatalog(catalogId = 'main') {
        if (this.sys.settings.key !== 'Shop' || this.catalogLoading) return;
        this.catalogLoading = true;
        try {
            const result = await this.multiplayer.requestInventory('shop:catalog', { catalogId });
            if (!this.sys.isActive()) return;
            this.closePlayerCard();
            if (this.inventoryWindow) closeWindow(this, this.inventoryWindow);
            this.inventoryWindow = null;
            this.catalogItems = result.items;
            this.activeCatalogId = result.catalogId || catalogId;
            this.catalogOpen = true;
            this.catalogPreviewEquipment = { ...this.registry.get('inventory').equipped };
            this.inventoryCategory = 'bodyColor';
            this.openInventory();
        } catch (error) { if (this.sys.isActive()) this.showItemNotice(error.message); }
        finally { this.catalogLoading = false; }
    }

    async buyItem(itemId) {
        if (this.inventoryActionPending || this.purchaseModal) return;
        const item = getClothingItem(itemId);
        const offer = this.catalogItems?.find(entry => entry.id === itemId);
        if (!this.catalogOpen || !item || !offer) return;
        const catalogId = this.activeCatalogId || 'main';
        return openPurchaseConfirmation(this, item, offer.price, async () => {
            if (this.inventoryActionPending) throw new Error('מתבצעת פעולה נוספת. נסו שוב בעוד רגע.');
            this.inventoryActionPending = true;
            try {
                await this.multiplayer.requestInventory('shop:purchase', { itemId, catalogId });
                if (this.sys.isActive()) {
                    this.sound.play('sfx-buy');
                    this.showItemNotice('הפריט נוסף לתיק החפצים!');
                }
            } finally { this.inventoryActionPending = false; }
        });
    }

    showItemNotice(message) {
        this.itemNotice?.destroy();
        this.itemNoticeTimer?.remove();
        this.itemNotice = this.add.text(this.scale.width / 2, this.scale.height - 110, message, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '17px', color: '#ffffff',
            backgroundColor: '#17324d', padding: { x: 16, y: 10 },
            align: 'center', wordWrap: { width: 500 }
        }).setOrigin(0.5).setDepth(300).setScrollFactor(0);
        this.itemNoticeTimer = this.time.delayedCall(3000, () => {
            this.itemNotice?.destroy();
            this.itemNotice = null;
            this.itemNoticeTimer = null;
        });
    }


    updateRoom(delta) {
        if (!this.player) return;
        if (this.snowGame || this.coffeeGame || this.activeResident || this.adminModal || this.tradeModal) { this.multiplayer?.update(delta); return; }
        if (this.multiplayer?.backgroundControlled) return;

        // Update player movement first
        this.player.update(delta);
        
        this.multiplayer?.update(delta);
        this.refreshPlayerCard();

        // Check whether a room transition is pending
        if (!this.pendingTransition) return;

        const { sceneKey, x, y } = this.pendingTransition;

        const distance = Math.hypot(
            this.player.container.x - x,
            this.player.container.y - y
        );

        // Transition once the player reaches the entrance
        if (distance <= 8) {
            this.pendingTransition = null;
            this.scene.start(sceneKey, { fromRoom: this.sys.settings.key });
        }
    }
}
