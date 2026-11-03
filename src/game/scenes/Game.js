import { addHoverOutline } from '../ui/HoverOutline';
import square from '../../../shared/square.json';
import { getSquareColliders } from '../../../shared/collision';
import { createSnowGameEntry } from '../minigames/SnowCatch';
import { createSnow } from '../ui/Snow';
import { createClouds } from '../ui/Clouds';
import { BaseRoom } from '../rooms/BaseRoom';
import { residents } from '../residents/residents';
import { Resident } from '../objects/Resident';
import { setWorldDepth } from '../objects/WorldDepth';

export class Game extends BaseRoom {
    constructor() {
        super('Game');
    }

    preload() {
        super.preload();
        this.load.image('igloo-square', 'assets/enviroment/igloo-square.png');
        this.load.image('square-fountain', 'assets/enviroment/fountaint.png');
        this.load.image('snow-game-snowman', 'assets/enviroment/snowman.png');
        this.load.image('shop-building', 'assets/enviroment/shop-building1.png');
        this.load.image('shop-building-door', 'assets/enviroment/shop-building-door.png');
        this.load.image('coffee-building', 'assets/enviroment/coffee-building.png');
        this.load.image('coffee-building-door', 'assets/enviroment/coffee-building-door.png');
        for (const resident of residents.filter(resident => resident.room === 'Game')) {
            if (!this.textures.exists(resident.texture)) this.load.image(resident.texture, resident.image);
        }
        if (!this.cache.audio.exists('main-room-music')) {
            this.load.audio('main-room-music', 'sfx/soundreality-nature-forest-sound-537925.mp3');
        }
    }

    create(data = {}) {
        const width = this.scale.width;
        const height = this.scale.height;

        const music = this.sound.add('main-room-music', { loop: true, volume: 0.2 });
        const playMusic = () => music.play();
        if (this.sound.locked) this.sound.once('unlocked', playMusic);
        else playMusic();
        this.events.once('shutdown', () => {
            this.sound.off('unlocked', playMusic);
            music.destroy();
        });

        this.pendingShopEntry = false;

        // Snowy background
        this.cameras.main.setBackgroundColor(0xd8f1ff);
        document.body.style.backgroundColor = '#d8f1ff';
        document.getElementById('game-container').style.backgroundColor = '#d8f1ff';

        this.add.image(width / 2, height / 2, 'igloo-square')
            .setDisplaySize(width, height).setDepth(-1);
        this.clouds = createClouds(this);
        this.createSnow();

        // Buildings
        this.shopBuilding = this.add.image(width * square.shop.xRatio, square.shop.y, 'shop-building')
            .setOrigin(0.5, 1).setScale(square.shop.scale);
        this.shopEntrance = this.add.image(this.shopBuilding.x, this.shopBuilding.y, 'shop-building-door')
            .setOrigin(0.5, 1).setScale(this.shopBuilding.scaleX)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
        // Shop sorting line: 86% down the image, across the doorway.
        this.shopDepthLine = this.shopBuilding.y - this.shopBuilding.displayHeight * (1 - square.shop.depthRatio);
        setWorldDepth(this.shopBuilding, this.shopDepthLine, height);
        setWorldDepth(this.shopEntrance, this.shopDepthLine, height);
        this.shopDoorOutline = addHoverOutline(this, this.shopEntrance);
        this.cafeBuilding = this.add.image(width * square.cafe.xRatio, square.cafe.y, 'coffee-building')
            .setOrigin(0.5, 1).setScale(square.cafe.scale);
        this.cafeEntrance = this.add.image(this.cafeBuilding.x, this.cafeBuilding.y, 'coffee-building-door')
            .setOrigin(0.5, 1).setScale(this.cafeBuilding.scaleX)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
        this.cafeDepthLine = this.cafeBuilding.y - this.cafeBuilding.displayHeight * (1 - square.cafe.depthRatio);
        setWorldDepth(this.cafeBuilding, this.cafeDepthLine, height);
        setWorldDepth(this.cafeEntrance, this.cafeDepthLine, height);
        this.cafeDoorOutline = addHoverOutline(this, this.cafeEntrance);
        this.cafeEntrancePoint = {
            x: this.cafeBuilding.x + (square.cafe.doorCenter - this.cafeBuilding.width / 2) * square.cafe.scale,
            y: this.cafeBuilding.y + (square.cafe.doorBottom - this.cafeBuilding.height) * square.cafe.scale + 12
        };

        this.fountain = this.add.image(width * 0.41, height * 0.74, 'square-fountain')
            .setOrigin(0.5, 1).setScale(0.8);
        this.add.ellipse(this.fountain.x, this.fountain.y - 24 * this.fountain.scaleY,
            this.fountain.displayWidth * 1.1, 58 * this.fountain.scaleY, 0x536b7d, 0.22).setDepth(0);
        // Sorting line: 75% of the way down the fountain image.
        this.fountainDepthLine = this.fountain.y - this.fountain.displayHeight * 0.25;
        setWorldDepth(this.fountain, this.fountainDepthLine, height);

        // Door art shares the building canvas; its visible center is at source x=187.
        this.shopEntrancePoint = {
            x: this.shopBuilding.x + (187 - this.shopBuilding.width / 2) * this.shopBuilding.scaleX,
            y: this.shopBuilding.y + 12
        };

        this.colliders = getSquareColliders({ ...square, width });

        // Returning shoppers appear just outside the door.
        const returningEntrance = data.fromRoom === 'Shop' ? this.shopEntrancePoint
            : data.fromRoom === 'Cafe' ? this.cafeEntrancePoint : null;
        this.createPlayer(returningEntrance?.x ?? width * 0.58,
            returningEntrance?.y ?? height / 2, 'Player1');
        this.residents = new Map(residents.filter(resident => resident.room === 'Game')
            .map(definition => [definition.id, new Resident(this, definition)]));
        this.snowGameEntry = createSnowGameEntry(this);

        // Shop entrance
        this.lastShopClickTime = -Infinity;
        this.lastCafeClickTime = -Infinity;
        this.cafeEntrance.on('pointerdown', () => {
            const now = this.time.now;
            const doubleClick = now - this.lastCafeClickTime <= 300;
            this.lastCafeClickTime = doubleClick ? -Infinity : now;
            this.moveToRoom('Cafe', this.cafeEntrancePoint.x, this.cafeEntrancePoint.y, doubleClick);
        });

        this.shopEntrance.on('pointerdown', () => {
            console.log('SHOP DOOR CLICKED');
            const now = this.time.now;

            const doubleClick =
                now - this.lastShopClickTime <= 300;

            this.lastShopClickTime = doubleClick
                ? -Infinity
                : now;

            this.moveToRoom(
                'Shop',
                this.shopEntrancePoint.x,
                this.shopEntrancePoint.y,
                doubleClick
            );
        });

        
    }

    createSnow() {
        return createSnow(this);
    }

    createBuilding(x, y, color, label) {
        // Building body
        this.add.rectangle(x, y, 170, 115, color)
            .setStrokeStyle(4, 0xffffff);

        // Roof, positioned directly above the building
        this.add.triangle(
            x, y - 82,
            0, 55,
            100, 55,
            50, 0,
            0x567d9b
        ).setDisplaySize(200, 70);

        // Door
        this.add.rectangle(x, y + 32, 45, 50, 0x735b50);

        // Building name
        this.add.text(x, y - 25, label, {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2,
            fontSize: '22px',
            color: '#24394c'
        }).setOrigin(0.5);
    }

    createTree(x, y) {
        // Tree trunk
        this.add.rectangle(
            x, y + 20,
            16, 55,
            0x8b6549
        );

        // Tree foliage
        this.add.triangle(
            x, y - 20,
            0, 90,
            100, 90,
            50, 0,
            0x3c9875
        ).setDisplaySize(90, 100);
    }

    showMessage(message) {
        if (this.messageText) {
            this.messageText.destroy();
        }

        this.messageText = this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 - 100,
            message,
            {
                fontFamily: 'Rubik, Arial, sans-serif', resolution: 2,
                fontSize: '22px',
                color: '#ffffff',
                backgroundColor: '#264e70',
                padding: { x: 15, y: 10 }
            }
        ).setOrigin(0.5).setDepth(100);

        this.time.delayedCall(2500, () => {
            this.messageText?.destroy();
            this.messageText = null;
        });
    }

    update(time, delta) {
        this.updateRoom(delta);
        const characters = [this.player, ...this.multiplayer.remotePlayers.values(),
            ...this.residents.values()];
        for (const character of characters) {
            setWorldDepth(character.container,
                character.container.y + (character.body?.y ?? 24), this.scale.height);
        }
    }
}
