# Cesium ion 設定與獨立地形驗收

本功能從品牌 PR #5 的 `f9d651e6c2fe2b08706809614a22d6c03018a8aa` 建立獨立分支；品牌、Logo 與 Splash 沿用既有版本。一般 UI 語言切換不重新載入；**更新金鑰**仍需 Vite 重啟及 App 重新載入，以重新注入瀏覽器端設定。

## 設定狀態

- CESIUM ION 琥珀色燈：有設定值，尚未驗證權限。密碼欄位的「已儲存 — 貼上可替換」是 placeholder，不是 Token，也不會阻止輸入。
- 儲存：只提交非空欄位；留白保留原設定。一般 `npm.cmd run dev` 寫入專案 `.env`；Pinokio 啟動時仍寫入其 App 設定來源。外部環境／啟動器管理的金鑰維持唯讀，不繞過原有保護。
- 後端原子寫入並讀回確認後才回覆成功，再請求 Vite 重啟。不要將 `.env` 或任何真實憑證提交至 Git。
- 已儲存／等待重新載入：新 Token 尚未套用到目前 App。Vite 正常會重新載入；若未完成，按「重新載入 App 以套用已儲存的金鑰」，必要時手動重啟伺服器。
- 重新載入後，使用 sessionStorage 中的 SHA-256 摘要與已注入值比對，確認讀取是否符合本次儲存。Web storage **不存 Token 原文**；摘要不提供資產存取驗證。摘要不符顯示「套用失敗」。儲存空間被封鎖時，持久儲存仍可進行，但套用確認需人工驗證。
- 「驗證 World Terrain 存取權」以目前已套用的 Token 向 `https://api.cesium.com/v1/assets/1/endpoint` 發出一次要求。若仍有未儲存的替換值，要求先儲存及重新載入，不驗證舊值冒充新值。
- 驗證成功（綠燈）只表示這次端點可存取，**不代表**所有地形圖磚、Google 3D、Bing 或其他資產已獲授權。每次啟動重新回到未驗證狀態。
- 401／403、網路失敗及15秒逾時有安全的中英文提示。錯誤不呈現完整 URL、Authorization、Token 或服務回傳本文。若儲存回應遺失，會提示「尚未確認」，不假設檔案完全未變更。

## 獨立 3D 地形

在底部「視覺預設／Visual Presets」的地圖來源區域，下方有「3D 地形／3D Terrain」：

1. Cesium World Terrain：ion asset `1`，需要已套用 Token 及適當資產權限。
2. 免費地形（Re:Earth）：沿用現有地形來源及既有授權標示。
3. 平坦地球：Cesium Ellipsoid，不需要 Token 或地形網路服務。

第一次預設免費地形，即使有 Token 也不自動要求 World Terrain。優先順序為瀏覽器已儲存的有效 `gev:terrain:v1` 偏好，再回到免費地形；只有成功的使用者選取才保存。地形偏好不寫入分享網址，不取代其底圖／相機設定。儲存 World Terrain 後移除 Token，會提示缺少 Token並保留目前地形／影像，可手動恢復免費或平坦地球。

地形控制器只切換 `viewer.terrainProvider`，不移除影像、不重建 Viewer，也不飛行相機。初始化失敗保留先前地形；逾時及舊請求結果不覆蓋新選取。地形圖磚錯誤顯示單一非阻塞式通知及免費地形恢復按鈕，也可在選單選擇平坦地球；不自動循環切換。Google 3D 繼續使用自身地形，該模式停用獨立地形選單；先切 Esri／OSM 再操作。沒有新增 OSM Buildings。

## Windows 11 更新

先在目前開發伺服器視窗 Ctrl+C。PowerShell 逐步執行，任何一步失敗就停止：

```powershell
Set-Location -LiteralPath 'F:\Digital Twin\gods-eye-view'
git branch --show-current
git status --short
if (git status --porcelain) { throw '先保留本機未提交修改，停止更新' }
git fetch origin feature/cesium-ion-settings-terrain:refs/remotes/origin/feature/cesium-ion-settings-terrain
git switch --track -c feature/cesium-ion-settings-terrain origin/feature/cesium-ion-settings-terrain
git rev-parse HEAD
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

若分支已存在，改用 `git switch feature/cesium-ion-settings-terrain`，再 `git pull --ff-only origin feature/cesium-ion-settings-terrain`。本次沒有新增依賴，不需重新安裝；不要使用會切回舊 zh-TW 分支的一鍵驗收腳本。**不要刪除／覆寫原有 Pinokio 安裝或變更 Windows 安全性設定。**

## Edge 人工驗收

1. 開啟 `http://127.0.0.1:4175/?lang=zh-TW&setup=1`。確認新 Logo、固定英文 Splash 與主畫面繁中品牌。Provider Settings API 只有 dev server 提供，不能用 `npm preview` 代替。
2. 確認「有設定」是未驗證狀態。於 Cesium ion 自己的網站設定**可由瀏覽器使用的受限 Token**，授予所需資產讀取權並檢查允許的本機來源（`localhost` 與 `127.0.0.1` 是不同來源）。不需要分享 Token 給 Codex。
3. 在 CESIUM ION 密碼欄貼上替換 Token；按儲存金鑰，確認已儲存／等待重新載入，觀察 Vite 重啟與頁面重新載入。不要截圖輸入內容、複製完整 Network URL 或 Authorization。
4. 重新載入後確認「已讀取儲存的 Token」，再按驗證，記錄成功／401／403／逾時的分類。Token 可存取地形不代表可存取 Google 3D asset `2275207`。
5. 選 Esri，選免費地形、平坦地球、World Terrain。到有起伏的山區，以斜視角檢查高程；平坦地區或垂直視角不足以驗收地形。確認衛星影像仍在、相機／圖層／面板狀態保持。啟用地形後地表外觀自然會改變。
6. F5、Ctrl+C 停止並重新啟動伺服器，確認設定持續、地形偏好保存；再執行一次存取驗證。
7. 使用受限測試 Token 或 Edge DevTools 的請求封鎖測試失敗，不要在正式 Token 上隨意破壞權限。確認401／403或網路錯誤有明確提示，免費地形／平坦地球可恢復；底圖不消失。解除封鎖後恢復測試。
8. EN／zh-TW 即時切換，檢查新地形控制與錯誤提示語言；確認既有品牌、側欄、Esri attribution、OSM 15秒故障提示及 Esri 恢復仍正常。
9. 若有 Google 3D 授權，驗證既有開關與地形選單停用說明；若無授權，記為未測試，不作成功宣稱。

## 驗證範圍與限制

自動化僅使用模擬 Token。儲存 API 測試在隔離暫存目錄檢查原子儲存、替換、讀回、重啟後讀取與不洩漏回應；瀏覽器攔截設定／ion／影像 API，部分地形 Provider 使用可控制的模擬，不代表真實 World Terrain 圖磚或 Windows Edge 驗收。既有 OSM／Esri／品牌／Splash 回歸另外保留。

新訊息完整支援英文與 zh-TW；es、ru、zh-CN 的新增訊息暫採明確英文 fallback，不覆蓋其既有翻譯。正式 ion／Google／Esri 商業部署授權、配額與可用服務網域仍待確認。不能將可連線或驗證成功解讀為所有資料的部署授權。
