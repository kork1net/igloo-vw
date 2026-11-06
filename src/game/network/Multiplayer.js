import rankSettings from '../../../shared/rank-settings.json';
import { adminStyle, stylePlayerName } from '../ui/AdminStyle';
import { showChatMessage, updateChatMessage } from '../objects/ChatBubble';
import { showPlayerEmoji } from '../objects/PlayerEmoji';
import { ClothingLayers, normalizeEquipment } from '../items/Clothing';

import { io } from 'socket.io-client';
import { SERVER_URL, saveToken } from './Auth';
import { createAdminBadge } from '../objects/AdminBadge';
import { playChatSound, silenceChatSound } from '../ui/ChatSound';
import { createMinigameBadge } from '../objects/MinigameBadge';
import { showPendingAdminGift } from '../ui/AdminGrants';
import { receiveTradeState, closeTradeWindow } from '../ui/TradeWindow';

class RemotePlayer {
    constructor(scene, data) {
        this.scene = scene;
        this.targetX = data.x ?? 0;
        this.targetY = data.y ?? 0;
        this.directionFrame = Number.isFinite(data.direction)
            ? data.direction
            : 0;
        this.facingLeft = Boolean(data.facingLeft);
        this.isMoving = Boolean(data.isMoving);
        this.isRunning = Boolean(data.isRunning);
        this.username = data.username || 'Player';
        this.level = Math.max(1, Math.min(rankSettings.maxLevel, data.level || 1));
        this.rankingPoints = data.rankingPoints ?? 0;
        this.pointsToNextLevel = data.pointsToNextLevel ?? 0;
        this.gender = data.gender === 'female' ? 'female' : 'male';
        this.equipped = normalizeEquipment(data.equipped || { shirt: data.shirt });
        this.walkTimer = 0;
        this.walkFrame = 0;

        this.container = scene.add.container(this.targetX, this.targetY);

        const shadow = scene.add.ellipse(0, 16, 42, 12, 0x7897a8, 0.35);
        this.body = scene.add.sprite(0, 24, 'player', this.directionFrame);
        this.body.setOrigin(0.5, 1);

        this.nameText = scene.add.text(0, 37, this.username, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2,
            fontStyle: 'bold',
            fontSize: '17px',
            color: data.isAdmin === true ? adminStyle.text : '#17324d',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5);
        stylePlayerName(this.nameText, data.isAdmin);

        this.container.add([shadow, this.body, this.nameText]);
        this.adminBadge = createAdminBadge(scene, this.container, data.isAdmin);
        this.minigameBadge = createMinigameBadge(scene, this.container).setVisible(Boolean(data.minigame));
        this.clothing = new ClothingLayers(scene, this.container, 0, 24, 1, this.body, this.gender);
        this.clothing.setEquipment(this.equipped);
        this.container.setDepth(10);
        this.container.setSize(80, 150);
        this.container.setInteractive({ useHandCursor: true });
        this.container.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            scene.sound.play('wood-tap-ui');
            scene.openPlayerCard(this);
        });
        this.updateAvatar();
    }

    showMessage(message) {
        showChatMessage(this, message);
    }

    setState(data) {
        if (Number.isInteger(data.level)) this.level = Math.max(1, Math.min(rankSettings.maxLevel, data.level));
        if (Number.isFinite(data.rankingPoints)) this.rankingPoints = data.rankingPoints;
        if (Number.isFinite(data.pointsToNextLevel)) this.pointsToNextLevel = data.pointsToNextLevel;
        this.minigameBadge.setVisible(Boolean(data.minigame));
        this.adminBadge.setVisible(data.isAdmin === true);
        stylePlayerName(this.nameText, data.isAdmin);
        this.targetX = data.x ?? this.targetX;
        this.targetY = data.y ?? this.targetY;

        if (data.username) {
            this.username = data.username;
            this.nameText.setText(this.username);
        }

        if (Number.isFinite(data.direction)) {
            this.directionFrame = data.direction;
        }

        if (typeof data.facingLeft === 'boolean') {
            this.facingLeft = data.facingLeft;
        }

        this.isMoving = Boolean(data.isMoving);
        this.isRunning = Boolean(data.isRunning);
        this.equipped = normalizeEquipment(data.equipped || { shirt: data.shirt });
        this.clothing.setEquipment(this.equipped);

        this.updateAvatar();
    }

    updateAvatar() {
        if (!this.isMoving) {
            this.walkTimer = 0;
            this.walkFrame = 0;
            this.body.setTexture('player', this.directionFrame);
        } else {
            const textures = ['player-walk-1', 'player-walk-2'];
            this.body.setTexture(textures[this.walkFrame], this.directionFrame);
        }

        this.body.setFlipX(this.facingLeft);
        this.body.x = this.directionFrame === 6 ? (this.facingLeft ? -6 : 6) : 0;

        this.clothing.update(this.directionFrame, this.facingLeft, this.body.x, this.body.texture.key);
    }

    update(delta) {
        const dx = this.targetX - this.container.x;
        const dy = this.targetY - this.container.y;

        // Exponential smoothing has the same response at every render rate.
        const blend = 1 - Math.exp(-15 * delta / 1000);
        if (Math.hypot(dx, dy) < 0.1) {
            this.container.setPosition(this.targetX, this.targetY);
        } else {
            this.container.x += dx * blend;
            this.container.y += dy * blend;
        }

        if (!this.isMoving) {
            this.walkTimer = 0;
            this.walkFrame = 0;
        } else {
            const frameDuration = this.isRunning ? 75 : 125;
            this.walkTimer += delta;
            while (this.walkTimer >= frameDuration) {
                this.walkTimer -= frameDuration;
                this.walkFrame = (this.walkFrame + 1) % 2;
            }
        }

        this.updateAvatar();
        updateChatMessage(this);
    }
}

export default class Multiplayer {
    constructor(scene) {
        this.scene = scene;
        this.socket = null;
        this.remotePlayers = new Map();
        this.sendElapsed = 0;
        this.lastSentState = null;
        this.backgroundControlled = false;
    }

    sendChatMessage(message) {
        if (typeof message !== 'string') return;
        const text = message.trim().slice(0, 100);
        if (text && this.socket?.connected) {
            this.socket.emit('chatMessage', text);
            playChatSound(this.scene);
        }
    }

    sendEmoji(emoji) {
        if (this.socket?.connected) this.socket.emit('playerEmoji', { emoji });
    }

    syncLocalProfile() {
        if (!this.socket?.connected || !this.scene.player) return;

        const inventory = this.scene.registry.get('inventory') || {};
        const equipped = inventory.equipped || {};

        this.socket.emit('playerProfile', {
            username: this.scene.player.username,
            equipped: normalizeEquipment(equipped),
            shirt: equipped.shirt || null
        });
    }

    applyInventory(inventory) {
        if (!inventory || !Array.isArray(inventory.items) || !inventory.equipped) return;
        const previous = this.scene.registry.get('inventory');
        if (JSON.stringify(previous) === JSON.stringify(inventory)) return;
        this.scene.registry.set('inventory', inventory);
        if (!this.scene.sys.isActive()) return;
        this.scene.player?.setEquipment(inventory.equipped);
        for (const resident of this.scene.residents?.values() || []) resident.refreshQuestMarker();
        this.scene.activeResident?.refreshQuests();
        if (this.scene.inventoryWindow) {
            this.scene.inventoryWindow.destroy();
            this.scene.inventoryWindow = null;
            this.scene.openInventory(this.scene.inventoryPage, false);
        }
    }

    requestInventory(event, data) {
        return new Promise((resolve, reject) => {
            if (!this.socket?.connected) { reject(new Error('אין חיבור לשרת המשחק.')); return; }
            this.socket.timeout(5000).emit(event, data, (error, result) => {
                if (error) { reject(new Error('לא התקבלה תשובה מהשרת. נסו שוב.')); return; }
                if (!result?.ok) {
                    const failure = new Error(result?.error || 'הפעולה נכשלה.');
                    failure.code = result?.code;
                    reject(failure); return;
                }
                this.applyInventory(result.inventory);
                resolve(result);
            });
        });
    }

    connect() {
        this.onVisibilityChange = () => { silenceChatSound(this.scene.sound); this.syncVisibility(); };
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.socket = io(SERVER_URL, {
            auth: (callback) => callback({
                token: this.scene.registry.get('auth')?.token,
                room: this.scene.sys.settings.key,
                player: this.getLocalState()
            })
        });

        this.socket.on('authRequired', () => this.leaveAccount());
        this.socket.on('accountReset', () => this.leaveAccount());
        this.socket.on('inventoryUpdated', inventory => this.applyInventory(inventory));
        this.socket.on('trade:state', state => receiveTradeState(this.scene, state));
        this.socket.on('trade:closed', result => closeTradeWindow(this.scene, result));
        this.socket.on('disconnect', () => closeTradeWindow(this.scene, { reason: 'ההחלפה בוטלה בעקבות ניתוק.', id: this.scene.tradeWindow?.state.id }));
        this.socket.on('snow:update', state => this.scene.snowGame?.applyState(state));
        this.socket.on('snow:error', message => this.scene.snowGame?.error(message));
        this.socket.on('itemRaritiesUpdated', values => {
            this.scene.registry.set('itemRarities', values);
            this.scene.tradeWindow?.render();
            if (this.scene.sys.isActive() && this.scene.inventoryWindow) {
                this.scene.inventoryWindow.destroy();
                this.scene.inventoryWindow = null;
                this.scene.openInventory(this.scene.inventoryPage, false);
            }
        });
        this.socket.on('inventoryError', message => this.scene.showItemNotice(message));

        this.socket.on('disconnect', () => {
            for (const player of this.remotePlayers.values()) player.container.destroy();
            this.remotePlayers.clear();
            this.lastSentState = null;
        });

        this.socket.on('connect', () => {
            console.log('Connected to multiplayer server:', this.socket.id);
            this.syncLocalProfile();
            if (document.hidden) this.syncVisibility();
            else this.backgroundControlled = false;
            if (this.scene.snowGame && !this.scene.snowGame.closing) this.requestInventory('minigame:presence', { game: 'snow-catch', active: true }).catch(() => {});
        });

        this.socket.on('backgroundState', state => this.applyBackgroundState(state));

        this.socket.on('currentPlayers', (players) => {
            this.scene.setVanishState(players[this.socket.id]?.vanished === true);
            this.scene.player.setAdmin(players[this.socket.id]?.isAdmin);
            this.scene.player.setMinigame(players[this.socket.id]?.minigame);
            for (const [id, data] of Object.entries(players)) {
                if (id !== this.socket.id) {
                    this.addRemotePlayer(id, data);
                }
            }
        });

        this.socket.on('vanishState', state => this.scene.setVanishState(state.active === true));

        this.socket.on('playerJoined', (data) => {
            if (data.id !== this.socket.id) {
                this.addRemotePlayer(data.id, data);
            }
        });

        this.socket.on('playerMoved', (data) => {
            if (!data || !data.id) return;
            if (data.id === this.socket.id) { this.scene.player.setMinigame(data.minigame); return; }

            if (!this.remotePlayers.has(data.id)) {
                this.addRemotePlayer(data.id, data);
            }

            this.remotePlayers.get(data.id)?.setState(data);
        });

        this.socket.on('chatMessage', (data) => {
            if (!data || typeof data.message !== 'string' || !data.message.trim()) return;
            this.remotePlayers.get(data.id)?.showMessage(data.message);
            playChatSound(this.scene);
        });
        this.socket.on('playerEmoji', data => {
            if (!data || typeof data.id !== 'string') return;
            const owner = data.id === this.socket.id ? this.scene.player : this.remotePlayers.get(data.id);
            showPlayerEmoji(owner, data.emoji);
        });

        this.socket.on('playerLeft', (id) => {
            const player = this.remotePlayers.get(id);

            if (player) {
                player.container.destroy();
                this.remotePlayers.delete(id);
            }
        });

        this.scene.events.once('shutdown', () => {
            this.disconnect();
        });
    }

    addRemotePlayer(id, data) {
        if (this.remotePlayers.has(id)) {
            this.remotePlayers.get(id)?.setState(data);
            return;
        }

        const player = new RemotePlayer(this.scene, data);
        player.id = id;
        this.remotePlayers.set(id, player);
    }

    getLocalState() {
        const player = this.scene.player;
        const inventory = this.scene.registry.get('inventory');
        return {
            x: player.container.x,
            y: player.container.y,
            username: player.username,
            equipped: normalizeEquipment(inventory?.equipped),
            shirt: inventory?.equipped?.shirt || null,
            direction: player.currentDirectionFrame,
            facingLeft: player.facingLeft,
            isMoving: player.isMoving,
            isRunning: player.isRunning
        };
    }

    applyBackgroundState(state) {
        const player = this.scene.player;
        player.container.setPosition(state.x, state.y);
        player.currentDirectionFrame = state.direction;
        player.facingLeft = state.facingLeft;
        player.isMoving = state.isMoving;
        player.isRunning = state.isRunning;
        if (!state.isMoving) player.moveTarget = null;
        player.updateAnimation(0, state.isMoving);
    }

    syncVisibility() {
        if (!this.socket?.connected) return;
        const player = this.scene.player;
        if (document.hidden) {
            // Released keys can be missed after switching tabs. Keep click destinations.
            Object.values(player.cursors)
                .forEach(key => key.reset());
            if (player.moveTarget) {
                player.updateDirection(player.moveTarget.x - player.container.x,
                    player.moveTarget.y - player.container.y);
            }
            this.backgroundControlled = true;
            this.socket.emit('playerBackground', {
                hidden: true,
                state: this.getLocalState(),
                target: player.moveTarget
            });
        } else if (this.backgroundControlled) {
            // Wait for the final server position before resuming local simulation.
            this.socket.emit('playerBackground', { hidden: false }, state => {
                this.applyBackgroundState(state);
                this.lastSentState = null;
                this.backgroundControlled = false;
                // Visibility may have changed again while waiting for the response.
                if (document.hidden) this.syncVisibility();
            });
        }
    }

    update(delta) {
        showPendingAdminGift(this.scene);
        for (const remotePlayer of this.remotePlayers.values()) {
            remotePlayer.update(delta);
        }
        if (!this.socket?.connected || !this.scene.player || this.backgroundControlled) return;

        this.sendElapsed += delta;
        const state = this.getLocalState();
        const previous = this.lastSentState;
        // Send starts, stops, turns and clothing changes immediately; positions at 20 Hz.
        const changed = !previous || ['username', 'shirt', 'direction', 'facingLeft',
            'isMoving', 'isRunning'].some(key => state[key] !== previous[key]);
        const clothingChanged = !previous || JSON.stringify(state.equipped) !== JSON.stringify(previous.equipped);
        const moved = !previous || state.x !== previous.x || state.y !== previous.y;
        if (changed || clothingChanged || (moved && this.sendElapsed >= 50)) {
            this.socket.emit('playerMove', state);
            this.lastSentState = state;
            this.sendElapsed = 0;
        }
    }

    disconnect() {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.socket?.disconnect();
        this.socket = null;

        for (const player of this.remotePlayers.values()) {
            player.container.destroy();
        }

        this.remotePlayers.clear();
    }

    leaveAccount() {
        saveToken(null);
        this.scene.registry.remove('auth');
        this.scene.registry.remove('inventory');
        this.scene.scene.start('MainMenu');
    }

    logout() {
        if (this.socket?.connected) {
            this.socket.timeout(2000).emit('auth:logout', () => this.leaveAccount());
        } else this.leaveAccount();
    }
}
