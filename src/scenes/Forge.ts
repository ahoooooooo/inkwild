import { Scene, type GameObjects } from 'phaser';
import { SaveService } from '../services/SaveService';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';
const GOLD = 0xc9a227;

interface ForgeRow {
    nameY: number;
    level: GameObjects.Text;
    stat: GameObjects.Text;
    cost: GameObjects.Text;
}

// 工坊三鍛:斷水(攻)/ 玄武鱗(防+血)/ 墨鶴(靈寵攻成)— 全部無上限吃獸材+銀兩
export class Forge extends Scene {
    private silverText!: GameObjects.Text;
    private matText!: GameObjects.Text;
    private rows: ForgeRow[] = [];
    private forging = false;

    constructor() {
        super('Forge');
    }

    create(): void {
        this.forging = false;
        this.rows = [];
        const bg = this.add.image(W / 2, H / 2, 'forge_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.3);

        // 爐火金屑
        for (let i = 0; i < 10; i++) {
            const gx = 340 + Math.random() * 400;
            const gy = 1200 + Math.random() * 350;
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

        // 標題 + 資源
        this.add.text(W / 2, 160, '工  坊', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 72, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 10, false, true);
        this.add.rectangle(W / 2, 222, 180, 3, VERMILION, 0.9);
        this.silverText = this.add.text(W / 2 - 160, 290, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5);
        this.matText = this.add.text(W / 2 + 160, 290, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5);

        // 三鍛列
        this.buildRow(470, '斷 水', () => SaveService.instance.tryForge());
        this.buildRow(890, '玄武鱗', () => SaveService.instance.tryArmor());
        this.buildRow(1310, '墨 鶴', () => SaveService.instance.tryPet());

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

    private buildRow(y: number, name: string, tryUpgrade: () => boolean): void {
        // 列底:極簡墨匾(細線框)
        this.add.rectangle(W / 2 - 90, y + 60, 720, 320, 0x14110c, 0.55)
            .setStrokeStyle(2, 0xf3ead6, 0.18);
        this.add.text(180, y, name, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 64, fontStyle: '900', color: PAPER
        }).setOrigin(0, 0.5).setShadow(0, 3, '#14110c', 10, false, true);
        const level = this.add.text(620, y, '', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 40, fontStyle: '700', color: VERMILION_CSS
        }).setOrigin(0, 0.5);
        const stat = this.add.text(180, y + 70, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.9);
        const cost = this.add.text(180, y + 128, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 27, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.65);

        // 鍛印
        const sealX = W - 190;
        this.add.circle(sealX, y + 64, 72, VERMILION, 0.92);
        this.add.text(sealX, y + 64, '鍛', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 70, fontStyle: '900', color: PAPER
        }).setOrigin(0.5);
        const hit = this.add.circle(sealX, y + 64, 104, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.upgrade(sealX, y + 64, tryUpgrade));

        this.rows.push({ nameY: y, level, stat, cost });
    }

    private refresh(): void {
        const save = SaveService.instance;
        const d = save.get();
        this.silverText.setText(`銀兩 ${d.silver}`);
        this.matText.setText(`獸材 ${d.materials}`);

        const fc = save.forgeCost();
        this.rows[0].level.setText(`+${d.weaponLevel}`);
        this.rows[0].stat.setText(`攻 ${save.atk}  →  強化後更高`);
        this.rows[0].cost.setText(`獸材 ${fc.materials} · 銀兩 ${fc.silver}`);

        const ac = save.armorCost();
        this.rows[1].level.setText(`+${d.armorLevel}`);
        this.rows[1].stat.setText(`防 ${save.def} · 氣血 ${save.maxHp}`);
        this.rows[1].cost.setText(`獸材 ${ac.materials} · 銀兩 ${ac.silver}`);

        const pc = save.petCost();
        this.rows[2].level.setText(`+${d.petLevel}`);
        this.rows[2].stat.setText(`靈攻加成 +${d.petLevel * 6}%`);
        this.rows[2].cost.setText(`獸材 ${pc.materials} · 銀兩 ${pc.silver}`);
    }

    private upgrade(sx: number, sy: number, tryUpgrade: () => boolean): void {
        if (this.forging) return;
        if (!tryUpgrade()) {
            const toast = this.add.text(sx - 200, sy, '材料不足', {
                fontFamily: '"Noto Serif TC", serif', fontSize: 40, fontStyle: '700',
                color: PAPER, stroke: INK, strokeThickness: 5
            }).setOrigin(0.5).setAlpha(0.9).setDepth(50);
            this.tweens.add({
                targets: toast, alpha: 0, y: sy - 40, duration: 900,
                onComplete: () => toast.destroy()
            });
            this.cameras.main.shake(60, 0.003);
            return;
        }
        this.forging = true;
        this.cameras.main.shake(90, 0.005);
        for (let i = 0; i < 12; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 150;
            const spark = this.add.circle(sx, sy, 2 + Math.random() * 3,
                Math.random() < 0.5 ? GOLD : 0xd96a3a, 0.95).setDepth(50);
            this.tweens.add({
                targets: spark,
                x: sx + Math.cos(ang) * dist,
                y: sy + Math.sin(ang) * dist - 50,
                alpha: 0, duration: 450 + Math.random() * 250,
                ease: 'Sine.out', onComplete: () => spark.destroy()
            });
        }
        const pop = this.add.text(sx - 200, sy - 20, '+1', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 64, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(50).setScale(1.5).setAlpha(0);
        this.tweens.add({
            targets: pop, scale: 1, alpha: 1, duration: 220, ease: 'Back.out',
            onComplete: () => this.tweens.add({
                targets: pop, alpha: 0, y: sy - 70, duration: 550, delay: 300,
                onComplete: () => pop.destroy()
            })
        });
        this.refresh();
        this.time.delayedCall(300, () => { this.forging = false; });
    }
}
