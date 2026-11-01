import { BaseRoom } from '../rooms/BaseRoom';
import { residents } from '../residents/residents';
import { Resident } from '../objects/Resident';

export class Cafe extends BaseRoom {
    constructor() { super('Cafe'); }

    preload() {
        super.preload();
        for (const resident of residents.filter(resident => resident.room === 'Cafe')) {
            if (!this.textures.exists(resident.texture)) this.load.image(resident.texture, resident.image);
        }
        if (!this.cache.audio.exists('coffee-shop-music')) {
            this.load.audio('coffee-shop-music', 'sfx/coffee-shop-music.mp3');
        }
    }

    create() {
        const music = this.sound.add('coffee-shop-music', { loop: true, volume: 0.2 });
        const playMusic = () => music.play();
        if (this.sound.locked) this.sound.once('unlocked', playMusic);
        else playMusic();
        this.events.once('shutdown', () => {
            this.sound.off('unlocked', playMusic);
            music.destroy();
        });

        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(0x5c4840);
        document.body.style.backgroundColor = '#5c4840';
        document.getElementById('game-container').style.backgroundColor = '#5c4840';
        this.add.rectangle(width / 2, height / 2, width - 80, height - 80, 0xc59f7b);
        this.add.rectangle(width / 2, 130, width - 80, 180, 0xf0debd);
        for (let y = 250; y < height - 50; y += 64) {
            this.add.rectangle(width / 2, y, width - 80, 2, 0x9b785d, 0.4);
        }
        this.add.rectangle(width / 2, height / 2, width - 80, height - 80)
            .setFillStyle().setStrokeStyle(4, 0x9bc5df).setDepth(10);
        this.add.text(width / 2, 80, 'בית הקפה של איגלו', {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '34px',
            fontStyle: 'bold', color: '#5b4033'
        }).setOrigin(0.5);
        this.add.rectangle(width / 2, 200, 420, 70, 0x76513b).setStrokeStyle(4, 0xae8057);
        for (const x of [width / 2 - 120, width / 2, width / 2 + 120]) {
            this.add.rectangle(x, 169, 24, 20, 0xe5f4ff).setStrokeStyle(2, 0x7199bd);
        }
        for (const x of [260, width - 260]) {
            for (const y of [355, 490]) {
                this.add.ellipse(x, y + 12, 140, 30, 0x5c4840, 0.15);
                this.add.rectangle(x - 70, y + 25, 34, 34, 0x8e5d45);
                this.add.rectangle(x + 70, y + 25, 34, 34, 0x8e5d45);
                this.add.ellipse(x, y, 120, 65, 0xead0a4).setStrokeStyle(3, 0x76513b);
            }
        }
        this.createPlayer(width / 2, height - 190, 'Player1');
        this.residents = new Map(residents.filter(resident => resident.room === 'Cafe')
            .map(definition => [definition.id, new Resident(this, definition)]));
        this.exit = this.add.rectangle(width / 2, height - 100, 110, 55, 0x76513b)
            .setStrokeStyle(3, 0xe5f4ff).setInteractive({ useHandCursor: true });
        const label = this.add.text(width / 2, height - 100, 'לכיכר', {
            fontFamily: 'Rubik, Arial, sans-serif', resolution: 2, fontSize: '20px', color: '#ffffff'
        }).setOrigin(0.5);
        this.addButtonHover(this.exit, [this.exit, label]);
        this.exitPoint = { x: width / 2, y: height - 130 };
        this.lastExitClickTime = -Infinity;
        this.exit.on('pointerdown', () => {
            const now = this.time.now;
            const doubleClick = now - this.lastExitClickTime <= 300;
            this.lastExitClickTime = doubleClick ? -Infinity : now;
            this.moveToRoom('Game', this.exitPoint.x, this.exitPoint.y, doubleClick);
        });
    }

    update(time, delta) { this.updateRoom(delta); }
}
