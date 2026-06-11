import type { Scene } from 'phaser';

// 音效薄封裝:音量 + 隨機 detune(避免機關槍感),載入失敗靜默
export const SFX_KEYS = [
    'slash_0', 'slash_1', 'hit_0', 'hit_1', 'crit', 'hurt',
    'beast_die', 'beast_aggro', 'coin', 'pickup', 'jump',
    'levelup', 'gate', 'forge', 'deny'
] as const;

export type SfxKey = typeof SFX_KEYS[number];

export function playSfx(scene: Scene, key: SfxKey, volume = 0.5): void {
    try {
        scene.sound.play(key, {
            volume,
            detune: (Math.random() - 0.5) * 240
        });
    } catch (err: unknown) {
        void err; // 音訊未解鎖 / 載入失敗不擋遊戲
    }
}
