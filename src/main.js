import StartGame from './game/main';

document.addEventListener('DOMContentLoaded', async () => {

    // Canvas text must be created after both regular and bold font faces are ready.
    try {
        await Promise.all([
            document.fonts.load('400 16px Rubik'),
            document.fonts.load('700 16px Rubik')
        ]);
    } catch (error) {
        console.warn('Unable to load Rubik; using the fallback font.', error);
    }

    StartGame('game-container');

});
