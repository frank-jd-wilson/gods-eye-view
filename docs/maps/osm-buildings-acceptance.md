# Esri + World Terrain + Cesium OSM Buildings

本分支從 `feature/cesium-ion-settings-terrain` 的 `2384ed90a0d0a9278c99cc6c82dc9fcec38e2c51` 建立。既有地形與Token功能保留；沒有合併或修改PR #6、品牌PR #5或main。

## 三種不同資料

- Esri Satellite：影像底圖。
- Cesium World Terrain（ion asset 1）：高程地形。
- Cesium OSM Buildings（ion asset 96188）：獨立3D Tiles建築模型，加入同一Viewer的scene.primitives，不是地形高程效果。

目前實際安裝CesiumJS 1.138.0。這個版本的createOsmBuildingsAsync與fromIonAssetId不接受每次呼叫的accessToken，而是使用全域ion預設值。因此沿用專案現有慣例：IonResource.fromAssetId(96188, {accessToken})，再Cesium3DTileset.fromUrl(resource)。不修改Ion.defaultAccessToken，不嵌入真實Token，不加新依賴。

## 操作與生命週期

在底部「視覺預設／Visual Presets」→地圖來源區下方新增「3D 建築物／3D BUILDINGS」：

- Off／關閉：預設值，每次啟動都關閉，不記憶自動開啟。預設不請求資產96188。
- Cesium OSM Buildings／Cesium OSM 建築物：使用本次App已套用的CESIUM_ION_TOKEN。可與Esri和World Terrain同時啟用。

正常Off只隱藏並保留單一Tileset快取，再開啟重用；正在初始化時關閉，請求可能完成但結果維持隱藏，不會反過來重新啟用。重複開啟共用同一個未完成請求。錯誤後手動重試會先清除錯誤Tileset再載入。初始化20秒逾時；晚到結果正確釋放。Viewer生命週期結束時清理Tileset、事件與計時器。快取上限64MiB，允許額外32MiB溢出；這不是整個App的總記憶體上限。

切換地形或Esri／OSM不會移除建築物。Google Photorealistic 3D本身包含建築物，切到該模式時暫時隱藏OSM Buildings；切回一般地球模式恢復已選取的建築物，避免重疊模型。

不修改modelMatrix或手動加減高程，使用資產原有的地理定位。推薦配合World Terrain檢查實際貼地情況；不同地形資料源／建築物資料的精度與日期可能造成局部差異，不能以模擬驗證保證所有城市無落差。

## 狀態與錯誤

- 缺少已套用Token：提示先儲存並重新載入App。
- 401：ion拒絕Token。
- 403：檢查asset 96188權限與允許的來源網址。
- 初始化失敗／逾時：顯示網路與權限指引，影像與地形不移除。
- tileFailed：3D Tiles請求或內容處理失敗，固定安全訊息，隱藏建築物停止繼續顯示錯誤模型；可Off/On或按「重試建築物」。這個SDK事件沒有結構化HTTP狀態，只有訊息明確包含401/403時才分類，否則維持圖磚請求／處理失敗，不猜測Token失效。
- 加入場景失敗：單獨提示Tileset無法加入。
- scene.renderError：只在建築物顯示中發生時隱藏它並通知。這是場景層級事件，不能斷言一定由建築物造成；若畫面仍未恢復，重新載入並調查其他圖層，不自動反覆重啟渲染迴圈。
- 無可見建築物：僅在Tileset目前請求完成且沒有可見feature時提示放大至有資料的城市。這是非錯誤狀態，**不是**「整個區域永久沒有OSM資料」的證明；也可能是視野、LOD或涵蓋範圍因素。官方asset沒有提供本App可用的城市覆蓋查詢API。

事件訊息與日誌不輸出Token、完整URL或回應本文。已註冊tileFailed，避免SDK在無監聽器時自行輸出含Token的圖磚網址。瀏覽器本身的Network仍能看到瀏覽器端Token，勿分享HAR或完整請求；Token必須使用最小資產讀取權及來源限制。保留SDK透過官方資產提供的attribution，Windows驗收時另確認Cesium／OSM來源標示。新文字支援英文／zh-TW，其他現有語系新增文字暫採英文fallback，既有翻譯不覆蓋。

## Windows 11 更新

先在現有伺服器視窗Ctrl+C，PowerShell逐步執行；任何一步失敗就停止，不重裝依賴、不刪除Pinokio或更改系統安全設定：

```powershell
Set-Location -LiteralPath 'F:\Digital Twin\gods-eye-view'
git branch --show-current
git status --short
if (git status --porcelain) { throw '先保留未提交修改，停止更新' }
git fetch origin feature/cesium-osm-3d-buildings:refs/remotes/origin/feature/cesium-osm-3d-buildings
git switch --track -c feature/cesium-osm-3d-buildings origin/feature/cesium-osm-3d-buildings
git rev-parse HEAD
npm.cmd run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

若本機已存在分支，改用git switch feature/cesium-osm-3d-buildings，再git pull --ff-only origin feature/cesium-osm-3d-buildings。不要使用固定舊zh-TW分支的一鍵bat。

## Edge 驗收 A–G

A. 在ion將asset 1及96188加入受限開發Token的授權範圍，確認資產讀取權與允許的本機來源。Token名稱只是標籤；程式讀取既有CESIUM_ION_TOKEN值。若換Token值，沿用Provider Settings儲存、Vite重啟及重新載入；不要把Token貼到GitHub。開啟http://127.0.0.1:4175/?lang=zh-TW，先選Esri Satellite、World Terrain，再開啟OSM Buildings。

B. 搜尋有建築物資料的城市，如San Francisco／舊金山、Taipei／台北，放大到街區並使用「傾斜視角」按鈕。可先以舊金山市中心約37.7749,-122.4194作為候選位置；實際涵蓋仍以當前OSM asset為準，不能預先保證每個街區都有模型。確認立面和屋頂的立體高度，而不是只看山形；同時確認衛星影像、山坡高程及官方attribution。

C. 關閉建築物，確認建築模型消失，Esri影像與World Terrain仍在。記錄相機、圖層、面板狀態，不能因開關主動移動相機。

D. 再開啟，確認模型恢復。另切換平坦／免費／World Terrain，確認建築物圖層未被清除；比較實際貼地效果。

E. 連續Off/On十次，確認只有一套模型、不閃回過期開啟狀態；正常快取不重新初始化asset。可在Edge Performance/Memory另做長時間觀察；自動測試確認物件及事件數量有界，不等於完整記憶體洩漏分析。

F. 測試未設定Token、受限測試Token的401／403與DevTools請求封鎖；不要破壞正式Token，也不要將完整URL／Authorization／HAR貼出。若已有正常快取，先關閉並F5再封鎖，以確保測到新請求。確認錯誤分類、Off及重試可操作，Esri與地形保持。移除封鎖後再試。移到沒有可見建築物的視野，確認呈現涵蓋提示而非錯誤；這不是完整地區無資料的認證。

G. 確認Logo與中／英文品牌、固定英文Splash、即時語系切換、語言／地形偏好、Esri attribution、OSM故障提示及Esri恢復、分享視角還原仍正常。若有Google 3D授權，確認OSM建築物暫時隱藏及返回Esri後恢復；無授權則記為未測試。

## 自動化與人工界線

單元測試使用模擬Token，覆蓋十次重用、快速切換、延遲結果、銷毀、401/403/網路／逾時、加入場景／渲染錯誤、涵蓋提示、明確Token傳遞與即時語系清理。

瀏覽器使用真正CesiumJS處理合成b3dm建築物、模擬ion endpoint／影像，部分地形以平坦Provider代替來隔離狀態測試。這能驗證Tileset實際加入與可見feature、開關重用及其他圖層保留，**不能**視為真實OSM Buildings、World Terrain貼地精度、Windows Edge或實際Token授權已通過。真實驗收必須由使用者在Windows完成。正式商業部署、OSM／ion資料授權及配額仍需另確認。
