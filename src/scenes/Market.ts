import { Scene, type GameObjects } from 'phaser';
import { SaveService } from '../services/SaveService';
import { MarketService, type Listing } from '../services/MarketService';
import { CloudSave } from '../services/CloudSave';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';

// 坊市 — 全服獸材交易(M4)。掛單瀏覽/購入/上架/下架;離線唯讀。
export class Market extends Scene {
    private resText!: GameObjects.Text;
    private statusText!: GameObjects.Text;
    private rowsGroup: GameObjects.GameObject[] = [];
    private busy = false;

    constructor() {
        super('Market');
    }

    create(): void {
        this.busy = false;
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.68);

        this.add.text(W / 2, 160, '坊  市', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 72, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 10, false, true);
        this.add.rectangle(W / 2, 222, 180, 3, VERMILION, 0.9);

        this.resText = this.add.text(W / 2, 290, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5);
        this.statusText = this.add.text(W / 2, 348, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0.5).setAlpha(0.6);

        // 上架(預設兩檔,M5 再做自訂量價)
        this.makeAction(W / 2 - 250, 470, '上架 獸材×10 · 100 銀', () => this.doList(10, 100));
        this.makeAction(W / 2 + 250, 470, '上架 獸材×50 · 450 銀', () => this.doList(50, 450));

        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));

        this.refreshHud();
        void this.boot();
    }

    private async boot(): Promise<void> {
        if (!CloudSave.instance.online) {
            this.statusText.setText('未連線 — 雲端服務未啟用,坊市暫不可交易');
            return;
        }
        const claimed = await MarketService.instance.claimPayouts();
        if (claimed > 0) {
            this.toast(`售出入帳 +${claimed} 銀`);
            this.refreshHud();
        }
        await this.refreshListings();
    }

    private refreshHud(): void {
        const d = SaveService.instance.get();
        this.resText.setText(`銀兩 ${d.silver} · 獸材 ${d.materials}`);
    }

    private makeAction(x: number, y: number, label: string, act: () => void): void {
        const t = this.add.text(x, y, label, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 34, fontStyle: '700', color: PAPER
        }).setOrigin(0.5).setAlpha(0.9).setInteractive({ useHandCursor: true });
        this.add.rectangle(x, y + 38, 200, 3, VERMILION, 0.8);
        t.on('pointerdown', act);
    }

    private async refreshListings(): Promise<void> {
        for (const o of this.rowsGroup) o.destroy();
        this.rowsGroup = [];
        const listings = await MarketService.instance.browse();
        if (listings.length === 0) {
            const empty = this.add.text(W / 2, 900, '— 坊市無人擺攤 —', {
                fontFamily: '"Noto Sans TC", sans-serif', fontSize: 32, color: PAPER
            }).setOrigin(0.5).setAlpha(0.5);
            this.rowsGroup.push(empty);
            return;
        }
        const myUid = CloudSave.instance.uid;
        listings.slice(0, 8).forEach((l, i) => {
            const y = 640 + i * 150;
            const box = this.add.rectangle(W / 2, y, 880, 120, 0x14110c, 0.7)
                .setStrokeStyle(2, 0xf3ead6, 0.18);
            const mine = l.sellerUid === myUid;
            const label = this.add.text(140, y, `獸材 ×${l.amount}`, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 38, fontStyle: '700', color: PAPER
            }).setOrigin(0, 0.5);
            const price = this.add.text(520, y, `${l.priceSilver} 銀`, {
                fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: VERMILION_CSS
            }).setOrigin(0, 0.5);
            const actLabel = mine ? '下 架' : '購 入';
            const act = this.add.text(W - 150, y, actLabel, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 38, fontStyle: '900',
                color: mine ? PAPER : VERMILION_CSS, stroke: INK, strokeThickness: 3
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            act.on('pointerdown', () => {
                if (mine) void this.doCancel(l);
                else void this.doBuy(l);
            });
            this.rowsGroup.push(box, label, price, act);
        });
    }

    private async doList(amount: number, price: number): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        const r = await MarketService.instance.list(amount, price);
        this.toast(r.ok ? '已上架' : r.reason);
        this.refreshHud();
        await this.refreshListings();
        this.busy = false;
    }

    private async doBuy(l: Listing): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        const r = await MarketService.instance.buy(l.id);
        this.toast(r.ok ? `購入 獸材×${l.amount}` : r.reason);
        this.refreshHud();
        await this.refreshListings();
        this.busy = false;
    }

    private async doCancel(l: Listing): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        const r = await MarketService.instance.cancel(l.id);
        this.toast(r.ok ? '已下架,獸材退回' : r.reason);
        this.refreshHud();
        await this.refreshListings();
        this.busy = false;
    }

    private toast(msg: string): void {
        const t = this.add.text(W / 2, 540, msg, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 40, fontStyle: '700',
            color: PAPER, stroke: INK, strokeThickness: 5
        }).setOrigin(0.5).setDepth(50).setAlpha(0.95);
        this.tweens.add({
            targets: t, alpha: 0, y: 505, duration: 1100, delay: 400,
            onComplete: () => t.destroy()
        });
    }
}
