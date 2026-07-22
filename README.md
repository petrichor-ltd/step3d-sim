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
- 自動辨識並顯示 STEP AP203／AP214／AP242 schema
- STEP 階層、搜尋、自動組立分支分類
- 3D 選取、隔離、隱藏、顯示全部
- 前／上／右／等角視角與選取置中
- 爆炸距離、依 STEP 檔／零件自動分色、STEP 原色、tessellation 網格
- 兩點 mesh 量測
- AABB、外包尺寸、近似表面積／體積、mesh／vertex／triangle、SHA-256
- 對應個別 STEP 的本機下載
- 桌面、平板與手機面板
- 匿名瀏覽／模型開啟／schema 相容性統計與管理儀表板

## 本機預覽

主網站沒有 npm 或建置步驟。在專案根目錄啟動任一靜態 HTTP server，例如：

```bash
python3 -m http.server 8080
```

再開啟 `http://127.0.0.1:8080/`。請勿直接雙擊 `index.html`，因為瀏覽器不允許 `file://` 安全載入 Web Worker／WebAssembly。

## GitHub Pages

Repository 已包含 `.github/workflows/deploy-pages.yml`。推送到預設分支後，在 GitHub repository 的 **Settings → Pages → Source** 選擇 **GitHub Actions**；之後每次 push 都會先執行 CAD 洩漏檢查，再發布靜態檔案。

也可以不使用 workflow，直接把 repository root 設為 GitHub Pages 的 branch publishing source。

## 匿名使用統計

主網站仍是 GitHub Pages 純靜態網站；`analytics-worker/` 是可獨立部署的 Cloudflare Worker＋D1 後台。統計服務失效時，STEP 上傳與 3D 檢視不會受到影響。

紀錄內容只有：

- `page_view`、ZIP 接受／拒絕、模型開啟成功／失敗。
- STEP schema：AP203、AP214、AP242、Other 或 Unknown。
- 預先定義的錯誤分類，例如加密、ZIP64、解析失敗或沒有可顯示幾何。
- 以每日 salted hash 去重的訪客數，以及只存在分頁記憶體的匿名 session。

不記錄 ZIP、STEP、檔名、零件名稱、尺寸、幾何、來源 hash、原始 IP 或完整錯誤訊息。daily visitor hash 與 event receipt 最多保留 180 天；每日 aggregate count 會持續保留。

### 部署統計後台

1. 進入 `analytics-worker/`，建立 D1：

   ```bash
   npx wrangler@latest d1 create step3d-analytics
   ```

2. 把回傳的 `database_id` 寫入 `analytics-worker/wrangler.jsonc`。
3. 套用 migration：

   ```bash
   npx wrangler@latest d1 migrations apply step3d-analytics --remote
   ```

4. 設定兩個不進版控的 secret：

   ```bash
   npx wrangler@latest secret put ADMIN_TOKEN
   npx wrangler@latest secret put ANALYTICS_SALT
   ```

5. 部署 Worker，並把 `analytics-config.js` 的 endpoint 改成實際 Worker URL。正式 Worker 使用 `https://step3d-analytics.petrichor.tw` custom domain；Workers.dev 與 preview URL 均關閉，以縮小公開入口。

   ```bash
   npx wrangler@latest deploy
   ```

後台位於 Worker 的 `/admin`，輸入 `ADMIN_TOKEN` 後可看 7／30／90／180 天的訪客、瀏覽、成功／失敗與 schema 分布。token 會在送出請求後立即從輸入欄位清空，不會寫入瀏覽器儲存空間；正式環境的 token 存於 Cloudflare encrypted secret 與本機 macOS Keychain，不會進入 Git。

需要登入後台時，可在本機 Terminal 從 Keychain 取回 token：

```bash
security find-generic-password -a step3d-sim-admin -s petrichor-step3d-cloudflare -w
```

Wrangler OAuth 僅在部署期間使用；完成驗證後執行 `npx wrangler@latest logout` 撤銷本機授權。D1 database ID 不是密鑰，可以安全保留在部署設定中。

## 機密資料防護

- Repository 不包含任何示範或公司 STEP、STP、ZIP、parts manifest、衍生 mesh 或幾何報告。
- `.gitignore` 會忽略常見 CAD／封裝格式。
- `.gitignore` 也會阻擋 `.env`、`.dev.vars` 與 Wrangler 本機狀態，避免 secret 誤入版控。
- `scripts/check-no-cad.sh` 會在 GitHub Actions 發布前阻擋 CAD、ZIP 與常見幾何輸出。
- 模型解析不呼叫雲端 API，也沒有模型 persistence；重新整理或關閉頁面後，模型會從頁面記憶體移除。
- 啟用匿名統計後只傳送上述固定事件欄位；統計 API 永遠不接收檔案或模型 metadata。

瀏覽器載入網站本身時仍會依 GitHub Pages 的一般機制向 GitHub 取得 HTML、JavaScript、WebAssembly 與樣式檔；只有匿名使用事件會送往設定的統計 Worker，使用者選擇的 ZIP／STEP 不會由本應用程式送出。

## 第三方元件

執行期已 vendored，不依賴 CDN。版本與授權見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
