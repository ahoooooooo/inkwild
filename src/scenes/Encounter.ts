import { Scene, TintModes, type GameObjects } from 'phaser';
import { SaveService } from '../services/SaveService';
import { BEASTS, type BeastDef } from '../data/beasts';

const W = 1080;
const H = 1920;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';

// 遭遇 — 獵妖師自動出刀(傷害只來自數值:武器+等級+靈寵),點擊只放冷卻技能。
// M2:異獸會前搖反撲,玩家點「避」開無敵幀;玄武鱗減傷,力竭退山。
export class Encounter extends Scene {
    private beast!: BeastDef;
    private beastIdx = 0;
    private hp = 0;
    private hunterHp = 0;
    private readonly critRate = 0.2;
    private readonly critMult = 2.2;
    private readonly attackIntervalMs = 900;
    private readonly skillCooldownMs = 2500;
    private readonly dodgeCooldownMs = 1600;
    private readonly invulnMs = 800;

    private hpFill!: GameObjects.Rectangle;
    private hunterHpFill!: GameObjects.Rectangle;
    private fox!: GameObjects.Image;
    private hunter!: GameObjects.Image;
    private crane: GameObjects.Image | null = null;
    private skillSeal!: GameObjects.Arc;
    private skillText!: GameObjects.Text;
    private dodgeSeal!: GameObjects.Arc;
    private dodgeText!: GameObjects.Text;
    private foxBaseScale = 1;
    private foxHome = { x: 620, y: 760 };
    private hunterHome = { x: 280, y: 1330 };
    private skillReadyAt = 0;
    private dodgeReadyAt = 0;
    private invulnUntil = 0;
    private striking = false;
    private slain = false;
    private defeated = false;

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
        const save = SaveService.instance;
        this.hp = this.beast.maxHp;
        this.hunterHp = save.maxHp;
        this.slain = false;
        this.defeated = false;
        this.striking = false;
        this.skillReadyAt = 0;
        this.dodgeReadyAt = 0;
        this.invulnUntil = 0;
        this.foxHome = { x: 620, y: this.beast.y };

        // 1. 立軸山水為底,壓暗聚焦
        const bg = this.add.image(W / 2, H / 2, 'title_bg');
        bg.setScale(Math.max(W / bg.width, H / bg.height));
        this.add.rectangle(W / 2, H / 2, W, H, 0x14110c, 0.55);

        // 2. 異獸
        this.fox = this.add.image(this.foxHome.x, this.foxHome.y, this.beast.texture);
        this.foxBaseScale = this.beast.displayWidth / this.fox.width;
        if (this.beast.id === 'foxling_red') this.fox.setTint(0xd9a090);
        this.fox.setScale(this.foxBaseScale * 0.92).setAlpha(0);
        this.tweens.add({
            targets: this.fox, alpha: 1, scale: this.foxBaseScale,
            duration: 900, ease: 'Sine.out'
        });
        this.time.delayedCall(950, () => {
            if (this.slain) return;
            this.fox.setScale(this.foxBaseScale);
            this.startFoxIdle();
        });

        // 3. 獵妖師 + 墨鶴(靈寵,有養才出場)
        this.hunter = this.add.image(this.hunterHome.x, this.hunterHome.y, 'hunter');
        this.hunter.setScale(520 / this.hunter.height).setDepth(20).setAlpha(0);
        this.tweens.add({ targets: this.hunter, alpha: 1, duration: 700, ease: 'Sine.out' });
        this.tweens.add({
            targets: this.hunter, angle: -1.2,
            duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });
        if (save.get().petLevel > 0) {
            this.crane = this.add.image(this.hunterHome.x - 150, this.hunterHome.y - 290, 'pet_crane');
            this.crane.setScale(190 / this.crane.height).setDepth(19).setAlpha(0);
            this.tweens.add({ targets: this.crane, alpha: 0.95, duration: 900, delay: 400 });
            this.tweens.add({
                targets: this.crane, y: this.hunterHome.y - 320,
                duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.inOut'
            });
        }

        // 4. 名牌 + 異獸血墨條
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

        // 5. HUD:資源 + 獵妖師氣血/攻
        const d = save.get();
        this.add.text(W - 70, 190, `銀兩 ${d.silver}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.75);
        this.add.text(W - 70, 232, `獸材 ${d.materials}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.75);

        this.add.text(90, 1790, `攻 ${save.atk} · 防 ${save.def} · Lv${d.hunterLevel}`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.6);
        this.add.rectangle(90, 1840, 330, 6, 0x14110c, 0.8).setOrigin(0, 0.5);
        this.hunterHpFill = this.add.rectangle(90, 1840, 330, 6, 0xf3ead6, 0.9)
            .setOrigin(0, 0.5);

        // 6. 技能印「斬」「避」 + 導覽
        const sealY = 1700;
        this.skillSeal = this.add.circle(W / 2 + 150, sealY, 86, VERMILION, 0.92).setDepth(30);
        this.skillText = this.add.text(W / 2 + 150, sealY, '斬', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setDepth(31);
        const skillHit = this.add.circle(W / 2 + 150, sealY, 120, 0x000000, 0.001)
            .setDepth(32).setInteractive({ useHandCursor: true });
        skillHit.on('pointerdown', () => this.castSkill());

        this.dodgeSeal = this.add.circle(W / 2 - 150, sealY, 86, 0x1c1814, 0.85).setDepth(30);
        this.dodgeSeal.setStrokeStyle(3, 0xf3ead6, 0.5);
        this.dodgeText = this.add.text(W / 2 - 150, sealY, '避', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 84, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setDepth(31);
        const dodgeHit = this.add.circle(W / 2 - 150, sealY, 120, 0x000000, 0.001)
            .setDepth(32).setInteractive({ useHandCursor: true });
        dodgeHit.on('pointerdown', () => this.castDodge());

        const back = this.add.text(90, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('Title'));
        const forge = this.add.text(W - 90, 110, '工坊 〉', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });
        forge.on('pointerdown', () => this.scene.start('Forge'));

        // 7. 自動出刀 + 異獸反撲 loop
        this.time.addEvent({
            delay: this.attackIntervalMs, loop: true, startAt: 300,
            callback: () => this.autoStrike()
        });
        this.time.addEvent({
            delay: this.beast.attackEveryMs, loop: true,
            callback: () => this.beastAttack()
        });
    }

    update(time: number): void {
        if (this.slain || this.defeated) return;
        const skillReady = time >= this.skillReadyAt;
        this.skillSeal.setAlpha(skillReady ? 0.92 : 0.28);
        this.skillText.setAlpha(skillReady ? 1 : 0.4);
        const dodgeReady = time >= this.dodgeReadyAt;
        this.dodgeSeal.setAlpha(dodgeReady ? 0.85 : 0.25);
        this.dodgeText.setAlpha(dodgeReady ? 1 : 0.4);
    }

    private rollDamage(mult: number): { dmg: number; crit: boolean } {
        const crit = Math.random() < this.critRate;
        const base = SaveService.instance.atk * (0.85 + Math.random() * 0.3) * mult;
        return { dmg: Math.round(crit ? base * this.critMult : base), crit };
    }

    // 前衝(純視覺)+ 命中結算掛 Clock — tween 被衝突殺掉也不影響遊戲狀態
    // (教訓:結算放 tween callback,property 衝突時 onComplete 不觸發 → 戰鬥凍死)
    private lunge(dx: number, dy: number, durMs: number, onHit: () => void, onDone?: () => void): void {
        this.tweens.killTweensOf(this.hunter);
        this.hunter.setPosition(this.hunterHome.x, this.hunterHome.y);
        this.tweens.add({
            targets: this.hunter,
            x: this.hunterHome.x + dx, y: this.hunterHome.y + dy,
            duration: durMs, ease: 'Sine.out', yoyo: true
        });
        this.time.delayedCall(durMs, onHit);
        this.time.delayedCall(durMs * 2 + 60, () => {
            this.hunter.setPosition(this.hunterHome.x, this.hunterHome.y);
            if (onDone) onDone();
        });
    }

    private autoStrike(): void {
        if (this.slain || this.defeated || this.striking) return;
        this.striking = true;
        const { dmg, crit } = this.rollDamage(1);
        this.lunge(190, -70, 130,
            () => this.hitBeast(dmg, crit, 1),
            () => { this.striking = false; });
    }

    private castSkill(): void {
        if (this.slain || this.defeated || this.time.now < this.skillReadyAt) return;
        this.skillReadyAt = this.time.now + this.skillCooldownMs;
        const { dmg, crit } = this.rollDamage(2.5);
        this.lunge(260, -110, 110, () => this.hitBeast(dmg, crit, 1.7));
    }

    // 「避」:1.6s 冷卻,0.8s 無敵幀 + 殘影
    private castDodge(): void {
        if (this.slain || this.defeated || this.time.now < this.dodgeReadyAt) return;
        this.dodgeReadyAt = this.time.now + this.dodgeCooldownMs;
        this.invulnUntil = this.time.now + this.invulnMs;
        const ghost = this.add.image(this.hunter.x, this.hunter.y, 'hunter')
            .setScale(this.hunter.scaleX, this.hunter.scaleY)
            .setAlpha(0.35).setDepth(19);
        this.tweens.add({
            targets: ghost, alpha: 0, x: ghost.x - 90, duration: 450,
            onComplete: () => ghost.destroy()
        });
    }

    // 異獸反撲:前搖(硃砂「!」+ 伏身)→ 撲擊 → 命中或被避開
    private beastAttack(): void {
        if (this.slain || this.defeated) return;
        const mark = this.add.text(this.fox.x, this.fox.y - this.beast.displayWidth * 0.42, '!', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 110, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 8
        }).setOrigin(0.5).setDepth(45).setScale(0.3).setAlpha(0);
        this.tweens.add({
            targets: mark, scale: 1, alpha: 1, duration: 200, ease: 'Back.out',
            onComplete: () => this.tweens.add({
                targets: mark, alpha: 0, duration: 250, delay: 250,
                onComplete: () => mark.destroy()
            })
        });
        this.time.delayedCall(600, () => {
            if (this.slain || this.defeated) return;
            this.tweens.killTweensOf(this.fox);
            this.fox.setPosition(this.foxHome.x, this.foxHome.y);
            this.fox.setScale(this.foxBaseScale);
            this.tweens.add({
                targets: this.fox, x: this.foxHome.x - 240, y: this.foxHome.y + 120,
                duration: 170, ease: 'Sine.out', yoyo: true, hold: 40
            });
        });
        this.time.delayedCall(770, () => this.resolveBeastHit());
        this.time.delayedCall(990, () => {
            if (this.slain || this.defeated) return;
            this.fox.setPosition(this.foxHome.x, this.foxHome.y);
            this.startFoxIdle();
        });
    }

    // 呼吸/尾擺 idle(被 killTweensOf 清掉後重啟用)
    private startFoxIdle(): void {
        this.tweens.add({
            targets: this.fox, scaleY: this.foxBaseScale * 1.018,
            duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });
        this.tweens.add({
            targets: this.fox, angle: 1.1,
            duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });
    }

    private resolveBeastHit(): void {
        if (this.slain || this.defeated) return;
        const save = SaveService.instance;
        if (this.time.now < this.invulnUntil) {
            const t = this.add.text(this.hunter.x, this.hunter.y - 260, '避', {
                fontFamily: '"Noto Serif TC", serif', fontSize: 64, fontStyle: '900',
                color: PAPER, stroke: INK, strokeThickness: 6
            }).setOrigin(0.5).setDepth(50);
            this.tweens.add({
                targets: t, y: t.y - 80, alpha: 0, duration: 650,
                onComplete: () => t.destroy()
            });
            return;
        }
        const raw = this.beast.atk * (0.9 + Math.random() * 0.2);
        const dmg = Math.max(1, Math.round(raw - save.def));
        this.hunterHp = Math.max(0, this.hunterHp - dmg);
        this.hunterHpFill.scaleX = this.hunterHp / save.maxHp;
        // 受擊:硃砂閃 + 退步
        this.hunter.setTint(0xb03a2e);
        this.hunter.setTintMode(TintModes.FILL);
        this.time.delayedCall(80, () => {
            this.hunter.clearTint();
            this.hunter.setTintMode(TintModes.MULTIPLY);
        });
        this.cameras.main.shake(80, 0.005);
        const popup = this.add.text(this.hunter.x + 40, this.hunter.y - 280, `-${dmg}`, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 56, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
            targets: popup, y: popup.y - 90, alpha: 0, duration: 700,
            onComplete: () => popup.destroy()
        });
        if (this.hunterHp <= 0) this.defeat();
    }

    private hitBeast(dmg: number, crit: boolean, slashScale: number): void {
        if (this.slain || this.defeated) return;

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

        // 受擊白墨閃(Phaser 4.1:setTint + TintModes.FILL)
        this.fox.setTint(0xf3ead6);
        this.fox.setTintMode(TintModes.FILL);
        this.time.delayedCall(70, () => {
            if (this.beast.id === 'foxling_red') this.fox.setTint(0xd9a090);
            else this.fox.clearTint();
            this.fox.setTintMode(TintModes.MULTIPLY);
        });
        if (crit) this.cameras.main.shake(70, 0.004);

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

    // 一次性轉場 guard(per Codex review:scene.start/restart 是 queue 操作,雙點會排多組)
    private actionRow(items: Array<{ label: string; act: () => void }>, y: number, delayMs: number): void {
        let leaving = false;
        const guard = (act: () => void) => () => {
            if (leaving) return;
            leaving = true;
            act();
        };
        const spacing = 280;
        const startX = W / 2 - spacing * (items.length - 1) / 2;
        items.forEach((a, i) => {
            const t = this.add.text(startX + i * spacing, y, a.label, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 50, fontStyle: '700', color: PAPER
            }).setOrigin(0.5).setDepth(62).setAlpha(0)
                .setInteractive({ useHandCursor: true });
            this.add.rectangle(startX + i * spacing, y + 48, 120, 3, VERMILION, 0.8)
                .setDepth(62);
            t.on('pointerdown', guard(a.act));
            this.tweens.add({ targets: t, alpha: 0.92, duration: 500, delay: delayMs });
        });
    }

    private slay(): void {
        this.slain = true;
        this.tweens.add({
            targets: this.fox, alpha: 0.14, duration: 1100, ease: 'Sine.in'
        });

        const save = SaveService.instance;
        const loot = this.rollLoot();
        const result = save.addLoot(loot.silver, loot.materials, this.beast.exp);
        const hasNext = this.beastIdx + 1 < BEASTS.length;
        if (hasNext) save.unlockBeast(this.beastIdx + 1);

        const seal = this.add.text(W / 2, 660, '討伐 · 完', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 110, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(60).setScale(2.2).setAlpha(0);
        this.tweens.add({
            targets: seal, scale: 1, alpha: 1, duration: 380, ease: 'Back.out'
        });
        this.cameras.main.shake(120, 0.005);

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

        const actions: Array<{ label: string; act: () => void }> = [
            { label: '再 戰', act: () => this.scene.restart({ beastIdx: this.beastIdx }) }
        ];
        if (hasNext) {
            actions.push({ label: '下一獸', act: () => this.scene.restart({ beastIdx: this.beastIdx + 1 }) });
        }
        actions.push({ label: '工 坊', act: () => this.scene.start('Forge') });
        this.actionRow(actions, 1380, 800);
    }

    // 力竭:無懲罰退山(M3 起接雲存檔再談死亡代價)
    private defeat(): void {
        this.defeated = true;
        this.tweens.add({
            targets: [this.hunter, ...(this.crane ? [this.crane] : [])],
            alpha: 0.15, duration: 900, ease: 'Sine.in'
        });
        const seal = this.add.text(W / 2, 760, '力竭 · 退山', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 100, fontStyle: '900',
            color: PAPER, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(60).setScale(1.8).setAlpha(0);
        this.tweens.add({
            targets: seal, scale: 1, alpha: 0.95, duration: 420, ease: 'Back.out'
        });
        const hint = this.add.text(W / 2, 900, '回工坊強化玄武鱗,再入山', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5).setDepth(60).setAlpha(0);
        this.tweens.add({ targets: hint, alpha: 0.6, duration: 500, delay: 500 });

        this.actionRow([
            { label: '再 戰', act: () => this.scene.restart({ beastIdx: this.beastIdx }) },
            { label: '工 坊', act: () => this.scene.start('Forge') },
            { label: '卷 首', act: () => this.scene.start('Title') }
        ], 1180, 700);
    }
}
