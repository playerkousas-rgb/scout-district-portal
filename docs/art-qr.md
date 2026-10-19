# 🎨 藝術 QR（區章／燈塔風格）— v4.19.0

> 將普通黑白 FPS 收款 QR／網址 QR，變成好似 **童軍筲箕灣區區章**、**海岸燈塔** 咁嘅設計。
> 類似 [ICQR](https://shop.icqr.com/collections/arts-and-entertainment) 嘅藝術 QR，但**免費、即時、自己出圖**，
> 而且 QR 內容照跟香港轉數快（FPS）Common QR 規格，銀行 App 照掃得。

---

## 喺邊度用

1. 登入平台 → 主控台 → **💳 FPS QR 製作**。
2. 頁面頂部揀 **🎨 藝術 QR（區章／燈塔）**（預設）或 **▦ 標準 QR**。
3. 填銀碼／參考編號（或者留空做靜態 QR），右邊即時預覽。
4. 揀主題、配色、方塊形狀、徽章大小 → 下載 1600 × 1600 PNG。

> 藝術 QR **唔會**改動 FPS 內容、CRC 或戶口；佢淨係換畫法。
> 內容同「標準 QR」一模一樣，所以 bank App 掃到嘅付款資料完全一樣。

---

## 四個主題

| 主題 | 背景圖案 | 預設徽章 | 樣板 |
|---|---|---|---|
| 🌊 **海岸燈塔** | 旋轉光束、海平線、海浪、金色星點 | 燈塔 | [`lighthouse.png`](../public/samples/art-qr/lighthouse.png) |
| 🧭 **區章** | 16 方位羅盤線、虛線縫線圈 | 羅盤 | [`badge.png`](../public/samples/art-qr/badge.png) |
| ⚜️ **百合花** | 巨型童軍百合花水印、星點 | 百合花 | [`fleur.png`](../public/samples/art-qr/fleur.png) |
| ⬜ **簡約** | 乾淨底、細刻度 | 百合花 | [`minimal.png`](../public/samples/art-qr/minimal.png) |

樣板圖係 `scripts/make-art-qr-samples.ts` 出嘅（1000 × 1000，內容＝區會靜態 FPS 收款碼），
直接用相機掃都掃得。

四個配色：**海港藍金**（列印首選）、**童軍綠**、**日落紅**、**單色印刷**（黑白影印用）。

---

## 掃描安全設計

| 做法 | 原因 |
|---|---|
| QR 用 **H 級錯誤修正（30%）** | 中央徽章、背景圖案會蓋住部分模組，H 級容錯最多 |
| 徽章直徑預設 **20%**，上限 26% | 保留足夠資料模組；預覽會顯示「掃描穩定度」分數 |
| 定位眼（三個角）保持 1:1:3:1:1 | 掃描器靠佢定位；只係改成圓角，比例不變 |
| 圓點／菱形會補「橋」連接 | 掃描器最重視同一色塊嘅連通性 |
| 背景圖案只佔淺色、對比低 | 唔會同深色模組混淆 |
| QR 四邊留靜區（quiet zone） | 剪裁、貼紙、印刷出血都安全 |

**實測**：用 ZXing（大部分手機掃描器嘅核心）將 3 種內容 × 4 主題 × 4 配色 × 4 方塊 × 3 徽章大小
（共 192 款，800px 輸出）逐一解碼，**192/192 全部通過**；徽章放大到 26–28% 亦全部通過。
可以用 `scripts/verify-art-qr.ts` 自己重跑（見下）。

> ⚠️ 任何藝術 QR 都建議**印前用真手機試掃一次**，尤其係印細過 3cm 或者用「日落紅」配色嗰陣。

---

## 上傳真實區章

「3. 文字」上面有個 **⬆️ 上傳徽章**：

- 支援 PNG／JPG／SVG，4MB 以內，建議正方形、透明底。
- 上傳後會取代內建圖案，畫喺 QR 中央圓形安全區內。
- 檔案只留喺你部瀏覽器（Data URL），**唔會上傳去伺服器**。

> 如果用真實區章，請確認區會批准使用該圖案。

---

## 自己驗證（開發用）

```bash
npm i --no-save tsx @napi-rs/canvas jsqr pngjs @zxing/library
npx tsx scripts/verify-art-qr.ts
```

會逐款生成再解碼，最後印出 ZXing／jsQR 通過率；失敗樣本寫入 `/tmp/artqr-fail-*.png`。

---

## 實作位置

| 檔案 | 作用 |
|---|---|
| `lib/artQr.ts` | 純 Canvas 繪圖引擎（主題、配色、模組、徽章、文字），零外部圖檔 |
| `components/ArtQrStudio.tsx` | 工作室 UI：來源、風格、自訂徽章、預覽、下載／複製／分享 |
| `app/fps/page.tsx` | 加「🎨 藝術 QR / ▦ 標準 QR」切換 |
| `app/globals.css` | `.artqr-*`、`.fps-mode-switch` 樣式 |
| `scripts/verify-art-qr.ts` | 掃描驗證（開發用） |
| `scripts/make-art-qr-samples.ts` | 出 `public/samples/art-qr/` 四張樣板圖 |

繪圖引擎用 `qrcode-generator`（MIT，純 JS）出 QR 矩陣，再用 Canvas 2D 畫；
所以同一份程式可以喺瀏覽器（預覽、下載）同 Node（驗證腳本）行，出圖一致。
