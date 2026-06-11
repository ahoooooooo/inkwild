// 存檔(M1 localStorage;M3 換 Firestore 為唯一權威)
const KEY = 'inkwild_save_v1';

export interface SaveData {
    schemaVersion: number;
    silver: number;       // 銀兩
    materials: number;    // 獸材(妖骨)
    exp: number;
    hunterLevel: number;
    weaponLevel: number;  // 斷水 強化等級(無上限)
    beastIndex: number;   // 已解鎖最遠異獸 index
}

export interface LootResult {
    silver: number;
    materials: number;
    exp: number;
    leveledTo: number | null;
}

function defaults(): SaveData {
    return {
        schemaVersion: 1,
        silver: 0,
        materials: 0,
        exp: 0,
        hunterLevel: 1,
        weaponLevel: 0,
        beastIndex: 0
    };
}

export function expToNext(level: number): number {
    return Math.round(80 * Math.pow(level, 1.5));
}

export class SaveService {
    private static _instance: SaveService | null = null;
    private data: SaveData;

    static get instance(): SaveService {
        if (!SaveService._instance) SaveService._instance = new SaveService();
        return SaveService._instance;
    }

    private constructor() {
        this.data = this.load();
    }

    private load(): SaveData {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return defaults();
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) return defaults();
            return this.sanitize({ ...defaults(), ...(parsed as Partial<SaveData>) });
        } catch (err: unknown) {
            void err; // localStorage 不可用(隱私模式等)→ 純記憶體模式
            return defaults();
        }
    }

    // 腐敗存檔防護(per Codex review):非有限數 / 負數 / 小數 / 天文數字一律校正,
    // 避免 NaN/Infinity 污染 ATK、addLoot 升級迴圈卡死
    private sanitize(d: SaveData): SaveData {
        const int = (v: unknown, min: number, max: number, fallback: number): number => {
            const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
            return Math.min(max, Math.max(min, n));
        };
        const RES_MAX = 1e9; // 防腐上限(非玩法上限)
        return {
            schemaVersion: int(d.schemaVersion, 1, 100, 1),
            silver: int(d.silver, 0, RES_MAX, 0),
            materials: int(d.materials, 0, RES_MAX, 0),
            exp: int(d.exp, 0, RES_MAX, 0),
            hunterLevel: int(d.hunterLevel, 1, 99999, 1),
            weaponLevel: int(d.weaponLevel, 0, 999999, 0),
            beastIndex: int(d.beastIndex, 0, 999, 0)
        };
    }

    private persist(): void {
        try {
            localStorage.setItem(KEY, JSON.stringify(this.data));
        } catch (err: unknown) {
            void err;
        }
    }

    get(): Readonly<SaveData> {
        return this.data;
    }

    // 傷害數值唯一來源:武器強化 + 獵妖師等級(M2 加裝備/寵物)
    get atk(): number {
        return 50 + this.data.weaponLevel * 15 + (this.data.hunterLevel - 1) * 4;
    }

    addLoot(silver: number, materials: number, exp: number): LootResult {
        this.data.silver += silver;
        this.data.materials += materials;
        this.data.exp += exp;
        let leveledTo: number | null = null;
        while (
            Number.isFinite(this.data.exp) &&
            expToNext(this.data.hunterLevel) > 0 &&
            this.data.exp >= expToNext(this.data.hunterLevel)
        ) {
            this.data.exp -= expToNext(this.data.hunterLevel);
            this.data.hunterLevel += 1;
            leveledTo = this.data.hunterLevel;
        }
        this.persist();
        return { silver, materials, exp, leveledTo };
    }

    unlockBeast(index: number): void {
        if (index > this.data.beastIndex) {
            this.data.beastIndex = index;
            this.persist();
        }
    }

    forgeCost(): { silver: number; materials: number } {
        const l = this.data.weaponLevel;
        // 指數在極端等級會溢位 Infinity(per Codex review)→ clamp 指數 + 成本上限。
        // 銀兩防腐上限 1e9,成本 cap 1e12 必然付不起但保持 finite 可顯示。
        const silver = Math.min(1e12, Math.round(40 * Math.pow(1.18, Math.min(l, 150))));
        return {
            silver,
            materials: Math.min(1e9, 2 + Math.floor(l * 0.8))
        };
    }

    // 鍛打:扣材料 +1 級。回傳 false = 材料不足
    tryForge(): boolean {
        const cost = this.forgeCost();
        if (this.data.silver < cost.silver || this.data.materials < cost.materials) {
            return false;
        }
        this.data.silver -= cost.silver;
        this.data.materials -= cost.materials;
        this.data.weaponLevel += 1;
        this.persist();
        return true;
    }
}
