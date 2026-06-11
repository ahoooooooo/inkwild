import { Scene } from 'phaser';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const VERMILION = 0xb03a2e;

// 卷首 — 立軸山水 + 狂草 logo + 入山
export class Title extends Scene {
    private entering = false;

    constructor() {
        super('Title');
    }

    create(): void {
        this.entering = false;

        // 1. 立軸山水(緩慢推鏡,雲霧獸影)
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.tweens.add({
            targets: bg, scale: bg.scaleX * 1.05,
            duration: 16000, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });

        // 2. 金塵(微金箔屑緩升,低調)
        for (let i = 0; i < 14; i++) {
            const gx = 80 + Math.random() * (W - 160);
            const gy = 500 + Math.random() * 1200;
            const dust = this.add.circle(gx, gy, 1.5 + Math.random() * 2, 0xc9a227, 0.32);
            this.tweens.add({
                targets: dust,
                y: gy - 220 - Math.random() * 260,
                x: gx + (Math.random() - 0.5) * 90,
                alpha: 0,
                duration: 6000 + Math.random() * 4000,
                delay: Math.random() * 5000,
                repeat: -1,
                onRepeat: () => { dust.y = gy; dust.x = gx; dust.alpha = 0.32; }
            });
        }

        // 3. 狂草 logo — 墨韻浮現 + 微呼吸
        const logo = this.add.image(W / 2, 330, 'logo');
        logo.setScale(880 / logo.width);
        logo.setAlpha(0);
        this.tweens.add({ targets: logo, alpha: 1, y: 350, duration: 1100, ease: 'Sine.out' });
        this.tweens.add({
            targets: logo, scale: logo.scaleX * 1.01,
            duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 1100
        });

        // 4. 入山(極簡水墨式入口:字 + 硃砂線,不畫方塊按鈕)
        const enterY = 1560;
        const enter = this.add.text(W / 2, enterY, '入  山', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900',
            color: PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 12, false, true);
        enter.setAlpha(0);
        const line = this.add.rectangle(W / 2, enterY + 70, 250, 4, VERMILION, 0.95);
        line.setScale(0, 1);
        this.tweens.add({ targets: enter, alpha: 1, duration: 900, delay: 700, ease: 'Sine.out' });
        this.tweens.add({ targets: line, scaleX: 1, duration: 700, delay: 1000, ease: 'Sine.out' });
        this.tweens.add({
            targets: enter, alpha: 0.72,
            duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 1600
        });

        // 點擊範圍(透明大熱區,手機好按)
        const hit = this.add.rectangle(W / 2, enterY + 10, 560, 170, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.enterMountain());

        // 次要入口:工坊 / 坊市
        const goScene = (key: string) => () => {
            if (this.entering) return;
            this.entering = true;
            const veil = this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 1)
                .setDepth(100).setAlpha(0);
            this.tweens.add({
                targets: veil, alpha: 1, duration: 420, ease: 'Sine.in',
                onComplete: () => this.scene.start(key)
            });
        };
        const subEntries: Array<[string, string, number]> = [
            ['工 坊', 'Forge', W / 2 - 190],
            ['坊 市', 'Market', W / 2 + 190]
        ];
        for (const [label, key, x] of subEntries) {
            const t = this.add.text(x, enterY + 175, label, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 46, fontStyle: '700',
                color: PAPER
            }).setOrigin(0.5).setAlpha(0);
            this.tweens.add({ targets: t, alpha: 0.65, duration: 900, delay: 1100, ease: 'Sine.out' });
            const hit = this.add.rectangle(x, enterY + 175, 320, 110, 0x000000, 0.001)
                .setInteractive({ useHandCursor: true });
            hit.on('pointerdown', goScene(key));
        }

        // 5. 版本
        this.add.text(W / 2, H - 36, '定調版 v0.1 — 墨山海 INKWILD', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 22, color: PAPER
        }).setOrigin(0.5).setAlpha(0.45);
    }

    private enterMountain(): void {
        if (this.entering) return;
        this.entering = true;
        // 墨色淹沒轉場
        const veil = this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 1)
            .setDepth(100).setAlpha(0);
        this.tweens.add({
            targets: veil, alpha: 1, duration: 420, ease: 'Sine.in',
            onComplete: () => this.scene.start('Hunt')
        });
    }
}
