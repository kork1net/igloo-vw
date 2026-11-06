import { BaseRoom } from '../rooms/BaseRoom';
import { residents } from '../residents/residents';
import { Resident } from '../objects/Resident';
import { createCoffeeGameEntry } from '../minigames/CoffeeMemory';
import { createCafeDecor } from '../objects/CafeDecor';
import { getShopInteriorColliders } from '../../../shared/collision';
import { addHoverOutline } from '../ui/HoverOutline';

export class Cafe extends BaseRoom {
    constructor() { super('Cafe'); }

    preload() {
        super.preload();
        this.load.image('cafe-shop-background', 'assets/enviroment/shop-interior-background-simple.png');
        this.load.image('cafe-table', 'assets/enviroment/cafe-table.png');
        this.load.image('cafe-cashbox', 'assets/enviroment/cashbox.png');
        this.load.image('cafe-minigame-cup', 'assets/enviroment/minigame-cup.png');
        this.load.image('cafe-menu', 'assets/enviroment/menu.png');
        this.load.image('cafe-light', 'assets/enviroment/cafe-light.png');
        this.load.image('shop-leave-arrow', 'assets/ui/leave-arrow.png');
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
        this.cafeDecor = createCafeDecor(this);
        this.colliders = getShopInteriorColliders(width, height);
        this.createPlayer(width / 2, height - 190, 'Player1');
        this.coffeeGameEntry = createCoffeeGameEntry(this, this.cafeDecor.gamePosition);
        this.residents = new Map(residents.filter(resident => resident.room === 'Cafe')
            .map(definition => [definition.id, new Resident(this, definition)]));
        this.exit = this.add.image(18, height - 18, 'shop-leave-arrow')
            .setOrigin(0, 1).setScale(2).setFlipX(true).setDepth(90).setScrollFactor(0)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 128, useHandCursor: true });
        this.exitOutline = addHoverOutline(this, this.exit);
        this.addButtonHover(this.exit, [this.exit, this.exitOutline]);
        this.exitPoint = { x: 90, y: height - 75 };
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
