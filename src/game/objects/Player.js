import { showChatMessage, updateChatMessage } from './ChatBubble';
import { ClothingLayers, normalizeEquipment } from '../items/Clothing';
import { Math as PhaserMath } from 'phaser';
import { createAdminBadge } from './AdminBadge';

export class Player {
    constructor(scene, x, y, username = 'Player1') {
        this.username = username;
        this.gender = scene.registry.get('auth')?.user?.gender === 'female' ? 'female' : 'male';
        this.scene = scene;
        this.movementMargin = scene.sys?.settings.key === 'Game' ? 25 : 65;
        this.speed = 220;
        this.runSpeed = 380;
        this.isRunning = false;
        this.isMoving = false;
        this.moveTarget = null;
        this.walkTimer = 0;
        this.walkFrame = 0;
        this.walkFrameDuration = 125;
        this.currentDirectionFrame = 0;
        this.facingLeft = false;
        

        // Create player container
        this.container = scene.add.container(x, y);


        // Shadow
        const shadow = scene.add.ellipse(
            0, 16, 42, 12, 0x7897a8, 0.35
        );

        // Character sprite
        this.body = scene.add.sprite(0, 24, 'player', 0);

        this.body.setOrigin(0.5, 1);
        this.body.setScale(1);
        // Username
        const name = scene.add.text(0, 37, username, {
            fontFamily: 'Rubik, Arial, sans-serif',
            fontStyle: 'bold',
            fontSize: '17px',
            color: '#17324d',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.container.add([
            shadow,
            this.body,
            name
        ]);

        this.clothing = new ClothingLayers(scene, this.container, 0, 24, 1, this.body, this.gender);
        this.adminBadge = createAdminBadge(scene, this.container,
            scene.registry.get('auth')?.user?.isAdmin);
        this.container.setDepth(10);

        // Keyboard controls
        this.cursors = scene.input.keyboard.createCursorKeys();

        scene.input.keyboard.on('keydown-P', () => {
            scene.game.renderer.snapshot((image) => {
                const link = document.createElement('a');
                link.href = image.src;
                link.download = 'phaser-snapshot.png';
                link.click();
            });
        });
    }

    setEquipment(equipped) {
        this.clothing.setEquipment(equipped);
        this.clothing.update(this.currentDirectionFrame, this.facingLeft, this.body.x, this.body.texture.key);
    }

    setAdmin(isAdmin) {
        this.adminBadge.setVisible(isAdmin === true);
    }

    setShirtEquipped(equipped) {
        this.setEquipment({ ...this.clothing.equipped, shirt: equipped ? 'black-shirt' : null });
    }

    getSyncState() {
        const inventory = this.scene.registry.get('inventory') || {};
        const equipped = inventory.equipped || {};

        let isMoving = false;
        const keyboardActive =
            this.cursors.left.isDown ||
            this.cursors.right.isDown ||
            this.cursors.up.isDown ||
            this.cursors.down.isDown;

        isMoving = keyboardActive || !!this.moveTarget;

        return {
            x: this.container.x,
            y: this.container.y,
            username: this.username,
            equipped: normalizeEquipment(equipped),
            shirt: equipped.shirt || null,
            direction: this.currentDirectionFrame,
            facingLeft: this.facingLeft,
            isMoving
        };
    }
    
    showMessage(message) {
        showChatMessage(this, message);
    }


    setMoveTarget(x, y, run = false) {
        this.isRunning = run;

        this.moveTarget = {
            x: PhaserMath.Clamp(x, this.movementMargin, this.scene.scale.width - this.movementMargin),
            y: PhaserMath.Clamp(y, this.movementMargin, this.scene.scale.height - this.movementMargin)
        };
    }

    updateDirection(dx, dy) {
        if (dx === 0 && dy === 0) return;

        const angle = Math.atan2(dy, dx);
        const sector = Math.round(angle / (Math.PI / 4));

        const frames = {
            0: 6,     // Right
            1: 3,     // Down-right
            2: 0,     // Down
            3: 2,     // Down-left
            4: 6,     // Left
            '-4': 6,  // Left
            '-3': 5,  // Up-left
            '-2': 1,  // Up
            '-1': 4   // Up-right
        };

        this.currentDirectionFrame = frames[sector];
        this.facingLeft = sector === 4 || sector === -4;
    }
    updateAnimation(delta, isMoving) {
        if (!isMoving) {
            this.walkTimer = 0;
            this.walkFrame = 0;

            // Idle when standing still
            this.body.setTexture(
                'player',
                this.currentDirectionFrame
            );
        } else {
            const frameDuration = this.isRunning
                ? 75
                : this.walkFrameDuration;

            this.walkTimer += delta;

            while (this.walkTimer >= frameDuration) {
                this.walkTimer -= frameDuration;
                this.walkFrame = (this.walkFrame + 1) % 2;
            }

            // Only the two walking frames
            const textures = [
                'player-walk-1',
                'player-walk-2'
            ];

            this.body.setTexture(
                textures[this.walkFrame],
                this.currentDirectionFrame
            );
        }

        this.body.setFlipX(this.facingLeft);
        if (this.currentDirectionFrame === 6) {
            this.body.x = this.facingLeft ? -6 : 6;
        } else {
            this.body.x = 0;
        }
        this.clothing.update(this.currentDirectionFrame, this.facingLeft, this.body.x, this.body.texture.key);
    }

    update(delta) {
        const previousX = this.container.x;
        const previousY = this.container.y;
        let dx = 0;
        let dy = 0;

        // Keyboard input
        if (this.cursors.left.isDown) dx -= 1;
        if (this.cursors.right.isDown) dx += 1;
        if (this.cursors.up.isDown) dy -= 1;
        if (this.cursors.down.isDown) dy += 1;

        const keyboardActive = dx !== 0 || dy !== 0;
        let isMoving = false;

        // Keyboard movement always uses walking speed
        if (keyboardActive) {
            this.isRunning = false;
            this.moveTarget = null;
        }

        // Calculate speed after checking keyboard input
        const currentSpeed = this.isRunning
            ? this.runSpeed
            : this.speed;

        const movement = currentSpeed * delta / 1000;

        if (keyboardActive) {
            isMoving = true;

            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;

            this.updateDirection(dx, dy);

            this.container.x += dx * movement;
            this.container.y += dy * movement;
        }
        else if (this.moveTarget) {
            const distanceX = this.moveTarget.x - this.container.x;
            const distanceY = this.moveTarget.y - this.container.y;

            const distance = Math.hypot(distanceX, distanceY);

            if (distance > 0) {
                this.updateDirection(distanceX, distanceY);
                isMoving = true;
            }

            if (distance <= movement) {
                this.container.setPosition(
                    this.moveTarget.x,
                    this.moveTarget.y
                );

                this.moveTarget = null;
                this.isRunning = false;
                isMoving = false;
            }
            else {
                this.container.x +=
                    (distanceX / distance) * movement;

                this.container.y +=
                    (distanceY / distance) * movement;
            }
        }

        // Keep player inside room
        this.container.x = PhaserMath.Clamp(
            this.container.x,
            this.movementMargin,
            this.scene.scale.width - this.movementMargin
        );

        this.container.y = PhaserMath.Clamp(
            this.container.y,
            this.movementMargin,
            this.scene.scale.height - this.movementMargin
        );
        
        updateChatMessage(this);
        // Publish actual movement, including the final step and room boundaries.
        this.isMoving = this.container.x !== previousX || this.container.y !== previousY;
        this.updateAnimation(delta, this.isMoving);

    }
}
