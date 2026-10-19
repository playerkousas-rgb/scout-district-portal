# 🎨 區章融合 QR — v4.21.0

> 將成個 **FPS 收款 QR 本身**變成 **童軍筲箕灣區區章**：
> 唔係中間貼一個 logo，而係每一個 QR 模組都參與畫畫——
> 藍底、白色光束、黑白格燈塔、海浪，全部由 QR 方塊砌出嚟。
> QR 內容照跟香港轉數快（FPS）Common QR 規格，銀行 App 照掃得。

---

## 三種模式

| 模式 | 效果 | 適合 |
|---|---|---|
| 🎨 **區章融合 QR**（預設，v4.21.0） | **整個 QR 就係區章**：每個模組按構圖深淺上色，八個 mask 逐個試，揀最似區章嗰個；冇 3D、冇中央貼圖 | 想要「一眼睇得出係筲箕灣區章」嘅收款碼 |
| 🌊 **場景 QR + 3D**（v4.20.0） | 用你上傳嘅相片／插畫做底圖，逐像素重映射，可出 STL 3D 打印 | 相片風、紀念品、布章、3D 掛牌 |
| ▦ **標準 QR** | 最原始黑白 QR | 最高辨識率、影印、細張貼紙 |

三個模式嘅 QR 內容（FPS 戶口、銀碼、CRC）完全一樣，只係畫法唔同。

---

## 🎨 區章融合 QR（v4.21.0）

樣板：[`district-badge.png`](../public/samples/art-qr/district-badge.png) ·
[`lighthouse-sunset.png`](../public/samples/art-qr/lighthouse-sunset.png) ·
[`harbour-night.png`](../public/samples/art-qr/harbour-night.png) ·
[`fleur.png`](../public/samples/art-qr/fleur.png)

### 原理

1. **構圖圖（structure map）**：內建區章構圖——燈塔黑頂、黑白格塔身、左右白色光束、
   底部三條 zig-zag 海浪；每個位置標示「一定深色／一定淺色／由 QR 決定」。
2. **改寫資料碼字（QArt 式）**：喺 H 級容錯嘅安全額度內，逐個 RS block 改寫部分資料碼字，
   令深色模組啱啱好落喺燈塔黑位；淺色位就唔浪費額度，留返畀 QR 自己。
3. **半色調上色**：深色模組按構圖用「墨黑（塔身）」或「寶藍（區章底色）」，
   並且按構圖深淺放大縮細；淺色模組用近白／淡藍底。遠看係一幅區章，近看係完整 QR。
4. **自動揀 mask**：八個 mask 逐個試，用「深色模組 × 構圖深色位」對位分數揀最好嗰個。
5. **自適應融合**：輸出太細或者內容太長（每個模組 device pixel 太少）會自動收斂融合度，
   寧願淡少少都保證掃得到。

### 選項

| 選項 | 說明 |
|---|---|
| 主題 | 筲箕灣區章（預設）／燈塔黃昏／海港夜色／百合花 |
| 融合強度 | 40–100%（預設 100%） |
| 模組形狀 | 方塊（最易掃）／微圓角 |
| 文字 | 頂部中文、頂部英文、底部說明全部可改 |

### 銀碼一改，圖案會變？

會——因為 QR 內容真係唔同咗，資料碼字同紋理自然唔同。
但**構圖唔變**：燈塔、光束、海浪永遠喺同一個位置，所以一眼都認得係同一款區章。

### 掃描安全設計

| 做法 | 原因 |
|---|---|
| QR 用 **H 級錯誤修正（30%）** | 改寫碼字用嘅額度只佔每個 RS block 約一半容錯量 |
| 只改寫「深色」構圖位 | 淺色位唔花容錯額，將改寫量集中喺最影響外觀嘅地方 |
| 六格靜區（quiet zone） | 比標準四格更闊，避免頂部標題干擾解碼 |
| 每個模組加 1.2px bleed | 避免 Canvas 縮放時模組之間出現白線 |
| 太細自動收斂融合度 | 預覽細圖、超長內容都唔會犧牲可掃性 |
| 定位眼／時序線保持原色原大 | 掃描器靠佢定位 |

**實測**（`scripts/verify-art-qr-fusion.ts`）：4 種內容（靜態、HK$100、HK$2,380.50、
超長參考編號）× 4 主題 × 2 模組形狀 × 3 融合強度 × 2 輸出尺寸（1600／2000px，共 192 款）：

- **ZXing（銀行 App／大部分掃描器核心）：192/192（100%）**
- jsQR（較舊、較嚴格嘅參考解碼器）：184/192（95.8%），失敗集中喺「微圓角 + 最長內容」；
  介面預設用方塊，印刷前請照樣試掃。

> ⚠️ 任何藝術 QR 都建議**印前用真手機試掃一次**，尤其係印細過 3cm 嗰陣。

---

## 喺邊度用

1. 登入平台 → 主控台 → **💳 FPS QR 製作**。
2. 頁面頂部揀 **🎨 區章融合 QR**（預設）、**🌊 場景 QR（相片／3D）** 或 **▦ 標準 QR**。
3. 填銀碼／參考編號（或者留空做靜態 QR），右邊即時預覽。
4. 揀主題、融合強度、模組形狀 → 下載 1600 × 1600 PNG。

> 藝術 QR **唔會**改動 FPS 內容、CRC 或戶口；佢淨係換畫法。
> 內容同「標準 QR」一模一樣，所以 bank App 掃到嘅付款資料完全一樣。

---

## 🌊 場景 QR（v4.20.0）

樣板：[`badge-stitch.png`](../public/samples/scene-qr/badge-stitch.png) ·
[`badge-flat.png`](../public/samples/scene-qr/badge-flat.png) ·
[`poster.png`](../public/samples/scene-qr/poster.png)

用自己嘅相片／插畫做底圖，逐像素將亮度推向深淺兩極、保留色相，QR 同圖案合而為一；
另設 CSS 立體預覽同 STL 下載（100 × 100 mm），可交 3D 打印。

實測：`scripts/verify-scene-qr.ts`，2 張底圖 × 3 模組 × 4 融圖強度 × 3 靜區（72 款），
ZXing 72/72 通過；jsQR 56/72，失敗集中喺「插畫底圖 + 針腳／圓角 + 低融合強度」。

---

## 自己驗證（開發用）

```bash
npm i --no-save tsx @napi-rs/canvas jsqr pngjs @zxing/library
npx tsx scripts/verify-art-qr-fusion.ts   # 區章融合 QR（192 款）
npx tsx scripts/verify-scene-qr.ts        # 場景 QR（72 款）
```

會逐款生成再解碼，最後印出 ZXing／jsQR 通過率；ZXing 有任何失敗會以 exit code 1 結束。

---

## 實作位置

| 檔案 | 作用 |
|---|---|
| `lib/artQrFusion.ts` | 區章融合引擎：構圖圖、碼字改寫、mask 選擇、半色調繪圖 |
| `lib/qrcode-internals.d.ts` | `qrcode` 內部模組（RS block／EC level）型別宣告 |
| `components/ArtQrStudio.tsx` | 區章融合 QR UI（即時預覽、下載／複製／分享） |
| `lib/sceneQr.ts` | 場景 QR 引擎：夾圖、逐像素重映射、浮雕、STL 生成 |
| `components/SceneQrStudio.tsx` | 場景 QR UI：底圖、融合、3D 預覽、STL 下載 |
| `scripts/verify-art-qr-fusion.ts` | 區章融合 QR 掃描驗證（ZXing 必過 + jsQR 報告） |
| `scripts/make-art-qr-samples.ts` | 出 `public/samples/art-qr/` 四張樣板 |
| `scripts/verify-scene-qr.ts` | 場景 QR 掃描驗證（ZXing／jsQR） |
| `scripts/make-scene-qr-samples.ts` | 出 `public/samples/scene-qr/` 樣板 |
| `app/fps/page.tsx` | 「🎨 區章融合 QR / 🌊 場景 QR / ▦ 標準 QR」切換 |
| `app/globals.css` | `.artqr-*`、`.fps-mode-switch` 樣式 |

引擎用 `qrcode`（MIT，純 JS）出 QR 矩陣同 RS block 資料，再用 Canvas 2D 逐格繪畫；
所以同一份程式可以喺瀏覽器（預覽、下載）同 Node（驗證腳本）行，出圖一致。
