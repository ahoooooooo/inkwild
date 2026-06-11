# GAME_SPEC —《墨山海 INKWILD》(2026-06-12 從零重做)

> user 明令:「我沒有說可以沿用之前的資料欸 全部重做 用你的美感 製造出符合我設定的高質感遊戲」
> 一切舊資產 / 舊代碼 / 舊世界觀全部不沿用。本檔是唯一 spec。

## 一句話
水墨山海經獵妖 RPG:獵妖師入山討伐異獸,以獸材鍛兵強甲,坊市與全服獵人交易,十卷主線揭開墨山海之謎。

## 美學(我的美感,全案唯一基調)
- **水墨**:墨黑 `#1c1814` + 宣紙白 `#f3ead6` + 唯一強調色硃砂 `#b03a2e` + 微金塵 `#c9a227`
- 整幅墨繪異獸為戰鬥舞台(不做人形逐幀動畫 — 9 輪走路血淚教訓),傀儡式 tween(呼吸/撲擊/縮擠)
- UI 極簡水墨:字 + 細線 + 印章,禁粗框方塊按鈕
- 字體:Noto Serif TC(標題 900/700)+ Noto Sans TC(內文)
- 白底素材去背走「白色解混」(alpha = 1 - min(RGB)/255 + 色彩反解),保留墨暈軟邊

## 五大支柱(user 硬需求,缺一不可)
1. **玩家交易**:坊市掛單制(Firebase Firestore transaction 原子交易,5% 手續費銀兩 sink)
2. **武器強化**:鍛兵 — 獸材 + 銀兩無上限強化(真實上限彩蛋,絕對保密)
3. **裝備升級**:強甲 — 防具升星/突破,bonus 屬性
4. **打怪資源軌**:討伐異獸 → 獸材 / EXP / 銀兩(穩定細水)
5. **主線任務軌**:十卷主線(卷一 · 霧隱青丘 起),解鎖region/異獸,大額獎勵(階段大注)

## 戰鬥(核心 loop)
- 整幅異獸插畫 + telegraph 前搖 → 玩家點擊出刀 / 滑動迴避(i-frame)
- 打擊感:TintModes.FILL 白墨閃 + 縮擠 + 墨字傷害(暴擊硃砂大字)+ camera shake
- 討伐完成 → 硃砂「討伐 · 完」落款 + 戰利結算

## 技術
- Phaser 4.1 + TS strict + Vite,直屏 1080×1920 Scale.FIT
- 部署:GitHub Pages(repo `inkwild`,base `/inkwild/`)
- 後端:Firebase Spark 免費層(Auth 匿名→Email、Firestore 雲存檔 + 坊市)
- 美術管線:GPT-4o(codex_imagegen)→ 白色解混去背 → quantize
- Phaser 4.1 陷阱:`setTintFill` 已移除 → `setTint + setTintMode(TintModes.FILL)`;
  named imports only(prod 禁 runtime `Phaser.*` namespace)

## 里程碑
- **M0 定調**(本次):logo / 立軸標題畫面 / 九尾遭遇展示戰 → user 美學方向確認
- **M1 戰鬥縱切**:telegraph + 迴避 + 技能 + 戰利品結算 + 2-3 隻異獸
- **M2 鍛造**:鍛兵(武器強化)+ 強甲(裝備升級)UI + 數值
- **M3 後端**:Firebase Auth + 雲存檔
- **M4 坊市**:掛單 / 瀏覽 / 購買(transaction)
- **M5 十卷主線** + 經濟平衡

## 鐵律(不變)
tsc + vite build + Playwright 實測 + 截圖證據才能說「好了」;每段 code Codex APPROVE 才 commit;
不付費;機密不送 free-tier LLM;Conventional Commits;.env 不 commit。
