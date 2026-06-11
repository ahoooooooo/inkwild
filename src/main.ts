import './style.css';
import { AUTO, Game, Scale } from 'phaser';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { Encounter } from './scenes/Encounter';
import { Forge } from './scenes/Forge';
import { Market } from './scenes/Market';
import { Hunt } from './scenes/Hunt';
import { CloudSave } from './services/CloudSave';
import { SaveService } from './services/SaveService';

// 字體(CJK 子集帶樣本字預載)與雲存檔 bootstrap 並行,整體 race 上限後就起遊戲
async function start(): Promise<void> {
    const SAMPLE = '墨山海入工坊市鍛兵斬避卷首再戰討伐完獸材銀兩修為妖狐赤目九尾青丘之主力竭退山攻防按住畫面移動靠近自動出刀結界';
    const fontsTask = Promise.all([
        document.fonts.load('900 64px "Noto Serif TC"', SAMPLE),
        document.fonts.load('700 64px "Noto Serif TC"', SAMPLE),
        document.fonts.load('400 32px "Noto Sans TC"', SAMPLE),
        document.fonts.load('700 32px "Noto Sans TC"', SAMPLE)
    ]).then(() => undefined).catch(() => undefined);
    // M3 雲存檔:匿名登入 + 拉雲端(較新者勝);失敗 = 離線照常
    const cloudTask = (async () => {
        try {
            await CloudSave.instance.start();
            const remote = await CloudSave.instance.load();
            if (remote) SaveService.instance.adoptCloud(remote);
        } catch (err: unknown) {
            void err;
        }
    })();
    // 兩者並行;6s 硬上限,慢網路也不准黑屏太久
    await Promise.race([
        Promise.all([fontsTask, cloudTask]),
        new Promise<void>((resolve) => setTimeout(resolve, 6000))
    ]);
    document.getElementById('boot-loader')?.remove();
    const game = new Game({
        type: AUTO,
        parent: 'game-container',
        width: 1080,
        height: 1920,
        backgroundColor: '#14110c',
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        scene: [Boot, Title, Hunt, Encounter, Forge, Market]
    });
    // E2E 測試把手(production 無副作用)
    (globalThis as unknown as Record<string, unknown>).__game = game;
}

void start();
