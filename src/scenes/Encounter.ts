import { Scene, TintModes, type GameObjects, type Input } from 'phaser';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';

// 遭遇 — 九尾 · 青丘之主(戰鬥美學展示:整幅獸繪 + 傀儡式 tween,無人形逐幀)
export class Encounter extends Scene {
    private hp = 0;
    private readonly maxHp = 6000;
    private hpFill!: GameObjects.Rectangle;
    private fox!: GameObjects.Image;
    private foxBaseScale = 1;
    private slain = false;

    constructor() {
        super('Encounter');
    }

    create(): void {
        this.hp = this.maxHp;
        this.slain = false;

        // 1. 同幅山水為底,壓暗聚焦獸身
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.55);

        // 2. 九尾(墨繪整幅 + 呼吸 / 尾擺)
        this.fox = this.add.image(W / 2, 880, 'beast_ninetails');
        this.foxBaseScale = 980 / this.fox.width;
        this.fox.setScale(this.foxBaseScale * 0.92).setAlpha(0);
        this.tweens.add({
            targets: this.fox, alpha: 1, scale: this.foxBaseScale,
            duration: 900, ease: 'Sine.out'
        });
        this.tweens.add({
            targets: this.fox, scaleY: this.foxBaseScale * 1.018,
            duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 900
        });
        this.tweens.add({
            targets: this.fox, angle: 1.1,
            duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 900
        });

        // 3. 名牌 + 血墨條(細線,不畫粗框)
        this.add.text(W / 2, 170, '九尾 · 青丘之主', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 56, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 10, false, true);
        this.add.text(W / 2, 232, '卷一 · 霧隱青丘', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0.5).setAlpha(0.55);

        const barY = 290;
        this.add.rectangle(W / 2, barY, 720, 6, 0x14110c, 0.8);
        this.hpFill = this.add.rectangle(W / 2 - 360, barY, 720, 6, VERMILION, 0.95)
            .setOrigin(0, 0.5);

        // 4. 出刀提示 + 回卷首
        const hint = this.add.text(W / 2, 1640, '— 點 擊 出 刀 —', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 32, color: PAPER
        }).setOrigin(0.5).setAlpha(0.6);
        this.tweens.add({
            targets: hint, alpha: 0.25,
            duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });

        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7)
            .setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));

        // 5. 全畫面出刀熱區(名牌與返回鈕之下)
        const strikeZone = this.add.rectangle(W / 2, 1080, W, 1500, 0x000000, 0.001)
            .setInteractive();
        strikeZone.on('pointerdown', (p: Input.Pointer) => this.strike(p));
    }

    private strike(p: Input.Pointer): void {
        if (this.slain) return;

        const crit = Math.random() < 0.25;
        const dmg = crit
            ? 260 + Math.floor(Math.random() * 160)
            : 110 + Math.floor(Math.random() * 90);

        // 受擊:白墨閃 + 縮擠 + 微退
        // Phaser 4.1:setTintFill 已移除,白閃 = setTint + TintModes.FILL
        this.fox.setTint(0xf3ead6);
        this.fox.setTintMode(TintModes.FILL);
        this.time.delayedCall(70, () => {
            this.fox.clearTint();
            this.fox.setTintMode(TintModes.MULTIPLY);
        });
        this.tweens.add({
            targets: this.fox,
            scaleX: this.foxBaseScale * 1.05, scaleY: this.foxBaseScale * 0.95,
            duration: 80, yoyo: true, ease: 'Sine.out'
        });
        this.tweens.add({
            targets: this.fox, x: W / 2 - 14,
            duration: 70, yoyo: true, ease: 'Sine.out'
        });
        if (crit) this.cameras.main.shake(70, 0.004);

        // 墨字傷害(暴擊硃砂大字,普通紙白)
        const px = Math.min(Math.max(p.worldX, 160), W - 160);
        const py = Math.min(Math.max(p.worldY, 420), 1300);
        const popup = this.add.text(px, py, `${dmg}`, {
            fontFamily: '"Noto Serif TC", serif',
            fontSize: crit ? 88 : 56, fontStyle: '900',
            color: crit ? VERMILION_CSS : PAPER,
            stroke: INK, strokeThickness: crit ? 8 : 5
        }).setOrigin(0.5).setAngle((Math.random() - 0.5) * 14).setDepth(50);
        this.tweens.add({
            targets: popup, y: py - 110, alpha: 0,
            duration: 750, ease: 'Sine.out',
            onComplete: () => popup.destroy()
        });

        this.hp = Math.max(0, this.hp - dmg);
        this.hpFill.scaleX = this.hp / this.maxHp;
        if (this.hp <= 0) this.slay();
    }

    private slay(): void {
        this.slain = true;
        this.tweens.add({
            targets: this.fox, alpha: 0.14, duration: 1100, ease: 'Sine.in'
        });

        // 「討伐 · 完」硃砂印落款
        const seal = this.add.text(W / 2, 880, '討伐 · 完', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 110, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(60).setScale(2.2).setAlpha(0);
        this.tweens.add({
            targets: seal, scale: 1, alpha: 1, duration: 380, ease: 'Back.out'
        });
        this.cameras.main.shake(120, 0.005);

        const again = this.add.text(W / 2, 1100, '再 戰', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 54, fontStyle: '700', color: PAPER
        }).setOrigin(0.5).setDepth(60).setAlpha(0)
            .setInteractive({ useHandCursor: true });
        again.on('pointerdown', () => this.scene.restart());
        this.tweens.add({ targets: again, alpha: 0.9, duration: 600, delay: 700 });
    }
}
