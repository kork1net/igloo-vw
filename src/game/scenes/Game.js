import { createSnow } from '../ui/Snow';
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
        for (const resident of residents.filter(resident => resident.room === 'Game')) {
            if (!this.textures.exists(resident.texture)) this.load.image(resident.texture, resident.image);
        }
        if (!this.cache.audio.exists('main-room-music')) {
            this.load.audio('main-room-music', 'sfx/soundreality-nature-forest-sound-537925.mp3');
        }
    }

    create() {
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
        this.createSnow();
        this.add.rectangle(width / 2, height / 2, width - 4, height - 4)
            .setFillStyle()
            .setStrokeStyle(4, 0x9bc5df)
            .setScrollFactor(0)
            .setDepth(90);

        // Buildings
        this.createBuilding(width * 0.25, 180, 0xffb86b, 'SHOP');
        this.createBuilding(width * 0.75, 180, 0x8fc9ff, 'CAFE');

        this.fountain = this.add.image(width * 0.38, height * 0.63, 'square-fountain')
            .setOrigin(0.5, 1).setScale(1);
        this.add.ellipse(this.fountain.x, this.fountain.y - 24,
            this.fountain.displayWidth * 1.1, 58, 0x536b7d, 0.22).setDepth(0);
        // Sorting line: 75% of the way down the fountain image.
        this.fountainDepthLine = this.fountain.y - this.fountain.displayHeight * 0.25;
        setWorldDepth(this.fountain, this.fountainDepthLine, height);

        // Player
        this.createPlayer(
            width * 0.58,
            height / 2,
            'Player1'
        );
        this.residents = new Map(residents.filter(resident => resident.room === 'Game')
            .map(definition => [definition.id, new Resident(this, definition)]));

        // Shop entrance
        this.shopEntrance = this.add.rectangle(
            width * 0.25, 212, 45, 50, 0x735b50
        ).setInteractive({ useHandCursor: true });

        this.shopEntrance.setAlpha(0.01);

        this.shopEntrancePoint = {
            x: this.shopEntrance.x,
            y: this.shopEntrance.y
        };

        this.lastShopClickTime = -Infinity;

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

        this.add.text(
            width / 2, height - 22,
            'Move with the mouse or arrow keys', {
                fontFamily: 'Rubik, Arial, sans-serif',
                fontSize: '16px',
                color: '#34566e'
            }
        ).setOrigin(0.5);
        
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
            fontFamily: 'Rubik, Arial, sans-serif',
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
                fontFamily: 'Rubik, Arial, sans-serif',
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
