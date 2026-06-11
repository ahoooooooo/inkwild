// 坊市(M4):全服玩家自由交易獸材。掛單/瀏覽/購買,
// Firestore transaction 保證原子性(扣貨上架、扣銀交貨一體,杜絕複製),
// 5% 手續費 = 銀兩 sink。離線(未登入)時坊市唯讀不可交易。
import {
    getFirestore, collection, doc, query, where, orderBy, limit, getDocs,
    runTransaction, serverTimestamp, type Firestore
} from 'firebase/firestore';
import { CloudSave } from './CloudSave';
import { SaveService } from './SaveService';

export interface Listing {
    id: string;
    sellerUid: string;
    item: 'materials';      // M4 先開獸材交易;M5 擴武器/裝備
    amount: number;
    priceSilver: number;    // 總價
    status: 'open' | 'sold' | 'cancelled';
    createdAt: number;      // epoch ms(client 填,排序用)
}

const FEE_RATE = 0.05;
const MAX_OPEN_LISTINGS = 5;
const MAX_AMOUNT = 10000;
const MAX_PRICE = 1e9;

export type MarketResult =
    | { ok: true }
    | { ok: false; reason: string };

export class MarketService {
    private static _instance: MarketService | null = null;

    static get instance(): MarketService {
        if (!MarketService._instance) MarketService._instance = new MarketService();
        return MarketService._instance;
    }

    private get db(): Firestore | null {
        return CloudSave.instance.online ? getFirestore() : null;
    }

    private get uid(): string | null {
        return CloudSave.instance.uid;
    }

    // 瀏覽:最新 open 掛單(最多 30 筆)
    async browse(): Promise<Listing[]> {
        if (!this.db) return [];
        try {
            const q = query(
                collection(this.db, 'listings'),
                where('status', '==', 'open'),
                orderBy('createdAt', 'desc'),
                limit(30)
            );
            const snap = await getDocs(q);
            return snap.docs.map((d) => ({ ...(d.data() as Omit<Listing, 'id'>), id: d.id }));
        } catch (err: unknown) {
            void err;
            return [];
        }
    }

    // 上架:transaction 內扣獸材 + 建掛單(存檔權威在 Firestore saves/{uid})
    async list(amount: number, priceSilver: number): Promise<MarketResult> {
        const db = this.db;
        const uid = this.uid;
        if (!db || !uid) return { ok: false, reason: '未連線,無法交易' };
        if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
            return { ok: false, reason: '數量不合法' };
        }
        if (!Number.isInteger(priceSilver) || priceSilver <= 0 || priceSilver > MAX_PRICE) {
            return { ok: false, reason: '價格不合法' };
        }
        try {
            await runTransaction(db, async (tx) => {
                const saveRef = doc(db, 'saves', uid);
                const saveSnap = await tx.get(saveRef);
                const materials = (saveSnap.data()?.materials as number | undefined) ?? 0;
                if (materials < amount) throw new Error('獸材不足');
                // 同時最多 5 張掛單(防洗版;query 不能進 transaction,用計數 doc)
                const counterRef = doc(db, 'listingCounters', uid);
                const counterSnap = await tx.get(counterRef);
                const open = (counterSnap.data()?.open as number | undefined) ?? 0;
                if (open >= MAX_OPEN_LISTINGS) throw new Error(`同時最多 ${MAX_OPEN_LISTINGS} 張掛單`);

                const listingRef = doc(collection(db, 'listings'));
                tx.update(saveRef, { materials: materials - amount });
                tx.set(counterRef, { open: open + 1 }, { merge: true });
                tx.set(listingRef, {
                    sellerUid: uid,
                    item: 'materials',
                    amount,
                    priceSilver,
                    status: 'open',
                    createdAt: Date.now(),
                    serverTime: serverTimestamp()
                });
            });
            await this.refreshLocalFromCloud();
            return { ok: true };
        } catch (err: unknown) {
            return { ok: false, reason: err instanceof Error ? err.message : '交易失敗' };
        }
    }

    // 購買:transaction 內 扣買家銀兩 → 給買家獸材 → 給賣家銀兩(扣 5% 手續費)→ 關單
    async buy(listingId: string): Promise<MarketResult> {
        const db = this.db;
        const uid = this.uid;
        if (!db || !uid) return { ok: false, reason: '未連線,無法交易' };
        try {
            await runTransaction(db, async (tx) => {
                const listingRef = doc(db, 'listings', listingId);
                const listingSnap = await tx.get(listingRef);
                if (!listingSnap.exists()) throw new Error('掛單不存在');
                const l = listingSnap.data() as Omit<Listing, 'id'>;
                if (l.status !== 'open') throw new Error('已售出');
                if (l.sellerUid === uid) throw new Error('不能買自己的掛單');

                const buyerRef = doc(db, 'saves', uid);
                const buyerSnap = await tx.get(buyerRef);

                const buyerSilver = (buyerSnap.data()?.silver as number | undefined) ?? 0;
                const buyerMat = (buyerSnap.data()?.materials as number | undefined) ?? 0;
                if (buyerSilver < l.priceSilver) throw new Error('銀兩不足');

                // 免費層無 Cloud Functions:不能寫賣家存檔(規則只准本人)。
                // 改開 payout 單,賣家上線 claimPayouts() 自領(5% 手續費 sink)
                const payout = Math.floor(l.priceSilver * (1 - FEE_RATE));
                const payoutRef = doc(db, 'payouts', listingId);

                tx.update(buyerRef, {
                    silver: buyerSilver - l.priceSilver,
                    materials: Math.min(1e9, buyerMat + l.amount)
                });
                tx.update(listingRef, { status: 'sold', buyerUid: uid, soldAt: Date.now() });
                tx.set(payoutRef, {
                    sellerUid: l.sellerUid, silver: payout, listingId, createdAt: Date.now()
                });
            });
            await this.refreshLocalFromCloud();
            return { ok: true };
        } catch (err: unknown) {
            return { ok: false, reason: err instanceof Error ? err.message : '交易失敗' };
        }
    }

    // 下架自己的掛單:退回獸材
    async cancel(listingId: string): Promise<MarketResult> {
        const db = this.db;
        const uid = this.uid;
        if (!db || !uid) return { ok: false, reason: '未連線' };
        try {
            await runTransaction(db, async (tx) => {
                const listingRef = doc(db, 'listings', listingId);
                const listingSnap = await tx.get(listingRef);
                if (!listingSnap.exists()) throw new Error('掛單不存在');
                const l = listingSnap.data() as Omit<Listing, 'id'>;
                if (l.sellerUid !== uid) throw new Error('不是你的掛單');
                if (l.status !== 'open') throw new Error('已售出');

                const saveRef = doc(db, 'saves', uid);
                const counterRef = doc(db, 'listingCounters', uid);
                const saveSnap = await tx.get(saveRef);
                const counterSnap = await tx.get(counterRef);
                const materials = (saveSnap.data()?.materials as number | undefined) ?? 0;

                tx.update(saveRef, { materials: Math.min(1e9, materials + l.amount) });
                tx.update(listingRef, { status: 'cancelled' });
                const open = (counterSnap.data()?.open as number | undefined) ?? 1;
                tx.set(counterRef, { open: Math.max(0, open - 1) }, { merge: true });
            });
            await this.refreshLocalFromCloud();
            return { ok: true };
        } catch (err: unknown) {
            return { ok: false, reason: err instanceof Error ? err.message : '交易失敗' };
        }
    }

    // 賣家認領售出款項(上線時呼叫):transaction 內 入帳 + 刪單 + 減掛單計數
    async claimPayouts(): Promise<number> {
        const db = this.db;
        const uid = this.uid;
        if (!db || !uid) return 0;
        let claimed = 0;
        try {
            const q = query(collection(db, 'payouts'), where('sellerUid', '==', uid), limit(10));
            const snap = await getDocs(q);
            for (const p of snap.docs) {
                await runTransaction(db, async (tx) => {
                    const pSnap = await tx.get(doc(db, 'payouts', p.id));
                    if (!pSnap.exists()) return;
                    const silver = (pSnap.data()?.silver as number | undefined) ?? 0;
                    const saveRef = doc(db, 'saves', uid);
                    const counterRef = doc(db, 'listingCounters', uid);
                    const saveSnap = await tx.get(saveRef);
                    const counterSnap = await tx.get(counterRef);
                    const cur = (saveSnap.data()?.silver as number | undefined) ?? 0;
                    tx.update(saveRef, { silver: Math.min(1e9, cur + silver) });
                    tx.delete(doc(db, 'payouts', p.id));
                    const open = (counterSnap.data()?.open as number | undefined) ?? 1;
                    tx.set(counterRef, { open: Math.max(0, open - 1) }, { merge: true });
                    claimed += silver;
                });
            }
            if (claimed > 0) await this.refreshLocalFromCloud();
        } catch (err: unknown) {
            void err;
        }
        return claimed;
    }

    // 交易後雲端為準 → 同步回本地(雲端被 transaction 改過,updatedAt 蓋新)
    private async refreshLocalFromCloud(): Promise<void> {
        const remote = await CloudSave.instance.load();
        if (remote) {
            remote.updatedAt = Date.now();
            SaveService.instance.adoptCloud(remote);
        }
    }
}
