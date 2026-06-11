import { Scene, TintModes, type GameObjects } from 'phaser';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';

// 遭遇 — 九尾 · 青丘之主
// 戰鬥設計(2026-06-12 user 拍板):獵妖師「自動出刀」,傷害完全來自數值
// (武器強化/裝備/寵物),點擊只發動技能(冷卻制)— 連點器無利可圖。
export class Encounter extends Scene {
    private hp = 0;
    private readonly maxHp = 6000;
    // M1 起這些值改由 武器強化+裝備+寵物 計算;這裡是定調版基準數值
    private readonly atk = 120;
    private readonly critRate = 0.2;
    private readonly critMult = 2.2;
    private readonly attackIntervalMs = 900;
    private readonly skillCooldownMs = 2500;

    private hpFill!: GameObjects.Rectangle;
    private fox!: GameObjects.Image;
    private hunter!: GameObjects.Image;
    private skillSeal!: GameObjects.Arc;
    private skillText!: GameObjects.Text;
    private foxBaseScale = 1;
    private foxHome = { x: 620, y: 760 };
    private hunterHome = { x: 280, y: 1330 };
    private skillReadyAt = 0;
    private striking = false;
    private slain = false;

    constructor() {
        super('Encounter');
    }

    create(): void {
        this.hp = this.maxHp;
        this.slain = false;
        this.striking = false;
        this.skillReadyAt = 0;

        // 1. 同幅山水為底,壓暗聚焦
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.55);

        // 2. 九尾(右上舞台,呼吸 / 尾擺)
        this.fox = this.add.image(this.foxHome.x, this.foxHome.y, 'beast_ninetails');
        this.foxBaseScale = 880 / this.fox.width;
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

        // 3. 獵妖師(左下前景,墨披風微擺,自動出刀)
        this.hunter = this.add.image(this.hunterHome.x, this.hunterHome.y, 'hunter');
        this.hunter.setScale(520 / this.hunter.height).setDepth(20).setAlpha(0);
        this.tweens.add({ targets: this.hunter, alpha: 1, duration: 700, ease: 'Sine.out' });
        this.tweens.add({
            targets: this.hunter, angle: -1.2, y: this.hunterHome.y - 6,
            duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });

        // 4. 名牌 + 血墨條
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

        // 5. 技能印「斬」(硃砂圓印,冷卻變淡)+ 提示 + 回卷首
        const sealY = 1700;
        this.skillSeal = this.add.circle(W / 2, sealY, 86, VERMILION, 0.92).setDepth(30);
        this.skillText = this.add.text(W / 2, sealY, '斬', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setDepth(31);

        this.add.text(W / 2, 1560, '獵妖師自動出刀 — 點「斬」發動技能', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 28, color: PAPER
        }).setOrigin(0.5).setAlpha(0.55);

        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7)
            .setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));

        // 技能熱區(大圓好按)
        const skillHit = this.add.circle(W / 2, sealY, 130, 0x000000, 0.001)
            .setDepth(32).setInteractive({ useHandCursor: true });
        skillHit.on('pointerdown', () => this.castSkill());

        // 6. 自動出刀 loop(傷害來自數值,不是手速)
        this.time.addEvent({
            delay: this.attackIntervalMs, loop: true, startAt: 300,
            callback: () => this.autoStrike()
        });
    }

    update(time: number): void {
        if (this.slain) return;
        const ready = time >= this.skillReadyAt;
        this.skillSeal.setAlpha(ready ? 0.92 : 0.28);
        this.skillText.setAlpha(ready ? 1 : 0.4);
    }

    private rollDamage(mult: number): { dmg: number; crit: boolean } {
        const crit = Math.random() < this.critRate;
        const base = this.atk * (0.85 + Math.random() * 0.3) * mult;
        return { dmg: Math.round(crit ? base * this.critMult : base), crit };
    }

    // 前衝 → 命中結算(僅一次)→ 回位
    // per Codex review:mult屬性 tween 的 onYoyo 每個 property 各觸發一次,
    // 結算必須放單發的 onComplete
    private lunge(dx: number, dy: number, durMs: number, onHit: () => void, onDone?: () => void): void {
        this.tweens.add({
            targets: this.hunter,
            x: this.hunterHome.x + dx, y: this.hunterHome.y + dy,
            duration: durMs, ease: 'Sine.out',
            onComplete: () => {
                onHit();
                this.tweens.add({
                    targets: this.hunter, x: this.hunterHome.x, y: this.hunterHome.y,
                    duration: durMs + 40, ease: 'Sine.in',
                    onComplete: () => { if (onDone) onDone(); }
                });
            }
        });
    }

    // 自動出刀:lunge 向九尾 → 刀光 + 結算 → 歸位
    private autoStrike(): void {
        if (this.slain || this.striking) return;
        this.striking = true;
        const { dmg, crit } = this.rollDamage(1);
        this.lunge(190, -70, 130,
            () => this.hitFox(dmg, crit, 1),
            () => { this.striking = false; });
    }

    // 技能「斬」:冷卻 2.5s,大刀光 2.5 倍傷害(主動操作層)
    private castSkill(): void {
        if (this.slain || this.time.now < this.skillReadyAt) return;
        this.skillReadyAt = this.time.now + this.skillCooldownMs;
        const { dmg, crit } = this.rollDamage(2.5);
        this.lunge(260, -110, 110, () => this.hitFox(dmg, crit, 1.7));
    }

    private hitFox(dmg: number, crit: boolean, slashScale: number): void {
        if (this.slain) return;

        // 刀光(墨筆斬擊,隨機角度)
        const slash = this.add.image(
            this.fox.x - 60 + (Math.random() - 0.5) * 120,
            this.fox.y + (Math.random() - 0.5) * 160,
            'slash'
        ).setDepth(40).setScale(0.4 * slashScale).setAlpha(0)
            .setAngle(-15 + (Math.random() - 0.5) * 30);
        this.tweens.add({
            targets: slash, alpha: 1, scale: 0.75 * slashScale,
            duration: 90, ease: 'Sine.out',
            onComplete: () => this.tweens.add({
                targets: slash, alpha: 0, scale: 0.85 * slashScale,
                duration: 220, onComplete: () => slash.destroy()
            })
        });

        // 受擊:白墨閃 + 縮擠 + 微退(Phaser 4.1 白閃 = setTint + TintModes.FILL)
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
            targets: this.fox, x: this.foxHome.x + 16,
            duration: 70, yoyo: true, ease: 'Sine.out'
        });
        if (crit) this.cameras.main.shake(70, 0.004);

        // 墨字傷害(暴擊硃砂大字,普通紙白)
        const px = this.fox.x + (Math.random() - 0.5) * 300;
        const py = this.fox.y - 120 + (Math.random() - 0.5) * 160;
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
