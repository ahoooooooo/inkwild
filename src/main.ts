import './style.css';
import { AUTO, Game, Scale } from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Encounter } from './scenes/Encounter';

// 字體先載完才起 Phaser,避免標題字 fallback 閃爍
async function start(): Promise<void> {
    try {
        await Promise.all([
            document.fonts.load('900 64px "Noto Serif TC"'),
            document.fonts.load('700 64px "Noto Serif TC"'),
            document.fonts.load('400 32px "Noto Sans TC"'),
            document.fonts.load('700 32px "Noto Sans TC"')
        ]);
    } catch (err: unknown) {
        // 字體載入失敗仍可啟動(系統 serif fallback)
        void err;
    }
    new Game({
        type: AUTO,
        parent: 'game-container',
        width: 1080,
        height: 1920,
        backgroundColor: '#14110c',
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        scene: [Boot, Title, Encounter]
    });
}

void start();
