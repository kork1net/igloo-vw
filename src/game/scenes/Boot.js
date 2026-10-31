import { Scene } from 'phaser';
import { showLoadingScreen } from '../ui/LoadingScreen';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        showLoadingScreen(this);
        //  The Boot Scene is typically used to load in any assets you require for your Preloader, such as a game logo or background.
        //  The smaller the file size of the assets, the better, as the Boot Scene itself has no preloader.

        this.load.image('background', 'assets/bg.png');
        this.load.audio('wood-tap-ui', 'assets/ui/wood-tap-ui.mp3');
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
