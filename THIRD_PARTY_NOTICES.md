# Third-party notices

網站執行期使用以下 vendored open-source dependencies；模型解析時不需要連接 CDN。

## occt-import-js 0.0.23

- Project: <https://github.com/kovacsv/occt-import-js>
- Purpose: 在 Web Worker 中透過 Open Cascade 讀取 STEP 並產生 hierarchy／tessellation。
- License: LGPL-2.1；本地副本位於 `vendor/occt-import-js/LICENSE.md`。
- Vendored files: `occt-import-js.js`、`occt-import-js.wasm`、`occt-import-js-worker.js`。
- Local modification: worker wrapper 增加解析錯誤回傳；parser 與 WebAssembly 本體未修改。

## three.js 0.176.0

- Project: <https://github.com/mrdoob/three.js>
- Purpose: WebGL scene、camera、material、raycast 與 OrbitControls。
- License: MIT；本地副本位於 `vendor/three/LICENSE`。
- Vendored files: `three.module.js`、`three.core.js`、`addons/controls/OrbitControls.js`。
- Local modification: 無。

## fflate 0.8.2

- Project: <https://github.com/101arrowz/fflate>
- Purpose: 在瀏覽器本機解壓縮使用者選擇的 ZIP。
- License: MIT；本地副本位於 `vendor/fflate/LICENSE`。
- Vendored file: `fflate.module.js`（npm package 的 `esm/browser.js`）。
- Local modification: 無。

本文件僅作工程追溯，不構成法律意見。公開散布前仍應由交付方確認適用的 LGPL／MIT 義務。

Vendored runtime 的完整性可用 `shasum -a 256 -c vendor/SHA256SUMS.txt` 驗證。
