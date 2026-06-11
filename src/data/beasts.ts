// 卷一 · 霧隱青丘 異獸譜(M5 擴到 8+ 隻 / 3 地域)
export interface BeastDef {
    id: string;
    name: string;
    sub: string;
    texture: string;
    maxHp: number;
    atk: number;
    attackEveryMs: number;
    lootSilver: [number, number];
    lootMaterials: [number, number];
    exp: number;
    displayWidth: number;
    y: number;
    boss: boolean;
}

export const BEASTS: BeastDef[] = [
    {
        id: 'foxling',
        name: '妖狐',
        sub: '卷一 · 霧隱青丘 · 其一',
        texture: 'beast_foxling',
        maxHp: 900,
        atk: 12,
        attackEveryMs: 3600,
        lootSilver: [25, 40],
        lootMaterials: [1, 2],
        exp: 25,
        displayWidth: 620,
        y: 800,
        boss: false
    },
    {
        id: 'foxling_red',
        name: '赤目妖狐',
        sub: '卷一 · 霧隱青丘 · 其二',
        texture: 'beast_foxling',
        maxHp: 2600,
        atk: 22,
        attackEveryMs: 3800,
        lootSilver: [60, 90],
        lootMaterials: [2, 4],
        exp: 70,
        displayWidth: 700,
        y: 790,
        boss: false
    },
    {
        id: 'ninetails',
        name: '九尾 · 青丘之主',
        sub: '卷一 · 霧隱青丘 · 主',
        texture: 'beast_ninetails',
        maxHp: 24000,
        atk: 45,
        attackEveryMs: 4200,
        lootSilver: [400, 600],
        lootMaterials: [10, 15],
        exp: 400,
        displayWidth: 880,
        y: 760,
        boss: true
    }
];
