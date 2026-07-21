# STEP/3D

一個可直接部署到 GitHub Pages 的純靜態 STEP 專案檢視器。使用者只能上傳 `.zip`；ZIP 會在瀏覽器本機解壓縮，STEP 也只在瀏覽器記憶體中解析，不會傳到應用程式伺服器。

## ZIP 使用規格

- 上傳檔案的副檔名必須是 `.zip`，否則前端會直接拒絕。
- ZIP 內至少要有一個 `.step` 或 `.stp`。
- 建議放入完整 assembly STEP 以及所有個別零件 STEP。
- 主組立檔建議與 ZIP 同名，或在檔名使用 `assembly`、`assy`、`main`、`master`、`complete`、`full` 等字樣；沒有命名提示時會選擇最大的 STEP。
- 所有 ZIP 內的 STEP 都會出現在左側選單，可手動切換。
- 如果 ZIP 只有彼此獨立的零件 STEP，網站可以分別檢視，但無法憑空推導真實裝配位置；要呈現正確整機架構，ZIP 必須包含保有 assembly occurrence／transform 的主組立 STEP。

為降低 ZIP bomb 與瀏覽器記憶體耗盡風險，目前限制為：ZIP 最大 500 MB、最多 250 個 STEP、STEP 解壓後合計最大 1.5 GB，並拒絕加密、不安全路徑與異常壓縮比。

## 功能

- 自動主模型選擇與 ZIP 內 STEP 切換
- STEP 階層、搜尋、自動組立分支分類
- 3D 選取、隔離、隱藏、顯示全部
- 前／上／右／等角視角與選取置中
- 爆炸距離、依 STEP 檔／零件自動分色、STEP 原色、tessellation 網格
- 兩點 mesh 量測
- AABB、外包尺寸、近似表面積／體積、mesh／vertex／triangle、SHA-256
- 對應個別 STEP 的本機下載
- 桌面、平板與手機面板

## 本機預覽

此專案沒有 npm、後端或建置步驟。在專案根目錄啟動任一靜態 HTTP server，例如：

```bash
python3 -m http.server 8080
```

再開啟 `http://127.0.0.1:8080/`。請勿直接雙擊 `index.html`，因為瀏覽器不允許 `file://` 安全載入 Web Worker／WebAssembly。

## GitHub Pages

Repository 已包含 `.github/workflows/deploy-pages.yml`。推送到預設分支後，在 GitHub repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**；之後每次 push 都會先執行 CAD 洩漏檢查，再發布靜態檔案。

也可以不使用 workflow，直接把 repository root 設為 GitHub Pages 的 branch publishing source。

## 機密資料防護

- Repository 不包含任何示範或公司 STEP、STP、ZIP、parts manifest、衍生 mesh 或幾何報告。
- `.gitignore` 會忽略常見 CAD／封裝格式。
- `scripts/check-no-cad.sh` 會在 GitHub Actions 發布前阻擋 CAD、ZIP 與常見幾何輸出。
- 網站不含 analytics、API call、雲端上傳或模型 persistence；重新整理或關閉頁面後，模型會從頁面記憶體移除。

瀏覽器載入網站本身時仍會依 GitHub Pages 的一般機制向 GitHub 取得 HTML、JavaScript、WebAssembly 與樣式檔；只有使用者選擇的 ZIP／STEP 不會由本應用程式送出。

## 第三方元件

執行期已 vendored，不依賴 CDN。版本與授權見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
