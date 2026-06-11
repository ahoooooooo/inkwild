import { Scene, type GameObjects } from 'phaser';
import { SaveService } from '../services/SaveService';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';
const GOLD = 0xc9a227;

// 鍛兵 — 武器「斷水」無上限強化,吃獸材+銀兩,ATK 真實變大
export class Forge extends Scene {
    private silverText!: GameObjects.Text;
    private matText!: GameObjects.Text;
    private levelText!: GameObjects.Text;
    private atkText!: GameObjects.Text;
    private costText!: GameObjects.Text;
    private forging = false;

    constructor() {
        super('Forge');
    }

    create(): void {
        this.forging = false;
        const bg = this.add.image(W / 2, H / 2, 'forge_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));

        // 爐火金屑(緩升)
        for (let i = 0; i < 10; i++) {
            const gx = 340 + Math.random() * 400;
            const gy = 1150 + Math.random() * 350;
            const spark = this.add.circle(gx, gy, 1.5 + Math.random() * 2.5, GOLD, 0.5);
            this.tweens.add({
                targets: spark,
                y: gy - 260 - Math.random() * 240,
                x: gx + (Math.random() - 0.5) * 80,
                alpha: 0,
                duration: 3200 + Math.random() * 2600,
                delay: Math.random() * 3000,
                repeat: -1,
                onRepeat: () => { spark.y = gy; spark.x = gx; spark.alpha = 0.5; }
            });
        }

        // 標題
        this.add.text(W / 2, 170, '鍛  兵', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 72, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 10, false, true);
        this.add.rectangle(W / 2, 232, 180, 3, VERMILION, 0.9);

        // 資源列
        this.silverText = this.add.text(W / 2 - 160, 310, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5);
        this.matText = this.add.text(W / 2 + 160, 310, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5);

        // 武器銘 + 數值
        this.add.text(W / 2, 560, '斷 水', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 110, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setShadow(0, 4, '#14110c', 14, false, true);
        this.levelText = this.add.text(W / 2, 668, '', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 44, fontStyle: '700', color: VERMILION_CSS
        }).setOrigin(0.5);
        this.atkText = this.add.text(W / 2, 760, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 36, color: PAPER
        }).setOrigin(0.5);
        this.costText = this.add.text(W / 2, 1180, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 32, color: PAPER
        }).setOrigin(0.5).setAlpha(0.85);

        // 鍛打印
        const sealY = 1430;
        this.add.circle(W / 2, sealY, 96, VERMILION, 0.92);
        this.add.text(W / 2, sealY, '鍛', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 96, fontStyle: '900', color: PAPER
        }).setOrigin(0.5);
        const hit = this.add.circle(W / 2, sealY, 140, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.forge());

        // 導覽
        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));
        const hunt = this.add.text(W - 90, 110, '入山 〉', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        hunt.on('pointerdown', () => this.scene.start('Encounter'));

        this.refresh();
    }

    private refresh(): void {
        const save = SaveService.instance;
        const d = save.get();
        const cost = save.forgeCost();
        this.silverText.setText(`銀兩 ${d.silver}`);
        this.matText.setText(`獸材 ${d.materials}`);
        this.levelText.setText(`強化 +${d.weaponLevel}`);
        this.atkText.setText(`攻 ${save.atk}  →  ${save.atk + 15}`);
        this.costText.setText(`鍛打需:獸材 ${cost.materials} · 銀兩 ${cost.silver}`);
    }

    private forge(): void {
        if (this.forging) return;
        const ok = SaveService.instance.tryForge();
        if (!ok) {
            // 材料不足:墨字提示
            const toast = this.add.text(W / 2, 1010, '材料不足', {
                fontFamily: '"Noto Serif TC", serif', fontSize: 48, fontStyle: '700',
                color: PAPER, stroke: INK, strokeThickness: 5
            }).setOrigin(0.5).setAlpha(0.9);
            this.tweens.add({
                targets: toast, alpha: 0, y: 970, duration: 900,
                onComplete: () => toast.destroy()
            });
            this.cameras.main.shake(60, 0.003);
            return;
        }
        this.forging = true;
        // 成功:金火迸發 + 攻擊力躍升墨字
        this.cameras.main.shake(90, 0.005);
        for (let i = 0; i < 14; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 70 + Math.random() * 180;
            const spark = this.add.circle(W / 2, 1430, 2 + Math.random() * 3,
                Math.random() < 0.5 ? GOLD : 0xd96a3a, 0.95).setDepth(50);
            this.tweens.add({
                targets: spark,
                x: W / 2 + Math.cos(ang) * dist,
                y: 1430 + Math.sin(ang) * dist - 60,
                alpha: 0, duration: 480 + Math.random() * 280,
                ease: 'Sine.out', onComplete: () => spark.destroy()
            });
        }
        const pop = this.add.text(W / 2, 880, '攻 +15', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 7
        }).setOrigin(0.5).setDepth(50).setScale(1.6).setAlpha(0);
        this.tweens.add({
            targets: pop, scale: 1, alpha: 1, duration: 240, ease: 'Back.out',
            onComplete: () => this.tweens.add({
                targets: pop, alpha: 0, y: 830, duration: 600, delay: 350,
                onComplete: () => pop.destroy()
            })
        });
        this.refresh();
        this.time.delayedCall(320, () => { this.forging = false; });
    }
}
