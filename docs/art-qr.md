# 🎨 FPS QR → 區章藝術 QR

> 將**成個轉數快（FPS）收款 QR 本身**變成筲箕灣區徽風格嘅圖：
> 唔係 QR 中間貼一個 logo，而係每一個 QR 模組都參與畫畫 ——
> 深藍底色、白色光束、黑白格燈塔、白色 zig-zag 海浪，全部由 QR 方塊砌出嚟。
> QR 內容照跟 FPS Common QR 規格，銀行 App 照掃得。

頁面：`/fps?d=SKW` → **藝術 QR** 分頁（預設）。

樣板（1200 × 1200）：
[`district-badge.png`](../public/samples/fps-art/district-badge.png) ·
[`district-badge-hk100.png`](../public/samples/fps-art/district-badge-hk100.png) ·
[`lighthouse.png`](../public/samples/fps-art/lighthouse.png)

---

## 原理（點解可以由頭到尾都係圖案）

1. **先把整幅圖畫好**：`drawDistrictBadge()`（區章）或 `drawCoastScene()`（海岸燈塔）
   用 Canvas 畫一幅完整插畫。
2. **縮到 QR 模組尺寸取色**：把插畫縮成 `n × n`，每格取一個平均色 → 得到每格的亮度 `cellLum`。
3. **逐格上色，但深淺由 QR 話事**：
   - 淺模組 → 純紙白（`#ffffff`）。淺模組一定要平色，一染就會拉低對比、HybridBinarizer 掃唔到。
   - 深模組 → 用插畫色相 + 一個**受控嘅深色明度**：
     `darkL = 0.06 + (darkTop − 0.06) · cellLum^0.75 · fusion`
     即係插畫愈光嘅位，深模組就愈光（燈塔白位自然浮出嚟），但永遠唔會超過 `darkTop`。
4. **功能圖案保持黑白分明**：三個定位眼用固定 7×7 深環 / 5×5 淺間距 / 3×3 深芯，
   時序線、對齊圖案、格式資訊一律用近黑墨色 + 紙白、實心方塊。
5. **自動揀 mask**：`pickMask()` 逐個 mask 計「深模組對唔對得上插畫深色位」，揀最高分。
   為安全起見只考慮 mask 2–7（實測 mask 0／1 配圓點風格喺 600px 會掃唔到）。

### 為何唔可以再光／再艷

| 限制 | 原因 |
|---|---|
| `darkTop ≤ 0.50`（實際 M 0.42、Q 0.47、H 0.45） | 深模組一超過 0.5 明度，同白底差距太細，自適應門檻會分唔開 |
| 淺模組必須純紙色 | 試過染淡彩：ZXing 通過率即刻跌 |
| 定位眼必須深環 + 淺間距、正方形 | 試過跟圖案色／圓角：即刻全軍覆沒 |
| 每格寬度用同一個整數 | 逐條邊 `Math.round` 會變 14/15px 梅花間竹，細版本（M v4）易死 |

---

## 選項

| 選項 | 說明 |
|---|---|
| 圖案 | 筲箕灣區章（預設）／海岸燈塔／上傳自己嘅圖 |
| 銀碼／參考編號 | 即時生成新 QR；留空＝靜態 QR |
| 融合強度 | 50–100%（預設 90%）：愈高愈似圖，但深模組愈光 |
| 方塊形狀 | 方塊（最穩）／微圓角／圓點（大圓角方塊＋實心方芯，保持連通） |
| 容錯級別 | M（模組最粗、圖案最靚）／Q（建議）／H（最耐污，模組最細） |
| 底部文字 | 印喺 QR 下面，例如「掃碼付款 · SCAN TO PAY」 |

**銀碼一改，圖案會唔會變？** 文字唔同 → QR 資料唔同 → 方塊紋理一定唔同；
但**構圖唔變**（燈塔、光束、海浪永遠喺同一個位置），所以一眼都認得係同一款。

---

## 掃描驗證

```bash
npm i --no-save tsx @napi-rs/canvas@0.1.80 pngjs jsqr @zxing/library
npx tsx scripts/verify-fps-art.ts        # 3 圖案 × M/Q/H × 3 形狀 × 3 銀碼 × 600/1200px = 162 款
DUMP=1 npx tsx scripts/verify-fps-art.ts # 失敗個案寫去 /tmp/zf-*.png
```

最新結果（162 款）：

| 解碼器 | 對照組（純黑白 QR） | 藝術 QR | 由圖案造成嘅失誤 |
|---|---|---|---|
| jsQR | 162/162 | **162/162** | **0** |
| ZXing（JS 版） | 132/162 | 143/162 | 1（`lighthouse/M/rounded/1200/static`） |

> ⚠️ **點解 ZXing 對照組都會失手？**
> `@zxing/library` 嘅 JS 版對某些**完全正確嘅純黑白 QR**（例如 M／版本 4／mask 6）
> 會喺 `Detector.computeDimension()` 擲 `Dimensions could be not found.` —— 這是
> 該 JS port 嘅已知限制（同一張圖用 jsQR、iOS、Android 都掃得到）。
> 所以驗證腳本會逐個組合另外畫一張純黑白對照圖，**只有「對照圖掃到、藝術版掃唔到」才算失誤**。
>
> 手機原生掃描器（iOS Vision、Android ML Kit／原生 ZXing）比 JS 版強得多，
> 但任何藝術 QR 都建議**印前用真手機試掃一次**，尤其印細過 3 cm。

---

## 實作位置

| 檔案 | 作用 |
|---|---|
| `lib/artQrFull.ts` | 繪圖引擎：矩陣、mask 選擇、區章／海岸插畫、逐格上色、定位眼 |
| `lib/artQrTypes.ts` | 模組形狀／容錯級別等共用型別 |
| `lib/qrcode-core.d.ts` | `qrcode/lib/core/qrcode` 型別宣告 |
| `components/FpsArtQr.tsx` | 藝術 QR UI：金額、圖案、融合、形狀、容錯、預覽、PNG 下載、剪貼板、安全度 |
| `app/fps/page.tsx` | 「藝術 QR / 標準 QR」兩個分頁 |
| `app/globals.css` | `.fps-art*` 版面樣式 |
| `scripts/verify-fps-art.ts` | 162 款掃描驗證（含純黑白對照組） |
| `scripts/make-fps-art-samples.ts` | 出 `public/samples/fps-art/` 三張樣板 |
| `scripts/_dec.ts` / `_one.ts` / `_crop.ts` | 開發用：解碼指定 PNG／單獨出一張／放大裁切 |

引擎用 `qrcode`（MIT，純 JS）出矩陣，再用 Canvas 2D 逐格繪畫；
瀏覽器（預覽、下載）同 Node（驗證腳本）用同一份程式，出圖一致。

---

## 同 FPS 規格嘅關係

藝術 QR **唔會**改動 FPS 內容：戶口、金額、參考編號、CRC 全部由 `lib/fps.ts` 嘅
`buildFpsPayload()` 產生，藝術層只係換畫法。所以藝術版同標準版掃出嚟嘅字串
**byte-for-byte 一樣**（驗證腳本就係逐個字串比對）。
