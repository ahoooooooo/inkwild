import { CloudSave } from './CloudSave';

// 存檔:localStorage 即時 + Firestore 雲端(M3,debounce 同步;updatedAt 新者勝)
const KEY = 'inkwild_save_v1';

export interface SaveData {
    schemaVersion: number;
    silver: number;       // 銀兩
    materials: number;    // 獸材(妖骨)
    exp: number;
    hunterLevel: number;
    weaponLevel: number;  // 斷水 強化等級(無上限)
    armorLevel: number;   // 玄武鱗 強化等級(防禦 + 氣血)
    petLevel: number;     // 墨鶴 靈寵等級(攻擊加成)
    beastIndex: number;   // 已解鎖最遠異獸 index
    updatedAt: number;    // epoch ms,雲端衝突解決用(新者勝)
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
        armorLevel: 0,
        petLevel: 0,
        beastIndex: 0,
        updatedAt: 0
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
            armorLevel: int(d.armorLevel, 0, 999999, 0),
            petLevel: int(d.petLevel, 0, 999999, 0),
            beastIndex: int(d.beastIndex, 0, 999, 0),
            updatedAt: int(d.updatedAt, 0, 1e14, 0)
        };
    }

    private persist(): void {
        this.data.updatedAt = Date.now();
        this.persistLocal();
        CloudSave.instance.queueSave({ ...this.data });
    }

    private persistLocal(): void {
        try {
            localStorage.setItem(KEY, JSON.stringify(this.data));
        } catch (err: unknown) {
            void err;
        }
    }

    // 雲端存檔較新 → 採用(只寫本地,不回寫雲端避免 echo)
    adoptCloud(remote: SaveData): boolean {
        const clean = this.sanitize({ ...defaults(), ...remote });
        if (clean.updatedAt <= this.data.updatedAt) return false;
        this.data = clean;
        this.persistLocal();
        return true;
    }

    get(): Readonly<SaveData> {
        return this.data;
    }

    // 傷害數值唯一來源:武器強化 + 獵妖師等級 + 靈寵加成
    get atk(): number {
        const base = 50 + this.data.weaponLevel * 15 + (this.data.hunterLevel - 1) * 4;
        return Math.round(base * (1 + Math.min(this.data.petLevel, 10000) * 0.06));
    }

    // 防禦:玄武鱗(承傷減免,下限 1)
    get def(): number {
        return this.data.armorLevel * 3;
    }

    // 氣血:基礎 100 + 玄武鱗
    get maxHp(): number {
        return 100 + this.data.armorLevel * 8;
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

    // 指數在極端等級會溢位 Infinity(per Codex review)→ clamp 指數 + 成本上限。
    // 銀兩防腐上限 1e9,成本 cap 1e12 必然付不起但保持 finite 可顯示。
    private growthCost(level: number, baseSilver: number, baseMat: number, matSlope: number): { silver: number; materials: number } {
        return {
            silver: Math.min(1e12, Math.round(baseSilver * Math.pow(1.18, Math.min(level, 150)))),
            materials: Math.min(1e9, baseMat + Math.floor(level * matSlope))
        };
    }

    forgeCost(): { silver: number; materials: number } {
        return this.growthCost(this.data.weaponLevel, 40, 2, 0.8);
    }

    armorCost(): { silver: number; materials: number } {
        return this.growthCost(this.data.armorLevel, 30, 2, 0.7);
    }

    petCost(): { silver: number; materials: number } {
        return this.growthCost(this.data.petLevel, 60, 3, 1.0);
    }

    private trySpend(cost: { silver: number; materials: number }): boolean {
        if (this.data.silver < cost.silver || this.data.materials < cost.materials) {
            return false;
        }
        this.data.silver -= cost.silver;
        this.data.materials -= cost.materials;
        return true;
    }

    // 鍛打:扣材料 +1 級。回傳 false = 材料不足
    tryForge(): boolean {
        if (!this.trySpend(this.forgeCost())) return false;
        this.data.weaponLevel += 1;
        this.persist();
        return true;
    }

    tryArmor(): boolean {
        if (!this.trySpend(this.armorCost())) return false;
        this.data.armorLevel += 1;
        this.persist();
        return true;
    }

    tryPet(): boolean {
        if (!this.trySpend(this.petCost())) return false;
        this.data.petLevel += 1;
        this.persist();
        return true;
    }
}
