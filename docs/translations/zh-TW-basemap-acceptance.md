# Windows Edge 底圖切換與故障驗收

此變更僅供 Windows 11 本機開發／驗收。分支為 `feature/zh-tw-localization`，沿用 Draft PR #2，不合併 main。

## 行為及設定優先順序

- 不新增全體使用者的永久預設。既有無 Google 3D 時使用 Esri 的啟動預設維持不變。
- OSM 與 Esri 使用既有地圖來源選單。Esri 改用使用者已測通的官方 `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer`；不是轉送／代理下載。
- 最終優先順序：**有效分享網址所指定的底圖 → 本機底圖偏好 → 既有預設**。啟動先讀本機偏好，再由既有分享還原流程套用有效分享；分享不覆寫已儲存偏好。
- `localStorage` 的 `gev:basemap:v1` 只儲存 `osm` 或 `esri-imagery`；手動選擇其他來源會清除此偏好。只有使用者成功啟用所選來源才儲存，背景 fallback、分享還原及暫時比較不儲存。啟用成功不代表所有圖磚已到達。
- 本機儲存依網站來源區隔：`127.0.0.1:4175` 與 `localhost:4175`／其他連接埠不共用設定。儲存被封鎖時顯示提示，App 仍可切換。
- OSM 第一次確定的圖磚失敗後，或已有請求且連續 15 秒沒有成功取得圖磚時，設定錯誤事件 `retry=false` 並隱藏該 imagery layer，暫停後續圖磚排程；已送出的請求仍可能稍後失敗。顯示一則浮動的非阻塞繁體提示及「切換至 Esri 衛星影像」按鈕，不依賴視覺預設面板是否展開。相同故障期間不重複建立提示；切換回 Esri 後隱藏，並清除舊來源監測／忽略舊非同步回報。15 秒監測從實際送出且回傳 Promise 的圖磚請求開始；瀏覽器背景分頁節流可能延遲計時。Cesium 排程取消或尚未排入請求不視為網路故障。
- 再選 OSM 是明確手動重試，會重建暫停的 layer。OSM 不自動切回 Esri。原有 Esri → OSM 單向 fallback 保留；Esri 的背景恢復最多三次（30／60／120 秒退避；共用地形恢復排程時時序可能不同）。OSM 也失敗時停止 Esri 背景恢復，避免自動循環。已在進行的恢復可能完成，但不會在 OSM 暫停後自動切換。
- 使用者手動選擇可明確重新嘗試 Esri，並重設三次背景恢復額度。既有地形 fallback／恢復機制不改動。
- 切換只替換底圖來源，不呼叫相機飛行、移動或縮放，不改圖層、座標或語言設定。

## 安全更新與啟動（PowerShell）

1. 回到目前執行 Vite 的終端按 `Ctrl+C`。若批次視窗詢問是否終止，輸入 `Y`。不要用全域結束所有 Node 程序的命令，以免影響 Pinokio 或其他專案。
2. 開啟一般 PowerShell，不需系統管理員權限，執行：

```powershell
Set-Location -LiteralPath 'F:\Digital Twin\gods-eye-view'
git remote get-url origin
git branch --show-current
git status --short
```

確認 origin 為自己的 `frank-jd-wilson/gods-eye-view` Fork，分支為 `feature/zh-tw-localization`。若不是，或有任何未提交／未追蹤檔案，先停止更新並保留資料；不要 reset、clean、強制切換或刪除安裝。

3. 以下命令檢查後只進行 fast-forward：

```powershell
if ((git branch --show-current) -ne 'feature/zh-tw-localization') { throw '分支不符，停止更新' }
if ((git remote get-url origin) -notmatch '^https://github\.com/frank-jd-wilson/gods-eye-view(?:\.git)?$') { throw '來源不符，停止更新' }
if (git status --porcelain) { throw '有本機修改，停止更新' }
git fetch origin feature/zh-tw-localization
if ($LASTEXITCODE -ne 0) { throw 'fetch 失敗' }
git merge-base --is-ancestor HEAD origin/feature/zh-tw-localization
if ($LASTEXITCODE -ne 0) { throw '有額外本機提交或分歧，停止更新' }
git merge --ff-only origin/feature/zh-tw-localization
if ($LASTEXITCODE -ne 0) { throw '更新失敗' }
git rev-parse HEAD
```

4. 本次沒有變更 package.json 或 lockfile，已有正常相依套件時**不必重新安裝**。若套件缺少，才執行以下安裝分支，然後啟動：

```powershell
node.exe --version
npm.cmd --version
if (-not (Test-Path -LiteralPath '.\node_modules\vite\bin\vite.js')) {
    $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw '相依套件安裝失敗' }
}
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

使用 `npm.cmd`，無需變更 PowerShell 執行政策。顯示 ready 後在 Edge 開啟 <http://127.0.0.1:4175/?lang=zh-TW>，終端保持開啟。若連接埠被占用，先確認是否仍有之前的驗收伺服器，而非強制結束其他程式。

## Edge 人工驗收

記錄 Commit、Edge 版本、網路、視窗尺寸、縮放及每項「通過／失敗／未測」。

1. **Esri 真實載入**：展開控制面板的「地圖來源」，選 `Esri Satellite`。等候圖磚載入，拉遠至全球並旋轉各方向，再拉近地面；檢查影像、地形、拖曳、縮放與資料圖層。單一測試圖磚成功不能代表所有區域／層級成功。
2. **相機保留**：固定目前位置與視角，切換 OSM／Esri；相機不得突然飛往其他位置。OSM 網路不通時應呈現可理解的失敗狀態，不要求 OSM 成功載入。
3. **OSM 故障**：在目前已知 OSM 不通的網路選 OSM，保持分頁前景；應於第一次確定失敗，或請求持續未成功約 15 秒後顯示提示，不必等到瀏覽器數分鐘的連線逾時。確認繁體「無法載入 OpenStreetMap 圖磚。已暫停請求…」提示及「切換至 Esri 衛星影像」操作。即使「視覺預設」保持收合，浮動提示及按鈕仍應可見、可點擊。點選後應顯示 Esri，提示消失，不應來回自動跳換；等候先前 OSM 請求逾時後，提示也不應再次出現。
4. **有限請求**：Edge DevTools Network 篩選 `tile.openstreetmap.org`。暫停後等既有請求結束，請求數不應持續成長；再選 OSM 才重新嘗試。多個先前送出的逾時不可誤判為重試。另檢查兩個服務皆失敗時無自動循環，不把這種情境標成可用。
5. **偏好保存**：手動選 Esri 後，開一個新分頁，直接貼上 <http://127.0.0.1:4175/?lang=zh-TW>，**不要附帶 `#…map=…` 分享狀態**；按 F5 並關閉重開分頁，仍應使用 Esri。DevTools Application → Local Storage 可檢查 `gev:basemap:v1=esri-imagery`。同樣測試 OSM 選擇保存，但網路不通不代表保存失敗。
6. **分享優先**：先保存 OSM，再開含有效座標且指定 `map=esri-imagery` 的分享連結；畫面應使用 Esri，本機偏好仍是 OSM。之後以不含分享狀態的乾淨網址開啟，應再採用 OSM。
7. **語言**：English 下故障提示及切換操作為英文；繁體中文下為台灣繁體用語。中英文切換與不含 `?lang=` 的 F5 偏好保存仍正常。
8. **Attribution**：Esri 顯示時，地圖 credit 區域應保留 `Powered by Esri` 與服務實際提供的資料來源文字，必要時開啟 Cesium 的來源資訊。供應商名稱可隨服務更新，不強制要求出現或不出現某家公司；測試要確認它來自 metadata，而非程式寫死。切換 OSM 後應顯示 OpenStreetMap contributors。

## 授權及雲端驗證限制

官方資訊：[World Imagery](https://goto.arcgisonline.com/maps/World_Imagery)、[Esri Master Agreement](https://www.esri.com/en-us/legal/terms/full-master-agreement)。本次未確認商業部署資格、金鑰要求與用量限制；能連線不是授權證明。可讀取的官方 `services.arcgisonline.com` metadata 回報 `exportTilesAllowed: false`。不實作圖磚批次下載或離線地圖。

Codex Cloud 真實網路探測：OSM 指定測試圖磚 HTTP 200，`services.arcgisonline.com` metadata HTTP 200；Windows 測通的 `server.arcgisonline.com` 與 Esri 條款網站在 Codex 被 CONNECT 代理以 403 拒絕，來源站 HTTP 未取得。未放寬網路設定。因此雲端的失敗／恢復瀏覽器情境使用攔截請求及人工產生的測試圖像，**只驗證功能邏輯，不是真實 Esri 地圖或 Windows Edge 驗收成功**。原生滑鼠／Windows 網路仍須依上述步驟人工確認。

## OSM 提示補修驗收紀錄

使用者已在 Windows 11 Edge 回報 Esri 圖磚、attribution、語言切換、F5 及 Esri／OSM 手動切換成功；但 OSM 逾時時沒有提示。程式檢查確認原實作依賴 Cesium errorEvent，未涵蓋仍 pending 的連線，且操作提示位於可收合面板內。實際 Windows 當時是否已觸發 errorEvent 尚無瀏覽器事件追蹤，不能斷言每次未顯示的原因都相同。

此補修監測既有 OSM provider 實例的公開 requestImage Promise，保留原 Promise、排程及取消語意；成功進度會重設 15 秒監測。切換來源及銷毀時移除監聽與計時；同來源重套用時保留尚在進行的監測，不修改 Cesium 核心或 Esri provider。一般介面是原生 DOM，沒有 React 狀態傳遞層。

請更新後以中英文各重測 OSM 不通情境：收合視覺預設，等候單一浮動提示，直接按切換 Esri，確認影像恢復、提示隱藏；再等候至少一分鐘，確認舊錯誤不會使提示復現。另測手動提前切回 Esri（15 秒內），不得稍後冒出 OSM 提示。雲端的 pending／失敗案例為攔截請求模擬，不等於 Windows 真實網路驗收通過。
