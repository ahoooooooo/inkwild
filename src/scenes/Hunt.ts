import { Scene, TintModes, type GameObjects, type Input } from 'phaser';
import { SaveService } from '../services/SaveService';
import { BEASTS, type BeastDef } from '../data/beasts';
import { playSfx } from '../services/Sfx';

const W = 1080;
const H = 1920;
const WORLD_W = 3400;
const GROUND_Y = 1430;
const PAPER = '#f3ead6';
const INK = '#1c1814';
const VERMILION = 0xb03a2e;
const VERMILION_CSS = '#b03a2e';
const RESPAWN_MS = 7560; // 楓谷 cycle spawn
const MOVE_SPEED = 420;  // px/s
const ATTACK_RANGE = 300;

interface FieldBeast {
    def: BeastDef;
    spawnX: number;
    img: GameObjects.Image;
    hpBg: GameObjects.Rectangle;
    hpFill: GameObjects.Rectangle;
    hp: number;
    alive: boolean;
    aggro: boolean;
    aggroLock: boolean;
    nextAttackAt: number;
    attacking: boolean;
    facing: number;
    wanderDir: number;
    nextWanderAt: number;
}

// 獵場 — 楓谷式橫向刷怪(2026-06-12 user:「我要的是可以打怪,楓之谷」)。
// 按住畫面往該方向輕功滑行,自動砍射程內的妖獸;固定 spawn point 7.56s 重生;
// 地圖最右硃砂結界 → 九尾 boss 房(Encounter)。
// 戰鬥結算一律掛 Clock,tween 純視覺(凍死教訓)。
export class Hunt extends Scene {
    private hunter!: GameObjects.Image;
    private crane: GameObjects.Image | null = null;
    private beasts: FieldBeast[] = [];
    private hunterHp = 0;
    private readonly critRate = 0.2;
    private readonly critMult = 2.2;
    private readonly skillCooldownMs = 2500;
    private readonly dodgeCooldownMs = 1600;
    private readonly invulnMs = 800;

    private hunterHpFill!: GameObjects.Rectangle;
    private resourceText!: GameObjects.Text;
    private statText!: GameObjects.Text;
    private skillSeal!: GameObjects.Arc;
    private skillText!: GameObjects.Text;
    private dodgeSeal!: GameObjects.Arc;
    private dodgeText!: GameObjects.Text;
    private moveTargetX: number | null = null;
    private skillReadyAt = 0;
    private dodgeReadyAt = 0;
    private invulnUntil = 0;
    private nextStrikeAt = 0;
    private nextTrailAt = 0;
    private striking = false;
    private defeated = false;
    private leaving = false;
    private vy = 0;
    private airJumps = 0;
    private hitStopActive = false;
    private comboCount = 0;
    private comboExpireAt = 0;
    private comboText: GameObjects.Text | null = null;
    private lootOrbs: Array<{ obj: GameObjects.Arc; vx: number; vy: number; bornAt: number }> = [];

    constructor() {
        super('Hunt');
    }

    create(): void {
        const save = SaveService.instance;
        this.hunterHp = save.maxHp;
        this.defeated = false;
        this.leaving = false;
        this.striking = false;
        this.moveTargetX = null;
        this.skillReadyAt = 0;
        this.dodgeReadyAt = 0;
        this.invulnUntil = 0;
        this.nextStrikeAt = 0;
        this.vy = 0;
        this.airJumps = 0;
        this.hitStopActive = false;
        this.comboCount = 0;
        this.comboExpireAt = 0;
        this.comboText = null;
        this.lootOrbs = [];
        this.beasts = [];

        this.cameras.main.setBounds(0, 0, WORLD_W, H);
        this.physics?.world?.setBounds?.(0, 0, WORLD_W, H); // 無 physics 也安全

        // 1. 山水卷軸背景(視差)+ 壓暗
        for (let i = 0; i < 4; i++) {
            const bg = this.add.image(i * 1078, H / 2, 'title_bg');
            bg.setOrigin(0, 0.5);
            bg.setScale(1080 / bg.width * (H / 1920));
            bg.setScrollFactor(0.35);
            if (i % 2 === 1) bg.setFlipX(true);
        }
        this.add.rectangle(WORLD_W / 2, H / 2, WORLD_W, H, 0x14110c, 0.5);
        // 地面墨線
        this.add.rectangle(WORLD_W / 2, GROUND_Y + 190, WORLD_W, 6, 0x1c1814, 0.55);

        // 2. 獵妖師(輕功滑行,無步行幀)
        this.hunter = this.add.image(360, GROUND_Y, 'hunter');
        this.hunter.setScale(420 / this.hunter.height).setDepth(20);
        this.tweens.add({
            targets: this.hunter, angle: -1,
            duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });
        if (save.get().petLevel > 0) {
            this.crane = this.add.image(360 - 130, GROUND_Y - 240, 'pet_crane');
            this.crane.setScale(160 / this.crane.height).setDepth(19).setAlpha(0.95);
        }
        this.cameras.main.startFollow(this.hunter, true, 0.12, 0);

        // 3. 妖獸 spawn points(前段妖狐、深處赤目)
        const spawnXs = [900, 1300, 1700, 2100, 2500, 2900];
        spawnXs.forEach((x, i) => {
            const def = BEASTS[i < 3 ? 0 : 1];
            this.beasts.push(this.spawnBeast(def, x));
        });

        // 4. 九尾結界門(地圖最右)
        const gateX = WORLD_W - 150;
        this.add.rectangle(gateX, GROUND_Y - 40, 10, 520, VERMILION, 0.5);
        const gateSeal = this.add.circle(gateX, GROUND_Y - 330, 64, VERMILION, 0.9);
        this.add.text(gateX, GROUND_Y - 330, '主', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 64, fontStyle: '900', color: PAPER
        }).setOrigin(0.5);
        this.tweens.add({
            targets: gateSeal, alpha: 0.55,
            duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut'
        });
        this.add.text(gateX, GROUND_Y + 120, '九尾結界', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0.5).setAlpha(0.6);

        // 5. HUD(固定螢幕)
        this.resourceText = this.add.text(W - 60, 120, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 28, color: PAPER
        }).setOrigin(1, 0.5).setAlpha(0.8).setScrollFactor(0).setDepth(80);
        this.statText = this.add.text(60, 1750, '', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 26, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.65).setScrollFactor(0).setDepth(80);
        this.add.rectangle(60, 1800, 330, 6, 0x14110c, 0.8)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(80);
        this.hunterHpFill = this.add.rectangle(60, 1800, 330, 6, 0xf3ead6, 0.9)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(80);
        this.refreshHud();

        const back = this.add.text(60, 110, '〈 卷首', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 34, color: PAPER
        }).setOrigin(0, 0.5).setAlpha(0.7).setScrollFactor(0).setDepth(90)
            .setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => { if (!this.leaving) { this.leaving = true; this.scene.start('Title'); } });

        // 6. 技能印「避」「斬」(固定螢幕右下)
        const sealY = 1660;
        this.dodgeSeal = this.add.circle(W - 330, sealY, 78, 0x1c1814, 0.85)
            .setScrollFactor(0).setDepth(85);
        this.dodgeSeal.setStrokeStyle(3, 0xf3ead6, 0.5);
        this.dodgeText = this.add.text(W - 330, sealY, '避', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 74, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setScrollFactor(0).setDepth(86);
        const dodgeHit = this.add.circle(W - 330, sealY, 105, 0x000000, 0.001)
            .setScrollFactor(0).setDepth(87).setInteractive({ useHandCursor: true });
        dodgeHit.on('pointerdown', (_p: Input.Pointer, _x: number, _y: number, e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            this.castDodge();
        });

        this.skillSeal = this.add.circle(W - 130, sealY, 78, VERMILION, 0.92)
            .setScrollFactor(0).setDepth(85);
        this.skillText = this.add.text(W - 130, sealY, '斬', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 74, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setScrollFactor(0).setDepth(86);
        const skillHit = this.add.circle(W - 130, sealY, 105, 0x000000, 0.001)
            .setScrollFactor(0).setDepth(87).setInteractive({ useHandCursor: true });
        skillHit.on('pointerdown', (_p: Input.Pointer, _x: number, _y: number, e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            this.castSkill(true);
        });

        // 6.5 跳躍印「躍」（左下，二段跳）
        const jumpSeal = this.add.circle(130, sealY, 78, 0x1c1814, 0.85)
            .setScrollFactor(0).setDepth(85);
        jumpSeal.setStrokeStyle(3, 0xf3ead6, 0.5);
        this.add.text(130, sealY, '躍', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 74, fontStyle: '900', color: PAPER
        }).setOrigin(0.5).setScrollFactor(0).setDepth(86);
        const jumpHit = this.add.circle(130, sealY, 105, 0x000000, 0.001)
            .setScrollFactor(0).setDepth(87).setInteractive({ useHandCursor: true });
        jumpHit.on('pointerdown', (_p: Input.Pointer, _x: number, _y: number, e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            this.jump();
        });

        // 7. 移動:按住畫面 → 朝指標 world x 輕功滑行
        this.input.on('pointerdown', (p: Input.Pointer) => {
            this.moveTargetX = p.worldX;
        });
        this.input.on('pointermove', (p: Input.Pointer) => {
            if (p.isDown) this.moveTargetX = p.worldX;
        });
        this.input.on('pointerup', () => { this.moveTargetX = null; });

        // 入場提示(淡出)
        const hint = this.add.text(W / 2, 1530, '按住畫面移動 — 靠近妖獸自動出刀', {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, color: PAPER
        }).setOrigin(0.5).setAlpha(0.75).setScrollFactor(0).setDepth(80);
        this.tweens.add({ targets: hint, alpha: 0, duration: 1200, delay: 3500, onComplete: () => hint.destroy() });
    }

    // 輕功二段跳
    private jump(): void {
        if (this.defeated) return;
        const onGround = this.hunter.y >= GROUND_Y - 1;
        if (!onGround && this.airJumps >= 1) return;
        if (!onGround) this.airJumps += 1;
        this.vy = -1250;
        playSfx(this, 'jump', 0.5);
        const puff = this.add.ellipse(this.hunter.x, GROUND_Y + 170, 56, 12, 0x1c1814, 0.35).setDepth(14);
        this.tweens.add({
            targets: puff, alpha: 0, scaleX: 1.8, duration: 350,
            onComplete: () => puff.destroy()
        });
    }

    // HitStop：time + tweens 同步，setTimeout 還原（不受 timescale 影響）
    private hitStop(ms: number, scale = 0.05): void {
        if (this.hitStopActive) return;
        this.hitStopActive = true;
        const prevTime = this.time.timeScale;
        const prevTween = this.tweens.timeScale;
        this.time.timeScale = scale;
        this.tweens.timeScale = scale;
        setTimeout(() => {
            this.time.timeScale = prevTime;
            this.tweens.timeScale = prevTween;
            this.hitStopActive = false;
        }, ms);
    }

    // 連斬計數：4 秒內連殺累積
    private addCombo(): void {
        const now = this.time.now;
        this.comboCount = now <= this.comboExpireAt ? this.comboCount + 1 : 1;
        this.comboExpireAt = now + 4000;
        if (this.comboCount < 2) return;
        if (this.comboText) this.comboText.destroy();
        const label = '連斬 ×' + this.comboCount;
        this.comboText = this.add.text(W / 2, 320, label, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 60, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 7
        }).setOrigin(0.5).setScrollFactor(0).setDepth(88).setScale(1.6).setAlpha(0);
        const ct = this.comboText;
        this.tweens.add({
            targets: ct, scale: 1, alpha: 1, duration: 160, ease: 'Back.out',
            onComplete: () => this.tweens.add({ targets: ct, alpha: 0, duration: 700, delay: 1300 })
        });
    }

    // 實體掉寶：鯖出 → 磁吸入袋
    private spawnLootOrbs(x: number, y: number, silver: number, mats: number): void {
        const counts: Array<[number, number]> = [
            [Math.min(4, Math.max(1, Math.round(silver / 12))), 0xc9a227],
            [Math.min(3, Math.max(1, mats)), 0x2a241d]
        ];
        for (const [n, color] of counts) {
            for (let i = 0; i < n; i++) {
                const orb = this.add.circle(x, y - 60, color === 0xc9a227 ? 9 : 11, color, 0.95).setDepth(35);
                orb.setStrokeStyle(2, color === 0xc9a227 ? 0xf3ead6 : 0xb03a2e, 0.9);
                this.lootOrbs.push({
                    obj: orb,
                    vx: (Math.random() - 0.5) * 420,
                    vy: -500 - Math.random() * 280,
                    bornAt: this.time.now
                });
            }
        }
    }

    private refreshHud(): void {
        const save = SaveService.instance;
        const d = save.get();
        this.resourceText.setText(`銀兩 ${d.silver} · 獸材 ${d.materials}`);
        this.statText.setText(`攻 ${save.atk} · 防 ${save.def} · Lv${d.hunterLevel}`);
        this.hunterHpFill.scaleX = Math.max(0, this.hunterHp / save.maxHp);
    }

    private spawnBeast(def: BeastDef, x: number): FieldBeast {
        const scale = (def.id === 'foxling_red' ? 300 : 260);
        const img = this.add.image(x, GROUND_Y + 40, def.texture);
        img.setScale(scale / img.width).setDepth(15);
        if (def.id === 'foxling_red') img.setTint(0xd9a090);
        const hpBg = this.add.rectangle(x, GROUND_Y - 130, 160, 5, 0x14110c, 0.8).setDepth(16);
        const hpFill = this.add.rectangle(x - 80, GROUND_Y - 130, 160, 5, VERMILION, 0.95)
            .setOrigin(0, 0.5).setDepth(16);
        const b: FieldBeast = {
            def, spawnX: x, img, hpBg, hpFill,
            hp: def.maxHp, alive: true, aggro: false, aggroLock: false,
            nextAttackAt: 0, attacking: false, facing: -1,
            wanderDir: Math.random() < 0.5 ? -1 : 1, nextWanderAt: 0
        };
        img.setAlpha(0);
        this.tweens.add({ targets: img, alpha: 1, duration: 600 });
        return b;
    }

    update(time: number, deltaMs: number): void {
        if (this.defeated || this.leaving) return;
        const dt = deltaMs / 1000;

        // 技能印冷卻顯示
        const skillReady = time >= this.skillReadyAt;
        this.skillSeal.setAlpha(skillReady ? 0.92 : 0.28);
        this.skillText.setAlpha(skillReady ? 1 : 0.4);
        const dodgeReady = time >= this.dodgeReadyAt;
        this.dodgeSeal.setAlpha(dodgeReady ? 0.85 : 0.25);
        this.dodgeText.setAlpha(dodgeReady ? 1 : 0.4);

        // 跳躍物理（手動重力）
        if (this.hunter.y < GROUND_Y || this.vy < 0) {
            this.vy += 3200 * dt;
            this.hunter.y = Math.min(GROUND_Y, this.hunter.y + this.vy * dt);
            if (this.hunter.y >= GROUND_Y && this.vy > 0) {
                this.vy = 0;
                this.airJumps = 0;
                const dust = this.add.ellipse(this.hunter.x, GROUND_Y + 170, 70, 14, 0x1c1814, 0.4).setDepth(14);
                this.tweens.add({ targets: dust, alpha: 0, scaleX: 2, duration: 380, onComplete: () => dust.destroy() });
            }
        }

        // 掉寶珠：拋物線 → 250ms 後磁吸 → 入袋
        for (const o of this.lootOrbs) {
            if (!o.obj.active) continue;
            if (time - o.bornAt > 250) {
                const dx = this.hunter.x - o.obj.x;
                const dy = (this.hunter.y - 60) - o.obj.y;
                const d = Math.hypot(dx, dy) || 1;
                if (d < 70) {
                    o.obj.destroy();
                    playSfx(this, 'pickup', 0.35);
                    continue;
                }
                o.obj.x += (dx / d) * 1500 * dt;
                o.obj.y += (dy / d) * 1500 * dt;
            } else {
                o.vy += 2600 * dt;
                o.obj.x += o.vx * dt;
                o.obj.y = Math.min(GROUND_Y + 150, o.obj.y + o.vy * dt);
            }
        }
        this.lootOrbs = this.lootOrbs.filter((o) => o.obj.active);

        // 連斬過期
        if (this.comboCount > 0 && time > this.comboExpireAt) this.comboCount = 0;

        // 移動(輕功滑行:傾身 + 墨痕,不做步行幀)
        if (this.moveTargetX !== null && !this.striking) {
            const dx = this.moveTargetX - this.hunter.x;
            if (Math.abs(dx) > 24) {
                const dir = Math.sign(dx);
                this.hunter.x = Math.min(WORLD_W - 80, Math.max(80, this.hunter.x + dir * MOVE_SPEED * dt));
                this.hunter.setFlipX(dir < 0);
                this.hunter.setAngle(dir * 5);
                if (time >= this.nextTrailAt) {
                    this.nextTrailAt = time + 70;
                    const trail = this.add.ellipse(
                        this.hunter.x - dir * 60, Math.min(GROUND_Y + 175, this.hunter.y + 175),
                        46, 10, 0x1c1814, 0.32
                    ).setDepth(14);
                    this.tweens.add({
                        targets: trail, alpha: 0, scaleX: 1.7, duration: 420,
                        onComplete: () => trail.destroy()
                    });
                }
            } else {
                this.hunter.setAngle(0);
            }
        } else if (!this.striking) {
            this.hunter.setAngle(0);
        }
        if (this.crane) {
            this.crane.x += ((this.hunter.x - 130) - this.crane.x) * Math.min(1, dt * 3);
            this.crane.y = this.hunter.y - 240 + Math.sin(time / 700) * 14;
        }

        // 九尾結界:走到門邊 → boss 房
        if (this.hunter.x > WORLD_W - 260) {
            this.leaving = true;
            playSfx(this, 'gate', 0.6);
            this.scene.start('Encounter', { beastIdx: 2 });
            return;
        }

        // 自動出刀:最近的存活妖獸進射程
        if (time >= this.nextStrikeAt && !this.striking) {
            const target = this.nearestBeast(ATTACK_RANGE);
            if (target) {
                this.nextStrikeAt = time + 900;
                this.strike(target, 1, false);
            }
        }

        // 妖獸 AI
        for (const b of this.beasts) {
            if (!b.alive) continue;
            const dist = Math.abs(b.img.x - this.hunter.x);
            if (!b.aggroLock && dist < 420) {
                b.aggroLock = true;
                playSfx(this, 'beast_aggro', 0.3);
            }
            b.aggro = b.aggroLock;
            if (b.attacking) continue;
            if (b.aggro && dist > 150) {
                const dir = Math.sign(this.hunter.x - b.img.x);
                b.img.x += dir * 150 * dt;
                b.facing = dir;
            } else if (!b.aggro) {
                if (time >= b.nextWanderAt) {
                    b.nextWanderAt = time + 1600 + Math.random() * 2000;
                    b.wanderDir = Math.random() < 0.5 ? -1 : 1;
                }
                const nx = b.img.x + b.wanderDir * 45 * dt;
                if (Math.abs(nx - b.spawnX) < 160) {
                    b.img.x = nx;
                    b.facing = b.wanderDir;
                }
            }
            // 妖狐美術面朝左:向右移動時翻面
            b.img.setFlipX(b.facing > 0);
            b.hpBg.x = b.img.x;
            b.hpFill.x = b.img.x - 80;
            b.hpBg.y = b.hpFill.y = b.img.y - 170;
            // 反撲
            if (b.aggro && dist <= 170 && time >= b.nextAttackAt) {
                b.nextAttackAt = time + b.def.attackEveryMs;
                this.beastPounce(b);
            }
        }
    }

    private nearestBeast(range: number): FieldBeast | null {
        let best: FieldBeast | null = null;
        let bestDist = range;
        for (const b of this.beasts) {
            if (!b.alive) continue;
            const d = Math.abs(b.img.x - this.hunter.x);
            if (d < bestDist) {
                bestDist = d;
                best = b;
            }
        }
        return best;
    }

    private rollDamage(mult: number): { dmg: number; crit: boolean } {
        const crit = Math.random() < this.critRate;
        const base = SaveService.instance.atk * (0.85 + Math.random() * 0.3) * mult;
        return { dmg: Math.round(crit ? base * this.critMult : base), crit };
    }

    // 出刀:面向目標衝刺(視覺)+ Clock 結算
    private strike(target: FieldBeast, mult: number, isSkill: boolean): void {
        if (this.striking || this.defeated) return;
        this.striking = true;
        const dir = Math.sign(target.img.x - this.hunter.x) || 1;
        this.hunter.setFlipX(dir < 0);
        const fromX = this.hunter.x;
        this.tweens.killTweensOf(this.hunter);
        this.tweens.add({
            targets: this.hunter, x: fromX + dir * (isSkill ? 150 : 100),
            duration: 120, ease: 'Sine.out', yoyo: true
        });
        playSfx(this, Math.random() < 0.5 ? 'slash_0' : 'slash_1', 0.45);
        const { dmg, crit } = this.rollDamage(mult);
        this.time.delayedCall(120, () => this.hitBeast(target, dmg, crit, isSkill ? 1.5 : 1));
        this.time.delayedCall(290, () => {
            this.striking = false;
            this.hunter.setAngle(0);
        });
    }

    private castSkill(fromButton: boolean): void {
        void fromButton;
        if (this.defeated || this.time.now < this.skillReadyAt) return;
        const target = this.nearestBeast(ATTACK_RANGE + 120);
        if (!target) return;
        this.skillReadyAt = this.time.now + this.skillCooldownMs;
        this.striking = false; // 技能可打斷普攻節奏
        this.strike(target, 2.5, true);
    }

    private castDodge(): void {
        if (this.defeated || this.time.now < this.dodgeReadyAt) return;
        this.dodgeReadyAt = this.time.now + this.dodgeCooldownMs;
        this.invulnUntil = this.time.now + this.invulnMs;
        const ghost = this.add.image(this.hunter.x, this.hunter.y, 'hunter')
            .setScale(this.hunter.scaleX, this.hunter.scaleY)
            .setFlipX(this.hunter.flipX)
            .setAlpha(0.35).setDepth(19);
        this.tweens.add({
            targets: ghost, alpha: 0, x: ghost.x - (this.hunter.flipX ? -90 : 90),
            duration: 450, onComplete: () => ghost.destroy()
        });
    }

    private hitBeast(b: FieldBeast, dmg: number, crit: boolean, slashScale: number): void {
        if (!b.alive || this.defeated) return;
        const slash = this.add.image(
            b.img.x + (Math.random() - 0.5) * 60,
            b.img.y - 40 + (Math.random() - 0.5) * 60,
            'slash'
        ).setDepth(40).setScale(0.22 * slashScale).setAlpha(0)
            .setAngle(-15 + (Math.random() - 0.5) * 30);
        this.tweens.add({
            targets: slash, alpha: 1, scale: 0.4 * slashScale,
            duration: 80, ease: 'Sine.out',
            onComplete: () => this.tweens.add({
                targets: slash, alpha: 0, duration: 200,
                onComplete: () => slash.destroy()
            })
        });
        b.img.setTint(0xf3ead6);
        b.img.setTintMode(TintModes.FILL);
        this.time.delayedCall(70, () => {
            if (b.def.id === 'foxling_red') b.img.setTint(0xd9a090);
            else b.img.clearTint();
            b.img.setTintMode(TintModes.MULTIPLY);
        });
        playSfx(this, crit ? 'crit' : (Math.random() < 0.5 ? 'hit_0' : 'hit_1'), crit ? 0.65 : 0.5);
        this.hitStop(crit ? 90 : 50);
        if (crit) this.cameras.main.shake(60, 0.003);
        const kdir = Math.sign(b.img.x - this.hunter.x) || 1;
        b.img.x += kdir * (crit ? 64 : 40);
        for (const other of this.beasts) {
            if (other.alive && Math.abs(other.img.x - b.img.x) < 600) other.aggroLock = true;
        }

        const popup = this.add.text(b.img.x + (Math.random() - 0.5) * 80, b.img.y - 200, `${dmg}`, {
            fontFamily: '"Noto Serif TC", serif',
            fontSize: crit ? 64 : 44, fontStyle: '900',
            color: crit ? VERMILION_CSS : PAPER,
            stroke: INK, strokeThickness: crit ? 7 : 5
        }).setOrigin(0.5).setAngle((Math.random() - 0.5) * 12).setDepth(50);
        this.tweens.add({
            targets: popup, y: popup.y - 90, alpha: 0, duration: 700,
            onComplete: () => popup.destroy()
        });

        b.hp = Math.max(0, b.hp - dmg);
        b.hpFill.scaleX = b.hp / b.def.maxHp;
        if (b.hp <= 0) this.killBeast(b);
    }

    // 討伐:戰利品飛字 + 楓谷式 respawn
    private killBeast(b: FieldBeast): void {
        b.alive = false;
        const save = SaveService.instance;
        const [s0, s1] = b.def.lootSilver;
        const [m0, m1] = b.def.lootMaterials;
        const silver = s0 + Math.floor(Math.random() * (s1 - s0 + 1));
        const mats = m0 + Math.floor(Math.random() * (m1 - m0 + 1));
        const result = save.addLoot(silver, mats, b.def.exp);

        playSfx(this, 'beast_die', 0.55);
        playSfx(this, 'coin', 0.4);
        this.hitStop(110, 0.05);
        this.addCombo();
        this.tweens.add({ targets: b.img, alpha: 0, y: b.img.y - 30, duration: 500 });
        for (let i = 0; i < 4; i++) {
            const blob = this.add.circle(
                b.img.x + (Math.random() - 0.5) * 60,
                b.img.y - 40 + (Math.random() - 0.5) * 60,
                7 + Math.random() * 9, 0x1c1814, 0.6
            ).setDepth(34);
            this.tweens.add({
                targets: blob,
                x: blob.x + (Math.random() - 0.5) * 260,
                y: blob.y + (Math.random() - 0.5) * 200,
                alpha: 0, scale: 1.8, duration: 520 + Math.random() * 240,
                ease: 'Sine.out', onComplete: () => blob.destroy()
            });
        }
        this.spawnLootOrbs(b.img.x, b.img.y, silver, mats);
        b.hpBg.setVisible(false);
        b.hpFill.setVisible(false);

        const loot = this.add.text(b.img.x, b.img.y - 240, `+${silver} 銀 · +${mats} 獸材`, {
            fontFamily: '"Noto Sans TC", sans-serif', fontSize: 30, fontStyle: 'bold',
            color: PAPER, stroke: INK, strokeThickness: 4
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
            targets: loot, y: loot.y - 80, alpha: 0, duration: 1000,
            onComplete: () => loot.destroy()
        });
        if (result.leveledTo) {
            playSfx(this, 'levelup', 0.6);
            const lvl = this.add.text(this.hunter.x, GROUND_Y - 320, `晉 Lv${result.leveledTo}`, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 56, fontStyle: '900',
                color: VERMILION_CSS, stroke: INK, strokeThickness: 6
            }).setOrigin(0.5).setDepth(50);
            this.tweens.add({
                targets: lvl, y: lvl.y - 90, alpha: 0, duration: 1100,
                onComplete: () => lvl.destroy()
            });
        }
        this.refreshHud();

        // 楓谷 cycle respawn:固定點 7.56s
        this.time.delayedCall(RESPAWN_MS, () => {
            if (this.defeated || this.leaving) return;
            b.img.setPosition(b.spawnX, GROUND_Y + 40);
            b.img.setAlpha(0);
            if (b.def.id === 'foxling_red') b.img.setTint(0xd9a090);
            else b.img.clearTint();
            b.img.setTintMode(TintModes.MULTIPLY);
            b.hp = b.def.maxHp;
            b.alive = true;
            b.aggro = false;
            b.attacking = false;
            b.hpFill.scaleX = 1;
            b.hpBg.setVisible(true);
            b.hpFill.setVisible(true);
            this.tweens.add({ targets: b.img, alpha: 1, duration: 500 });
        });
    }

    // 妖獸反撲:前搖「!」→ 撲擊 → Clock 結算
    private beastPounce(b: FieldBeast): void {
        if (!b.alive || this.defeated) return;
        b.attacking = true;
        const mark = this.add.text(b.img.x, b.img.y - 220, '!', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 76, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 7
        }).setOrigin(0.5).setDepth(45).setScale(0.3).setAlpha(0);
        this.tweens.add({
            targets: mark, scale: 1, alpha: 1, duration: 180, ease: 'Back.out',
            onComplete: () => this.tweens.add({
                targets: mark, alpha: 0, duration: 220, delay: 200,
                onComplete: () => mark.destroy()
            })
        });
        const dir = Math.sign(this.hunter.x - b.img.x) || 1;
        this.time.delayedCall(500, () => {
            if (!b.alive || this.defeated) return;
            this.tweens.killTweensOf(b.img);
            this.tweens.add({
                targets: b.img, x: b.img.x + dir * 130,
                duration: 150, ease: 'Sine.out', yoyo: true
            });
        });
        this.time.delayedCall(660, () => this.resolvePounce(b));
        this.time.delayedCall(900, () => { b.attacking = false; });
    }

    private resolvePounce(b: FieldBeast): void {
        if (!b.alive || this.defeated) return;
        if (Math.abs(b.img.x - this.hunter.x) > 260) return;
        if (this.hunter.y < GROUND_Y - 160) return; // 跳起躲開 // 走位躲開
        const save = SaveService.instance;
        if (this.time.now < this.invulnUntil) {
            const t = this.add.text(this.hunter.x, GROUND_Y - 260, '避', {
                fontFamily: '"Noto Serif TC", serif', fontSize: 52, fontStyle: '900',
                color: PAPER, stroke: INK, strokeThickness: 5
            }).setOrigin(0.5).setDepth(50);
            this.tweens.add({
                targets: t, y: t.y - 70, alpha: 0, duration: 600,
                onComplete: () => t.destroy()
            });
            return;
        }
        const raw = b.def.atk * (0.9 + Math.random() * 0.2);
        const dmg = Math.max(1, Math.round(raw - save.def));
        this.hunterHp = Math.max(0, this.hunterHp - dmg);
        playSfx(this, 'hurt', 0.55);
        const kdir = Math.sign(this.hunter.x - b.img.x) || 1;
        this.hunter.x = Math.min(WORLD_W - 80, Math.max(80, this.hunter.x + kdir * 60));
        this.hunter.setTint(0xb03a2e);
        this.hunter.setTintMode(TintModes.FILL);
        this.time.delayedCall(80, () => {
            this.hunter.clearTint();
            this.hunter.setTintMode(TintModes.MULTIPLY);
        });
        this.cameras.main.shake(70, 0.004);
        const popup = this.add.text(this.hunter.x + 30, GROUND_Y - 280, `-${dmg}`, {
            fontFamily: '"Noto Serif TC", serif', fontSize: 48, fontStyle: '900',
            color: VERMILION_CSS, stroke: INK, strokeThickness: 5
        }).setOrigin(0.5).setDepth(50);
        this.tweens.add({
            targets: popup, y: popup.y - 80, alpha: 0, duration: 650,
            onComplete: () => popup.destroy()
        });
        this.refreshHud();
        if (this.hunterHp <= 0) this.defeat();
    }

    private defeat(): void {
        this.defeated = true;
        this.tweens.add({
            targets: [this.hunter, ...(this.crane ? [this.crane] : [])],
            alpha: 0.15, duration: 900, ease: 'Sine.in'
        });
        const seal = this.add.text(W / 2, 760, '力竭 · 退山', {
            fontFamily: '"Noto Serif TC", serif', fontSize: 100, fontStyle: '900',
            color: PAPER, stroke: INK, strokeThickness: 6
        }).setOrigin(0.5).setDepth(90).setScale(1.8).setAlpha(0).setScrollFactor(0);
        this.tweens.add({ targets: seal, scale: 1, alpha: 0.95, duration: 420, ease: 'Back.out' });

        let acted = false;
        const guard = (act: () => void) => () => {
            if (acted) return;
            acted = true;
            act();
        };
        const actions: Array<[string, () => void]> = [
            ['再 戰', () => this.scene.restart()],
            ['工 坊', () => this.scene.start('Forge')],
            ['卷 首', () => this.scene.start('Title')]
        ];
        actions.forEach(([label, act], i) => {
            const x = W / 2 - 280 + i * 280;
            const t = this.add.text(x, 1100, label, {
                fontFamily: '"Noto Serif TC", serif', fontSize: 50, fontStyle: '700', color: PAPER
            }).setOrigin(0.5).setDepth(91).setAlpha(0).setScrollFactor(0)
                .setInteractive({ useHandCursor: true });
            this.add.rectangle(x, 1148, 120, 3, VERMILION, 0.8).setDepth(91).setScrollFactor(0);
            t.on('pointerdown', guard(act));
            this.tweens.add({ targets: t, alpha: 0.92, duration: 500, delay: 600 });
        });
    }
}
