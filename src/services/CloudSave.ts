// 雲存檔(M3):Firebase 匿名登入 + Firestore。離線優先 — 任何失敗都
// 靜默退回 localStorage,遊戲永不因後端掛掉而壞。
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { SaveData } from './SaveService';

const SAVE_DEBOUNCE_MS = 2500;

export class CloudSave {
    private static _instance: CloudSave | null = null;
    private app: FirebaseApp | null = null;
    private auth: Auth | null = null;
    private db: Firestore | null = null;
    private _uid: string | null = null;
    private pending: SaveData | null = null;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    static get instance(): CloudSave {
        if (!CloudSave._instance) CloudSave._instance = new CloudSave();
        return CloudSave._instance;
    }

    get online(): boolean {
        return this._uid !== null;
    }

    get uid(): string | null {
        return this._uid;
    }

    // 啟動:有 config 才初始化;匿名登入失敗 = 離線模式
    async start(): Promise<void> {
        const apiKey = import.meta.env.VITE_FB_API_KEY as string | undefined;
        const projectId = import.meta.env.VITE_FB_PROJECT_ID as string | undefined;
        const authDomain = import.meta.env.VITE_FB_AUTH_DOMAIN as string | undefined;
        const appId = import.meta.env.VITE_FB_APP_ID as string | undefined;
        if (!apiKey || !projectId || !authDomain || !appId) return;
        try {
            this.app = initializeApp({ apiKey, projectId, authDomain, appId });
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app);
            await signInAnonymously(this.auth);
            this._uid = await new Promise<string | null>((resolve) => {
                const timeout = setTimeout(() => resolve(null), 4000);
                onAuthStateChanged(this.auth as Auth, (u) => {
                    if (u) {
                        clearTimeout(timeout);
                        resolve(u.uid);
                    }
                });
            });
        } catch (err: unknown) {
            void err; // auth 未啟用 / 斷網 → 離線模式
            this._uid = null;
        }
    }

    // 讀雲端存檔(無 / 失敗 → null)
    async load(): Promise<SaveData | null> {
        if (!this.db || !this._uid) return null;
        try {
            const snap = await getDoc(doc(this.db, 'saves', this._uid));
            if (!snap.exists()) return null;
            return snap.data() as SaveData;
        } catch (err: unknown) {
            void err;
            return null;
        }
    }

    // 寫雲端(debounce,合併連續 persist)
    queueSave(data: SaveData): void {
        if (!this.db || !this._uid) return;
        this.pending = data;
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => { void this.flush(); }, SAVE_DEBOUNCE_MS);
    }

    private async flush(): Promise<void> {
        if (!this.db || !this._uid || !this.pending) return;
        const data = this.pending;
        this.pending = null;
        try {
            await setDoc(doc(this.db, 'saves', this._uid), data, { merge: true });
        } catch (err: unknown) {
            void err; // 失敗就等下一次 persist 再試
        }
    }
}
