import { BaseRoom } from '../rooms/BaseRoom';

export class Shop extends BaseRoom {
    constructor() {
        super('Shop');
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;

        // Shop background
        this.cameras.main.setBackgroundColor(0xf3dfbf);
        document.body.style.backgroundColor = '#f3dfbf';
        document.getElementById('game-container').style.backgroundColor = '#f3dfbf';

        // Floor
        this.add.rectangle(
            width / 2, height / 2,
            width - 80, height - 80,
            0xd6ae80
        );

        // Room border
        this.add.rectangle(
            width / 2, height / 2,
            width - 80, height - 80
        )
        .setFillStyle()
        .setStrokeStyle(4, 0x9b704a)
        .setDepth(10);

        // Back wall
        this.add.rectangle(
            width / 2, 130,
            width - 80, 180,
            0xf7e9d3
        );

        // Shop title
        this.add.text(width / 2, 70, 'ITEM SHOP', {
            fontFamily: 'Rubik, Arial, sans-serif',
            fontSize: '36px',
            color: '#69452b'
        }).setOrigin(0.5);

        // Display shelves
        this.add.rectangle(200, 200, 180, 25, 0x865c3d);
        this.add.rectangle(width - 200, 200, 180, 25, 0x865c3d);

        // Display items
        this.add.circle(160, 175, 20, 0x4c9be8);
        this.add.circle(240, 175, 20, 0xffcc55);

        this.add.rectangle(width - 240, 175, 35, 35, 0xff7777);
        this.add.rectangle(width - 160, 175, 35, 35, 0x88cc88);

        // Create player
        this.createPlayer(
            width / 2,
            height - 150,
            'Player1'
        );
        const catalogButton = this.add.text(width / 2, 135, 'קטלוג פריטים', {
            fontFamily: 'Rubik, Arial, sans-serif', fontSize: '23px', color: '#ffffff',
            backgroundColor: '#3779a8', padding: { x: 22, y: 12 }
        }).setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true });
        this.addButtonHover(catalogButton);
        catalogButton.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            this.sound.play('wood-tap-ui');
            this.openShopCatalog();
        });

        // Exit door
        this.exit = this.add.rectangle(
            width / 2,
            height - 100,
            110,
            55,
            0x75523b
        ).setStrokeStyle(3, 0xffffff)
         .setInteractive({ useHandCursor: true });

        const exitLabel = this.add.text(width / 2, height - 100, 'EXIT', {
            fontFamily: 'Rubik, Arial, sans-serif',
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.addButtonHover(this.exit, [this.exit, exitLabel]);

        // Exit destination
        this.exitPoint = {
            x: width / 2,
            y: height - 130
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
