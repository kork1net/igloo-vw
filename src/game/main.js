
import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { Shop } from './scenes/Shop';
import { GameOver } from './scenes/GameOver';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';
import { AUTO, Game, Scale } from 'phaser';

const config = {
    type: AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#d8f1ff',

    pixelArt: true,
    roundPixels: true,
    antialias: false,
    antialiasGL: false,

    scale: {
        mode: Scale.NONE,
        autoCenter: Scale.CENTER_BOTH
    },

    // Enable HTML elements inside Phaser (chat input)
    dom: {
        createContainer: true
    },

    scene: [
        Boot,
        Preloader,
        MainMenu,
        MainGame,
        Shop,
        GameOver
    ]
};

const StartGame = (parent) => {
    const game = new Game({ ...config, parent });

    function updateCanvasDisplay() {
        const canvas = game.canvas;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;

        const maxScale = Math.min(
            window.innerWidth * dpr / config.width,
            window.innerHeight * dpr / config.height
        );

        // 1 = maximum sharpness
        // 0 = maximum screen coverage
        const sharpness = 1;

        const pixelPerfectScale =
            maxScale >= 1
                ? Math.floor(maxScale)
                : 1 / Math.ceil(1 / maxScale);

        const physicalScale =
            pixelPerfectScale +
            (maxScale - pixelPerfectScale) * (1 - sharpness);

        game.scale.setZoom(physicalScale / dpr);
    }

    game.events.once('ready', () => {
        updateCanvasDisplay();
        window.addEventListener('resize', updateCanvasDisplay);
    });

    game.events.once('destroy', () => {
        window.removeEventListener('resize', updateCanvasDisplay);
    });

    return game;
};

export default StartGame;
