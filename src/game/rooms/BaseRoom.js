import { getClothingItem, normalizeEquipment, loadClothing, ClothingLayers, getClothingTexture, applyClothingColor, inventoryCategories } from '../items/Clothing';
import { Scene } from 'phaser';
import { Player } from '../objects/Player';
import Multiplayer from '../network/Multiplayer';
import { showLoadingScreen } from '../ui/LoadingScreen';
import { addButtonHover } from '../ui/ButtonHover';
import { openWindow, closeWindow } from '../ui/WindowTransition';
import { openRarityManager } from '../ui/RarityManager';
import { layoutItemIcon } from '../ui/ItemIcon';
import { addInventoryBackdrop } from '../ui/InventoryBackdrop';
import { addGameFrame } from '../ui/GameFrame';
import { addItemRarityEffect } from '../ui/ItemRarityEffect';
import { addRankingEffect } from '../ui/RankingEffect';
import { openAdminGrants } from '../ui/AdminGrants';
import { openAdminReset } from '../ui/AdminReset';

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

    showClickMarker(x, y) {
        const marker = this.add.circle(
            x, y, 12, 0x4c9be8, 0.45
        ).setStrokeStyle(2, 0xffffff);

        this.tweens.add({
            targets: marker,
            scale: 1.8,
            alpha: 0,
            duration: 400,
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
        this.load.image('quest-mark', 'assets/ui/quest-mark.png');
        this.load.image('in-minigame-symbol', 'assets/ui/in-minigame-symbol.png');
        this.load.image('logout-symbol', 'assets/ui/logout-symbol.png');
        this.load.image('x-button', 'assets/ui/x-button.png');
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
        loadClothing(this);
    }
    

    createChat() {
        const { width, height } = this.scale;

        const barY = height - 52;
        const barWidth = Math.min(width - 80, 650);
        const barRight = width / 2 + barWidth / 2;
        const inputWidth = barWidth - 150;
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
        .setDepth(100);

        // HTML input
        this.chatInput = this.add.dom(
            width / 2 - 55,
            barY - 3,
            input
        ).setOrigin(0.5)
        .setDepth(101)
        .setScrollFactor(0);

         // Custom send button
        const sendButton = this.add.image(
            barRight - 93,
            barY,
            'send-button'
        )
            .setDisplaySize(buttonWidth, buttonHeight)
            .setInteractive({ useHandCursor: true })
            .setDepth(101)
            .setScrollFactor(0);
        // Inventory button

        const inventoryButton = this.add.image(
            barRight - 45,
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

        input.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

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

        const close = add(this.add.image(centerX + 188, centerY - 228, 'x-button')
            .setDisplaySize(48, 48 * 47 / 51).setInteractive({ useHandCursor: true }));
        close.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('ui-close');
            this.closePlayerCard();
        });
        this.addButtonHover(close);

        const levelBadge = add(this.add.image(centerX, centerY + 184, 'levels-symbols', 0)
            .setDisplaySize(80, 80));
        const trade = add(this.add.text(centerX + 120, centerY + 185, '⇄ החלפה', {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '17px',
            fontStyle: 'bold', color: '#ffffff', backgroundColor: '#3779a8', padding: { x: 10, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
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
        this.playerCard = { panel, remotePlayer, name, clothing, levelBadge };
        // Phaser DOM inputs otherwise stay above the canvas modal.
        this.chatInput?.setVisible(false);
        this.refreshPlayerCard();
        openWindow(this, panel, overlay);
    }

    refreshPlayerCard() {
        if (!this.playerCard) return;
        const { remotePlayer, name, clothing, levelBadge } = this.playerCard;
        if (![...this.multiplayer.remotePlayers.values()].includes(remotePlayer)) {
            this.closePlayerCard();
            return;
        }
        name.setText(remotePlayer.username);
        const level = Math.max(1, Math.min(3, remotePlayer.level || 1));
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
        const category = inventoryCategories.find(entry => entry.id === this.inventoryCategory)
            || inventoryCategories[0];
        this.inventoryCategory = category.id;
        const itemIds = this.catalogOpen ? (this.catalogItems || []).map(item => item.id) : inventory.items;
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
        add(this.add.nineslice(centerX, centerY, this.catalogOpen ? 'window-frame' : 'inventory-window-frame',
            undefined, 860, 620, 16, 16, 16, 16));
        if (!this.catalogOpen) addInventoryBackdrop(this, panel, centerX, centerY);
        add(this.add.rectangle(centerX, centerY, 860, 620, 0x000000, 0)
            .setInteractive()).on('pointerdown', stopClick);
        if (this.catalogOpen) text(centerX, centerY - 214, 'קטלוג החנות', 26);
        if (this.registry.get('auth')?.user?.isAdmin) {
            const reset = text(centerX - 280, centerY - 202, 'איפוס שחקן', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(reset);
            reset.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openAdminReset(this);
            });
            const grants = text(centerX - 280, centerY - 228, 'מתנות לשחקנים', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(grants);
            grants.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openAdminGrants(this);
            });
            const manage = text(centerX - 280, centerY - 260, 'ניהול נדירות', 17)
                .setInteractive({ useHandCursor: true });
            this.addButtonHover(manage);
            manage.on('pointerdown', (pointer, localX, localY, event) => {
                event.stopPropagation();
                this.sound.play('wood-tap-ui');
                openRarityManager(this);
            });
        }
        const close = add(this.add.image(centerX + 418, centerY - 298, 'x-button')
            .setInteractive({ useHandCursor: true }));
        close.setScale(56 / close.width);
        this.addButtonHover(close);
        close.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('ui-close');
            this.toggleInventory();
        });

        inventoryCategories.forEach((entry, index) => {
            const x = centerX + 360 - index * 80;
            const button = add(this.add.image(x, centerY - (this.catalogOpen ? 153 : 220), 'inventory-symbols', index)
                .setDisplaySize(76, 76).setData('categoryId', entry.id)
                .setInteractive({ useHandCursor: true }));
            if (entry.id === category.id) {
                const selectedColor = { texture: 'inventory-symbols', hue: 180,
                    frameWidth: 54, frameHeight: 54 };
                button.setTexture(getClothingTexture(this, selectedColor), index);
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
        const level = Math.max(1, Math.min(3, inventory.level || 1));
        if (!this.catalogOpen) addRankingEffect(this, panel, previewX, centerY, level);
        add(this.add.image(previewX - 84, centerY + 224, 'levels-symbols', level - 1)
            .setDisplaySize(96, 96));
        const rankingText = text(previewX + 70, centerY + 210, (inventory.rankingPoints || 0).toLocaleString(), 32)
            .setStyle(metricStyle);
        if (rankingText.width > 100) rankingText.setScale(100 / rankingText.width);
        add(this.add.image(previewX + 70 - rankingText.displayWidth / 2 - 33, centerY + 210, 'levelup-symbol')
            .setDisplaySize(44, 44 * 56 / 51));
        text(previewX + 54, centerY + 239, level < 3
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
                const y = centerY - (this.catalogOpen ? 45 : 100) + Math.floor(index / 3) * 145;
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
            const pageY = centerY + (this.catalogOpen ? 212 : 270);
            text(centerX + 80, pageY, `${this.inventoryPage + 1} / ${pages}`, 16);
            for (const [offset, label, change] of [[-80, '<', -1], [80, '>', 1]]) {
                const control = text(centerX + 80 + offset, pageY, label, 23)
                    .setInteractive({ useHandCursor: true });
                this.addButtonHover(control);
                control.on('pointerdown', () => {
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

    async openShopCatalog() {
        if (this.sys.settings.key !== 'Shop' || this.catalogLoading) return;
        this.catalogLoading = true;
        try {
            const result = await this.multiplayer.requestInventory('shop:catalog', {});
            if (!this.sys.isActive()) return;
            this.closePlayerCard();
            if (this.inventoryWindow) closeWindow(this, this.inventoryWindow);
            this.inventoryWindow = null;
            this.catalogItems = result.items;
            this.catalogOpen = true;
            this.catalogPreviewEquipment = { ...this.registry.get('inventory').equipped };
            this.inventoryCategory = 'bodyColor';
            this.openInventory();
        } catch (error) { if (this.sys.isActive()) this.showItemNotice(error.message); }
        finally { this.catalogLoading = false; }
    }

    async buyItem(itemId) {
        if (this.inventoryActionPending) return;
        this.inventoryActionPending = true;
        try {
            await this.multiplayer.requestInventory('shop:purchase', { itemId });
            if (this.sys.isActive()) this.sound.play('sfx-buy');
            if (this.sys.isActive()) this.showItemNotice('הפריט נוסף לתיק החפצים!');
        } catch (error) { if (this.sys.isActive()) this.showItemNotice(error.message); }
        finally { this.inventoryActionPending = false; }
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
        if (this.snowGame || this.activeResident || this.adminModal || this.tradeModal) { this.multiplayer?.update(delta); return; }
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
