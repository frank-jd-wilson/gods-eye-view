# GOOGLE 3D 停用問題與修復驗收

基於Buildings分支HEAD `7bf6e50480355f9b42c4a26aed840407cdd434a4`，獨立分支feature/cesium-ion-google-photorealistic。沒有修改main、Terrain／Buildings／品牌分支或合併任何PR。

## 已確認的根因與尚未確定的原因

舊流程：app/scene.js啟動時等待loadPhotorealisticTileset；任何原因導致最後沒有Tileset，googleTileset就是null。maps/defaultSources.js將photoreal.available設為Boolean(googleTileset)，registry建立後沒有新的Google載入factory。mapStackChips.js因此產生aria-disabled=true及unavailable外觀，而且click不呼叫載入；maps/controller.js的setStack也會因isStackAvailable=false直接返回。啟動失敗一次，就失去實際重試入口。

這個判斷是「完整啟動載入成功與否」，不是獨立的Token驗證。泛用的「檢查API限制、配額、網路」提示不能證明401／403，更不能推定缺少Google Maps API Key。

可取得的原始Git基準15de9d73與Buildings HEAD比較：maps/google3d.js、app/viewer.js、main.js、server/standalone/vite.config.js、package.json與package-lock.json沒有差異。原始基準的ion路徑已使用IonResource.fromAssetId(2275207,{accessToken})再Cesium3DTileset.fromUrl；直接Google路徑使用createGooglePhotorealistic3DTileset；另有伺服器短期Google Token路徑。因此不能只靠Default Token這個名稱，斷言AI Studio或Pinokio當時走哪一路，或宣稱品牌改動破壞了SDK。其確切提交、實際設定來源與首次失敗的Network回應未提供，仍待人工核對。

已新增的Terrain與Buildings使用同一份已注入CESIUM_ION_TOKEN，但asset 1及96188成功不等於2275207有權限。原有按鈕停用條件早於這些改動；它們可以改變標準模式的呈現與偏好，不會單獨把成功Google Tileset變成false。

## 最小修復

- 正常啟動不預載Google；標準模式沿用Esri／已保存底圖與地形選擇。明確的分享連結若要求photoreal，仍可在還原時按需載入。
- Registry依可用的設定／載入路徑建立lazy factory，不再以預先載入結果鎖死按鈕。失敗的Promise從cache清除，再選GOOGLE 3D即重試。
- 新factory優先使用已套用的ion Token及asset 2275207，不使用SDK全域預設Token，不要求新增Google Cloud Key。若完全沒有ion Token，保留既有直接Google及本機短期Token服務的相容路徑；本機服務沒有提供Token時給予明確的缺少憑證提示。
- 保留原始createGoogleIonTileset API及Tileset選項；Google初始化（ion endpoint與根Tileset JSON）20秒逾時、取消及晚到結果會清理，不自動反覆重試。
- 沒有憑證／未選取（不發出Google請求）、401、403、429、逾時及一般載入失敗分開；所有公開錯誤只顯示固定文字，不輸出原始SDK錯誤、URL、Token或Authorization。
- 初次載入成功前不移除標準底圖／地形／建築物。成功後使用既有MapSourceController隱藏一般地球與影像，BuildingsController暫時隱藏OSM模型，Viewer與相機不重建、不飛行。
- 切回標準模式恢復原地形與建築物選取。Google runtime tileFailed僅通知一次並返回先前標準底圖；手動重試移除失敗Tileset後重建，不形成自動Google重試循環。
- 從原本的啟動時Tileset參照改成讀取目前controller主機，保留Recent Imagery與偵錯入口的既有動態主機相容性。沒有更動資料內容或翻譯原始名稱。

## 標註及合規界線

IonResource原樣傳給SDK，不剝除credits或覆寫Google來源。標準Esri靜態標註在Google模式移除，Google由Tileset／官方metadata提供credits，切回標準恢復Esri標註。需在Windows確認真正Google Logo及各視角／視窗的供應商標註可見、未裁切或遮擋；合成credit顯示不等於官方Google標註已完成實機驗收。

目前搜尋架構保持原狀；SDK原有直接Google helper有onlyUsingWithGoogleGeocoder=true，但Viewer關閉內建geocoder，不能以此旗標當成已完成合規。正式公開／商業部署前仍需核對Google／ion對地理編碼、其他影像疊圖、擷取與快取的適用規範、授權、配額及費用。本修復不默默新增Google Cloud Key、Google搜尋服務或擴大成全站搜尋重構。

現有Google記憶體cache選項保留原樣，不進行深度GPU效能優化；合成模型測試不能代表完整真實城市的資源需求。

## Windows 11 更新

先於目前伺服器視窗Ctrl+C。PowerShell逐步執行，任何一步失敗就停止：

```powershell
Set-Location -LiteralPath 'F:\Digital Twin\gods-eye-view'
git branch --show-current
git status --short
if (git status --porcelain) { throw '先保留未提交修改，停止更新' }
git fetch origin feature/cesium-ion-google-photorealistic:refs/remotes/origin/feature/cesium-ion-google-photorealistic
git switch --track -c feature/cesium-ion-google-photorealistic origin/feature/cesium-ion-google-photorealistic
git rev-parse HEAD
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

若分支已存在，改用git switch feature/cesium-ion-google-photorealistic，再git pull --ff-only origin feature/cesium-ion-google-photorealistic。沒有新增依賴，不需重裝，不要使用固定舊分支的一鍵bat，不修改Pinokio安裝或系統安全設定。

## Edge 驗收

1. 先沿用目前同一組已儲存Token，不要盲目新增Google Maps API Key。開啟http://127.0.0.1:4175/?lang=zh-TW（先用不含分享hash的網址）。確認Esri、World Terrain、OSM Buildings標準模式正常。
2. 若出現首次啟動導覽，先完成或選擇手動探索並關閉對話框，再開啟Visual Presets／視覺預設。GOOGLE 3D應可選取；有ion Token時不能只因尚未建立Tileset而顯示unavailable。尚未點選前，Network不應有asset 2275207的啟動預載請求。
3. 記錄目前相機與圖層狀態，點GOOGLE 3D。成功後觀察有實際外牆、窗戶、屋頂及道路紋理的Google城市，而不是把山形或OSM白色模型當作Google實景。
4. 檢查Google Logo與供應商attribution清楚可見；確認一般地球、Esri影像及OSM Buildings沒有重複疊在高擬真模型上。必要時用座標導航／滑鼠，不以未確認合規的搜尋路徑作部署驗收。
5. 切回Esri，確認原World Terrain／建築物選取、相機位置與方向恢復；再進Google確認可正常重用模型。
6. 若401／403，記錄分類；403時確認同一Token已授權asset 2275207及目前本機來源，不能以1／96188成功代替此權限。若原版Default Token同值可用，本版仍失敗，只回報失敗網域、HTTP狀態及移除query的path，勿貼Token、完整請求、Authorization或HAR。
7. 故障後GOOGLE 3D應仍能再次選取；解除請求封鎖／修正權限後重試，不需重裝或反覆覆寫金鑰。快取成功時不會重新請求asset endpoint；測試首次失敗可先用乾淨網址F5再操作。
8. 快速Google→Esri、重複十次切換，確認過期載入不反向切回Google、不出現重複Tileset；若runtime圖磚失敗，返回標準後仍可手動重試。
9. 重驗Logo、固定英文Splash、EN／zh-TW即時切換、F5、分享視角還原、OSM故障提示與Esri恢復。

## 自動化界線

自動化不讀取真實Token。單元測試涵蓋availability根因、優先ion路徑、401/403/429/500、重試、逾時／延遲模型與runtime恢復。瀏覽器以真正CesiumJS載入合成3D Tiles和模擬Google credit，地形亦有模擬；驗證介面、互斥、相機與資源生命週期，不代表真實Google城市紋理、官方標註、Windows Edge、帳戶授權或實際網路已驗收。
