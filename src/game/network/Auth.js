import { io } from 'socket.io-client';

export const SERVER_URL = 'http://localhost:3001';
const TOKEN_KEY = 'vw.session';
export function savedToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveToken(token) {
    try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* Login still works when browser storage is unavailable. */ }
}

export function requestAccount(action, data, signal) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER_URL, { auth: { account: true }, reconnection: false, timeout: 5000 });
        let finished = false;
        const finish = (error, result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            socket.disconnect();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new Error('הפעולה בוטלה.'));
        const timer = setTimeout(() => finish(new Error('לא התקבלה תשובה מהשרת. נסו שוב.')), 10000);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        socket.once('connect_error', () => finish(new Error('לא ניתן להתחבר לשרת המשחק.')));
        socket.once('connect', () => {
            socket.emit(`auth:${action}`, data, result => {
                if (!result?.ok) finish(new Error(result?.error || 'הפעולה נכשלה.'));
                else finish(null, result);
            });
        });
    });
}
