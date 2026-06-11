import { Scene, TintModes, type GameObjects } from 'phaser';
import { SaveService } from '../services/SaveService';
import { BEASTS, type BeastDef } from '../data/beasts';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';

// 遭遇 — 獵妖師自動出刀(傷害只來自數值:武器強化+等級,M2 加裝備/寵物),
// 點擊只發動冷卻制技能「斬」— 連點器無利可圖(2026-06-12 user 拍板)
export class Encounter extends Scene {
    private beast!: BeastDef;
    private beastIdx = 0;
    private hp = 0;
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

    init(data: { beastIdx?: number }): void {
        const save = SaveService.instance.get();
        const requested = data.beastIdx ?? save.beastIndex;
        this.beastIdx = Math.max(0, Math.min(requested, BEASTS.length - 1, save.beastIndex));
        this.beast = BEASTS[this.beastIdx];
    }

    create(): void {
        this.hp = this.beast.maxHp;
        this.slain = false;
        this.striking = false;
        this.skillReadyAt = 0;
        this.foxHome = { x: 620, y: this.beast.y };

        // 1. 立軸山水為底,壓暗聚焦
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.55);

        // 2. 異獸(呼吸 / 尾擺;赤目妖狐 = 硃砂染目變體)
        this.fox = this.add.image(this.foxHome.x, this.foxHome.y, this.beast.texture);
        this.foxBaseScale = this.beast.displayWidth / this.fox.width;
        if (this.beast.id === 'foxling_red') this.fox.setTint(0xd9a090);
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

        // 3. 獵妖師
        this.hunter = this.add.image(this.hunterHome.x, this.hunterHome.y, 'hunter');
        this.hunter.setScale(520 / this.hunter.height).setDepth(20).setAlpha(0);
        this.tweens.add({ targets: this.hunter, alpha: 1, duration: 700, ease: 'Sine.out' });
        this.tweens.add({
            targets: this.hunter, angle: -1.2,
            duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });

        // 4. 名牌 + 血墨條
        this.add.text(W / 2, 170, this.beast.name, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 56, fontStyle: '900',
            color: this.beast.boss ? VERMILION_CSS : PAPER
        }).setOrigin(0.5).setShadow(0, 3, '#14110c', 10, false, true);
        this.add.text(W / 2, 232, this.beast.sub, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0.5).setAlpha(0.55);

        const barY = 290;
        this.add.rectangle(W / 2, barY, 720, 6, 0x14110c, 0.8);
        this.hpFill = this.add.rectangle(W / 2 - 360, barY, 720, 6, VERMILION, 0.95)
            .setOrigin(0, 0.5);

        // 5. HUD:資源 + 攻
        const save = SaveService.instance;
        const d = save.get();
        this.add.text(W - 70, 190, `銀兩 ${d.silver}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.75);
        this.add.text(W - 70, 232, `獸材 ${d.materials}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.75);
        this.add.text(90, 1820, `攻 ${save.atk} · 獵妖師 Lv${d.hunterLevel}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 28, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.6);

        // 6. 技能印「斬」 + 導覽
        const sealY = 1700;
        this.skillSeal = this.add.circle(W / 2, sealY, 86, VERMILION, 0.92).setDepth(30);
        this.skillText = this.add.text(W / 2, sealY, '斬', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setDepth(31);
        const skillHit = this.add.circle(W / 2, sealY, 130, 0x000000, 0.001)
            .setDepth(32).setInteractive({ useHandCursor: true });
        skillHit.on('pointerdown', () => this.castSkill());

        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));
        const forge = this.add.text(W - 90, 110, '鍛兵 〉', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        forge.on('pointerdown', () => this.scene.start('Forge'));

        // 7. 自動出刀 loop
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
        const base = SaveService.instance.atk * (0.85 + Math.random() * 0.3) * mult;
        return { dmg: Math.round(crit ? base * this.critMult : base), crit };
    }

    // 前衝 → 命中結算(僅一次)→ 回位
    // per Codex review:多屬性 tween 的 onYoyo 每個 property 各觸發一次,結算放 onComplete
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

    private autoStrike(): void {
        if (this.slain || this.striking) return;
        this.striking = true;
        const { dmg, crit } = this.rollDamage(1);
        this.lunge(190, -70, 130,
            () => this.hitBeast(dmg, crit, 1),
            () => { this.striking = false; });
    }

    private castSkill(): void {
        if (this.slain || this.time.now < this.skillReadyAt) return;
        this.skillReadyAt = this.time.now + this.skillCooldownMs;
        const { dmg, crit } = this.rollDamage(2.5);
        this.lunge(260, -110, 110, () => this.hitBeast(dmg, crit, 1.7));
    }

    private hitBeast(dmg: number, crit: boolean, slashScale: number): void {
        if (this.slain) return;

        // 刀光
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

        // 受擊白墨閃(Phaser 4.1:setTint + TintModes.FILL)+ 縮擠 + 微退
        this.fox.setTint(0xf3ead6);
        this.fox.setTintMode(TintModes.FILL);
        this.time.delayedCall(70, () => {
            if (this.beast.id === 'foxling_red') this.fox.setTint(0xd9a090);
            else this.fox.clearTint();
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

        // 墨字傷害
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
        this.hpFill.scaleX = this.hp / this.beast.maxHp;
        if (this.hp <= 0) this.slay();
    }

    private rollLoot(): { silver: number; materials: number } {
        const [s0, s1] = this.beast.lootSilver;
        const [m0, m1] = this.beast.lootMaterials;
        return {
            silver: s0 + Math.floor(Math.random() * (s1 - s0 + 1)),
            materials: m0 + Math.floor(Math.random() * (m1 - m0 + 1))
        };
    }

    private slay(): void {
        this.slain = true;
        this.tweens.add({
            targets: this.fox, alpha: 0.14, duration: 1100, ease: 'Sine.in'
        });

        // 結算入帳 + 解鎖下一獸
        const save = SaveService.instance;
        const loot = this.rollLoot();
        const result = save.addLoot(loot.silver, loot.materials, this.beast.exp);
        const hasNext = this.beastIdx + 1 < BEASTS.length;
        if (hasNext) save.unlockBeast(this.beastIdx + 1);

        // 「討伐 · 完」落款
        const seal = this.add.text(W / 2, 660, '討伐 · 完', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 110, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(60).setScale(2.2).setAlpha(0);
        this.tweens.add({
            targets: seal, scale: 1, alpha: 1, duration: 380, ease: 'Back.out'
        });
        this.cameras.main.shake(120, 0.005);

        // 戰利墨卷
        const panel = this.add.container(W / 2, 1020).setDepth(61).setAlpha(0);
        const box = this.add.rectangle(0, 0, 760, 460, 0x14110c, 0.9)
            .setStrokeStyle(2, 0xf3ead6, 0.25);
        const lootLines = [
            `獸材  +${result.materials}`,
            `銀兩  +${result.silver}`,
            `修為  +${result.exp}`
        ];
        const lootText = this.add.text(0, result.leveledTo ? -60 : -20, lootLines.join('\n'), {
            fontFamily: '"Noto Serif TC", serif', fontSize: 44, fontStyle: '700',
            color: PAPER, align: 'center', lineSpacing: 22
        }).setOrigin(0.5);
        panel.add([box, lootText]);
        if (result.leveledTo) {
            const lvl = this.add.text(0, 130, `獵妖師 晉 Lv${result.leveledTo}`, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 40, fontStyle: '900',
                color: VERMILION_CSS
            }).setOrigin(0.5);
            panel.add(lvl);
        }
        this.tweens.add({ targets: panel, alpha: 1, y: 1000, duration: 500, delay: 500, ease: 'Sine.out' });

        // 行動列:再戰 / 下一獸 / 鍛兵
        // per Codex review:scene.start/restart 是 queue 操作,快速雙點會排入多組
        // 轉場競態 → leaving guard 一次性鎖死
        let leaving = false;
        const guard = (act: () => void) => () => {
            if (leaving) return;
            leaving = true;
            act();
        };
        const actions: Array<{ label: string; act: () => void }> = [
            { label: '再 戰', act: () => this.scene.restart({ beastIdx: this.beastIdx }) }
        ];
        if (hasNext) {
            actions.push({ label: '下一獸', act: () => this.scene.restart({ beastIdx: this.beastIdx + 1 }) });
        }
        actions.push({ label: '鍛 兵', act: () => this.scene.start('Forge') });

        const spacing = 280;
        const startX = W / 2 - spacing * (actions.length - 1) / 2;
        actions.forEach((a, i) => {
            const t = this.add.text(startX + i * spacing, 1380, a.label, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 50, fontStyle: '700', color: PAPER
            }).setOrigin(0.5).setDepth(62).setAlpha(0)
                .setInteractive({ useHandCursor: true });
            this.add.rectangle(startX + i * spacing, 1428, 120, 3, VERMILION, 0.8)
                .setDepth(62);
            t.on('pointerdown', guard(a.act));
            this.tweens.add({ targets: t, alpha: 0.92, duration: 500, delay: 800 });
        });
    }
}
