
import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { Shop } from './scenes/Shop';
import { Cafe } from './scenes/Cafe';
import { GameOver } from './scenes/GameOver';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';
import { AUTO, Game, Scale } from 'phaser';
import { installFullscreen } from './ui/Fullscreen';
import { restoreVolume } from './ui/Settings';

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
        Cafe,
        GameOver
    ]
};

const StartGame = (parent) => {
    const game = new Game({ ...config, parent });

    let removeFullscreen;
    game.events.once('ready', () => {
        restoreVolume(game.sound);
        removeFullscreen = installFullscreen(game, config);
    });

    game.events.once('destroy', () => {
        removeFullscreen?.();
    });

    return game;
};

export default StartGame;
