// 彈出界面邏輯 - 處理用戶交互和設定

class PopupController {
  constructor() {
    this.isRecording = false;
    // 統一使用subtitle-window的設定結構
    this.settings = {
      // 兼容舊版設定
      microsoftKey: '',
      openaiKey: '',
      microsoftRegion: 'eastus',
      translationProvider: 'free',
      targetLanguages: ['zh-tw', 'en'],
      
      // 新版統一設定
      microsoftApiKey: '',
      openaiApiKey: '',
      speechRecognitionLanguage: 'auto',
      speechRecognitionEngine: 'browser',
      audioInputDevice: 'default',
      confidenceThreshold: 0.6,
      enableTextCorrection: true,
      enableSpeakerDiarization: true
    };

    this.languageOptions = [
      { code: 'zh-tw', name: '繁體中文' },
      { code: 'zh-cn', name: '簡體中文' },
      { code: 'en', name: 'English' },
      { code: 'ja', name: '日本語' },
      { code: 'ko', name: '한국어' },
      { code: 'es', name: 'Español' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'it', name: 'Italiano' },
      { code: 'pt', name: 'Português' },
      { code: 'ru', name: 'Русский' }
    ];

    this.initializeElements();
    this.attachEventListeners();
    this.loadSettings();
  }

  initializeElements() {
    this.elements = {
      toggleBtn: document.getElementById('toggleBtn'),
      openWindowBtn: document.getElementById('openWindowBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      status: document.getElementById('status')
    };
  }

  attachEventListeners() {
    // 主要控制按鈕
    this.elements.toggleBtn.addEventListener('click', () => this.toggleRecording());
    this.elements.openWindowBtn.addEventListener('click', () => this.openSubtitleWindow());
    this.elements.settingsBtn.addEventListener('click', () => this.openSettingsWindow());

    // 鍵盤快捷鍵
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            this.toggleRecording();
            break;
          case 's':
            e.preventDefault();
            this.openSettingsWindow();
            break;
        }
      }
    });
  }

  async loadSettings() {
    try {
      // 載入統一的設定結構，與subtitle-window.js保持一致
      const result = await chrome.storage.sync.get([
        // 舊版設定（兼容性）
        'microsoftKey', 'openaiKey', 'microsoftRegion', 'translationProvider', 'targetLanguages',
        // 新版設定
        'microsoftApiKey', 'openaiApiKey', 'speechRecognitionLanguage', 'speechRecognitionEngine',
        'audioInputDevice', 'confidenceThreshold', 'enableTextCorrection', 'enableSpeakerDiarization'
      ]);
      
      console.log('🔧 popup載入的設定:', result);
      
      // 設定遷移邏輯 - 優先使用新版設定，回退到舊版
      this.settings.microsoftApiKey = result.microsoftApiKey || result.microsoftKey || '';
      this.settings.openaiApiKey = result.openaiApiKey || result.openaiKey || '';
      this.settings.translationProvider = result.translationProvider || 'free';
      this.settings.targetLanguages = result.targetLanguages || ['zh-tw', 'en'];
      
      // 同步舊版設定以保持UI兼容
      this.settings.microsoftKey = this.settings.microsoftApiKey;
      this.settings.openaiKey = this.settings.openaiApiKey;
      this.settings.microsoftRegion = result.microsoftRegion || 'eastus';
      
      this.updateUI();
      
      // 如果發現舊版設定，自動遷移到新版
      if ((result.microsoftKey && !result.microsoftApiKey) || (result.openaiKey && !result.openaiApiKey)) {
        console.log('🔄 檢測到舊版設定，執行自動遷移...');
        await this.migrateOldSettings();
      }
      
    } catch (error) {
      console.error('❌ 載入設定失敗:', error);
      this.showStatus('載入設定失敗', 'error');
    }
  }

  // 自動遷移舊版設定
  async migrateOldSettings() {
    try {
      const migrationSettings = {
        microsoftApiKey: this.settings.microsoftKey,
        openaiApiKey: this.settings.openaiKey,
        translationProvider: this.settings.translationProvider,
        targetLanguages: this.settings.targetLanguages
      };
      
      await chrome.storage.sync.set(migrationSettings);
      console.log('✅ 設定遷移完成');
      this.showStatus('🔄 設定已自動升級', 'info');
    } catch (error) {
      console.error('❌ 設定遷移失敗:', error);
    }
  }

  updateUI() {
    // 簡化的UI更新 - 只需要更新狀態顯示
    console.log('🔄 UI已更新，設定已載入');
  }

  // 已移除舊版設定相關方法，統一使用獨立視窗的設定界面

  // 網頁字幕功能 - 監聽當前網頁聲音
  async toggleRecording() {
    try {
      this.showStatus('正在啟動網頁字幕...', 'info');
      
      // 獲取當前分頁
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.showStatus('❌ 無法獲取當前分頁', 'error');
        return;
      }

      // 檢查是否為有效的網頁
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
        this.showStatus('❌ 此頁面不支援網頁字幕功能', 'error');
        return;
      }

      // 注入content script和樣式
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['styles.css']
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (error) {
        console.log('Content script可能已存在:', error.message);
      }

      // 等待一下讓content script準備好
      await new Promise(resolve => setTimeout(resolve, 500));

      // 發送消息到content script切換錄音
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'toggleRecording' 
      });
      
      if (response && response.success) {
        this.isRecording = response.isRecording;
        
        if (this.isRecording) {
          this.showStatus('🎤 網頁字幕已啟動 - 正在監聽網頁聲音', 'success');
        } else {
          this.showStatus('🛑 網頁字幕已停止', 'info');
        }
        
        // 提示使用說明
        if (this.isRecording) {
          setTimeout(() => {
            this.showStatus('💡 正在監聽當前網頁的聲音（Teams會議、YouTube等）', 'info');
          }, 2000);
        }
        
      } else {
        this.showStatus('❌ 網頁字幕啟動失敗 - 請檢查麥克風權限', 'error');
        this.showPermissionGuide();
      }
    } catch (error) {
      console.error('❌ 網頁字幕切換失敗:', error);
      this.showStatus(`啟動失敗: ${error.message || '未知錯誤'}`, 'error');
      this.showPermissionGuide();
    }
  }

  // 權限設定指導
  showPermissionGuide() {
    setTimeout(() => {
      this.showStatus('💡 提示：請確保已允許此網站使用麥克風，並且網頁有聲音輸出', 'info');
    }, 3000);
  }

  // 開啟獨立字幕視窗
  async openSubtitleWindow() {
    try {
      console.log('開始開啟獨立視窗...');
      this.showStatus('正在開啟獨立視窗...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        action: 'openSubtitleWindow'
      });
      
      console.log('獨立視窗回應:', response);
      
      if (response && response.success) {
        this.showStatus('✅ 獨立視窗已開啟', 'success');
        
        // 延遲關閉彈出視窗
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        const errorMsg = response?.error || '未知錯誤';
        console.error('開啟獨立視窗失敗:', errorMsg);
        this.showStatus(`❌ 開啟失敗: ${errorMsg}`, 'error');
      }
    } catch (error) {
      console.error('開啟獨立視窗異常:', error);
      this.showStatus(`❌ 系統錯誤: ${error.message}`, 'error');
    }
  }

  updateRecordingUI() {
    if (this.isRecording) {
      this.elements.toggleBtn.textContent = '停止錄音';
      this.elements.toggleBtn.classList.add('recording');
    } else {
      this.elements.toggleBtn.textContent = '開始錄音';
      this.elements.toggleBtn.classList.remove('recording');
    }
  }

  showStatus(message, type = 'info') {
    const status = this.elements.status;
    status.textContent = message;
    status.className = `status ${type}`;
    
    // 3秒後恢復預設狀態
    setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = this.isRecording ? '語音識別進行中...' : '準備開始語音識別';
        status.className = `status ${this.isRecording ? 'active' : 'inactive'}`;
      }
    }, 3000);
  }

  // 設定保存功能已移到獨立視窗，確保統一管理

  // 開啟獨立字幕視窗
  async openSubtitleWindow() {
    try {
      this.showStatus('正在開啟獨立字幕視窗...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        action: 'openSubtitleWindow'
      });
      
      if (response && response.success) {
        this.showStatus('✅ 獨立字幕視窗已開啟', 'success');
        
        // 延遲提示
        setTimeout(() => {
          this.showStatus('💡 請在獨立視窗中進行所有操作', 'info');
        }, 2000);
        
      } else {
        this.showStatus('❌ 開啟獨立字幕視窗失敗', 'error');
      }
      
    } catch (error) {
      console.error('❌ 開啟獨立字幕視窗失敗:', error);
      this.showStatus(`開啟失敗: ${error.message || '未知錯誤'}`, 'error');
    }
  }

  // 開啟設定視窗
  async openSettingsWindow() {
    try {
      this.showStatus('正在開啟設定視窗...', 'info');
      
      // 先開啟獨立字幕視窗
      const response = await chrome.runtime.sendMessage({
        action: 'openSubtitleWindow'
      });
      
      if (response && response.success) {
        // 等待視窗載入完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 通知獨立視窗開啟設定面板
        await chrome.runtime.sendMessage({
          action: 'openSettings'
        });
        
        this.showStatus('✅ 設定視窗已開啟', 'success');
        
        // 延遲提示
        setTimeout(() => {
          this.showStatus('💡 請在設定面板中調整所有功能參數', 'info');
        }, 2000);
        
      } else {
        this.showStatus('❌ 開啟設定視窗失敗', 'error');
      }
      
    } catch (error) {
      console.error('❌ 開啟設定視窗失敗:', error);
      this.showStatus(`開啟失敗: ${error.message || '未知錯誤'}`, 'error');
    }
  }
}

// 初始化彈出界面
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  
  // 設定初始狀態
  popup.showStatus('插件已就緒', 'inactive');
}); 