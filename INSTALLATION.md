# 📦 詳細安裝指南

## 🔧 環境準備

### 系統需求
- **作業系統**: Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)
- **瀏覽器**: Google Chrome 88+ 或 Microsoft Edge 88+
- **網路**: 穩定的網際網路連接
- **硬體**: 內建或外接麥克風

### 瀏覽器兼容性
- ✅ Google Chrome (推薦)
- ✅ Microsoft Edge (Chromium)
- ❌ Firefox (不支援某些Web Speech API功能)
- ❌ Safari (Web Speech API支援有限)

## 🔑 API 金鑰設定

### 方案一：微軟翻譯 API (推薦)

1. **註冊 Azure 帳戶**
   - 前往 [Azure Portal](https://portal.azure.com/)
   - 使用Microsoft帳戶登入或註冊新帳戶

2. **創建翻譯服務**
   ```bash
   1. 點擊「建立資源」
   2. 搜尋「Translator」
   3. 選擇「Translator」服務
   4. 填寫以下資訊：
      - 訂閱：選擇您的訂閱
      - 資源群組：建立新的或選擇現有的
      - 區域：建議選擇 East US 或 East Asia
      - 名稱：自定義名稱
      - 定價層：F0 (免費層) 或 S1 (付費層)
   5. 點擊「檢閱 + 建立」
   6. 點擊「建立」
   ```

3. **獲取 API 金鑰**
   ```bash
   1. 等待部署完成
   2. 前往您建立的翻譯服務
   3. 點擊左側選單的「金鑰和端點」
   4. 複製「金鑰 1」或「金鑰 2」
   5. 記錄「區域」資訊
   ```

4. **免費額度說明**
   - F0 層級：每月 200 萬字元免費
   - 超出額度後需要升級到付費方案

### 方案二：OpenAI API (替代方案)

1. **註冊 OpenAI 帳戶**
   - 前往 [OpenAI Platform](https://platform.openai.com/)
   - 註冊新帳戶或使用現有帳戶登入

2. **創建 API 金鑰**
   ```bash
   1. 登入後前往 API Keys 頁面
   2. 點擊「Create new secret key」
   3. 輸入金鑰名稱 (例如: "語音翻譯插件")
   4. 複製生成的 API 金鑰
   5. 妥善保存金鑰 (僅顯示一次)
   ```

3. **設定付費方案**
   ```bash
   1. 前往 Billing 頁面
   2. 添加付款方式
   3. 設定使用限額 (建議每月 $10-20)
   ```

4. **費用說明**
   - GPT-3.5-turbo: 約 $0.002/1K tokens
   - 翻譯一句話約 0.01-0.02 tokens
   - 預估每月使用費用: $5-15

## 🛠️ 插件安裝

### 步驟 1：下載原始碼

**方法一：直接下載**
```bash
1. 點擊 GitHub 頁面的「Code」按鈕
2. 選擇「Download ZIP」
3. 解壓縮到本地資料夾
```

**方法二：Git 克隆**
```bash
git clone https://github.com/your-username/realtime-speech-translation-extension.git
cd realtime-speech-translation-extension
```

### 步驟 2：準備圖標 (可選)

1. 前往 `icons/` 資料夾
2. 閱讀 `README.md` 了解圖標需求
3. 準備以下尺寸的圖標：
   - icon16.png (16x16)
   - icon32.png (32x32)
   - icon48.png (48x48)
   - icon128.png (128x128)

**快速獲取圖標方法：**
```bash
1. 前往 https://icon.to/
2. 上傳一張麥克風圖片
3. 選擇所有需要的尺寸
4. 下載並放入 icons/ 資料夾
```

### 步驟 3：安裝到 Chrome

1. **開啟擴充功能頁面**
   ```
   在Chrome網址列輸入: chrome://extensions/
   或點擊選單 > 更多工具 > 擴充功能
   ```

2. **啟用開發人員模式**
   ```
   在頁面右上角開啟「開發人員模式」開關
   ```

3. **載入擴充功能**
   ```bash
   1. 點擊「載入未封裝項目」
   2. 選擇您下載的專案資料夾
   3. 點擊「選取資料夾」
   ```

4. **確認安裝成功**
   ```
   - 擴充功能列表中出現「即時語音翻譯字幕」
   - Chrome工具列出現插件圖標
   - 狀態顯示為「已啟用」
   ```

## ⚙️ 初始設定

### 步驟 1：基本配置

1. **點擊插件圖標**
   - 在Chrome工具列找到插件圖標
   - 點擊開啟設定面板

2. **選擇翻譯服務**
   ```
   翻譯服務下拉選單中選擇：
   - 微軟翻譯 (推薦，較穩定)
   - OpenAI (較靈活，但費用較高)
   ```

3. **輸入 API 金鑰**
   ```
   微軟翻譯：
   - API 金鑰: 輸入從Azure複製的金鑰
   - 區域: 選擇您設定的區域 (如 eastus)
   
   OpenAI：
   - API 金鑰: 輸入從OpenAI複製的金鑰
   ```

### 步驟 2：語言設定

1. **選擇目標語言**
   ```
   勾選您需要的翻譯語言，例如：
   ✅ 繁體中文
   ✅ English  
   ✅ 日本語
   ✅ 한국어
   ```

2. **建議語言組合**
   ```
   商務會議: 中文 + 英文
   學術研討: 中文 + 英文 + 日文
   國際會議: 英文 + 中文 + 西班牙文
   ```

### 步驟 3：儲存設定

```bash
1. 檢查所有設定資料
2. 點擊「儲存設定」按鈕
3. 等待「設定已儲存」提示
```

## 🎤 麥克風權限設定

### Chrome 權限設定

1. **允許麥克風存取**
   ```bash
   1. 首次使用時會彈出權限請求
   2. 點擊「允許」
   3. 確保麥克風圖標沒有被禁止
   ```

2. **檢查網站權限**
   ```bash
   1. 在需要使用的網站上點擊網址列左側的鎖頭圖標
   2. 確保「麥克風」設定為「允許」
   3. 重新載入頁面
   ```

### 系統權限設定

**Windows:**
```bash
1. 設定 > 隱私權 > 麥克風
2. 確保「允許應用程式存取您的麥克風」已開啟
3. 確保「允許桌面應用程式存取您的麥克風」已開啟
```

**macOS:**
```bash
1. 系統偏好設定 > 安全性與隱私權 > 隱私權
2. 選擇「麥克風」
3. 確保 Google Chrome 已勾選
```

## 🧪 測試安裝

### 基本功能測試

1. **語音識別測試**
   ```bash
   1. 開啟任意網頁
   2. 點擊插件圖標
   3. 點擊「開始錄音」
   4. 說話測試是否有字幕顯示
   ```

2. **翻譯功能測試**
   ```bash
   1. 用中文說「你好世界」
   2. 檢查是否出現英文翻譯 "Hello World"
   3. 測試其他選定的語言
   ```

3. **控制功能測試**
   ```bash
   1. 測試「隱藏字幕」按鈕
   2. 測試「清除字幕」按鈕
   3. 測試「停止錄音」按鈕
   ```

### 常見問題排除

**問題 1: 無法載入擴充功能**
```
解決方案:
1. 檢查manifest.json語法是否正確
2. 確保所有必要文件都存在
3. 查看Chrome擴充功能頁面的錯誤訊息
```

**問題 2: 語音識別無反應**
```
解決方案:
1. 檢查麥克風權限
2. 確認瀏覽器支援Web Speech API
3. 嘗試重新載入頁面
```

**問題 3: 翻譯失敗**
```
解決方案:
1. 檢查API金鑰是否正確
2. 確認網路連接正常
3. 檢查API配額是否充足
```

## 🔄 更新流程

### 手動更新

```bash
1. 下載新版本原始碼
2. 備份現有設定 (如果需要)
3. 在Chrome擴充功能頁面點擊「重新載入」
4. 重新設定API金鑰和偏好設定
```

### 自動更新 (未來版本)

```bash
當插件發布到Chrome Web Store後，將支援自動更新
```

## 🎯 下一步

安裝完成後，您可以：

1. **閱讀使用指南** - 查看 README.md 了解詳細功能
2. **參加線上會議** - 在Zoom、Teams、Google Meet等平台測試
3. **自定義設定** - 根據使用習慣調整語言和顯示選項
4. **提供反饋** - 遇到問題或建議請提交Issue

## 📞 支援服務

如果在安裝過程中遇到問題：

- 📧 發送郵件到支援信箱
- 💬 在GitHub提交Issue
- 📚 查看常見問題解答
- 🎥 觀看安裝教學影片

---

**祝您使用愉快！🎉** 