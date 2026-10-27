# Traditional Chinese — Taiwan (`zh-TW`)

Catalog: `src/i18n/locales/zh-TW.json`. General rules: [TRANSLATORS.md](../TRANSLATORS.md).

This first phase supplies all 2,727 currently marked messages (including 69 plural entries), because the catalog gate requires complete coverage. Main menus, first launch, settings, map/layer controls, panels, hints and errors are the priority review surface. The existing `zh-CN` catalog is unchanged. Its translations by abiyeenzo (#914) and EDIT-Aeterna (#979) provided the base; an OpenCC 0.1.7 `s2twp` authoring conversion was followed by Taiwanese terminology and priority UI revisions. OpenCC is not a runtime or project dependency. Specialized aviation, maritime, SDR and weather wording remains appropriate for further native domain review; catalog completeness does not imply exhaustive linguistic or visual sign-off.

## Locale selection and fallback

- `zh-TW`, `zh-Hant` and regional Traditional tags select `zh-TW`. `zh-HK` and `zh-MO` use the available Traditional catalog, not separate Hong Kong/Macao or Cantonese translations.
- An explicit script wins over the region: `zh-Hans-TW`/`zh-Hans-HK` select `zh-CN`; `zh-Hant-CN` selects `zh-TW`.
- Bare `zh`, `zh-CN`, `zh-SG` and `zh-Hans` keep the existing `zh-CN` behavior. Other languages remain independent.
- Priority remains `?lang=` → stored choice → browser languages → English. The language picker stores the canonical `zh-TW` tag and reloads; query-only choices do not overwrite the saved preference. Missing or empty translations fall back to English, not Simplified Chinese.

## Style and glossary

Use Taiwanese Traditional Chinese and short, neutral instructions. Chinese has no uppercase/lowercase distinction; an uppercase HUD label becomes the same short Chinese label. Use 「」, ，。：；？！（） and keep `·`, `—`, `→`, `↗`, `…`. Keep a space between Chinese and Latin text/numbers where appropriate, including placeholders.

| English                       | Taiwan usage               |
| ----------------------------- | -------------------------- |
| settings / configure          | 設定                       |
| layer / data layer            | 圖層／資料圖層             |
| load / loading                | 載入／載入中               |
| save / apply                  | 儲存／套用                 |
| search / retry                | 搜尋／重試                 |
| map source / basemap / tile   | 地圖來源／底圖／圖磚       |
| image / video                 | 影像／影片                 |
| data / information            | 資料／資訊                 |
| live / timeout                | 即時／逾時                 |
| interface / control panel     | 介面／控制面板             |
| camera (CCTV) / calibration   | 攝影機／校正               |
| key / token / credential      | 金鑰／權杖／憑證           |
| provider / Provider Settings  | 服務供應商／服務供應商設定 |
| POWER UP                      | 啟用服務                   |
| software / hardware / network | 軟體／硬體／網路           |
| clipboard / memory / thread   | 剪貼簿／記憶體／執行緒     |
| parameter / layout            | 參數／版面配置             |
| reset / undo                  | 重設／復原                 |
| import / export / file        | 匯入／匯出／檔案           |
| double-click / click          | 連按兩下／點選             |
| satellite / aircraft / vessel | 衛星／飛機／船舶           |
| radio / transit / bikeshare   | 電台／大眾運輸／公共自行車 |

## Plurals, numbers and units

`Intl.PluralRules('zh-TW')` uses only `other`. Keep every `{placeholder}` name and its occurrence count; apply appropriate measure words such as 組金鑰、台攝影機、架飛機、艘船. `Intl` number/date formatting follows `zh-TW`, while the existing caller still controls time zone and units. Do not silently change geographic coordinates, timing, measurements or provider data.

## Intentionally untranslated

English is retained only for product/provider names, established codes and units (for example Cesium, OpenAI, ADS-B, CCTV, CRT, FLIR, km, ft, hPa), keyboard keys, conventional music-genre labels (House, Techno, Trance) and structural placeholder-only strings. Deliberately identical entries are declared under `zh-TW` in `src/i18n/same-as-english.json`.

Layer IDs, share-link parameters, API/schema fields, feed records (callsigns, vessel/place names and headlines), attribution, console diagnostics, AI tool contracts and user-authored text are not translated. Raw external-provider errors can still appear in their source language; this phase does not rewrite external responses or add new extraction rules.

## Verification

Run `npm run i18n`, the `src/i18n/zh-TW.test.mjs` tests, the existing picker/reload tests, the full unit suite, package boundaries and build. Check `?lang=zh-TW` and `?lang=zh-Hant`, picker persistence after reload, English switching, first-launch/settings/layer panels and narrow layouts. Compare the existing English, Spanish, Russian and Simplified catalogs against the base branch; do not change them to accommodate the new locale.
