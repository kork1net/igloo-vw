import { Scene } from 'phaser';
import { requestAccount, savedToken, saveToken } from '../network/Auth';
import registration from '../../../shared/registration.json';
import { getClothingItem } from '../items/Clothing';
import { createSnowOverlay } from '../ui/Snow';

export class MainMenu extends Scene {
    constructor() { super('MainMenu'); }

    create() {
        this.cameras.main.setBackgroundColor(0xd8f1ff);
        document.body.style.backgroundColor = '#d8f1ff';
        document.getElementById('game-container').style.backgroundColor = '#d8f1ff';

        const root = document.createElement('section');
        root.className = 'account-panel';
        root.dir = 'rtl';
        root.innerHTML = `
            <header><img class="account-logo" src="assets/logo.png" alt="IGLOO" /></header>
            <div class="account-tabs" role="tablist" aria-label="כניסה למשחק">
                <button type="button" role="tab" data-mode="login">התחברות</button>
                <button type="button" role="tab" data-mode="register">הרשמה</button>
            </div>
            <div class="account-layout"><form>
                <label>שם משתמש<input name="username" autocomplete="username" required
                    minlength="3" maxlength="20" placeholder="איך קוראים לכם באיגלו?" /></label>
                <label>סיסמה<input name="password" type="password" required
                    minlength="8" maxlength="128" /></label>
                <label class="account-confirm" hidden>אימות סיסמה<input name="confirm" type="password"
                    autocomplete="new-password" minlength="8" maxlength="128" /></label>
                <p class="account-hint"></p>
                <p class="account-status" role="status" aria-live="polite"></p>
                <button class="account-submit" type="submit"></button>
            </form>
            <aside class="registration-preview" hidden aria-label="תצוגה מקדימה של השחקן">
                <span class="registration-preview-title">השחקן שלכם</span>
                <div class="registration-avatar">
                    <canvas width="160" height="195" aria-label="הדמות בצבע שנבחר"></canvas>
                    <span class="registration-preview-name"></span>
                </div>
                <p>בחרו צבע</p>
                <div class="starter-colors" role="group" aria-label="צבעי פתיחה"></div>
                <fieldset class="registration-gender">
                    <legend>בחרו מגדר</legend>
                    <label><input type="radio" name="gender" value="male" checked /> זכר</label>
                    <label><input type="radio" name="gender" value="female" /> נקבה</label>
                </fieldset>
            </aside></div>`;
        // Keep form text at browser resolution, independent of the pixel-art zoom.
        const overlay = document.createElement('div');
        overlay.className = 'account-screen';
        overlay.append(root);
        createSnowOverlay(overlay);
        document.getElementById('game-container').append(overlay);
        const form = root.querySelector('form');
        const username = form.elements.username;
        const password = form.elements.password;
        const confirm = form.elements.confirm;
        const status = root.querySelector('.account-status');
        const submit = root.querySelector('.account-submit');
        const tabs = [...root.querySelectorAll('[data-mode]')];
        const controller = new AbortController();
        let active = true;
        let busy = false;
        let mode = 'login';
        let starterColor = registration.starterColors[0];
        const preview = root.querySelector('.registration-preview');
        const previewName = root.querySelector('.registration-preview-name');
        const canvas = preview.querySelector('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const image = new Image();
        const eyelashesImage = new Image();
        const genderControls = [...root.querySelectorAll('input[name="gender"]')];
        const selectedGender = () => genderControls.find(input => input.checked).value;
        const drawPreview = () => {
            if (!image.complete || !image.naturalWidth) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = false;
            context.drawImage(image, 0, 0, 64, 78, 0, 0, canvas.width, canvas.height);
            const tint = getClothingItem(starterColor)?.tint ?? 0xffffff;
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < pixels.data.length; i += 4) {
                pixels.data[i] *= ((tint >> 16) & 255) / 255;
                pixels.data[i + 1] *= ((tint >> 8) & 255) / 255;
                pixels.data[i + 2] *= (tint & 255) / 255;
            }
            context.putImageData(pixels, 0, 0);
            if (selectedGender() === 'female' && eyelashesImage.complete && eyelashesImage.naturalWidth) {
                context.drawImage(eyelashesImage, 0, 0, 64, 78, 0, 0, canvas.width, canvas.height);
            }
        };
        image.onload = drawPreview;
        image.src = 'assets/characters/player.png';
        eyelashesImage.onload = drawPreview;
        eyelashesImage.src = 'assets/characters/eyelashes.png';
        genderControls.forEach(input => input.addEventListener('change', drawPreview));
        const updatePreviewName = () => {
            previewName.textContent = username.value.normalize('NFKC').trim() || 'שם השחקן שלכם';
        };
        username.addEventListener('input', updatePreviewName);
        updatePreviewName();
        const colorButtons = registration.starterColors.map(id => {
            const item = getClothingItem(id);
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.starterColor = id;
            button.className = 'starter-color';
            button.title = item.name;
            button.setAttribute('aria-label', item.name);
            button.setAttribute('aria-pressed', String(id === starterColor));
            button.style.setProperty('--starter-color', `#${item.tint.toString(16).padStart(6, '0')}`);
            button.addEventListener('click', () => {
                starterColor = id;
                colorButtons.forEach(control => control.setAttribute('aria-pressed', String(control === button)));
                drawPreview();
            });
            root.querySelector('.starter-colors').append(button);
            return button;
        });

        const setBusy = value => {
            busy = value;
            root.setAttribute('aria-busy', String(value));
            for (const control of root.querySelectorAll('input, button')) control.disabled = value;
            confirm.disabled = value || mode !== 'register';
            submit.textContent = value ? 'מתחברים…' : mode === 'login' ? 'כניסה לעולם' : 'יצירת שחקן';
        };
        const setMode = value => {
            mode = value;
            root.dataset.mode = mode;
            const register = mode === 'register';
            preview.hidden = !register;
            for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
            root.querySelector('.account-confirm').hidden = !register;
            confirm.required = register;
            password.autocomplete = register ? 'new-password' : 'current-password';
            password.value = confirm.value = '';
            status.textContent = '';
            root.querySelector('.account-hint').textContent = register
                ? 'שם: 3–20 אותיות או ספרות, מקף או קו תחתון. סיסמה: לפחות 8 תווים.'
                : 'כבר נרשמתם? התחברו עם שם המשתמש והסיסמה שלכם.';
            setBusy(false);
        };
        const enterGame = result => {
            saveToken(result.token);
            this.registry.set('auth', result);
            this.registry.set('inventory', result.inventory);
            this.scene.start('Game');
        };
        tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
        root.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            if (this.sound.locked) this.sound.unlock();
            this.sound.play('wood-tap-ui');
        });
        root.addEventListener('keydown', event => event.stopPropagation());
        root.addEventListener('pointerdown', event => event.stopPropagation());
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy) return;
            if (mode === 'register' && password.value !== confirm.value) {
                status.textContent = 'הסיסמאות אינן תואמות.';
                return;
            }
            setBusy(true);
            status.textContent = '';
            try {
                const result = await requestAccount(mode, { username: username.value, password: password.value,
                    ...(mode === 'register' ? { starterColor, gender: selectedGender() } : {}) }, controller.signal);
                if (active) enterGame(result);
            } catch (error) {
                if (active) { status.textContent = error.message; setBusy(false); }
            }
        });
        this.events.once('shutdown', () => {
            active = false;
            controller.abort();
            image.onload = null;
            eyelashesImage.onload = null;
            password.value = confirm.value = '';
            overlay.remove();
        });
        setMode('login');
        const token = savedToken();
        if (token) {
            setBusy(true);
            requestAccount('resume', token, controller.signal).then(result => {
                if (active) enterGame(result);
            }).catch(error => {
                if (active) { saveToken(null); status.textContent = error.message; setBusy(false); }
            });
        }
    }
}
