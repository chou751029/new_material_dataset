# 各國政策與技術盤點資料庫網頁平台

本專案將 Google 試算表（Google Sheets）中的各國政策與技術資料，轉換為一個具備即時搜尋、分類篩選與詳情彈窗的現代化高質感網頁。

## 方案說明

專案採用 **方案 A：客戶端即時獲取數據** 運作。
- 每次使用者開啟或重新整理網頁時，瀏覽器會直接拉取您指定的 Google 試算表最新的 CSV 資料。
- 當您在 Google 試算表更新內容（不論是手動修改或是透過 Google 表單寫入），網頁端重新整理後會**即時同步**，不需要另外執行任何後端排程。

## 檔案結構

```bash
policy-database/
├── index.html   # 網頁骨架、統計卡片與詳情彈窗
├── style.css    # 現代玻璃擬物化 (Glassmorphism) 與響應式排版樣式
├── app.js       # 核心邏輯：CSV 拉取、自訂 CSV 解析、篩選搜尋引擎與 CSV 匯出
└── README.md    # 本說明文件
```

## 如何更換 Google 試算表來源

如果您未來想要更換成其他的 Google 試算表，請依照以下步驟調整：

1. **共享您的 Google 試算表**：
   - 開啟您的 Google 試算表，點擊右上角的「共用」按鈕。
   - 將「一般存取權」改為「知道連結的任何人」，並將權限設為「檢視者」。

2. **取得試算表 ID**：
   - 複製試算表網址中的 ID，例如：`https://docs.google.com/spreadsheets/d/1gWQv6qg2R_uTyjYNorDK5vWNpjwL1JXDmxdMi5JjZuA/edit`
   - 上述網址中，ID 即為 `1gWQv6qg2R_uTyjYNorDK5vWNpjwL1JXDmxdMi5JjZuA`。

3. **修改 `app.js`**：
   - 開啟 `policy-database/app.js`，將最頂端的 `SPREADSHEET_ID` 替換為您的新 ID：
     ```javascript
     const SPREADSHEET_ID = '您的新試算表ID';
     ```

## 網頁特色功能

1. **即時多重篩選**：可同時組合「國家」、「領域別」、「屬性」進行篩選，且標籤會動態呈現在篩選區下方。
2. **全局搜尋**：搜尋欄會對政策名稱、描述內容、金屬材料製程與新興材料等進行模糊比對。
3. **數據統計儀表板**：顯示總收錄項目、涵蓋國家與關注領域總數。
4. **Excel 相容匯出**：點擊「匯出 CSV 資料」會將目前**篩選後**的資料，加入 UTF-8 BOM，確保在 Microsoft Excel 開啟時，中文字元不會出現亂碼。
5. **原生 Dialog 視窗**：詳情彈窗採用 HTML5 原生 `<dialog>` 標籤，提供出色的網頁無障礙體驗 (Accessibility) 與順暢的縮放動畫。
