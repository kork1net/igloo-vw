import { BaseRoom } from '../rooms/BaseRoom';
import { residents } from '../residents/residents';
import { Resident } from '../objects/Resident';
import { addHoverOutline } from '../ui/HoverOutline';
import { setWorldDepth } from '../objects/WorldDepth';
import { createShopDecor } from '../objects/ShopDecor';
import { getShopInteriorColliders } from '../../../shared/collision';

export class Shop extends BaseRoom {
    constructor() {
        super('Shop');
    }

    preload() {
        super.preload();
        this.load.image('shop-interior-background', 'assets/enviroment/shop-interior-background-simple.png');
        this.load.image('shop-clothing-rack', 'assets/enviroment/shop-clothing-rack-simple.png');
        this.load.image('shop-wall-shelf', 'assets/enviroment/shop-wall-shelf-v4.png');
        this.load.image('shop-table', 'assets/enviroment/shop-table.png');
        this.load.image('hair-stand', 'assets/enviroment/hair-stand.png');
        this.load.image('color-buckets', 'assets/enviroment/color-buckets.png');
        this.load.image('shop-window', 'assets/enviroment/window-shop.png');
        this.load.image('shop-leave-arrow', 'assets/ui/leave-arrow.png');
        if (!this.cache.audio.exists('shop-music')) {
            this.load.audio('shop-music', 'sfx/shop-sfx.mp3');
        }
        for (const resident of residents.filter(resident => resident.room === 'Shop')) {
            if (!this.textures.exists(resident.texture)) this.load.image(resident.texture, resident.image);
        }
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;

        const music = this.sound.add('shop-music', { loop: true, volume: 0.2 });
        const playMusic = () => music.play();
        if (this.sound.locked) this.sound.once('unlocked', playMusic);
        else playMusic();
        this.events.once('shutdown', () => {
            this.sound.off('unlocked', playMusic);
            music.destroy();
        });

        // Shop background
        this.cameras.main.setBackgroundColor(0xf3dfbf);
        document.body.style.backgroundColor = '#f3dfbf';
        document.getElementById('game-container').style.backgroundColor = '#f3dfbf';

        const background = this.add.image(width / 2, height / 2, 'shop-interior-background').setDepth(-1);
        // Fill the room while preserving the artwork's original proportions.
        background.setScale(Math.max(width / background.width, height / background.height));
        // Darken only the painted wall, above the wooden baseboard at source y=256.
        this.add.image(background.x, background.y, 'shop-interior-background')
            .setScale(background.scaleX).setCrop(0, 0, background.width, 256)
            .setTint(0xd9c6a8).setDepth(-0.75);
        this.shopDecor = createShopDecor(this);
        this.colliders = getShopInteriorColliders(width, height);

        // Create player
        this.createPlayer(
            width / 2,
            height - 150,
            'Player1'
        );
        this.residents = new Map(residents.filter(resident => resident.room === 'Shop')
            .map(definition => [definition.id, new Resident(this, definition)]));
        const rackX = width * 0.65, rackY = height * 0.47;
        this.add.ellipse(rackX, rackY - 3, 295, 24, 0x62452d, 0.18).setDepth(0);
        this.clothingRack = this.add.image(rackX, rackY, 'shop-clothing-rack')
            .setOrigin(0.5, 1);
        this.clothingRack.setScale(330 / this.clothingRack.width)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 128, useHandCursor: true });
        setWorldDepth(this.clothingRack, rackY, height);
        this.clothingRackOutline = addHoverOutline(this, this.clothingRack);
        this.addButtonHover(this.clothingRack, [this.clothingRack, this.clothingRackOutline]);
        this.clothingRack.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('wood-tap-ui');
            this.openShopCatalog();
        });
        const standPosition = this.shopDecor.hairStandPosition;
        this.add.ellipse(standPosition.x, standPosition.y - 1, 90, 10, 0x62452d, 0.15)
            .setDepth(this.shopDecor.table.depth + 0.005);
        this.hairStand = this.add.image(standPosition.x, standPosition.y, 'hair-stand')
            .setOrigin(0.5, 1).setScale(0.44)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 128, useHandCursor: true });
        this.hairStand.setDepth(this.shopDecor.table.depth + 0.01);
        this.hairStandOutline = addHoverOutline(this, this.hairStand);
        this.addButtonHover(this.hairStand, [this.hairStand, this.hairStandOutline]);
        this.hairStand.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('wood-tap-ui');
            this.openShopCatalog('hair');
        });

        const colorsX = width * 0.82, colorsY = height * 0.70;
        this.colorBucketsShadow = this.add.ellipse(colorsX, colorsY - 6, 228, 20, 0x62452d, 0.18)
            .setDepth(0);
        this.colorBuckets = this.add.image(colorsX, colorsY, 'color-buckets').setOrigin(0.5, 1);
        this.colorBuckets.setScale(215 / this.colorBuckets.width)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 128, useHandCursor: true });
        setWorldDepth(this.colorBuckets, colorsY, height);
        this.colorBucketsOutline = addHoverOutline(this, this.colorBuckets);
        this.addButtonHover(this.colorBuckets, [this.colorBuckets, this.colorBucketsOutline]);
        this.colorBuckets.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('wood-tap-ui');
            this.openShopCatalog('colors');
        });

        this.exit = this.add.image(width - 18, height - 18, 'shop-leave-arrow')
            .setOrigin(1, 1).setScale(2).setDepth(90).setScrollFactor(0)
            .setInteractive({ pixelPerfect: true, alphaTolerance: 128, useHandCursor: true });
        this.exitOutline = addHoverOutline(this, this.exit);
        this.addButtonHover(this.exit, [this.exit, this.exitOutline]);

        // Exit destination
        this.exitPoint = {
            x: width - 90,
            y: height - 75
        };
        this.lastExitClickTime = -Infinity;

        this.exit.on('pointerdown', () => {
            const now = this.time.now;

            const doubleClick =
                now - this.lastExitClickTime <= 300;

            this.lastExitClickTime = doubleClick
                ? -Infinity
                : now;

            this.moveToRoom(
                'Game',
                this.exitPoint.x,
                this.exitPoint.y,
                doubleClick
            );

            this.pendingExit = true;
        });

        
    }

    update(time, delta) {
        this.updateRoom(delta);
    }
}
