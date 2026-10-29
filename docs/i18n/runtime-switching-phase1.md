# Runtime i18n：第一階段設計與驗收

本分支以品牌分支 `6fd1eb6a0946ee6b5adbe2d6bec48769170ef402` 為基準；使用者已回報品牌與地圖 9/9 PASS。本次是獨立架構改善，第一階段交付後仍需 Windows Edge 驗收，不把既有 PASS 當成本次結果。

## 盤點與階段

| 範圍                                                                  | 實際來源／更新機制                                         | 第一階段處理                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 語言狀態與偏好                                                        | i18n/index.js 的 setLocale／subscribeLocale；gev:locale:v1 | 沿用，無第二份狀態                                                                      |
| 靜態側欄與隱藏面板                                                    | templates/layer-panels.html、context.html 的 data-i18n*    | 保存英文來源，原地重譯兩個 rail 的 opt-in 標籤                                          |
| 資料圖層與分組                                                        | LayerPanel.mount／_renderToggles／_refreshTogglePanel      | 只更新名稱、群組、狀態、既有 keyed chips/list；不重建圖層列                             |
| 面板 chrome                                                           | applicationShell、PanelChrome._syncPanelCollapseButton     | 更新標題與 aria/title，不改 collapsed／pin／scroll                                      |
| 天氣展開卡片                                                          | weatherPanel、railTimeline、railCards                      | 使用既有 update；更新初始化標籤，保留 openId、slider 與 keyed 卡片                      |
| Recent Imagery Details 與控制                                         | recentImagery 的 snapshot、render*、preserveScroll         | 讀取新語系 snapshot，文字呈現更新；不呼叫 split、工具、reportVisibleRange 或資料 action |
| 搜尋、設定、對話框、通知、語音、CCTV/Street Level 等專用動態 renderer | 各 feature owner                                           | 第二階段，尚未全面即時化；本階段僅其 rail 內明確 opt-in 靜態標籤受覆蓋                  |
| HUD 動態摘要、場景編輯器、外部資料欄位                                | HUD／SceneControls／provider                               | 不猜測翻譯；使用者名稱、設備碼、座標、provider 原文保留                                 |

資料圖層主要是 group heading，不是每個標題都具備 folder toggle。實際可展開的 rail／Details 沿用原節點及 owner 的 open 狀態；不為了測試新增虛構的資料夾系統。

第二階段需依第一階段 Edge 結果確認後，再逐一遷移搜尋、設定、對話框、CCTV／Street Level／SDR 等動態狀態呈現；不呼叫完整 App 初始化。第三階段再進行全站覆蓋、長時間訂閱／效能與所有面板的狀態回歸。此次不宣稱完成全站驗收項目。

## 核心設計與主要風險

- 宣告式 data-i18n* 節點的原始 key 在第一次 boot 翻譯前保存於 WeakMap；English boot 也建立綁定，確保 EN→ZH→EN 可逆。沒有反向查字典、沒有掃描任意字串。
- 綁定只查詢自己擁有的側欄 subtree，包含 hidden 內容；不改 input.value、raw data、機器 id 或 user-authored 名稱。owner 已改寫的標籤不被初始靜態快取覆蓋，交回動態 renderer 翻譯。
- 新建 feature DOM 使用當前 t() 或明確來源 marker；已存在而暫時隱藏的模板會在語言事件時更新。沒有全站 MutationObserver，不重建 App 根節點。
- 訂閱在 remount／destroy 時清理；圖層 row 的監聽不因語言重綁，資料參數不會被重新送出。靜態綁定不具備全站自動翻譯能力：未遷移動態 renderer 仍列第二階段。
- 以原有值更新函式避免無變更時的 DOM 寫入；保留既有零寫入 regression。語言事件可更新日期／數字的呈現，不改實際資料值。
- 風險包括：動態 owner 與初始 marker 的責任交疊、延遲建立的面板沒有來源 key、locale 格式化誤被當作資料修改，以及開啟卡片／拖曳中的控件因重建而失去狀態。測試分別驗證來源可逆、保留 owner 更新、raw name 不變、keyed identity、open／value／scroll 與無額外 action。
- Cesium Viewer、ImageryProvider、相機、地形、圖層資料與 OSM／Esri 網路邏輯不修改。雲端地圖情境使用受控圖像／故障時，須標為模擬，不當作 Windows 真實網路 PASS。

## Windows 更新、啟動與 Edge 驗收

先在現有 Vite 視窗 Ctrl+C。一般 PowerShell：

```powershell
Set-Location -LiteralPath 'F:\Digital Twin\gods-eye-view'
git branch --show-current
git status --short
if (git status --porcelain) { throw '先保留本機修改，停止更新' }
git fetch origin feature/runtime-i18n-switching:refs/remotes/origin/feature/runtime-i18n-switching
if ($LASTEXITCODE -ne 0) { throw 'fetch 失敗' }
git switch --track -c feature/runtime-i18n-switching origin/feature/runtime-i18n-switching
if ($LASTEXITCODE -ne 0) { throw '切換失敗；若分支已存在，先確認狀態再切換' }
git rev-parse HEAD
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

已存在本機分支時改用 `git switch feature/runtime-i18n-switching`，確認沒有額外本機提交後以 `git merge --ff-only origin/feature/runtime-i18n-switching` 更新。依賴不變，不需重裝；不要使用限定 zh-TW 分支的舊 bat。

在 Edge 開啟 `http://127.0.0.1:4175/?lang=en`：

1. 展開資料圖層、CCTV／Street Level 等側欄，記錄選取圖層、展開狀態、捲動位置與搜尋輸入。
2. EN→ZH-TW→EN：資料圖層標題、分組、名稱／狀態及 panel toggle 提示立即切換，hidden 面板之後展開亦正確；未遷移的專用動態欄位另列，不當作全站完成。
3. 開啟 Recent Imagery Details 與天氣卡片（服務可用時），切換語言並檢查仍展開、controls 值未改。原始地名、granule／設備碼、使用者名稱與座標不得被翻譯。
4. 快速切換 20 次，不能出現多次動作／重複訂閱；輸入值、圖層與相機不改。檢查 390、721、1024、1440px 或相近視窗寬度是否溢出、遮擋、缺字。
5. 以不含 `?lang=` 的網址 F5，確認語言保存。檢查品牌 U+2027、Esri 影像、attribution、OSM 單一錯誤提示與切 Esri 恢復仍正常。
6. 每項記錄 PASS／FAIL／未測、Edge 版本、完整 Commit 與縮放比例。沒有服務或未啟用的面板標「未測」，不推定 PASS。

## UI 翻譯候選清單

以下為 `src/ui/*.js` 中含 t() 呼叫的靜態搜尋結果；這是盤點索引，不等於每個模組都需修改，也不能僅憑此判定其初始化／更新時機。上表列出第一階段手工追蹤的 owner，其餘留作下一階段審閱。

先前「約 93」是寬鬆字串盤點，會包含 update／set 等並非翻譯呼叫；本次以直接 t() 呼叫縮小為 52 個候選模組，並依 owner／生命週期決定修改，不機械式改完所有檔案。

- `src/ui/applicationShell.js`
- `src/ui/cameraOrientationControls.js`
- `src/ui/cctvBindings.js`
- `src/ui/cctvCalibration.js`
- `src/ui/cctvFrames.js`
- `src/ui/cctvPresentation.js`
- `src/ui/clearLayersControl.js`
- `src/ui/cockpitBriefing.js`
- `src/ui/cockpitContext.js`
- `src/ui/cockpitInstruments.js`
- `src/ui/cockpitLayout.js`
- `src/ui/cockpitPresentation.js`
- `src/ui/cockpitSignals.js`
- `src/ui/cockpitTrackingController.js`
- `src/ui/contextActions.js`
- `src/ui/contextBindings.js`
- `src/ui/contextLayerChanges.js`
- `src/ui/contextSubscriptions.js`
- `src/ui/frameRateMonitor.js`
- `src/ui/geoFileImport.js`
- `src/ui/keyGuidance.js`
- `src/ui/layerNames.js`
- `src/ui/layerPanel.js`
- `src/ui/localSdrControls.js`
- `src/ui/localSdrPresentation.js`
- `src/ui/localePicker.js`
- `src/ui/locationControls.js`
- `src/ui/locationNavigation.js`
- `src/ui/mapSourceControls.js`
- `src/ui/mobileShell.js`
- `src/ui/panelChrome.js`
- `src/ui/panelPositionControls.js`
- `src/ui/placeNames.js`
- `src/ui/radioBindings.js`
- `src/ui/radioControls.js`
- `src/ui/radioPresentation.js`
- `src/ui/railCardBlocks.js`
- `src/ui/railTimeline.js`
- `src/ui/recentImagery.js`
- `src/ui/sceneControls.js`
- `src/ui/scenePresentation.js`
- `src/ui/sceneSharing.js`
- `src/ui/shareRestoration.js`
- `src/ui/shellFeedback.js`
- `src/ui/statusText.js`
- `src/ui/streetLevelControls.js`
- `src/ui/streetLevelPresentation.js`
- `src/ui/styleParameters.js`
- `src/ui/unitLabels.js`
- `src/ui/visualPresets.js`
- `src/ui/visualSettings.js`
- `src/ui/weatherPanel.js`
