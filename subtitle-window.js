// 獨立字幕視窗控制腳本 - 使用核心模組的簡化版本

// 等待核心模組載入
function waitForCoreModules() {
  return new Promise((resolve) => {
    const checkModules = () => {
      if (window.SpeechEngine && window.AudioManager && window.SettingsManager && 
          window.SubtitleCore && window.HistoryCore) {
        resolve();
      } else {
        setTimeout(checkModules, 100);
      }
    };
    checkModules();
  });
}

class SubtitleWindow {
  constructor() {
    this.isRecording = false;
    this.recognition = null;
    
    // 核心模組實例
    this.speechEngine = null;
    this.audioManager = null;
    this.settingsManager = null;
    this.subtitleCore = null;
    this.historyCore = null;
    
    // 簡化的設定結構（將由 SettingsManager 管理）
    this.settings = {};
    
    this.retryCount = 0;
    this.maxRetries = 5; // 增加重試次數
    this.isRestarting = false;
    this.isSwitchingLanguage = false;
    this.lastLanguageSwitch = 0;
    this.userRequestedStop = false; // 標記用戶是否主動停止錄音
    this.isTogglingRecording = false; // 防止重複調用錄音切換
    
    // 語音識別監控機制
    this.lastActivityTime = Date.now();
    this.watchdogTimer = null;
    this.watchdogInterval = 10000; // 10秒檢查一次
    this.maxInactiveTime = 15000; // 15秒無活動則重啟
    this.forceRestartTimer = null;
    this.forceRestartInterval = 60000; // 每60秒強制重啟一次（防止卡住）
    
    // 語音識別結果處理增強
    this.recognitionBuffer = []; // 用於累積識別結果
    this.lastConfidenceThreshold = 0.6; // 最低置信度閾值
    this.speechPatterns = this.initializeSpeechPatterns(); // 常見詞彙模式
    
    // 說話者分離功能
    this.speakerDetection = {
      enabled: true, // 是否啟用說話者分離
      speakers: [], // 說話者列表
      currentSpeaker: null, // 當前說話者
      lastSpeechTime: 0, // 上次語音時間
      silenceThreshold: 1500, // 靜默閾值 (ms)
      speakerChangeThreshold: 2000, // 說話者切換閾值 (ms)
      audioAnalyser: null, // 音頻分析器
      volumeHistory: [], // 音量歷史
      pitchHistory: [] // 音調歷史（如果可獲取）
    };
    
    // 翻譯請求管理
    this.pendingTranslations = new Map(); // 追蹤進行中的翻譯請求
    this.translationQueue = []; // 翻譯佇列
    this.isProcessingTranslations = false;
    this.maxPendingTranslations = 3; // 降低同時翻譯數，減少系統負擔
    this.translationTimeout = 10000; // 減少翻譯超時時間 (10秒)
    this.lastCleanupTime = Date.now();
    
    // 翻譯統計
    this.translationStats = {
      total: 0,           // 總翻譯請求數
      successful: 0,      // 成功數
      failed: 0,          // 失敗數
      timeout: 0,         // 超時數
      cancelled: 0,       // 取消數
      startTime: Date.now() // 統計開始時間
    };
      
    // 智能語言檢測相關
    this.languageDetectionBuffer = [];
    this.lastDetectedLanguage = null;
    
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
      { code: 'ru', name: 'Русский' },
      { code: 'ar', name: 'العربية' },
      { code: 'hi', name: 'हिन्दी' },
      { code: 'th', name: 'ไทย' },
      { code: 'vi', name: 'Tiếng Việt' },
      { code: 'id', name: 'Bahasa Indonesia' }
    ];
    
    // 語音識別語言選項
    this.speechRecognitionLanguages = [
      { code: 'auto', name: '🌐 智能檢測 (推薦)' },
      { code: 'zh-TW', name: '🇹🇼 中文 (繁體)' },
      { code: 'zh-CN', name: '🇨🇳 中文 (簡體)' },
      { code: 'en-US', name: '🇺🇸 English (US)' },
      { code: 'en-GB', name: '🇬🇧 English (UK)' },
      { code: 'ja-JP', name: '🇯🇵 日本語' },
      { code: 'ko-KR', name: '🇰🇷 한국어' },
      { code: 'es-ES', name: '🇪🇸 Español' },
      { code: 'fr-FR', name: '🇫🇷 Français' },
      { code: 'de-DE', name: '🇩🇪 Deutsch' },
      { code: 'it-IT', name: '🇮🇹 Italiano' },
      { code: 'pt-BR', name: '🇧🇷 Português (Brasil)' },
      { code: 'ru-RU', name: '🇷🇺 Русский' }
    ];

    // 智能整理系統
    this.smartOrganizer = {
      isEnabled: false,
      meetingContext: '',
      speechBuffer: [], // 收集語音片段
      currentParagraph: '',
      lastSpeechTime: 0,
      paragraphBreakInterval: 8000, // 8秒無語音自動分段
      maxParagraphLength: 500, // 最大段落長度
      forceBreakFlag: false,
      organizedParagraphs: [],
      isProcessing: false
    };
    
    // 初始化標記
    this.isInitialized = false;
    
    // 異步初始化
    this.init().catch(error => {
      console.error('❌ 初始化失敗:', error);
      this.showStatus('❌ 初始化失敗', 'error');
    });
  }

  async init() {
    console.log('🚀 字幕視窗初始化開始...');
    
    // 設定全域參考
    window.subtitleApp = this;
    
    try {
      // 等待核心模組載入
      await waitForCoreModules();
      console.log('✅ 核心模組載入完成');
      
      // 初始化核心模組
      await this.initializeCoreModules();
      
      // 設定事件監聽器
      this.setupEventListeners();
      this.setupWindowControls();
      this.setupLanguageSelector();
      this.setupKeyboardShortcuts();
      this.setupSmartOrganizer();
      
      // 更新UI狀態
      this.updateRecordingButton();
      this.updateLanguageButton();
      this.updateSessionInfo();
      
      console.log('✅ 字幕視窗初始化完成');
      this.showStatus('🎉 系統已就緒，點擊開始錄音', 'success');
      
    } catch (error) {
      console.error('❌ 字幕視窗初始化失敗:', error);
      this.showStatus('❌ 初始化失敗', 'error');
    }
  }

  async initializeCoreModules() {
    console.log('🔧 初始化核心模組...');
    
    try {
      // 初始化設定管理器
      this.settingsManager = new window.SettingsManager({
        enableAutoMigration: true,
        enableAutoSync: true
      });
      
      // 設定設定管理回調
      this.settingsManager.setCallbacks({
        onSettingsChanged: (data) => this.onSettingsChanged(data),
        onMigrationComplete: (data) => this.onMigrationComplete(data),
        onValidationError: (data) => this.onValidationError(data),
        onSyncComplete: (data) => this.onSyncComplete(data)
      });
      
      // 載入設定
      await this.settingsManager.initialize();
      
      // 同步設定到本地
      this.settings = this.settingsManager.getAllSettings();
      
      // 初始化語音識別引擎
      this.speechEngine = new window.SpeechEngine({
        speechRecognitionLanguage: this.settings.speechRecognitionLanguage,
        speechRecognitionEngine: this.settings.speechRecognitionEngine,
        audioInputDevice: this.settings.audioInputDevice,
        openaiKey: this.settings.openaiApiKey
      });
      
      // 設定語音識別回調
      this.speechEngine.setCallbacks({
        onResult: (data) => this.handleRecognitionResult(data),
        onError: (data) => this.handleRecognitionError(data),
        onStart: () => this.onRecognitionStart(),
        onEnd: () => this.onRecognitionEnd(),
        onStatusUpdate: (data) => this.showStatus(data.message, data.type)
      });
      
      // 初始化音頻設備管理
      this.audioManager = new window.AudioManager({
        audioInputDevice: this.settings.audioInputDevice,
        preferVirtualDevice: true,
        autoRefreshDevices: true
      });
      
      // 設定音頻管理回調
      this.audioManager.setCallbacks({
        onDeviceListUpdate: (devices) => this.onAudioDevicesUpdated(devices),
        onDeviceChange: (devices) => this.onAudioDeviceChanged(devices),
        onError: (data) => this.showStatus(data.message, 'error'),
        onStatusUpdate: (data) => this.showStatus(data.message, data.type),
        onVirtualDeviceDetected: (device) => this.onVirtualDeviceDetected(device)
      });
      
      // 初始化音頻管理
      await this.audioManager.initialize();
      
      // 初始化字幕核心
      this.subtitleCore = new window.SubtitleCore({
        maxSubtitleLines: this.settings.maxSubtitleLines || 50,
        autoScroll: true,
        showTimestamp: true,
        showSpeakerInfo: this.settings.enableSpeakerDiarization || true,
        enableInterimResults: true,
        subtitleAnimations: true
      });
      
      // 設定字幕核心回調
      this.subtitleCore.setCallbacks({
        onSubtitleDisplayed: (data) => this.onSubtitleDisplayed(data),
        onSubtitleUpdated: (data) => this.onSubtitleUpdated(data),
        onSubtitleCleared: (data) => this.onSubtitleCleared(data),
        onError: (data) => this.showStatus(data.error, 'error'),
        onContainerReady: (data) => this.onSubtitleContainerReady(data)
      });
      
      // 初始化字幕容器
      this.subtitleCore.initializeContainer('subtitleContainer');
      
      // 初始化歷程記錄核心
      this.historyCore = new window.HistoryCore({
        enableHistoryRecording: this.settings.enableHistoryRecording !== false,
        maxHistoryEntries: this.settings.maxHistoryEntries || 1000,
        autoSaveInterval: 300000, // 5分鐘
        exportFormats: ['csv', 'json', 'txt']
      });
      
      // 設定歷程記錄回調
      this.historyCore.setCallbacks({
        onRecordAdded: (data) => this.onHistoryRecordAdded(data),
        onRecordUpdated: (data) => this.onHistoryRecordUpdated(data),
        onHistoryCleared: (data) => this.onHistoryCleared(data),
        onExportComplete: (data) => this.onHistoryExportComplete(data),
        onError: (data) => this.showStatus(data.error, 'error'),
        onStatisticsUpdated: (data) => this.onHistoryStatisticsUpdated(data)
      });
      
      // 初始化歷程記錄系統
      await this.historyCore.initialize();
      
      console.log('✅ 核心模組初始化完成');
      
    } catch (error) {
      console.error('❌ 核心模組初始化失敗:', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      if (this.settingsManager) {
        // 使用統一的設定管理器
        this.settings = this.settingsManager.getAllSettings();
        console.log('✅ 設定載入成功:', this.settings);
        
        // 更新 UI
        this.updateSettingsUI();
        
        this.showStatus(`🔧 設定已載入 (翻譯: ${this.settings.translationProvider}, 語音: ${this.settings.speechRecognitionLanguage})`, 'success');
      } else {
        console.warn('⚠️ 設定管理器尚未初始化，使用預設設定');
      }
    } catch (error) {
      console.error('❌ 設定載入失敗:', error);
      this.showStatus('❌ 載入設定失敗', 'error');
    }
  }

  // 核心模組回調方法
  onSettingsChanged(data) {
    console.log('📢 收到設定變更通知:', data);
    
    // 更新本地設定
    this.settings = data.settings;
    
    // 更新核心模組設定
    if (this.speechEngine) {
      this.speechEngine.updateSettings(this.settings);
    }
    if (this.audioManager) {
      this.audioManager.updateSettings(this.settings);
    }
    if (this.subtitleCore) {
      this.subtitleCore.updateSettings(this.settings);
    }
    if (this.historyCore) {
      this.historyCore.updateSettings(this.settings);
    }
    
    // 更新 UI
    this.updateRecordingButton();
    this.updateLanguageButton();
    this.updateSettingsUI();
    
    this.showStatus('⚙️ 設定已更新', 'info');
  }

  onMigrationComplete(data) {
    console.log('🔄 設定遷移完成:', data);
    this.showStatus(`🔄 設定已自動遷移: ${data.migrations.length} 項變更`, 'success');
  }

  onValidationError(data) {
    console.warn('⚠️ 設定驗證錯誤:', data);
    this.showStatus(`⚠️ 設定驗證錯誤: ${data.errors ? data.errors.join(', ') : data.error}`, 'error');
  }

  onSyncComplete(data) {
    console.log('✅ 設定同步完成');
    // 靜默處理，不顯示消息避免過多通知
  }

  // 語音識別回調方法
  handleRecognitionResult(data) {
    this.handleSpeechResult(data.text, data.isFinal, data.confidence);
  }

  handleRecognitionError(data) {
    console.error('❌ 語音識別錯誤:', data);
    this.showStatus(`語音識別錯誤: ${data.error}`, 'error');
  }

  onRecognitionStart() {
    console.log('🎤 語音識別開始');
    this.lastActivityTime = Date.now();
  }

  onRecognitionEnd() {
    console.log('⏹️ 語音識別結束');
  }

  // 音頻管理回調方法
  onAudioDevicesUpdated(devices) {
    console.log('🎙️ 音頻設備列表已更新:', devices.length);
    this.audioDevices = devices;
    // 可以在這裡更新設定界面的設備選項
  }

  onAudioDeviceChanged(devices) {
    console.log('🎙️ 檢測到音頻設備變更');
    this.showStatus('🎙️ 音頻設備已變更', 'info');
  }

  onVirtualDeviceDetected(device) {
    console.log('🔧 檢測到虛擬音頻設備:', device.label);
    
    // 如果當前使用瀏覽器引擎，建議切換到 Whisper
    if (this.settings.speechRecognitionEngine === 'browser') {
      setTimeout(() => {
        this.showStatus(`🔧 檢測到虛擬設備 ${device.label}，建議使用 Whisper 引擎以獲得更好效果`, 'info');
      }, 2000);
    }
  }

  // 字幕核心回調方法
  onSubtitleDisplayed(data) {
    console.log('🎬 字幕已顯示:', data.subtitleId);
  }

  onSubtitleUpdated(data) {
    console.log('🔄 字幕已更新:', data.subtitleId);
  }

  onSubtitleCleared(data) {
    console.log('🧹 字幕已清除');
  }

  onSubtitleContainerReady(data) {
    console.log('📺 字幕容器就緒');
  }

  // 歷程記錄核心回調方法
  onHistoryRecordAdded(data) {
    console.log('📚 歷程記錄已添加:', data.record.id);
    this.updateSessionInfo();
  }

  onHistoryRecordUpdated(data) {
    console.log('📝 歷程記錄已更新:', data.recordId);
    this.refreshHistoryDisplay();
  }

  onHistoryCleared(data) {
    console.log('🧹 歷程記錄已清除');
    this.showStatus(`已清除 ${data.clearedRecords} 條記錄`, 'success');
    this.updateSessionInfo();
  }

  onHistoryExportComplete(data) {
    console.log('📤 歷程匯出完成:', data.format);
    this.showStatus(`${data.format.toUpperCase()} 匯出完成 - ${data.recordCount} 條記錄`, 'success');
  }

  onHistoryStatisticsUpdated(data) {
    console.log('📊 歷程統計已更新');
    // 可以在這裡更新統計顯示
  }

  // 枚舉音頻設備（使用 AudioManager）
  async enumerateAudioDevices() {
    try {
      if (this.audioManager) {
        // 使用 AudioManager 獲取設備列表
        const devices = await this.audioManager.getAudioDevices();
        this.audioDevices = devices;
        
        console.log('🎙️ 通過 AudioManager 獲取到設備:', devices.length, '個');
        
        // 更新設備選擇UI
        this.updateAudioDeviceUI();
      } else {
        console.warn('⚠️ AudioManager 尚未初始化，跳過設備枚舉');
      }
    } catch (error) {
      console.error('❌ 枚舉音頻設備失敗:', error);
      this.showStatus('❌ 無法獲取音頻設備列表: ' + error.message, 'error');
    }
  }

  // 更新音頻設備UI
  updateAudioDeviceUI() {
    const audioDeviceSelect = document.getElementById('audioInputDevice');
    if (!audioDeviceSelect) {
      console.warn('⚠️ 找不到音頻設備選擇器元素');
      return;
    }
    
    console.log('🎙️ 更新音頻設備UI，設備數量:', this.audioDevices.length);
    
    // 保存當前選中的設備
    const currentSelection = audioDeviceSelect.value;
    
    // 清空現有選項
    audioDeviceSelect.innerHTML = '';
    
    if (this.audioDevices.length === 0) {
      // 如果沒有設備，顯示載入訊息
      const option = document.createElement('option');
      option.value = 'default';
      option.textContent = '🔄 正在載入設備...';
      audioDeviceSelect.appendChild(option);
      console.log('⚠️ 沒有音頻設備可顯示');
      return;
    }
    
    // 添加設備選項
    this.audioDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label;
      
      // 如果是當前選中的設備，設為選中狀態
      if (device.deviceId === this.settings.audioInputDevice || 
          device.deviceId === currentSelection) {
        option.selected = true;
        console.log('📍 選中設備:', device.label);
      }
      
      audioDeviceSelect.appendChild(option);
      console.log(`  ✓ 已添加設備 ${index + 1}: ${device.label} (${device.deviceId})`);
    });
    
    // 如果沒有找到匹配的設備，選擇第一個
    if (!audioDeviceSelect.value && this.audioDevices.length > 0) {
      audioDeviceSelect.value = this.audioDevices[0].deviceId;
      console.log('🔧 未找到匹配設備，自動選擇:', this.audioDevices[0].label);
    }
    
    console.log('✅ 音頻設備UI更新完成，當前選擇:', audioDeviceSelect.options[audioDeviceSelect.selectedIndex]?.textContent);
  }

  setupEventListeners() {
    console.log('🔧 開始設置事件監聽器...');
    
    // 控制按鈕
    const toggleBtn = document.getElementById('toggleBtn');
    const languageBtn = document.getElementById('languageBtn');
    const historyBtn = document.getElementById('historyBtn');
    const smartPanelBtn = document.getElementById('smartPanelBtn');
    const exportBtn = document.getElementById('exportBtn');
    const testBtn = document.getElementById('testBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const clearBtn = document.getElementById('clearBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const closeBtn = document.getElementById('closeBtn');
    
    // 檢查關鍵按鈕元素
    console.log('🔍 按鈕元素檢查:', {
      toggleBtn: !!toggleBtn,
      settingsBtn: !!settingsBtn,
      languageBtn: !!languageBtn,
      historyBtn: !!historyBtn
    });
    
    // 添加事件監聽器，並添加調試信息
    if (toggleBtn) {
      // 安全的方式移除舊事件監聽器並添加新的
      const clickHandler = (event) => {
        console.log('🎯 錄音按鈕被點擊，當前狀態:', this.isRecording);
        event.preventDefault();
        event.stopPropagation();
        
        // 防止重複點擊
        if (toggleBtn.disabled || this.isTogglingRecording) {
          console.log('⚠️ 按鈕已禁用或正在處理，忽略點擊');
          return;
        }
        
        // 暫時禁用按鈕防止重複點擊
        toggleBtn.disabled = true;
        
        setTimeout(() => {
          toggleBtn.disabled = false;
        }, 1000); // 1秒後重新啟用
        
        this.toggleRecording();
      };
      
      // 移除舊的監聽器（如果存在）
      if (toggleBtn._clickHandler) {
        toggleBtn.removeEventListener('click', toggleBtn._clickHandler);
      }
      
      // 添加新的監聽器並保存引用
      toggleBtn.addEventListener('click', clickHandler);
      toggleBtn._clickHandler = clickHandler;
    }
    if (languageBtn) languageBtn.addEventListener('click', () => this.toggleLanguage());
    if (historyBtn) historyBtn.addEventListener('click', () => this.toggleHistory());
    if (smartPanelBtn) smartPanelBtn.addEventListener('click', () => this.toggleSmartPanel());
    if (exportBtn) exportBtn.addEventListener('click', () => this.quickExport());
    if (testBtn) testBtn.addEventListener('click', () => this.testTranslation());
    
    // 特別處理設定按鈕，添加調試信息
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (event) => {
        console.log('⚙️ 設定按鈕被點擊了！');
        event.preventDefault();
        event.stopPropagation();
        
        // 添加視覺反饋
        settingsBtn.style.backgroundColor = '#28a745';
        setTimeout(() => {
          settingsBtn.style.backgroundColor = '';
        }, 200);
        
        this.toggleSettings();
      });
    } else {
      console.warn('⚠️ 找不到設定按鈕元素');
    }
    
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearSubtitles());
    if (minimizeBtn) minimizeBtn.addEventListener('click', () => this.minimizeWindow());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeWindow());
    
    console.log('✅ 所有按鈕事件監聽器設置完成');
    
    // 歷程面板相關
    const exportTxtBtn = document.getElementById('exportTxtBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    
    if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => this.exportAsTxt());
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => this.exportAsCsv());
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => this.toggleHistory());
    
    // 設定相關
    const translationProvider = document.getElementById('translationProvider');
    if (translationProvider) {
      translationProvider.addEventListener('change', () => this.toggleProviderSettings());
    }
    
    const speechRecognitionEngine = document.getElementById('speechRecognitionEngine');
    if (speechRecognitionEngine) {
      speechRecognitionEngine.addEventListener('change', () => this.onEngineChange());
    }
    
    const audioInputDevice = document.getElementById('audioInputDevice');
    if (audioInputDevice) {
      audioInputDevice.addEventListener('change', () => this.onAudioDeviceChange());
    }
    
    const refreshAudioDevicesBtn = document.getElementById('refreshAudioDevicesBtn');
    if (refreshAudioDevicesBtn) {
      refreshAudioDevicesBtn.addEventListener('click', () => this.refreshAudioDevices());
    }
    
    const testAudioDeviceBtn = document.getElementById('testAudioDeviceBtn');
    if (testAudioDeviceBtn) {
      testAudioDeviceBtn.addEventListener('click', () => this.testAudioDevice());
    }
    
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
    
    // 添加關閉設定面板按鈕的事件監聽器
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', (event) => {
        console.log('❌ 關閉設定按鈕被點擊');
        event.preventDefault();
        event.stopPropagation();
        this.closeSettings();
      });
    }

    // 點擊外部區域關閉面板
    document.addEventListener('click', (event) => this.handleOutsideClick(event));
    
    console.log('✅ 所有事件監聽器設置完成');
  }

  // 處理點擊外部區域關閉設定面板 (已移至底部統一處理)

  setupWindowControls() {
    // 拖曳功能
    const header = document.getElementById('windowHeader');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      initialX = e.clientX;
      initialY = e.clientY;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        // 透過 Chrome API 移動視窗
        chrome.windows.getCurrent((window) => {
          chrome.windows.update(window.id, {
            left: window.left + currentX,
            top: window.top + currentY
          });
        });
        
        initialX = e.clientX;
        initialY = e.clientY;
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // 調整大小功能
    const resizeHandle = document.getElementById('resizeHandle');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (isResizing) {
        const rect = document.body.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        const newHeight = e.clientY - rect.top;
        
        chrome.windows.getCurrent((window) => {
          chrome.windows.update(window.id, {
            width: Math.max(400, newWidth),
            height: Math.max(200, newHeight)
          });
        });
      }
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
  }

  setupLanguageSelector() {
    const languageGrid = document.getElementById('languageGrid');
    languageGrid.innerHTML = '';
    
    this.languageOptions.forEach(lang => {
      const languageItem = document.createElement('div');
      languageItem.className = 'language-item';
      languageItem.setAttribute('data-lang', lang.code);
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `lang-${lang.code}`;
      checkbox.value = lang.code;
      
      const label = document.createElement('label');
      label.htmlFor = `lang-${lang.code}`;
      label.textContent = lang.name;
      label.style.fontSize = '12px';
      
      languageItem.appendChild(checkbox);
      languageItem.appendChild(label);
      
      languageItem.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.updateLanguageItemState(languageItem, checkbox.checked);
        }
      });
      
      checkbox.addEventListener('change', () => {
        this.updateLanguageItemState(languageItem, checkbox.checked);
      });
      
      languageGrid.appendChild(languageItem);
    });
  }

  updateLanguageItemState(languageItem, isSelected) {
    if (isSelected) {
      languageItem.classList.add('selected');
    } else {
      languageItem.classList.remove('selected');
    }
  }

  // 更新目標語言UI
  updateTargetLanguagesUI() {
    console.log('🔧 更新目標語言設定UI...');
    
    try {
      const targetLanguages = this.settings.targetLanguages || ['zh-tw', 'en'];
      
      // 更新語言選擇框的狀態
      const languageGrid = document.getElementById('languageGrid');
      if (languageGrid) {
        const checkboxes = languageGrid.querySelectorAll('input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
          const isSelected = targetLanguages.includes(checkbox.value);
          checkbox.checked = isSelected;
          
          const languageItem = checkbox.closest('.language-item');
          if (languageItem) {
            this.updateLanguageItemState(languageItem, isSelected);
          }
        });
        
        console.log('✅ 目標語言UI已更新:', targetLanguages);
      } else {
        console.warn('⚠️ 找不到語言選擇網格');
      }
    } catch (error) {
      console.error('❌ 更新目標語言UI時發生錯誤:', error);
    }
  }

  updateSettingsUI() {
    console.log('🔧 開始更新設定UI...');
    
    try {
      // 基本設定 - 只設置存在的元素
      const translationProvider = document.getElementById('translationProvider');
      if (translationProvider) {
        translationProvider.value = this.settings.translationProvider || 'free';
        console.log('✅ 翻譯服務設定已更新:', translationProvider.value);
      } else {
        console.warn('⚠️ 找不到翻譯服務選擇元素');
      }
      
      // 語音識別語言設定
      const speechRecognitionLanguage = document.getElementById('speechRecognitionLanguage');
      if (speechRecognitionLanguage) {
        speechRecognitionLanguage.value = this.settings.speechRecognitionLanguage || 'auto';
        console.log('✅ 語音識別語言設定已更新:', speechRecognitionLanguage.value);
      } else {
        console.warn('⚠️ 找不到語音識別語言選擇元素');
      }
      
      // 語音識別引擎設定
      const speechRecognitionEngine = document.getElementById('speechRecognitionEngine');
      if (speechRecognitionEngine) {
        speechRecognitionEngine.value = this.settings.speechRecognitionEngine || 'browser';
        console.log('✅ 語音識別引擎設定已更新:', speechRecognitionEngine.value);
      } else {
        console.warn('⚠️ 找不到語音識別引擎選擇元素');
      }
      
      // API 金鑰設定
      const microsoftKey = document.getElementById('microsoftKey');
      if (microsoftKey) {
        microsoftKey.value = this.settings.microsoftApiKey || '';
        console.log('✅ Microsoft API Key 設定已更新');
      }
      
      const openaiKey = document.getElementById('openaiKey');
      if (openaiKey) {
        openaiKey.value = this.settings.openaiApiKey || '';
        console.log('✅ OpenAI API Key 設定已更新');
      }
      
      // 音頻設備設定
      const audioInputDevice = document.getElementById('audioInputDevice');
      if (audioInputDevice) {
        // 先確保設備列表已載入
        if (this.audioDevices.length === 0 || 
            (this.audioDevices.length === 1 && this.audioDevices[0].deviceId === 'default')) {
          console.log('🎙️ 音頻設備列表為空，重新枚舉設備...');
          this.enumerateAudioDevices();
        }
        
        audioInputDevice.value = this.settings.audioInputDevice || 'default';
        console.log('✅ 音頻設備設定已更新:', audioInputDevice.value);
        
        // 顯示當前可用設備數量
        console.log('🎙️ 當前可用音頻設備:', this.audioDevices.length);
        this.audioDevices.forEach((device, index) => {
          console.log(`  ${index + 1}. ${device.label || device.deviceId} (${device.deviceId})`);
        });
      } else {
        console.warn('⚠️ 找不到音頻設備選擇元素');
      }
      
      // 語音識別準確性設定
      const confidenceSlider = document.getElementById('confidenceThreshold');
      const confidenceValue = document.getElementById('confidenceValue');
      if (confidenceSlider && confidenceValue) {
        confidenceSlider.value = this.settings.confidenceThreshold || 0.6;
        confidenceValue.textContent = this.settings.confidenceThreshold || 0.6;
        
        // 移除舊的事件監聽器，添加新的
        confidenceSlider.removeEventListener('input', this.confidenceSliderHandler);
        this.confidenceSliderHandler = (e) => {
          confidenceValue.textContent = e.target.value;
          this.lastConfidenceThreshold = parseFloat(e.target.value);
        };
        confidenceSlider.addEventListener('input', this.confidenceSliderHandler);
        
        console.log('✅ 置信度設定已更新');
      }
      
      const textCorrectionCheckbox = document.getElementById('enableTextCorrection');
      if (textCorrectionCheckbox) {
        textCorrectionCheckbox.checked = this.settings.enableTextCorrection !== false;
        console.log('✅ 文字校正設定已更新');
      }
      
      // 說話者分離設定
      const speakerDiarizationCheckbox = document.getElementById('enableSpeakerDiarization');
      if (speakerDiarizationCheckbox) {
        speakerDiarizationCheckbox.checked = this.settings.enableSpeakerDiarization !== false;
        
        // 移除舊的事件監聽器，添加新的
        speakerDiarizationCheckbox.removeEventListener('change', this.speakerDiarizationHandler);
        this.speakerDiarizationHandler = (e) => {
          this.speakerDetection.enabled = e.target.checked;
          if (!e.target.checked) {
            // 隱藏說話者統計面板
            const statsPanel = document.getElementById('speakerStatsPanel');
            if (statsPanel) {
              statsPanel.classList.remove('show');
            }
          }
        };
        speakerDiarizationCheckbox.addEventListener('change', this.speakerDiarizationHandler);
        
        console.log('✅ 說話者分離設定已更新');
      }
      
      const speakerThresholdSlider = document.getElementById('speakerChangeThreshold');
      const speakerThresholdValue = document.getElementById('speakerChangeValue');
      if (speakerThresholdSlider && speakerThresholdValue) {
        speakerThresholdSlider.value = this.settings.speakerChangeThreshold || 2;
        speakerThresholdValue.textContent = this.settings.speakerChangeThreshold || 2;
        
        // 移除舊的事件監聽器，添加新的
        speakerThresholdSlider.removeEventListener('input', this.speakerThresholdHandler);
        this.speakerThresholdHandler = (e) => {
          const value = parseFloat(e.target.value);
          speakerThresholdValue.textContent = value;
          this.speakerDetection.speakerChangeThreshold = value * 1000; // 轉換為毫秒
        };
        speakerThresholdSlider.addEventListener('input', this.speakerThresholdHandler);
        
        console.log('✅ 說話者切換閾值設定已更新');
      }
      
      const showStatsCheckbox = document.getElementById('showSpeakerStats');
      if (showStatsCheckbox) {
        showStatsCheckbox.checked = this.settings.showSpeakerStats !== false;
        console.log('✅ 說話者統計顯示設定已更新');
      }
      
      // 更新目標語言設定
      this.updateTargetLanguagesUI();
      
      // 顯示/隱藏翻譯API設定
      this.toggleProviderSettings();
      
      console.log('✅ 設定UI更新完成');
      
    } catch (error) {
      console.error('❌ 更新設定UI時發生錯誤:', error);
      this.showStatus('❌ 設定UI更新失敗', 'error');
    }
  }

  toggleProviderSettings() {
    const provider = document.getElementById('translationProvider');
    const microsoftSettings = document.getElementById('microsoftSettings');
    const openaiSettings = document.getElementById('openaiSettings');
    
    if (!provider || !microsoftSettings || !openaiSettings) {
      return; // 如果元素不存在就退出
    }
    
    const providerValue = provider.value;
    
    if (providerValue === 'microsoft') {
      microsoftSettings.style.display = 'block';
      openaiSettings.style.display = 'none';
    } else if (providerValue === 'openai') {
      microsoftSettings.style.display = 'none';
      openaiSettings.style.display = 'block';
    } else {
      // 免費翻譯不需要設定
      microsoftSettings.style.display = 'none';
      openaiSettings.style.display = 'none';
    }
  }

  initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.showStatus('❌ 瀏覽器不支援語音識別', 'error');
      return false;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      // 優化語音識別參數以提高準確性
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 5;  // 增加備選項以提高準確性
      
      // 設定語音識別語言
      this.updateSpeechRecognitionLanguage();
      
      // 重置所有計時器和狀態
      this.retryCount = 0;
      this.isRestarting = false;
      this.isSwitchingLanguage = false;
      this.lastLanguageSwitch = 0;
      this.lastActivityTime = Date.now();
      
      // 語音識別結果處理增強
      this.recognitionBuffer = []; // 用於累積識別結果
      this.lastConfidenceThreshold = 0.6; // 最低置信度閾值
      this.speechPatterns = this.initializeSpeechPatterns(); // 常見詞彙模式
      
      // 說話者分離功能
      this.speakerDetection = {
        enabled: true, // 是否啟用說話者分離
        speakers: [], // 說話者列表
        currentSpeaker: null, // 當前說話者
        lastSpeechTime: 0, // 上次語音時間
        silenceThreshold: 1500, // 靜默閾值 (ms)
        speakerChangeThreshold: 2000, // 說話者切換閾值 (ms)
        audioAnalyser: null, // 音頻分析器
        volumeHistory: [], // 音量歷史
        pitchHistory: [] // 音調歷史（如果可獲取）
      };
      
      this.recognition.onresult = (event) => {
        if (!this.isRecording) return;
        
        // 更新活動時間
        this.lastActivityTime = Date.now();
        
        this.handleRecognitionResultEnhanced(event);
      };

      this.recognition.onerror = (event) => {
        console.error('🚨 語音識別錯誤:', event.error);
        
        // 更新活動時間（即使是錯誤也算活動）
        this.lastActivityTime = Date.now();
        
        this.handleRecognitionError(event);
      };

      this.recognition.onend = () => {
        console.log('🔚 語音識別結束');
        
        // 更新活動時間
        this.lastActivityTime = Date.now();
        
        this.handleRecognitionEnd();
      };

      this.recognition.onstart = () => {
        console.log('🎤 語音識別開始');
        this.retryCount = 0; // 重置重試計數
        this.isRestarting = false;
        this.lastActivityTime = Date.now(); // 更新活動時間
        
        // 啟動監控機制
        this.startWatchdog();
        
        const langName = this.getSpeechRecognitionLanguageName();
        this.showStatus(`🎤 語音識別已啟動 (${langName})，請開始說話`, 'success');
      };

      console.log('✅ 語音識別初始化完成（增強版）');
      return true;
    } catch (error) {
      console.error('❌ 語音識別初始化失敗:', error);
      this.showStatus('❌ 語音識別初始化失敗', 'error');
      return false;
    }
  }

  // 初始化語音模式識別
  initializeSpeechPatterns() {
    return {
      // 中文常見詞彙校正
      zh: {
        '你好': ['你好', '妳好', '尼好'],
        '謝謝': ['謝謝', '謝謝你', '感謝'],
        '對不起': ['對不起', '抱歉', '不好意思'],
        '沒有': ['沒有', '沒有啊', '沒'],
        '可以': ['可以', '可以的', '行'],
        '什麼': ['什麼', '甚麼', '啥'],
        '怎麼': ['怎麼', '怎麼樣', '如何'],
        '知道': ['知道', '曉得', '了解'],
        '現在': ['現在', '目前', '當前'],
        '這個': ['這個', '這', '此'],
        '那個': ['那個', '那', '彼']
      },
      // 英文常見詞彙校正
      en: {
        'hello': ['hello', 'hallo', 'helo'],
        'thank you': ['thank you', 'thanks', 'thank u'],
        'sorry': ['sorry', 'sory', 'apologize'],
        'excuse me': ['excuse me', 'excuse', 'pardon'],
        'how are you': ['how are you', 'how r you', 'how do you do'],
        'what': ['what', 'wat', 'wot'],
        'where': ['where', 'were', 'wher'],
        'when': ['when', 'wen', 'whn'],
        'why': ['why', 'y', 'wi'],
        'how': ['how', 'hw', 'ow']
      }
    };
  }

  // 更新語音識別語言設定
  updateSpeechRecognitionLanguage() {
    if (!this.recognition) return;
    
    const selectedLang = this.settings.speechRecognitionLanguage;
    
    if (selectedLang === 'auto') {
      // 智能檢測模式：根據使用者設定的目標語言來推測
      const targetLangs = this.settings.targetLanguages || ['zh-tw', 'en'];
      
      if (targetLangs.includes('zh-tw') || targetLangs.includes('zh-cn')) {
        this.recognition.lang = 'zh-TW';
      } else if (targetLangs.includes('en')) {
        this.recognition.lang = 'en-US';
      } else {
        this.recognition.lang = 'zh-TW'; // 預設中文
      }
      
      console.log('🌐 智能語言檢測模式，當前使用:', this.recognition.lang);
    } else {
      this.recognition.lang = selectedLang;
      console.log('🗣️ 使用指定語言:', selectedLang);
    }
  }

  // 獲取語音識別語言名稱
  getSpeechRecognitionLanguageName() {
    const selectedLang = this.settings.speechRecognitionLanguage;
    if (selectedLang === 'auto') {
      return `智能檢測 (${this.recognition.lang})`;
    }
    const langOption = this.speechRecognitionLanguages.find(l => l.code === selectedLang);
    return langOption ? langOption.name : selectedLang;
  }

  // 智能語言檢測
  detectLanguageFromText(text) {
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /[a-zA-Z]/;
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanRegex = /[\uac00-\ud7af]/;
    
    if (chineseRegex.test(text)) {
      return 'zh-TW';
    } else if (japaneseRegex.test(text)) {
      return 'ja-JP';
    } else if (koreanRegex.test(text)) {
      return 'ko-KR';
    } else if (englishRegex.test(text)) {
      return 'en-US';
    }
    
    return null;
  }

  // 動態切換語言 - 改善版本，避免卡住
  async switchSpeechRecognitionLanguage(detectedLang) {
    if (this.settings.speechRecognitionLanguage !== 'auto') {
      return; // 非自動模式不進行切換
    }
    
    if (!this.recognition || this.recognition.lang === detectedLang) {
      return; // 已經是正確語言或識別器不存在
    }
    
    // 避免頻繁切換 - 延長冷卻時間
    if (this.lastLanguageSwitch && Date.now() - this.lastLanguageSwitch < 5000) {
      console.log('🔄 避免頻繁語言切換，忽略此次請求');
      return;
    }
    
    // 如果正在重啟或切換，跳過
    if (this.isRestarting || this.isSwitchingLanguage) {
      console.log('🔄 正在重啟或切換中，跳過語言切換');
      return;
    }
    
    console.log('🔄 準備切換語音識別語言:', this.recognition.lang, '->', detectedLang);
    
    try {
      // 標記切換時間和狀態
      this.lastLanguageSwitch = Date.now();
      this.isSwitchingLanguage = true;
      
      // 暫時停止監控機制
      this.stopWatchdog();
      
      // 暫時停止識別，但不更改isRecording狀態
      if (this.isRecording && this.recognition) {
        console.log('🔄 暫停當前識別以切換語言');
        
        // 停止當前識別
        this.recognition.stop();
        
        // 等待短暫時間讓識別完全停止
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 檢查是否仍在錄音狀態（可能用戶已停止）
        if (!this.isRecording) {
          this.isSwitchingLanguage = false;
          return;
        }
        
        // 更新語言
        this.recognition.lang = detectedLang;
        
        // 重新開始識別
        if (this.isRecording && !this.isRestarting) {
          console.log('🔄 重新啟動語音識別，新語言:', detectedLang);
          
          try {
            // 更新活動時間
            this.lastActivityTime = Date.now();
            
            this.recognition.start();
            this.showStatus(`🔄 已切換到 ${this.getSpeechRecognitionLanguageName()}`, 'success');
          } catch (startError) {
            console.error('🔄 重新啟動識別失敗:', startError);
            
            // 如果啟動失敗，使用強制重啟
            console.log('🔄 嘗試強制重啟來恢復識別');
            this.forceRestart();
          }
        }
      }
    } catch (error) {
      console.error('🔄 語言切換過程中出錯:', error);
      
      // 發生錯誤時，嘗試強制重啟來恢復
      if (this.isRecording) {
        this.showStatus('語言切換失敗，正在強制重啟...', 'warning');
        this.forceRestart();
      }
    } finally {
      // 無論成功失敗，都要重置切換狀態
      this.isSwitchingLanguage = false;
    }
  }

  // 增強語音識別結果處理
  handleRecognitionResultEnhanced(event) {
    console.log('🎯 收到語音識別結果（增強版）:', event);
    
    if (!event.results || event.results.length === 0) {
      console.warn('⚠️ 語音識別結果為空');
      return;
    }

    let interimText = '';
    let finalText = '';
    let bestConfidence = 0;
    let alternatives = [];
    
    // 處理所有結果，包括備選項
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      
      if (!result || result.length === 0) {
        console.warn('⚠️ 語音識別結果格式異常:', result);
        continue;
      }
      
      // 收集所有備選項
      const currentAlternatives = [];
      for (let j = 0; j < Math.min(result.length, 3); j++) {
        if (result[j] && result[j].transcript) {
          currentAlternatives.push({
            text: result[j].transcript.trim(),
            confidence: result[j].confidence || 0
          });
        }
      }
      
      if (currentAlternatives.length === 0) {
        continue;
      }
      
      // 選擇最佳結果
      const bestAlternative = this.selectBestAlternative(currentAlternatives);
      
      console.log(`📝 識別到文字: "${bestAlternative.text}" (置信度: ${bestAlternative.confidence.toFixed(2)}, isFinal: ${result.isFinal})`);
      
      if (result.isFinal) {
        // 只有置信度足夠高的最終結果才處理
        if (bestAlternative.confidence >= this.lastConfidenceThreshold) {
          const correctedText = this.correctSpeechText(bestAlternative.text);
          finalText += correctedText;
          bestConfidence = Math.max(bestConfidence, bestAlternative.confidence);
        } else {
          console.log(`⚠️ 置信度太低 (${bestAlternative.confidence.toFixed(2)} < ${this.lastConfidenceThreshold})，嘗試備選項`);
          
          // 檢查備選項是否有更好的結果
          const fallbackResult = this.findBestFallback(currentAlternatives);
          if (fallbackResult) {
            finalText += fallbackResult;
            console.log(`✅ 使用備選項: "${fallbackResult}"`);
          }
        }
      } else {
        // 臨時結果使用較低的閾值
        if (bestAlternative.confidence >= 0.3) {
          const correctedText = this.correctSpeechText(bestAlternative.text);
          interimText += correctedText;
        }
      }
      
      alternatives.push(...currentAlternatives);
    }
    
    // 處理最終結果
    if (finalText && finalText.trim().length > 0) {
      console.log('🎯 最終語音識別結果:', finalText, '最佳置信度:', bestConfidence.toFixed(2));
      this.showStatus(`🎤 識別到：${finalText} (置信度: ${bestConfidence.toFixed(2)})`, 'success');
      
      // 智能語言檢測和切換
      if (this.settings.speechRecognitionLanguage === 'auto') {
        const detectedLang = this.detectLanguageFromText(finalText);
        if (detectedLang) {
          this.switchSpeechRecognitionLanguage(detectedLang);
        }
      }
      
      // 使用統一的語音識別結果處理
      this.handleSpeechResult(finalText, true, bestConfidence);
    } 
    // 處理臨時結果
    else if (interimText && interimText.trim().length > 0) {
      console.log('⏳ 臨時語音識別結果:', interimText);
      this.showStatus(`🎤 識別中：${interimText}`, 'info');
      
      // 使用統一的語音識別結果處理
      this.handleSpeechResult(interimText, false);
    }
  }

  // 選擇最佳備選項
  selectBestAlternative(alternatives) {
    if (alternatives.length === 0) {
      return { text: '', confidence: 0 };
    }
    
    // 按置信度排序
    alternatives.sort((a, b) => b.confidence - a.confidence);
    
    const best = alternatives[0];
    
    // 如果最佳選項置信度很高，直接使用
    if (best.confidence >= 0.8) {
      return best;
    }
    
    // 如果置信度中等，檢查是否有常見詞彙模式
    const correctedBest = this.correctSpeechText(best.text);
    if (correctedBest !== best.text) {
      // 如果校正後有變化，提高置信度
      return { text: correctedBest, confidence: Math.min(best.confidence + 0.2, 1.0) };
    }
    
    return best;
  }

  // 尋找最佳備選項
  findBestFallback(alternatives) {
    for (const alt of alternatives) {
      const corrected = this.correctSpeechText(alt.text);
      
      // 如果校正後的文字不同，可能找到了正確的詞彙
      if (corrected !== alt.text && corrected.length > 2) {
        return corrected;
      }
      
      // 檢查是否包含常見詞彙
      if (this.containsCommonWords(alt.text)) {
        return alt.text;
      }
    }
    
    return null;
  }

  // 語音文字校正
  correctSpeechText(text) {
    if (!text || text.trim().length === 0) {
      return text;
    }
    
    let correctedText = text.trim();
    
    // 檢測當前語言
    const isChineseText = /[\u4e00-\u9fff]/.test(correctedText);
    const patterns = isChineseText ? this.speechPatterns.zh : this.speechPatterns.en;
    
    // 應用詞彙校正
    for (const [correct, variations] of Object.entries(patterns)) {
      for (const variation of variations) {
        // 使用正則表達式進行替換（不區分大小寫）
        const regex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        correctedText = correctedText.replace(regex, correct);
      }
    }
    
    // 基本清理
    correctedText = correctedText
      .replace(/\s+/g, ' ')  // 多個空格合併為一個
      .replace(/[。，、]{2,}/g, '。')  // 重複標點符號清理
      .trim();
    
    return correctedText;
  }

  // 檢查是否包含常見詞彙
  containsCommonWords(text) {
    const commonChinese = ['你', '我', '他', '她', '是', '的', '了', '在', '有', '會', '說', '去', '來', '好', '不'];
    const commonEnglish = ['the', 'is', 'and', 'to', 'a', 'in', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as'];
    
    const words = text.toLowerCase().split(/\s+/);
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    
    // 檢查中文常見字
    if (chineseChars.length > 0) {
      const commonChineseFound = chineseChars.some(char => commonChinese.includes(char));
      if (commonChineseFound) return true;
    }
    
    // 檢查英文常見詞
    const commonEnglishFound = words.some(word => commonEnglish.includes(word));
    return commonEnglishFound;
  }

  handleRecognitionError(event) {
    console.error('🚨 語音識別錯誤:', event.error);
    
    // 更新活動時間
    this.lastActivityTime = Date.now();
    
    switch (event.error) {
      case 'network':
        console.log('🌐 網路錯誤，嘗試重啟');
        this.showStatus('⚠️ 網路連接問題，正在重試...', 'warning');
        this.attemptRestart();
        break;
      case 'not-allowed':
        console.log('🚫 麥克風權限被拒絕');
        this.showStatus('❌ 麥克風權限被拒絕，請允許麥克風存取', 'error');
        this.stopRecording();
        break;
      case 'no-speech':
        // 靜音是正常的，不需要顯示錯誤
        console.log('🔇 未檢測到語音，繼續監聽');
        // 不重啟，讓它繼續運行
        break;
      case 'aborted':
        console.log('⏹️ 語音識別被中斷，這通常是正常的重啟過程');
        // 不顯示錯誤，這通常是正常的重啟過程
        break;
      case 'audio-capture':
        console.log('🎙️ 音頻捕獲失敗，嘗試重啟');
        this.showStatus('⚠️ 音頻設備問題，正在重試...', 'warning');
        this.attemptRestart();
        break;
      case 'service-not-allowed':
        console.log('🚫 語音服務被拒絕');
        this.showStatus('❌ 語音服務不可用，請重新整理頁面', 'error');
        this.stopRecording();
        break;
      case 'language-not-supported':
        console.log('🌍 語言不支援，切換到預設語言');
        this.recognition.lang = 'zh-TW';
        this.showStatus('⚠️ 切換語言設定，正在重試...', 'warning');
        this.attemptRestart();
        break;
      default:
        console.log(`❓ 未知錯誤: ${event.error}，嘗試重啟`);
        this.showStatus(`⚠️ 識別問題，正在重試... (${event.error})`, 'warning');
        this.attemptRestart();
    }
  }

  handleRecognitionEnd() {
    console.log('🔚 語音識別結束，當前狀態:', {
      isRecording: this.isRecording,
      isRestarting: this.isRestarting,
      isSwitchingLanguage: this.isSwitchingLanguage,
      userRequestedStop: this.userRequestedStop
    });
    
    // 如果用戶主動停止，不要自動重啟
    if (this.userRequestedStop) {
      console.log('🛑 用戶主動停止錄音，不自動重啟');
      this.userRequestedStop = false; // 重置標記
      return;
    }
    
    // 如果正在切換語言，不要自動重啟
    if (this.isSwitchingLanguage) {
      console.log('🔄 語言切換中，不自動重啟識別');
      return;
    }
    
    if (this.isRecording && !this.isRestarting) {
      console.log('🔄 語音識別意外結束，嘗試重啟');
      this.attemptRestart();
    }
  }

  attemptRestart() {
    if (!this.isRecording) {
      return; // 如果已經停止錄音，不需要重啟
    }

    if (this.isRestarting) {
      return; // 避免重複重啟
    }

    if (this.retryCount >= this.maxRetries) {
      this.showStatus('語音識別重試次數過多，請手動重新開始', 'error');
      this.stopRecording();
      return;
    }

    this.isRestarting = true;
    this.retryCount++;
    
    console.log(`🔄 嘗試重啟語音識別 (第 ${this.retryCount} 次)`);
    
    // 更新活動時間
    this.lastActivityTime = Date.now();
    
    // 等待一小段時間後重啟
    setTimeout(() => {
      if (this.isRecording && this.recognition) {
        try {
          console.log('🔄 重新啟動語音識別引擎');
          this.recognition.start();
          this.isRestarting = false;
          
          // 重置重試計數
          this.retryCount = 0;
          
          console.log('✅ 重啟成功');
        } catch (error) {
          console.error('❌ 重啟語音識別失敗:', error);
          this.isRestarting = false;
          
          if (this.retryCount < this.maxRetries) {
            console.log(`⏭️ 將在 2 秒後進行第 ${this.retryCount + 1} 次重試`);
            setTimeout(() => this.attemptRestart(), 2000);
          } else {
            this.showStatus('無法重啟語音識別，請手動重新開始', 'error');
            this.stopRecording();
          }
        }
      } else {
        this.isRestarting = false;
        
        // 如果識別器不存在，嘗試重新初始化
        if (this.isRecording && !this.recognition) {
          console.log('🔧 識別器不存在，嘗試重新初始化');
          this.forceRestart();
        }
      }
    }, Math.min(1000 * this.retryCount, 5000)); // 漸進式延遲，最多5秒
  }

  // 生成會話ID
  generateSessionId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const randomStr = Math.random().toString(36).substr(2, 6);
    return `session_${dateStr}_${randomStr}`;
  }

  // 記錄到歷程
  recordToHistory(originalText, timestamp = null, subtitleId = null, speakerInfo = null) {
    if (!this.settings.enableHistoryRecording) return null;
    
    const record = {
      id: `record_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: timestamp || new Date(),
      originalText: originalText,
      translations: {},
      recognitionEngine: this.settings.speechRecognitionEngine,
      language: this.recognition ? this.recognition.lang : 'unknown',
      subtitleId: subtitleId,
      speakerInfo: speakerInfo
    };
    
    this.sessionHistory.records.push(record);
    console.log('📚 已記錄到歷程:', record);
    
    return record.id;
  }

  // 更新歷程中的翻譯
  updateHistoryTranslations(recordId, translations) {
    const record = this.sessionHistory.records.find(r => r.id === recordId);
    if (record) {
      record.translations = translations;
      console.log('📚 已更新歷程翻譯:', recordId);
    }
  }

  // 顯示原文（使用 SubtitleCore）
  displayOriginalTextWithSpeaker(text, subtitleId, recordId, speakerInfo) {
    if (this.subtitleCore) {
      this.subtitleCore.displayOriginalTextWithSpeaker(text, subtitleId, recordId, speakerInfo);
      
      // 更新說話者統計顯示
      if (this.updateSpeakerStatsDisplay) {
        this.updateSpeakerStatsDisplay();
      }
    } else {
      console.warn('⚠️ SubtitleCore 尚未初始化');
    }
  }

  // 恢復原始的displayOriginalText方法（為了向後兼容）
  displayOriginalText(text, subtitleId, recordId) {
    this.displayOriginalTextWithSpeaker(text, subtitleId, recordId, null);
  }

  // 清除說話者歷史（重新開始會話時使用）
  clearSpeakerHistory() {
    this.speakerDetection.speakers = [];
    this.speakerDetection.currentSpeaker = null;
    this.speakerDetection.lastSpeechTime = 0;
    console.log('🗣️ 說話者歷史已清除');
  }

  // 獲取說話者統計信息
  getSpeakerStats() {
    return this.speakerDetection.speakers.map(speaker => ({
      id: speaker.id,
      name: speaker.name,
      speechCount: speaker.speechCount,
      duration: speaker.lastSeen - speaker.firstSeen,
      preferredLanguage: speaker.features.preferredLanguage,
      avgConfidence: speaker.features.avgConfidence,
      color: speaker.color
    }));
  }

  // 異步翻譯函數 - 優化版本
  async processRecognizedTextAsync(text, subtitleId) {
    if (!text.trim()) return;
    
    console.log('🌐 添加翻譯到佇列:', text, 'ID:', subtitleId);
    
    // 增加統計
    this.translationStats.total++;
    this.updateTranslationStats('total');
    
    // 定期清理過期請求（減少頻率）
    const now = Date.now();
    if (now - this.lastCleanupTime > 60000) { // 改為每60秒清理一次
      this.cleanupExpiredTranslations();
    }
    
    // 檢查是否已有相同的請求在處理
    if (this.pendingTranslations.has(subtitleId)) {
      console.log('⏭️ 跳過重複的翻譯請求:', subtitleId);
      return;
    }
    
    // 檢查佇列長度，防止過度累積
    if (this.translationQueue.length > 10) {
      console.warn('⚠️ 翻譯佇列過長，移除最舊的請求');
      const removedRequest = this.translationQueue.shift();
      this.showTranslationError(removedRequest.subtitleId, '翻譯請求被跳過（佇列過載）');
    }
    
    // 添加到佇列，使用較短的超時時間
    this.translationQueue.push({
      text: text,
      subtitleId: subtitleId,
      timestamp: now,
      priority: text.length < 50 ? 'high' : 'normal' // 短文本優先處理
    });
    
    console.log('📊 翻譯佇列狀態:', {
      queueLength: this.translationQueue.length,
      pendingCount: this.pendingTranslations.size,
      maxPending: this.maxPendingTranslations
    });
    
    // 非阻塞式處理佇列
    setTimeout(() => this.processTranslationQueue(), 0);
  }

  async testTranslation() {
    console.log('🧪 開始測試翻譯功能');
    this.showStatus('🧪 測試翻譯功能...', 'info');
    
    const testTexts = [
      '你好',
      'Hello',
      '今天天氣很好',
      'How are you?'
    ];
    
    const randomText = testTexts[Math.floor(Math.random() * testTexts.length)];
    
    console.log('🧪 測試文字:', randomText);
    this.showStatus(`🧪 測試翻譯：${randomText}`, 'info');
    
    // 正確生成subtitleId並傳給displayOriginalText
    const subtitleId = this.generateSessionId();
    const recordId = this.recordToHistory(randomText, new Date(), subtitleId, null);
    
    // 顯示原文
    this.displayOriginalText(randomText, subtitleId, recordId);
    
    // 處理翻譯
    this.processRecognizedTextAsync(randomText, subtitleId);
  }

  // 處理語音識別結果（統一入口）- 使用核心模組簡化版
  handleSpeechResult(text, isFinal = false, confidence = 0) {
    if (!text || text.trim().length === 0) {
      return;
    }
    
    if (isFinal) {
      console.log('🎯 收到最終語音結果:', text);
      
      // 使用歷程核心創建記錄條目
      const recordEntry = this.historyCore.createRecordEntry(text, {
        source: 'speech_recognition',
        engine: this.settings.speechRecognitionEngine,
        language: this.settings.speechRecognitionLanguage,
        confidence: confidence
      });
      
      // 使用字幕核心顯示原文
      this.subtitleCore.displayOriginalTextWithSpeaker(
        text,
        recordEntry.subtitleId,
        recordEntry.id,
        recordEntry.speakerInfo
      );
      
      // 異步進行翻譯
      this.processTranslationAsync(recordEntry);
      
      // 智能整理處理
      if (this.addToSmartOrganizer) {
        this.addToSmartOrganizer(text, recordEntry.speakerInfo);
      }
      
    } else {
      // 使用字幕核心顯示臨時結果
      if (this.subtitleCore) {
        this.subtitleCore.showInterimSubtitle(text);
      }
    }
  }

  // 異步處理翻譯（使用核心模組簡化版）
  async processTranslationAsync(recordEntry) {
    try {
      console.log('🌐 開始異步翻譯處理:', recordEntry.id);
      
      // 發送翻譯請求
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: recordEntry.originalText,
        targetLanguages: this.settings.targetLanguages || ['zh-tw', 'en']
      });

      if (response && response.success) {
        // 使用字幕核心更新翻譯
        this.subtitleCore.updateSubtitleTranslations(recordEntry.subtitleId, response.data);
        
        // 使用歷程核心更新翻譯記錄
        const translationsMap = {};
        response.data.translations.forEach(t => {
          translationsMap[t.language] = t.text;
        });
        this.historyCore.updateHistoryTranslations(recordEntry.id, translationsMap);
        
        console.log('✅ 翻譯處理完成:', response.data);
      } else {
        console.error('❌ 翻譯失敗:', response?.error);
        
        // 使用字幕核心顯示錯誤
        this.subtitleCore.showTranslationError(recordEntry.subtitleId, response?.error || '未知錯誤');
        
        this.showStatus(`翻譯失敗: ${response?.error || '未知錯誤'}`, 'error');
      }
    } catch (error) {
      console.error('❌ 翻譯處理失敗:', error);
      
      // 使用字幕核心顯示錯誤
      if (this.subtitleCore) {
        this.subtitleCore.showTranslationError(recordEntry.subtitleId, error.message);
      }
      
      this.showStatus(`翻譯處理失敗: ${error.message}`, 'error');
    }
  }

  // 立即創建記錄條目
  createImmediateRecord(originalText, confidence = 0) {
    const timestamp = new Date();
    const recordId = this.generateSessionId();
    const subtitleId = this.generateSessionId();
    
    // 說話者檢測
    const speakerInfo = this.detectSpeakerChange(originalText, confidence);
    
    // 創建記錄條目
    const recordEntry = {
      id: recordId,
      subtitleId: subtitleId,
      timestamp: timestamp,
      originalText: originalText,
      confidence: confidence,
      speakerInfo: speakerInfo,
      recognitionStatus: 'recorded', // recorded -> processing -> completed/failed
      translationStatus: 'pending',  // pending -> processing -> completed/failed
      translations: {},
      processingStartTime: Date.now()
    };
    
    // 記錄到歷程（包含說話者信息）
    const historyRecordId = this.recordToHistory(originalText, timestamp, subtitleId, speakerInfo);
    recordEntry.historyRecordId = historyRecordId;
    
    // 立即顯示記錄條目
    this.displayRecordEntry(recordEntry);
    
    console.log('📝 立即記錄已創建:', recordEntry.id);
    return recordEntry;
  }

  // 顯示記錄條目（新設計）
  displayRecordEntry(recordEntry) {
    const subtitleContainer = document.getElementById('subtitleContainer');
    const noSubtitles = document.getElementById('noSubtitles');
    
    if (noSubtitles) {
      noSubtitles.style.display = 'none';
    }
    
    // 創建記錄條目元素
    const recordElement = document.createElement('div');
    recordElement.id = recordEntry.subtitleId;
    recordElement.className = 'record-entry';
    recordElement.dataset.recordId = recordEntry.id;
    
    // 說話者前綴
    let speakerPrefix = '';
    let speakerStyle = '';
    if (this.speakerDetection.enabled && recordEntry.speakerInfo) {
      speakerPrefix = `<span class="speaker-label" style="color: ${recordEntry.speakerInfo.color}; background-color: ${recordEntry.speakerInfo.color}20;">${recordEntry.speakerInfo.name}:</span> `;
      speakerStyle = `style="border-left: 3px solid ${recordEntry.speakerInfo.color};"`;
    }
    
    recordElement.innerHTML = `
      <div class="record-content" ${speakerStyle}>
        <!-- 音頻記錄區域 -->
        <div class="audio-record-section">
          <div class="section-header">
            <span class="section-title">🎙️ 音頻記錄</span>
            <span class="record-status status-recorded">已記錄</span>
            <span class="record-timestamp">${this.formatTimestamp(recordEntry.timestamp)}</span>
          </div>
          <div class="audio-content">
            ${speakerPrefix}${recordEntry.originalText}
            <div class="confidence-info">置信度: ${recordEntry.confidence.toFixed(2)}</div>
          </div>
        </div>
        
        <!-- 語音識別區域 -->
        <div class="recognition-section">
          <div class="section-header">
            <span class="section-title">🔍 語音識別</span>
            <span class="recognition-status status-processing">
              <span class="loading-spinner"></span>
              處理中...
            </span>
          </div>
          <div class="recognition-content">
            <div class="recognition-result">等待識別結果...</div>
          </div>
        </div>
        
        <!-- 翻譯區域 -->
        <div class="translation-section">
          <div class="section-header">
            <span class="section-title">🌐 翻譯結果</span>
            <span class="translation-status status-pending">等待中</span>
          </div>
          <div class="translation-content">
            <div class="translation-placeholder">等待語音識別完成後開始翻譯...</div>
          </div>
        </div>
      </div>
    `;
    
    // 插入到容器頂部
    subtitleContainer.insertBefore(recordElement, subtitleContainer.firstChild);
    
    // 限制顯示數量
    this.limitRecordEntries();
    
    // 自動滾動
    recordElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    console.log('✅ 記錄條目已顯示:', recordEntry.subtitleId);
  }

  // 異步處理語音識別
  async processRecognitionAsync(recordEntry) {
    try {
      console.log('🔍 開始異步語音識別處理:', recordEntry.id);
      
      // 更新識別狀態
      this.updateRecognitionStatus(recordEntry.subtitleId, 'processing', '正在識別語音...');
      recordEntry.recognitionStatus = 'processing';
      
      // 根據設定選擇識別引擎
      let recognitionResult = null;
      
      if (this.settings.speechRecognitionEngine === 'whisper' && this.settings.openaiKey) {
        // 使用 Whisper API 重新識別
        recognitionResult = await this.reprocessWithWhisper(recordEntry.originalText);
      } else {
        // 使用瀏覽器識別結果（已有的文本）
        recognitionResult = this.enhanceRecognitionResult(recordEntry.originalText);
      }
      
      if (recognitionResult) {
        // 更新識別結果
        this.updateRecognitionResult(recordEntry.subtitleId, recognitionResult);
        recordEntry.recognitionStatus = 'completed';
        recordEntry.recognitionResult = recognitionResult;
        
        console.log('✅ 語音識別完成:', recognitionResult);
        
        // 開始翻譯處理
        this.processTranslationAsync(recordEntry);
      } else {
        throw new Error('識別結果為空');
      }
      
    } catch (error) {
      console.error('❌ 語音識別處理失敗:', error);
      this.updateRecognitionStatus(recordEntry.subtitleId, 'failed', '識別失敗: ' + error.message);
      recordEntry.recognitionStatus = 'failed';
      
      // 即使識別失敗，也嘗試使用原始文本進行翻譯
      recordEntry.recognitionResult = recordEntry.originalText;
      this.processTranslationAsync(recordEntry);
    }
  }

  // 增強識別結果（對瀏覽器識別進行後處理）
  enhanceRecognitionResult(originalText) {
    let enhancedText = this.correctSpeechText(originalText);
    
    // 添加更多後處理邏輯
    enhancedText = this.improveTextFormatting(enhancedText);
    
    return {
      text: enhancedText,
      confidence: 0.8, // 估計置信度
      language: this.detectLanguageFromText(enhancedText),
      processing_time: Date.now()
    };
  }

  // 改善文本格式
  improveTextFormatting(text) {
    return text
      .trim()
      .replace(/\s+/g, ' ') // 合併多餘空格
      .replace(/([。！？.!?])\s*([A-Za-z\u4e00-\u9fff])/g, '$1 $2') // 句號後適當空格
      .replace(/([A-Za-z\u4e00-\u9fff])\s*([，,])/g, '$1$2') // 逗號前不要空格
      .replace(/\s*([。！？.!?])/g, '$1'); // 標點符號前不要空格
  }

  // 使用 Whisper 重新處理
  async reprocessWithWhisper(originalText) {
    // 這裡可以實現將文本重新送到 Whisper API 進行校正
    // 或者使用其他AI服務進行文本改善
    
    // 目前先使用增強處理
    return this.enhanceRecognitionResult(originalText);
  }

  // 異步處理翻譯
  async processTranslationAsync(recordEntry) {
    try {
      console.log('🌐 開始異步翻譯處理:', recordEntry.id);
      
      // 更新翻譯狀態
      this.updateTranslationStatus(recordEntry.subtitleId, 'processing', '正在翻譯...');
      recordEntry.translationStatus = 'processing';
      
      // 獲取要翻譯的文本
      const textToTranslate = recordEntry.recognitionResult ? 
        recordEntry.recognitionResult.text : recordEntry.originalText;
      
      // 執行翻譯
      const translationResult = await this.executeTranslation(textToTranslate, recordEntry.subtitleId);
      
      if (translationResult && translationResult.success) {
        // 更新翻譯結果
        this.updateTranslationResult(recordEntry.subtitleId, translationResult.data);
        recordEntry.translationStatus = 'completed';
        recordEntry.translations = translationResult.data.translations;
        
        // 更新歷程記錄
        if (recordEntry.historyRecordId) {
          const translationsMap = {};
          translationResult.data.translations.forEach(t => {
            translationsMap[t.language] = t.text;
          });
          this.updateHistoryTranslations(recordEntry.historyRecordId, translationsMap);
        }
        
        console.log('✅ 翻譯處理完成:', recordEntry.id);
      } else {
        throw new Error(translationResult?.error || '翻譯失敗');
      }
      
    } catch (error) {
      console.error('❌ 翻譯處理失敗:', error);
      this.updateTranslationStatus(recordEntry.subtitleId, 'failed', '翻譯失敗: ' + error.message);
      recordEntry.translationStatus = 'failed';
    }
  }

  // 執行翻譯請求
  async executeTranslation(text, subtitleId) {
    const message = {
      action: 'translate',
      text: text,
      targetLanguages: this.settings.targetLanguages || ['zh-tw', 'en']
    };
    
    console.log('📤 發送翻譯請求:', message);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('翻譯請求超時'));
      }, 15000); // 15秒超時
      
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 更新識別狀態
  updateRecognitionStatus(subtitleId, status, message) {
    const recordElement = document.getElementById(subtitleId);
    if (!recordElement) return;
    
    const statusElement = recordElement.querySelector('.recognition-status');
    if (statusElement) {
      statusElement.className = `recognition-status status-${status}`;
      
      if (status === 'processing') {
        statusElement.innerHTML = '<span class="loading-spinner"></span>' + message;
      } else if (status === 'completed') {
        statusElement.innerHTML = '✅ ' + (message || '識別完成');
      } else if (status === 'failed') {
        statusElement.innerHTML = '❌ ' + (message || '識別失敗');
      }
    }
  }

  // 更新識別結果
  updateRecognitionResult(subtitleId, recognitionResult) {
    const recordElement = document.getElementById(subtitleId);
    if (!recordElement) return;
    
    const resultElement = recordElement.querySelector('.recognition-result');
    if (resultElement) {
      resultElement.innerHTML = `
        <div class="recognition-text">${recognitionResult.text}</div>
        <div class="recognition-meta">
          語言: ${recognitionResult.language || '未知'} | 
          置信度: ${(recognitionResult.confidence || 0).toFixed(2)}
        </div>
      `;
    }
    
    this.updateRecognitionStatus(subtitleId, 'completed', '識別完成');
  }

  // 更新翻譯狀態
  updateTranslationStatus(subtitleId, status, message) {
    const recordElement = document.getElementById(subtitleId);
    if (!recordElement) return;
    
    const statusElement = recordElement.querySelector('.translation-status');
    if (statusElement) {
      statusElement.className = `translation-status status-${status}`;
      
      if (status === 'processing') {
        statusElement.innerHTML = '<span class="loading-spinner"></span>' + message;
      } else if (status === 'completed') {
        statusElement.innerHTML = '✅ ' + (message || '翻譯完成');
      } else if (status === 'failed') {
        statusElement.innerHTML = '❌ ' + (message || '翻譯失敗');
      }
    }
  }

  // 更新翻譯結果
  updateTranslationResult(subtitleId, translationData) {
    const recordElement = document.getElementById(subtitleId);
    if (!recordElement) return;
    
    const contentElement = recordElement.querySelector('.translation-content');
    if (!contentElement) return;
    
    // 清空現有內容
    contentElement.innerHTML = '';
    
    if (translationData.translations && translationData.translations.length > 0) {
      translationData.translations.forEach(translation => {
        if (translation && translation.language && translation.text) {
          const translationDiv = document.createElement('div');
          translationDiv.className = 'translation-item';
          translationDiv.innerHTML = `
            <span class="lang-label">${this.getLanguageName(translation.language)}:</span>
            <span class="translation-text">${translation.text}</span>
          `;
          contentElement.appendChild(translationDiv);
        }
      });
    } else {
      contentElement.innerHTML = '<div class="no-translation">無翻譯結果</div>';
    }
    
    this.updateTranslationStatus(subtitleId, 'completed', '翻譯完成');
  }

  // 限制記錄條目數量
  limitRecordEntries() {
    const container = document.getElementById('subtitleContainer');
    if (!container) return;
    
    const recordEntries = container.querySelectorAll('.record-entry');
    const maxEntries = 30;
    
    if (recordEntries.length > maxEntries) {
      for (let i = maxEntries; i < recordEntries.length; i++) {
        recordEntries[i].remove();
      }
    }
  }

  showInterimSubtitle(text) {
    // 使用 SubtitleCore 顯示臨時字幕
    if (this.subtitleCore) {
      this.subtitleCore.showInterimSubtitle(text);
    } else {
      console.warn('⚠️ SubtitleCore 尚未初始化');
    }
  }

  // 更新現有字幕項目的翻譯（使用 SubtitleCore）
  updateSubtitleTranslations(subtitleId, translationData) {
    if (this.subtitleCore) {
      this.subtitleCore.updateSubtitleTranslations(subtitleId, translationData);
    } else {
      console.warn('⚠️ SubtitleCore 尚未初始化');
    }
  }

  // 顯示翻譯錯誤（使用 SubtitleCore）
  showTranslationError(subtitleId, errorMessage) {
    if (this.subtitleCore) {
      this.subtitleCore.showTranslationError(subtitleId, errorMessage);
    } else {
      console.warn('⚠️ SubtitleCore 尚未初始化');
    }
    
    this.showStatus(`❌ 翻譯失敗: ${errorMessage}`, 'error');
  }

  displaySubtitles(translationData) {
    console.log('🖥️ 開始顯示字幕:', translationData);
    
    const container = document.getElementById('subtitleContainer');
    const noSubtitles = document.getElementById('noSubtitles');
    
    if (!container) {
      console.error('❌ 找不到字幕容器元素');
      return;
    }
    
    if (noSubtitles) {
      noSubtitles.style.display = 'none';
    }
    
    // 移除暫時字幕
    const existingInterim = container.querySelector('.interim-subtitle');
    if (existingInterim) {
      existingInterim.remove();
    }
    
    // 檢查翻譯數據格式
    if (!translationData || !translationData.original) {
      console.error('❌ 翻譯數據格式異常:', translationData);
      return;
    }
    
    if (!translationData.translations || !Array.isArray(translationData.translations)) {
      console.error('❌ 翻譯結果格式異常:', translationData.translations);
      return;
    }
    
    // 創建字幕項目
    const subtitleItem = document.createElement('div');
    subtitleItem.className = 'subtitle-item';
    
    const originalText = document.createElement('div');
    originalText.className = 'subtitle-original';
    originalText.textContent = translationData.original;
    
    const translationsDiv = document.createElement('div');
    translationsDiv.className = 'subtitle-translations';
    
    console.log('🔍 處理翻譯結果:', translationData.translations);
    
    translationData.translations.forEach((translation, index) => {
      console.log(`🔍 處理第 ${index + 1} 個翻譯:`, translation);
      
      if (!translation || !translation.language || !translation.text) {
        console.warn('⚠️ 無效的翻譯項目:', translation);
        return;
      }
      
      const translationDiv = document.createElement('div');
      translationDiv.className = 'subtitle-translation';
      translationDiv.innerHTML = `
        <span class="lang-label">${this.getLanguageName(translation.language)}:</span>
        ${translation.text}
      `;
      translationsDiv.appendChild(translationDiv);
    });
    
    subtitleItem.appendChild(originalText);
    subtitleItem.appendChild(translationsDiv);
    container.appendChild(subtitleItem);
    
    console.log('✅ 字幕項目已添加到容器');
    
    // 自動滾動到底部
    container.scrollTop = container.scrollHeight;
    
    // 限制字幕數量
    const subtitleItems = container.querySelectorAll('.subtitle-item:not(.interim-subtitle)');
    if (subtitleItems.length > 50) {
      subtitleItems[0].remove();
    }
  }

  getLanguageName(langCode) {
    const lang = this.languageOptions.find(l => l.code === langCode);
    return lang ? lang.name : langCode;
  }

  async toggleRecording() {
    console.log('🔄 切換錄音狀態，當前狀態:', this.isRecording);
    
    // 防止重複調用
    if (this.isTogglingRecording) {
      console.log('⚠️ 正在處理錄音切換，忽略重複請求');
      return;
    }
    
    this.isTogglingRecording = true;
    
    try {
      // 確保已經初始化
      if (!this.recognition && this.settings.speechRecognitionEngine !== 'whisper') {
        console.log('🔧 語音識別未初始化，正在初始化...');
        this.initializeSpeechRecognition();
      }
      
      // 檢查瀏覽器支援
      if (this.settings.speechRecognitionEngine !== 'whisper' && !this.recognition) {
        this.showStatus('❌ 瀏覽器不支援語音識別', 'error');
        return;
      }
      
      if (this.isRecording) {
        console.log('🛑 準備停止錄音');
        this.stopRecording();
      } else {
        console.log('🎤 準備開始錄音');
        await this.startRecording();
      }
    } catch (error) {
      console.error('❌ 切換錄音狀態失敗:', error);
      this.showStatus('❌ 切換錄音狀態失敗: ' + error.message, 'error');
      
      // 重置狀態
      this.isRecording = false;
      this.updateRecordingButton();
    } finally {
      // 延遲釋放鎖定，確保狀態更新完成
      setTimeout(() => {
        this.isTogglingRecording = false;
        console.log('🔓 錄音切換鎖定已釋放');
      }, 500);
    }
  }

  // 開始錄音 - 改善版本
  async startRecording() {
    if (this.isRecording) {
      console.warn('⚠️ 已經在錄音中，忽略重複請求');
      return;
    }
    
    console.log('🎤 開始錄音');
    console.log('🔧 當前設定:', {
      engine: this.settings.speechRecognitionEngine || 'browser',
      language: this.settings.speechRecognitionLanguage || 'zh-TW',
      audioDevice: this.settings.audioInputDevice || 'default'
    });
    
    try {
      // 檢查麥克風權限
      console.log('🔍 檢查麥克風權限...');
      const hasPermission = await this.checkMicrophonePermission();
      
      if (!hasPermission) {
        this.showStatus('❌ 麥克風權限被拒絕', 'error');
        return;
      }
      
      console.log('✅ 麥克風權限確認');
      
      // 設置錄音狀態
      this.isRecording = true;
      this.isRestarting = false;
      this.isSwitchingLanguage = false;
      this.userRequestedStop = false; // 重置停止標記
      this.retryCount = 0;
      this.lastActivityTime = Date.now();
      
      // 更新UI
      this.updateRecordingButton();
      this.updateSessionInfo();
      
      // 初始化語音識別
      if (!this.recognition) {
        console.log('🔧 初始化語音識別');
        const initialized = this.initializeSpeechRecognition();
        if (!initialized) {
          throw new Error('語音識別初始化失敗');
        }
      }
      
      // 啟動語音識別
      console.log('🎤 啟動語音識別');
      this.showStatus('🎤 正在啟動語音識別...', 'info');
      
      // 確保識別器處於正確狀態
      if (this.recognition) {
        try {
          this.recognition.start();
          console.log('✅ 語音識別啟動成功');
        } catch (error) {
          if (error.name === 'InvalidStateError') {
            console.log('🔄 語音識別已在運行，先停止再重新啟動');
            this.recognition.stop();
            setTimeout(() => {
              if (this.isRecording && this.recognition) {
                this.recognition.start();
              }
            }, 500);
          } else {
            throw error;
          }
        }
      } else {
        throw new Error('語音識別器未初始化');
      }
      
    } catch (error) {
      console.error('❌ 開始錄音失敗:', error);
      this.showStatus('❌ 啟動失敗: ' + error.message, 'error');
      this.isRecording = false;
      this.updateRecordingButton();
    }
  }

  async checkMicrophonePermission() {
    console.log('🔍 檢查麥克風權限...');
    
    try {
      // 構建音頻約束
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      
      // 如果指定了設備，嘗試使用指定設備獲取權限
      const selectedDevice = this.settings.audioInputDevice || 'default';
      if (selectedDevice !== 'default') {
        audioConstraints.deviceId = { exact: selectedDevice };
        console.log('🎙️ 嘗試使用指定音頻設備獲取權限:', selectedDevice);
        
        // 找到設備名稱
        const device = this.audioDevices.find(d => d.deviceId === selectedDevice);
        const deviceName = device ? device.label : selectedDevice;
        
        // 警告用戶瀏覽器語音識別的限制
        this.showStatus(`⚠️ 注意：瀏覽器語音識別不支援指定音頻設備。建議切換到 Whisper 引擎以使用 ${deviceName}`, 'warning');
      }
      
      // 嘗試獲取麥克風存取
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      
      console.log('✅ 麥克風權限獲取成功');
      
      // 檢查音頻軌道信息
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log('🎙️ 使用的音頻設備:', {
          label: audioTracks[0].label,
          deviceId: audioTracks[0].getSettings().deviceId
        });
      }
      
      // 立即停止串流，我們只是檢查權限
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (error) {
      console.error('❌ 麥克風權限檢查失敗:', error);
      
      if (error.name === 'NotAllowedError') {
        this.showStatus('❌ 麥克風權限被拒絕，請允許麥克風存取', 'error');
      } else if (error.name === 'NotFoundError') {
        this.showStatus('❌ 找不到指定的麥克風設備', 'error');
      } else if (error.name === 'OverconstrainedError') {
        this.showStatus('❌ 指定的音頻設備不可用，請選擇其他設備', 'error');
      } else {
        this.showStatus('❌ 無法存取麥克風: ' + error.message, 'error');
      }
      
      return false;
    }
  }

  // 停止錄音 - 改善版本
  stopRecording() {
    if (!this.isRecording) {
      console.warn('⚠️ 沒有在錄音，忽略停止請求');
      return;
    }
    
    console.log('🛑 停止錄音');
    console.log('🔧 當前引擎:', this.settings.speechRecognitionEngine);
    
    // 立即重置錄音狀態，防止自動重啟
    this.isRecording = false;
    this.isRestarting = false;
    this.isSwitchingLanguage = false;
    this.userRequestedStop = true; // 新增標記，表示用戶主動停止
    
    // 立即更新按鈕狀態，防止用戶重複點擊
    this.updateRecordingButton();
    
    // 停止監控機制
    this.stopWatchdog();
    
    // 清理語音識別增強功能狀態
    this.recognitionBuffer = [];
    
    // 清理說話者檢測狀態（保留說話者歷史用於統計）
    if (this.speakerDetection) {
      this.speakerDetection.lastSpeechTime = 0;
      // 注意：不清除 speakers 數組，保留會議中的說話者記錄
      console.log('🗣️ 說話者檢測狀態已清理');
    }
    
    try {
      // 清理所有進行中的翻譯請求
      this.cleanupAllTranslations();
      
      if (this.settings.speechRecognitionEngine === 'whisper') {
        console.log('🛑 停止Whisper引擎');
        
        // 停止錄音定時器
        if (this.whisperTimer) {
          clearInterval(this.whisperTimer);
          this.whisperTimer = null;
          console.log('✅ Whisper定時器已清除');
        }
        
        // 停止MediaRecorder
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          console.log('🛑 停止MediaRecorder');
          this.mediaRecorder.stop();
        }
        
        // 關閉音頻流
        if (this.whisperStream) {
          console.log('🛑 關閉音頻流');
          this.whisperStream.getTracks().forEach(track => {
            track.stop();
            console.log('✅ 音頻軌道已停止:', track.label);
          });
          this.whisperStream = null;
        }
        
        // 清理狀態
        this.mediaRecorder = null;
        this.recordingChunks = [];
        
      } else {
        console.log('🛑 停止瀏覽器引擎');
        
        // 停止瀏覽器語音識別
        if (this.recognition) {
          try {
            this.recognition.stop();
            console.log('✅ 瀏覽器語音識別已停止');
          } catch (error) {
            console.warn('⚠️ 停止瀏覽器識別時出錯:', error);
          }
        }
      }
      
      // 更新UI
      this.updateRecordingButton();
      this.updateSessionInfo();
      
      this.showStatus('🛑 錄音已停止', 'info');
      console.log('✅ 錄音停止完成，狀態已清理');
      
    } catch (error) {
      console.error('❌ 停止錄音時出現錯誤:', error);
      this.showStatus('⚠️ 停止錄音時出現問題', 'error');
    }
  }

  // 清理所有翻譯請求
  cleanupAllTranslations() {
    console.log('🧹 清理所有翻譯請求');
    
    // 取消所有進行中的翻譯請求
    for (const [subtitleId, requestInfo] of this.pendingTranslations) {
      console.log('⏹️ 取消翻譯請求:', subtitleId);
      
      if (requestInfo.abortController) {
        requestInfo.abortController.abort();
      }
      
      // 顯示取消狀態
      this.showTranslationError(subtitleId, '翻譯已取消');
    }
    
    // 清空所有佇列和記錄
    this.pendingTranslations.clear();
    this.translationQueue = [];
    this.isProcessingTranslations = false;
    
    console.log('✅ 翻譯清理完成');
  }

  // 切換設定面板
  toggleSettings() {
    console.log('⚙️ toggleSettings() 方法被調用');
    
    const settingsPanel = document.getElementById('settingsPanel');
    
    if (!settingsPanel) {
      console.error('❌ 找不到設定面板元素！');
      this.showStatus('❌ 設定面板初始化失敗', 'error');
      return;
    }
    
    console.log('⚙️ 設定面板當前狀態:', {
      display: window.getComputedStyle(settingsPanel).display,
      visibility: window.getComputedStyle(settingsPanel).visibility,
      right: window.getComputedStyle(settingsPanel).right,
      zIndex: window.getComputedStyle(settingsPanel).zIndex,
      classList: settingsPanel.classList.toString(),
      offsetWidth: settingsPanel.offsetWidth,
      offsetHeight: settingsPanel.offsetHeight
    });
    
    const wasOpen = settingsPanel.classList.contains('open');
    
    if (wasOpen) {
      // 使用專用的關閉方法
      this.closeSettings();
    } else {
      // 開啟設定面板
      console.log('⚙️ 正在開啟設定面板...');
      
      // 強制確保面板可見
      settingsPanel.style.display = 'block';
      settingsPanel.style.visibility = 'visible';
      settingsPanel.style.position = 'fixed';
      settingsPanel.style.zIndex = '99999';
      
      // 關鍵修復：明確設置right屬性為開啟位置
      settingsPanel.style.right = '20px';
      
      // 添加open類
      settingsPanel.classList.add('open');
      
      // 強制重新渲染
      settingsPanel.offsetHeight;
      
      console.log('⚙️ 設定面板已開啟');
      this.showStatus('⚙️ 設定面板已開啟 - 請在右側查看設定選項', 'success');
      
      // 確保UI已更新
      this.updateSettingsUI();
      
      // 再次檢查狀態
      const finalState = {
        hasOpenClass: settingsPanel.classList.contains('open'),
        right: window.getComputedStyle(settingsPanel).right,
        isVisible: window.getComputedStyle(settingsPanel).visibility === 'visible',
        zIndex: window.getComputedStyle(settingsPanel).zIndex,
        offsetWidth: settingsPanel.offsetWidth,
        offsetHeight: settingsPanel.offsetHeight
      };
      
      console.log('⚙️ 設定面板開啟後狀態:', finalState);
      
      // 如果還是沒有正確顯示，嘗試備用方案
      if (finalState.right === '-360px' || finalState.offsetWidth === 0) {
        console.warn('⚠️ 設定面板可能沒有正確顯示，嘗試備用方案');
        settingsPanel.style.right = '20px';
        settingsPanel.style.transform = 'none';
        
        setTimeout(() => {
          const backupState = {
            right: window.getComputedStyle(settingsPanel).right,
            isVisible: window.getComputedStyle(settingsPanel).visibility === 'visible'
          };
          console.log('⚙️ 備用方案後狀態:', backupState);
        }, 100);
      }
    }
  }

  // 檢查音頻訊號強度 (用於診斷虛擬音頻設備)
  checkAudioLevel(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    microphone.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let checkCount = 0;
    let hasSignal = false;
    
    const checkLevel = () => {
      if (checkCount >= 50) { // 檢查5秒 (50 * 100ms)
        audioContext.close();
        if (!hasSignal) {
          console.warn('⚠️ 未檢測到音頻訊號，可能的原因：');
          console.warn('  1. 音頻設備沒有正確連接');
          console.warn('  2. 虛擬音頻設備沒有訊號輸入');
          console.warn('  3. 設備被其他應用程式佔用');
          this.showStatus('⚠️ 未檢測到音頻訊號，請檢查音頻輸入來源', 'warning');
        }
        return;
      }
      
      analyser.getByteFrequencyData(dataArray);
      
      // 計算音量平均值
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      if (average > 10) { // 如果有明顯的音頻訊號
        if (!hasSignal) {
          hasSignal = true;
          console.log('✅ 檢測到音頻訊號，設備工作正常');
          this.showStatus('✅ 檢測到音頻訊號，設備工作正常', 'success');
          audioContext.close();
          return;
        }
      }
      
      checkCount++;
      setTimeout(checkLevel, 100);
    };
    
    console.log('🔍 開始檢測音頻訊號強度...');
    checkLevel();
  }

  // 測試音頻設備功能
  async testAudioDevice() {
    const selectedDevice = this.settings.audioInputDevice || 'default';
    
    console.log('🧪 開始測試音頻設備:', selectedDevice);
    this.showStatus('🧪 正在測試音頻設備...', 'info');
    
    try {
      // 構建音頻約束
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      
      // 如果指定了設備，添加deviceId約束
      if (selectedDevice !== 'default') {
        audioConstraints.deviceId = { exact: selectedDevice };
        
        // 找到設備名稱
        const device = this.audioDevices.find(d => d.deviceId === selectedDevice);
        const deviceName = device ? device.label : '未知設備';
        console.log('🧪 測試指定設備:', deviceName);
      } else {
        console.log('🧪 測試預設設備');
      }
      
      // 獲取音頻流
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      
      console.log('✅ 成功獲取音頻流');
      
      // 檢查音頻軌道信息
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const trackInfo = {
          label: audioTracks[0].label,
          enabled: audioTracks[0].enabled,
          readyState: audioTracks[0].readyState,
          deviceId: audioTracks[0].getSettings().deviceId
        };
        
        console.log('🎙️ 測試結果 - 音頻軌道信息:', trackInfo);
        
        // 顯示設備信息
        this.showStatus(`✅ 音頻設備測試成功：${trackInfo.label}`, 'success');
        
        // 檢查音頻訊號強度
        this.checkAudioLevel(stream);
        
        // 3秒後停止測試
        setTimeout(() => {
          stream.getTracks().forEach(track => track.stop());
          console.log('🧪 音頻設備測試完成');
        }, 3000);
        
      } else {
        console.warn('⚠️ 沒有音頻軌道');
        this.showStatus('⚠️ 測試失敗：沒有音頻軌道', 'warning');
        stream.getTracks().forEach(track => track.stop());
      }
      
    } catch (error) {
      console.error('❌ 音頻設備測試失敗:', error);
      
      if (error.name === 'NotFoundError') {
        this.showStatus('❌ 測試失敗：找不到指定的音頻設備', 'error');
      } else if (error.name === 'NotAllowedError') {
        this.showStatus('❌ 測試失敗：麥克風權限被拒絕', 'error');
      } else if (error.name === 'OverconstrainedError') {
        this.showStatus('❌ 測試失敗：指定的音頻設備不可用或被佔用', 'error');
      } else {
        this.showStatus(`❌ 測試失敗：${error.message}`, 'error');
      }
    }
  }

  // 關閉設定面板的專用方法
  closeSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    if (!settingsPanel) {
      console.warn('⚠️ 找不到設定面板元素');
      return;
    }

    console.log('⚙️ 強制關閉設定面板');
    
    // 移除 open 類
    settingsPanel.classList.remove('open');
    
    // 強制隱藏面板
    settingsPanel.style.right = '-360px';
    
    // 記錄狀態並顯示訊息
    console.log('⚙️ 設定面板已關閉 (強制)');
    this.showStatus('⚙️ 設定面板已關閉', 'info');
    
    // 驗證關閉狀態
    setTimeout(() => {
      const isStillOpen = settingsPanel.classList.contains('open');
      const currentRight = window.getComputedStyle(settingsPanel).right;
      console.log('⚙️ 關閉驗證:', { isStillOpen, currentRight });
    }, 100);
  }

  // 快速語言切換
  toggleLanguage() {
    const currentLang = this.settings.speechRecognitionLanguage;
    const commonLanguages = ['auto', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
    
    // 找到當前語言的索引
    const currentIndex = commonLanguages.indexOf(currentLang);
    const nextIndex = (currentIndex + 1) % commonLanguages.length;
    const nextLang = commonLanguages[nextIndex];
    
    // 更新設定
    this.settings.speechRecognitionLanguage = nextLang;
    
    // 更新UI
    this.updateLanguageButton();
    
    // 保存設定
    chrome.storage.sync.set({ speechRecognitionLanguage: nextLang });
    
    // 重新初始化語音識別
    this.initializeSpeechRecognition();
    
    // 顯示狀態
    const langName = this.getSpeechRecognitionLanguageName();
    this.showStatus(`🔄 已切換到 ${langName}`, 'success');
  }

  // 更新語言按鈕顯示
  updateLanguageButton() {
    const langBtn = document.getElementById('langBtn');
    if (langBtn) {
      const langName = this.getSpeechRecognitionLanguageName();
      langBtn.textContent = `🌍 ${langName}`;
      console.log('🔄 語言按鈕已更新:', langName);
    }
  }

  // 更新會話資訊
  updateSessionInfo() {
    const sessionElement = document.getElementById('sessionInfo');
    if (!sessionElement) {
      console.warn('⚠️ 找不到會話信息元素');
      return;
    }
    
    if (this.sessionHistory.sessionId) {
      const duration = Date.now() - this.sessionHistory.startTime;
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      
      sessionElement.innerHTML = `
        <div class="session-stats">
          <span>📅 會話時間: ${minutes}:${seconds.toString().padStart(2, '0')}</span>
          <span>📝 記錄數: ${this.sessionHistory.records.length}</span>
          <span>🔄 翻譯狀態: ${this.pendingTranslations.size}/${this.translationQueue.length}</span>
        </div>
      `;
    } else {
      sessionElement.innerHTML = '<div class="session-stats">🔄 準備開始會話...</div>';
    }
  }

  // 切換歷程面板
  toggleHistory() {
    const historyPanel = document.getElementById('historyPanel');
    historyPanel.classList.toggle('open');
    
    if (historyPanel.classList.contains('open')) {
      this.refreshHistoryDisplay();
      // 啟動定時更新會話資訊
      this.sessionInfoTimer = setInterval(() => this.updateSessionInfo(), 1000);
    } else {
      // 清除定時器
      if (this.sessionInfoTimer) {
        clearInterval(this.sessionInfoTimer);
        this.sessionInfoTimer = null;
      }
    }
  }

  // 刷新歷程顯示
  refreshHistoryDisplay() {
    const historyContent = document.getElementById('historyContent');
    const noHistory = document.getElementById('noHistory');
    
    if (this.sessionHistory.records.length === 0) {
      noHistory.style.display = 'block';
      return;
    }
    
    noHistory.style.display = 'none';
    
    // 清空現有內容
    const existingItems = historyContent.querySelectorAll('.history-item');
    existingItems.forEach(item => item.remove());
    
    // 按時間順序顯示記錄
    this.sessionHistory.records.forEach(record => {
      const historyItem = this.createHistoryItem(record);
      historyContent.appendChild(historyItem);
    });
    
    // 滾動到底部
    historyContent.scrollTop = historyContent.scrollHeight;
  }

  // 創建歷程項目
  createHistoryItem(record) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.setAttribute('data-record-id', record.id);
    
    const timestamp = document.createElement('div');
    timestamp.className = 'history-timestamp';
    timestamp.textContent = record.timestamp.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const original = document.createElement('div');
    original.className = 'history-original';
    original.textContent = record.originalText;
    
    const translations = document.createElement('div');
    translations.className = 'history-translations';
    
    if (record.translations && Object.keys(record.translations).length > 0) {
      Object.entries(record.translations).forEach(([lang, text]) => {
        const translationDiv = document.createElement('div');
        translationDiv.className = 'history-translation';
        translationDiv.innerHTML = `
          <span class="lang-label">${this.getLanguageName(lang)}:</span>
          ${text}
        `;
        translations.appendChild(translationDiv);
      });
    } else {
      const translationDiv = document.createElement('div');
      translationDiv.className = 'history-translation';
      translationDiv.innerHTML = `<span class="lang-label">翻譯:</span> 處理中...`;
      translations.appendChild(translationDiv);
    }
    
    historyItem.appendChild(timestamp);
    historyItem.appendChild(original);
    historyItem.appendChild(translations);
    
    return historyItem;
  }

  // 快速導出（TXT格式）
  quickExport() {
    this.exportAsTxt();
  }

  // 導出為TXT格式
  exportAsTxt() {
    if (this.sessionHistory.records.length === 0) {
      this.showStatus('沒有可導出的記錄', 'error');
      return;
    }
    
    let content = '';
    content += `會議逐字稿\n`;
    content += `時間：${this.sessionHistory.startTime.toLocaleString('zh-TW')}\n`;
    content += `記錄數量：${this.sessionHistory.records.length}\n`;
    content += `會議時長：${Math.floor((new Date() - this.sessionHistory.startTime) / 60000)} 分鐘\n`;
    content += `========================================\n\n`;
    
    this.sessionHistory.records.forEach((record, index) => {
      const timeStr = record.timestamp.toLocaleTimeString('zh-TW', { hour12: false });
      content += `[${timeStr}] ${record.originalText}\n`;
      
      if (record.translations && Object.keys(record.translations).length > 0) {
        Object.entries(record.translations).forEach(([lang, text]) => {
          const langName = this.getLanguageName(lang);
          content += `  └─ ${langName}: ${text}\n`;
        });
      }
      content += '\n';
    });
    
    this.downloadFile(content, `會議逐字稿_${this.formatDate(new Date())}.txt`, 'text/plain');
    this.showStatus('逐字稿已導出', 'success');
  }

  // 導出為CSV格式（使用 HistoryCore）
  exportAsCsv() {
    if (this.historyCore) {
      this.historyCore.exportAsCsv();
    } else {
      this.showStatus('歷程核心尚未初始化', 'error');
    }
  }

  // 導出為JSON格式（使用 HistoryCore）
  exportAsJson() {
    if (this.historyCore) {
      this.historyCore.exportAsJson();
    } else {
      this.showStatus('歷程核心尚未初始化', 'error');
    }
  }

  // 導出為文字格式（使用 HistoryCore）
  exportAsText() {
    if (this.historyCore) {
      this.historyCore.exportAsText();
    } else {
      this.showStatus('歷程核心尚未初始化', 'error');
    }
  }

  // 清除歷程（使用 HistoryCore）
  clearHistory() {
    if (confirm('確定要清除所有歷程記錄嗎？此操作無法復原。')) {
      if (this.historyCore) {
        this.historyCore.clearHistory();
      } else {
        this.showStatus('歷程核心尚未初始化', 'error');
      }
    }
  }

  // 下載檔案
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}`;
  }

  // 格式化時間戳（用於字幕顯示）
  formatTimestamp(date) {
    return date.toLocaleTimeString('zh-TW', { 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  }

  // 語音識別引擎變更處理
  onEngineChange() {
    const engine = document.getElementById('speechRecognitionEngine').value;
    const openaiSettings = document.getElementById('openaiSettings');
    
    if (engine === 'whisper') {
      // 顯示OpenAI設定提示
      this.showStatus('Whisper需要OpenAI API Key，請在設定中填入', 'info');
      
      // 檢查是否選擇了虛擬音頻設備
      const selectedDevice = this.audioDevices.find(d => d.deviceId === this.settings.audioInputDevice);
      if (selectedDevice) {
        const isVirtualDevice = selectedDevice.label.toLowerCase().includes('virtual') || 
                               selectedDevice.label.toLowerCase().includes('cable') ||
                               selectedDevice.label.toLowerCase().includes('vb-audio');
        
        if (isVirtualDevice) {
          setTimeout(() => {
            this.showStatus(`✅ 已切換到 Whisper 引擎，現在可以使用虛擬音頻設備: ${selectedDevice.label}`, 'success');
          }, 1500);
        }
      }
    } else {
      // 瀏覽器引擎
      const selectedDevice = this.audioDevices.find(d => d.deviceId === this.settings.audioInputDevice);
      if (selectedDevice && selectedDevice.deviceId !== 'default') {
        const isVirtualDevice = selectedDevice.label.toLowerCase().includes('virtual') || 
                               selectedDevice.label.toLowerCase().includes('cable') ||
                               selectedDevice.label.toLowerCase().includes('vb-audio');
        
        if (isVirtualDevice) {
          setTimeout(() => {
            this.showStatus(`⚠️ 注意：瀏覽器引擎不支援虛擬音頻設備。建議使用 Whisper 引擎或選擇實體麥克風`, 'warning');
          }, 1000);
        }
      }
    }
    
    // 實時更新設定
    this.settings.speechRecognitionEngine = engine;
  }

  // 音頻設備變更處理
  onAudioDeviceChange() {
    const deviceId = document.getElementById('audioInputDevice').value;
    
    console.log('🎙️ 用戶選擇音頻設備:', deviceId);
    
    // 更新設定
    this.settings.audioInputDevice = deviceId;
    
    // 顯示狀態
    const selectedDevice = this.audioDevices.find(d => d.deviceId === deviceId);
    const deviceName = selectedDevice ? selectedDevice.label : '未知設備';
    
    // 檢查是否為虛擬音頻設備
    const isVirtualDevice = deviceName.toLowerCase().includes('virtual') || 
                           deviceName.toLowerCase().includes('cable') ||
                           deviceName.toLowerCase().includes('vb-audio');
    
    if (deviceId === 'default') {
      this.showStatus(`🎙️ 已選擇音頻設備: ${deviceName}`, 'success');
    } else if (isVirtualDevice) {
      // 虛擬音頻設備的特殊提示
      this.showStatus(`🎙️ 已選擇虛擬音頻設備: ${deviceName}`, 'success');
      
      // 檢查當前使用的語音識別引擎
      const currentEngine = this.settings.speechRecognitionEngine || 'browser';
      if (currentEngine === 'browser') {
        setTimeout(() => {
          this.showStatus(`⚠️ 重要提示：虛擬音頻設備需要使用 Whisper 引擎才能正常工作。請在設定中切換到 "OpenAI Whisper" 引擎`, 'warning');
        }, 2000);
      } else {
        setTimeout(() => {
          this.showStatus(`✅ 虛擬音頻設備已配置，Whisper 引擎支援此設備`, 'success');
        }, 1000);
      }
    } else {
      this.showStatus(`🎙️ 已選擇音頻設備: ${deviceName}`, 'success');
    }
    
    // 如果正在錄音，提示用戶重新開始
    if (this.isRecording) {
      this.showStatus('⚠️ 音頻設備變更將在停止並重新開始錄音時生效', 'info');
    }
    
    // 自動保存設定
    this.saveAudioDeviceSettings();
  }

  // 保存音頻設備設定
  async saveAudioDeviceSettings() {
    try {
      await chrome.storage.sync.set({ 
        audioInputDevice: this.settings.audioInputDevice 
      });
      console.log('✅ 音頻設備設定已保存:', this.settings.audioInputDevice);
    } catch (error) {
      console.error('❌ 保存音頻設備設定失敗:', error);
    }
  }

  // 手動刷新音頻設備
  async refreshAudioDevices() {
    console.log('🔄 手動刷新音頻設備列表');
    
    // 顯示載入狀態
    const refreshBtn = document.getElementById('refreshAudioDevicesBtn');
    const audioDeviceSelect = document.getElementById('audioInputDevice');
    
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳';
    }
    
    if (audioDeviceSelect) {
      audioDeviceSelect.innerHTML = '<option value="default">🔄 正在刷新設備...</option>';
    }
    
    this.showStatus('🔄 正在刷新音頻設備列表...', 'info');
    
    try {
      // 重置設備變更監聽器標記，允許重新設置
      this.deviceChangeListenerSet = false;
      
      // 重新枚舉設備
      await this.enumerateAudioDevices();
      
      this.showStatus('✅ 音頻設備列表已更新', 'success');
      console.log('✅ 音頻設備手動刷新完成');
      
    } catch (error) {
      console.error('❌ 手動刷新音頻設備失敗:', error);
      this.showStatus('❌ 刷新設備列表失敗: ' + error.message, 'error');
    } finally {
      // 恢復按鈕狀態
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄';
      }
    }
  }

  // Whisper語音識別 - 改善版本，添加調試信息
  async startWhisperRecognition() {
    console.log('🎤 準備啟動Whisper語音識別');
    console.log('🔧 Whisper設定檢查:', {
      hasOpenAIKey: !!this.settings.openaiKey,
      keyLength: this.settings.openaiKey ? this.settings.openaiKey.length : 0,
      audioDevice: this.settings.audioInputDevice,
      language: this.settings.speechRecognitionLanguage
    });
    
    if (!this.settings.openaiKey) {
      this.showStatus('🔑 請先在設定中填入OpenAI API Key', 'error');
      console.error('❌ Whisper啟動失敗: 缺少OpenAI API Key');
      return;
    }
    
    if (this.settings.openaiKey.length < 10) {
      this.showStatus('🔑 OpenAI API Key 格式不正確', 'error');
      console.error('❌ Whisper啟動失敗: API Key格式不正確');
      return;
    }
    
    try {
      console.log('🎙️ 正在獲取麥克風權限...');
      
      // 構建音頻約束
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      };
      
      // 如果指定了設備，添加deviceId約束
      const selectedDevice = this.settings.audioInputDevice || 'default';
      if (selectedDevice !== 'default') {
        audioConstraints.deviceId = { exact: selectedDevice };
        
        // 找到設備名稱
        const device = this.audioDevices.find(d => d.deviceId === selectedDevice);
        const deviceName = device ? device.label : selectedDevice;
        
        console.log('🎙️ Whisper使用指定音頻設備:', { deviceId: selectedDevice, deviceName });
        this.showStatus(`🎙️ Whisper引擎正在使用: ${deviceName}`, 'info');
      } else {
        console.log('🎙️ Whisper使用預設音頻設備');
        this.showStatus(`🎙️ Whisper引擎使用預設音頻設備`, 'info');
      }
      
      console.log('🎙️ 音頻約束:', audioConstraints);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      this.whisperStream = stream;
      
      console.log('✅ 麥克風權限獲取成功，音頻軌道:', stream.getAudioTracks().length);
      
      // 檢查音頻軌道狀態
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const trackInfo = {
          label: audioTracks[0].label,
          enabled: audioTracks[0].enabled,
          readyState: audioTracks[0].readyState,
          deviceId: audioTracks[0].getSettings().deviceId
        };
        
        console.log('🎙️ 音頻軌道詳情:', trackInfo);
        
        // 檢查是否成功使用了指定的設備
        const requestedDevice = this.settings.audioInputDevice;
        if (requestedDevice !== 'default' && trackInfo.deviceId !== requestedDevice) {
          console.warn('⚠️ 警告：實際使用的設備與請求的設備不同');
          this.showStatus(`⚠️ 警告：可能無法正確使用指定的音頻設備`, 'warning');
        } else if (requestedDevice !== 'default') {
          console.log('✅ 確認正在使用指定的音頻設備');
          this.showStatus(`✅ 正在使用指定的音頻設備: ${trackInfo.label}`, 'success');
        }
        
        // 檢查音頻訊號強度
        this.checkAudioLevel(stream);
      }
      
      // 開始錄音
      this.recordingChunks = [];
      
      // 檢查瀏覽器支援的MIME類型
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav'
      ];
      
      let selectedMimeType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }
      
      console.log('🎙️ 支援的音頻格式:', selectedMimeType);
      
      if (!selectedMimeType) {
        throw new Error('瀏覽器不支援任何錄音格式');
      }
      
      this.mediaRecorder = new MediaRecorder(stream, { 
        mimeType: selectedMimeType 
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('🎙️ 收到音頻數據:', event.data.size, 'bytes');
          this.recordingChunks.push(event.data);
        } else {
          console.warn('⚠️ 收到空的音頻數據');
        }
      };
      
      this.mediaRecorder.onstop = () => {
        console.log('🎙️ MediaRecorder停止，處理音頻...');
        this.processWhisperAudio();
      };
      
      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder錯誤:', event.error);
        this.showStatus('❌ 錄音設備錯誤: ' + event.error.message, 'error');
      };
      
      // 每5秒處理一次音頻
      console.log('🎙️ 開始錄音...');
      this.mediaRecorder.start();
      
      this.whisperTimer = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          console.log('🎙️ 分段處理音頻 (5秒間隔)');
          this.mediaRecorder.stop();
          this.mediaRecorder.start();
        } else {
          console.warn('⚠️ MediaRecorder狀態異常:', this.mediaRecorder?.state);
        }
      }, 5000);
      
      this.showStatus('🎤 Whisper語音識別已啟動', 'success');
      console.log('✅ Whisper啟動成功');
      
    } catch (error) {
      console.error('❌ Whisper錄音啟動失敗:', error);
      console.error('錯誤堆疊:', error.stack);
      
      if (error.name === 'NotAllowedError') {
        this.showStatus('❌ 麥克風權限被拒絕', 'error');
      } else if (error.name === 'NotFoundError') {
        this.showStatus('❌ 找不到指定的音頻設備', 'error');
      } else if (error.name === 'NotReadableError') {
        this.showStatus('❌ 音頻設備被其他程式佔用', 'error');
      } else {
        this.showStatus('❌ Whisper啟動失敗: ' + error.message, 'error');
      }
    }
  }

  // 停止Whisper語音識別
  stopWhisperRecognition() {
    if (this.whisperTimer) {
      clearInterval(this.whisperTimer);
      this.whisperTimer = null;
    }
    
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    
    if (this.whisperStream) {
      this.whisperStream.getTracks().forEach(track => track.stop());
      this.whisperStream = null;
    }
    
    this.recordingChunks = [];
    this.showStatus('🛑 Whisper語音識別已停止', 'info');
  }

  // 處理Whisper音頻 - 改善版本
  async processWhisperAudio() {
    console.log('🎙️ 開始處理Whisper音頻');
    console.log('🎙️ 音頻片段數量:', this.recordingChunks.length);
    
    if (this.recordingChunks.length === 0) {
      console.warn('⚠️ 沒有音頻數據可處理');
      return;
    }
    
    const blob = new Blob(this.recordingChunks, { type: 'audio/webm' });
    console.log('🎙️ 音頻Blob大小:', blob.size, 'bytes');
    
    // 清空緩衝區為下次錄音準備
    this.recordingChunks = [];
    
    // 檢查音頻大小（避免處理太小的音頻）
    if (blob.size < 1000) {
      console.log('🎙️ 音頻太小，跳過處理 (', blob.size, 'bytes)');
      return;
    }
    
    try {
      console.log('🌐 發送到Whisper API...');
      this.showStatus('🌐 正在識別語音...', 'info');
      
      const text = await this.sendToWhisper(blob);
      
      if (text && text.trim().length > 0) {
        console.log('✅ Whisper識別成功:', text);
        this.showStatus('✅ 語音識別成功', 'success');
        this.handleSpeechResult(text, true);
      } else {
        console.log('ℹ️ Whisper返回空文本');
      }
    } catch (error) {
      console.error('❌ Whisper識別失敗:', error);
      console.error('錯誤詳情:', error.message);
      console.error('錯誤堆疊:', error.stack);
      
      if (error.message.includes('401')) {
        this.showStatus('❌ OpenAI API Key 無效或已過期', 'error');
      } else if (error.message.includes('429')) {
        this.showStatus('❌ API 使用量超限，請稍後再試', 'error');
      } else if (error.message.includes('network')) {
        this.showStatus('❌ 網路連接失敗', 'error');
      } else {
        this.showStatus('❌ Whisper識別失敗: ' + error.message, 'error');
      }
    }
  }

  // 發送到Whisper API - 改善版本
  async sendToWhisper(audioBlob) {
    console.log('🌐 準備發送到Whisper API');
    console.log('🔧 API設定:', {
      endpoint: 'https://api.openai.com/v1/audio/transcriptions',
      audioSize: audioBlob.size,
      language: this.settings.speechRecognitionLanguage !== 'auto' ? this.settings.speechRecognitionLanguage : undefined
    });
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    // 如果不是自動語言，指定語言
    if (this.settings.speechRecognitionLanguage !== 'auto') {
      const whisperLang = this.settings.speechRecognitionLanguage.split('-')[0]; // zh-TW -> zh
      formData.append('language', whisperLang);
      console.log('🌐 指定語言:', whisperLang);
    } else {
      console.log('🌐 使用自動語言檢測');
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🌐 發送API請求...');
      
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.openaiKey}`
        },
        body: formData
      });
      
      const responseTime = Date.now() - startTime;
      console.log('🌐 API響應時間:', responseTime, 'ms');
      console.log('🌐 響應狀態:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API錯誤響應:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorMessage += ` - ${errorJson.error.message}`;
          }
        } catch (parseError) {
          console.warn('⚠️ 無法解析錯誤響應JSON:', parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('✅ Whisper API響應成功:', {
        text: result.text,
        responseTime: responseTime + 'ms'
      });
      
      return result.text;
      
    } catch (error) {
      console.error('❌ Whisper API調用失敗:', error);
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('網路連接失敗，請檢查網路連接');
      } else if (error.message.includes('401')) {
        throw new Error('API Key 無效或已過期');
      } else if (error.message.includes('429')) {
        throw new Error('API 使用量超限，請稍後再試');
      } else if (error.message.includes('413')) {
        throw new Error('音頻檔案太大');
      } else {
        throw error;
      }
    }
  }

  // 獲取語言名稱
  getLanguageName(langCode) {
    const langMap = {
      'zh-tw': '繁體中文',
      'zh-cn': '简体中文',
      'en': '英語',
      'ja': '日語',
      'ko': '韓語',
      'es': '西班牙語',
      'fr': '法語',
      'de': '德語',
      'it': '義大利語',
      'pt': '葡萄牙語',
      'ru': '俄語',
      'ar': '阿拉伯語',
      'hi': '印地語',
      'th': '泰語',
      'vi': '越南語',
      'id': '印尼語',
      'ms': '馬來語',
      'tl': '他加祿語',
      'tr': '土耳其語',
      'pl': '波蘭語',
      'nl': '荷蘭語',
      'sv': '瑞典語',
      'da': '丹麥語',
      'no': '挪威語',
      'fi': '芬蘭語',
      'cs': '捷克語',
      'sk': '斯洛伐克語',
      'hu': '匈牙利語',
      'ro': '羅馬尼亞語',
      'bg': '保加利亞語',
      'hr': '克羅地亞語',
      'sr': '塞爾維亞語',
      'sl': '斯洛文尼亞語',
      'et': '愛沙尼亞語',
      'lv': '拉脫維亞語',
      'lt': '立陶宛語',
      'uk': '烏克蘭語',
      'he': '希伯來語',
      'fa': '波斯語',
      'ur': '烏爾都語',
      'bn': '孟加拉語',
      'ta': '泰米爾語',
      'te': '泰盧固語',
      'kn': '卡納達語',
      'ml': '馬拉雅拉姆語',
      'gu': '古吉拉特語',
      'pa': '旁遮普語',
      'or': '奧里亞語',
      'as': '阿薩姆語',
      'ne': '尼泊爾語',
      'si': '僧伽羅語',
      'my': '緬甸語',
      'km': '高棉語',
      'lo': '老撾語',
      'ka': '格魯吉亞語',
      'am': '阿姆哈拉語',
      'sw': '斯瓦希里語',
      'zu': '祖魯語',
      'af': '南非語',
      'is': '冰島語',
      'mt': '馬耳他語',
      'cy': '威爾士語',
      'eu': '巴斯克語',
      'ca': '加泰羅尼亞語',
      'gl': '加利西亞語',
      'lb': '盧森堡語',
      'mk': '馬其頓語',
      'sq': '阿爾巴尼亞語',
      'bs': '波士尼亞語',
      'me': '黑山語',
      'lv': '拉脫維亞語',
      'lt': '立陶宛語'
    };
    
    return langMap[langCode] || langCode;
  }

  clearSubtitles() {
    const container = document.getElementById('subtitleContainer');
    const noSubtitles = document.getElementById('noSubtitles');
    
    // 移除所有記錄條目和字幕項目
    const recordEntries = container.querySelectorAll('.record-entry');
    const subtitleItems = container.querySelectorAll('.subtitle-item');
    const interimItems = container.querySelectorAll('.interim-subtitle');
    
    recordEntries.forEach(item => item.remove());
    subtitleItems.forEach(item => item.remove());
    interimItems.forEach(item => item.remove());
    
    // 顯示提示訊息
    if (noSubtitles) {
      noSubtitles.style.display = 'block';
    }
    
    this.showStatus('📝 所有記錄已清除', 'info');
    console.log('🗑️ 字幕和記錄條目已清除');
  }

  async saveSettings() {
    try {
      console.log('💾 開始儲存設定...');
      
      // 收集基本設定值
      const translationProvider = document.getElementById('translationProvider');
      const speechRecognitionLanguage = document.getElementById('speechRecognitionLanguage');
      const speechRecognitionEngine = document.getElementById('speechRecognitionEngine');
      const audioInputDevice = document.getElementById('audioInputDevice');
      
      // 收集目標語言
      const languageGrid = document.getElementById('languageGrid');
      const targetLanguages = [];
      if (languageGrid) {
        const checkedBoxes = languageGrid.querySelectorAll('input[type="checkbox"]:checked');
        checkedBoxes.forEach(checkbox => {
          targetLanguages.push(checkbox.value);
        });
      }
      
      // 如果沒有選擇任何語言，使用預設值
      if (targetLanguages.length === 0) {
        targetLanguages.push('zh-tw', 'en');
      }
      
      // 收集API金鑰
      const microsoftKey = document.getElementById('microsoftKey');
      const openaiKey = document.getElementById('openaiKey');
      
      const settings = {
        translationProvider: translationProvider ? translationProvider.value : 'free',
        targetLanguages: targetLanguages,
        speechRecognitionLanguage: speechRecognitionLanguage ? speechRecognitionLanguage.value : 'auto',
        speechRecognitionEngine: speechRecognitionEngine ? speechRecognitionEngine.value : 'browser',
        audioInputDevice: audioInputDevice ? audioInputDevice.value : 'default',
        microsoftApiKey: microsoftKey ? microsoftKey.value : '',
        openaiApiKey: openaiKey ? openaiKey.value : ''
      };
      
      // 收集進階設定（如果存在）
      const enableHistoryRecording = document.getElementById('enableHistoryRecording');
      if (enableHistoryRecording) {
        settings.enableHistoryRecording = enableHistoryRecording.checked;
      }
      
      const confidenceThreshold = document.getElementById('confidenceThreshold');
      if (confidenceThreshold) {
        settings.confidenceThreshold = parseFloat(confidenceThreshold.value);
      }
      
      const enableTextCorrection = document.getElementById('enableTextCorrection');
      if (enableTextCorrection) {
        settings.enableTextCorrection = enableTextCorrection.checked;
      }
      
      const enableSpeakerDiarization = document.getElementById('enableSpeakerDiarization');
      if (enableSpeakerDiarization) {
        settings.enableSpeakerDiarization = enableSpeakerDiarization.checked;
      }
      
      const speakerChangeThreshold = document.getElementById('speakerChangeThreshold');
      if (speakerChangeThreshold) {
        settings.speakerChangeThreshold = parseFloat(speakerChangeThreshold.value);
      }
      
      const showSpeakerStats = document.getElementById('showSpeakerStats');
      if (showSpeakerStats) {
        settings.showSpeakerStats = showSpeakerStats.checked;
      }
      
      console.log('📋 要儲存的設定:', settings);
      
      // 儲存到 Chrome Storage
      await chrome.storage.sync.set(settings);
      
      // 更新本地設定
      Object.assign(this.settings, settings);
      
      // 應用新設定
      if (settings.confidenceThreshold) {
        this.lastConfidenceThreshold = settings.confidenceThreshold;
      }
      
      if (settings.enableSpeakerDiarization !== undefined) {
        this.speakerDetection.enabled = settings.enableSpeakerDiarization;
      }
      
      if (settings.speakerChangeThreshold) {
        this.speakerDetection.speakerChangeThreshold = settings.speakerChangeThreshold * 1000;
      }
      
      // 更新語音識別語言
      if (this.recognition) {
        this.updateSpeechRecognitionLanguage();
      }
      
      // 如果說話者分離被禁用，清除相關顯示
      if (settings.enableSpeakerDiarization === false) {
        this.clearSpeakerHistory();
        const statsPanel = document.getElementById('speakerStatsPanel');
        if (statsPanel) {
          statsPanel.classList.remove('show');
        }
      }
      
      console.log('✅ 設定儲存成功');
      this.showStatus('✅ 設定已儲存', 'success');
      
      // 1.5秒後關閉設定面板
      setTimeout(() => {
        this.toggleSettings();
      }, 1500);
      
    } catch (error) {
      console.error('❌ 儲存設定失敗:', error);
      this.showStatus('❌ 設定儲存失敗: ' + error.message, 'error');
    }
  }

  minimizeWindow() {
    chrome.windows.getCurrent((window) => {
      chrome.windows.update(window.id, { state: 'minimized' });
    });
  }

  closeWindow() {
    chrome.windows.getCurrent((window) => {
      chrome.windows.remove(window.id);
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // ESC 鍵關閉設定面板
      if (e.key === 'Escape') {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel && settingsPanel.classList.contains('open')) {
          e.preventDefault();
          console.log('⚙️ ESC 鍵觸發關閉設定面板');
          this.closeSettings();
          return;
        }
      }
      
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case 'R':
            e.preventDefault();
            this.toggleRecording();
            break;
          case 'L':
            e.preventDefault();
            this.toggleLanguage();
            break;
          case 'S':
            e.preventDefault();
            this.toggleSmartPanel();
            break;
          case 'C':
            e.preventDefault();
            this.clearSubtitles();
            break;
          case 'T':
            e.preventDefault();
            this.toggleSettings();
            break;
        }
      }
    });
  }

  showStatus(message, type = 'info') {
    const statusIndicator = document.getElementById('statusIndicator');
    statusIndicator.textContent = message;
    statusIndicator.className = `status-indicator show ${type}`;
    
    console.log(`📢 狀態更新: ${message} (${type})`);
    
    // 延長顯示時間以便調試
    setTimeout(() => {
      statusIndicator.classList.remove('show');
    }, 5000); // 從3秒改為5秒
  }

  // 清理過期的翻譯請求 - 優化版本
  cleanupExpiredTranslations() {
    const now = Date.now();
    this.lastCleanupTime = now;
    
    let cleanedCount = 0;
    
    // 清理過期的進行中請求
    for (const [subtitleId, requestInfo] of this.pendingTranslations) {
      if (now - requestInfo.startTime > this.translationTimeout) {
        console.log('🧹 清理過期翻譯請求:', subtitleId);
        
        if (requestInfo.abortController) {
          requestInfo.abortController.abort();
        }
        
        this.showTranslationError(subtitleId, '翻譯請求超時');
        this.pendingTranslations.delete(subtitleId);
        this.translationStats.timeout++;
        cleanedCount++;
      }
    }
    
    // 清理過期的佇列請求
    const validQueue = this.translationQueue.filter(request => {
      if (now - request.timestamp > this.translationTimeout) {
        console.log('🧹 清理過期佇列請求:', request.subtitleId);
        this.showTranslationError(request.subtitleId, '翻譯請求超時');
        this.translationStats.timeout++;
        cleanedCount++;
        return false;
      }
      return true;
    });
    
    this.translationQueue = validQueue;
    
    if (cleanedCount > 0) {
      console.log(`🧹 清理完成，共清理 ${cleanedCount} 個過期請求`);
      
      // 更新統計
      this.updateTranslationStats('timeout');
      
      // 清理後嘗試處理佇列
      setTimeout(() => this.processTranslationQueue(), 100);
    }
  }

  // 處理翻譯佇列 - 優化版本
  async processTranslationQueue() {
    if (this.isProcessingTranslations || this.translationQueue.length === 0) {
      return;
    }
    
    if (this.pendingTranslations.size >= this.maxPendingTranslations) {
      console.log('⏸️ 翻譯請求達到上限，等待現有請求完成');
      return;
    }
    
    this.isProcessingTranslations = true;
    
    try {
      // 優先處理高優先級請求
      this.translationQueue.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return a.timestamp - b.timestamp; // 時間順序
      });
      
      let processedCount = 0;
      const maxBatchSize = 2; // 限制批次處理數量
      
      while (this.translationQueue.length > 0 && 
             this.pendingTranslations.size < this.maxPendingTranslations &&
             processedCount < maxBatchSize) {
        
        const request = this.translationQueue.shift();
        
        // 檢查請求是否還有效
        if (Date.now() - request.timestamp > this.translationTimeout) {
          console.warn('⏭️ 跳過過期的翻譯請求:', request.subtitleId);
          this.showTranslationError(request.subtitleId, '翻譯請求超時');
          continue;
        }
        
        console.log('🔄 處理翻譯佇列項目:', request.subtitleId);
        
        // 標記為進行中
        this.pendingTranslations.set(request.subtitleId, {
          startTime: Date.now(),
          text: request.text,
          abortController: new AbortController()
        });
        
        // 非阻塞式處理翻譯
        this.executeTranslationRequest(request.text, request.subtitleId);
        processedCount++;
      }
    } finally {
      this.isProcessingTranslations = false;
      
      // 如果還有待處理的請求，安排下一次處理（非阻塞）
      if (this.translationQueue.length > 0) {
        setTimeout(() => this.processTranslationQueue(), 500);
      }
    }
  }

  // 執行翻譯請求（帶超時控制）- 優化版本
  async executeTranslationRequest(text, subtitleId) {
    const requestInfo = this.pendingTranslations.get(subtitleId);
    if (!requestInfo) {
      console.warn('❌ 找不到翻譯請求信息:', subtitleId);
      return;
    }
    
    try {
      console.log('🌐 執行翻譯請求:', text, 'ID:', subtitleId);
      
      // 創建帶超時的Promise（減少超時時間）
      const translationPromise = this.sendTranslationRequest(text, requestInfo.abortController.signal);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('翻譯請求超時')), this.translationTimeout);
      });
      
      // 競賽Promise：翻譯完成 vs 超時
      const response = await Promise.race([translationPromise, timeoutPromise]);
      
      if (response && response.success) {
        console.log('✅ 翻譯請求成功:', subtitleId);
        this.updateSubtitleTranslations(subtitleId, response.data);
        
        // 簡化狀態顯示
        if (Math.random() < 0.3) { // 只有30%的機率顯示成功訊息，避免過度干擾
          this.showStatus('✅ 翻譯完成', 'success');
        }
        
        // 更新成功統計
        this.translationStats.successful++;
      } else {
        console.error('❌ 翻譯請求失敗:', response?.error || '未知錯誤');
        this.showTranslationError(subtitleId, response?.error || '翻譯失敗');
        
        // 更新失敗統計
        this.translationStats.failed++;
      }
      
    } catch (error) {
      console.error('❌ 翻譯請求異常:', error);
      
      if (error.name === 'AbortError') {
        console.log('⏹️ 翻譯請求被取消:', subtitleId);
        this.showTranslationError(subtitleId, '翻譯請求被取消');
        
        // 更新取消統計
        this.translationStats.cancelled++;
      } else if (error.message.includes('超時')) {
        console.warn('⏰ 翻譯請求超時:', subtitleId);
        this.showTranslationError(subtitleId, '翻譯超時');
        
        // 更新超時統計
        this.translationStats.timeout++;
      } else {
        this.showTranslationError(subtitleId, error.message);
        
        // 更新失敗統計
        this.translationStats.failed++;
      }
    } finally {
      // 清理請求記錄
      this.pendingTranslations.delete(subtitleId);
      
      // 繼續處理佇列（非阻塞，延遲更短）
      setTimeout(() => this.processTranslationQueue(), 100);
    }
  }

  // 發送翻譯請求（支援中止信號）
  async sendTranslationRequest(text, abortSignal) {
    const message = {
      action: 'translate',
      text: text,
      targetLanguages: this.settings.targetLanguages
    };
    
    console.log('📤 發送翻譯請求:', message);
    
    // 使用AbortController來支援請求取消
    return new Promise((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error('請求已被取消'));
        return;
      }
      
      // 監聽取消信號
      const abortHandler = () => {
        reject(new Error('請求被取消'));
      };
      abortSignal.addEventListener('abort', abortHandler);
      
      // 發送消息
      chrome.runtime.sendMessage(message, (response) => {
        // 移除監聽器
        abortSignal.removeEventListener('abort', abortHandler);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 更新翻譯統計
  updateTranslationStats(type) {
    this.translationStats[type]++;
    
    // 定期輸出統計信息
    if (this.translationStats.total % 10 === 0) {
      this.logTranslationStats();
    }
  }

  // 輸出翻譯統計信息
  logTranslationStats() {
    const stats = this.translationStats;
    const runtime = Date.now() - stats.startTime;
    const runtimeMinutes = Math.round(runtime / 60000);
    
    console.log('📊 翻譯統計信息:');
    console.log(`  ⏱️ 運行時間: ${runtimeMinutes} 分鐘`);
    console.log(`  📈 總請求數: ${stats.total}`);
    console.log(`  ✅ 成功: ${stats.successful} (${((stats.successful/stats.total)*100).toFixed(1)}%)`);
    console.log(`  ❌ 失敗: ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)`);
    console.log(`  ⏰ 超時: ${stats.timeout} (${((stats.timeout/stats.total)*100).toFixed(1)}%)`);
    console.log(`  ⏹️ 取消: ${stats.cancelled} (${((stats.cancelled/stats.total)*100).toFixed(1)}%)`);
    console.log(`  🔄 進行中: ${this.pendingTranslations.size}`);
    console.log(`  📋 佇列中: ${this.translationQueue.length}`);
    
    // 如果失敗率過高，給出建議
    const failureRate = (stats.failed + stats.timeout) / stats.total;
    if (failureRate > 0.3 && stats.total > 5) {
      console.warn('⚠️ 翻譯失敗率較高，建議：');
      console.warn('  1. 檢查網路連接');
      console.warn('  2. 確認API金鑰是否有效');
      console.warn('  3. 嘗試切換翻譯服務提供者');
    }
  }

  // ==================== 智能整理系統 ====================
  
  setupSmartOrganizer() {
    // 智能面板事件監聽器
    document.getElementById('closeSmartPanel').addEventListener('click', () => this.toggleSmartPanel());
    document.getElementById('updateContextBtn').addEventListener('click', () => this.updateMeetingContext());
    document.getElementById('autoOrganizeBtn').addEventListener('click', () => this.reorganizeParagraphs());
    document.getElementById('forceBreakBtn').addEventListener('click', () => this.forceBreakParagraph());
    document.getElementById('clearSummaryBtn').addEventListener('click', () => this.clearSummary());
    
    // 載入保存的會議背景
    this.loadMeetingContext();
    
    console.log('🧠 智能整理系統已初始化');
  }

  toggleSmartPanel() {
    const panel = document.getElementById('smartPanel');
    panel.classList.toggle('show');
    
    if (panel.classList.contains('show')) {
      this.smartOrganizer.isEnabled = true;
      this.updateParagraphStatus('智能整理已啟用');
      console.log('🧠 智能整理面板已開啟');
    } else {
      this.smartOrganizer.isEnabled = false;
      this.updateParagraphStatus('智能整理已停用');
      console.log('🧠 智能整理面板已關閉');
    }
  }

  async updateMeetingContext() {
    const contextTextarea = document.getElementById('meetingContext');
    const context = contextTextarea.value.trim();
    
    this.smartOrganizer.meetingContext = context;
    
    // 保存會議背景到本地儲存
    try {
      await chrome.storage.local.set({ meetingContext: context });
      console.log('💾 會議背景已保存');
    } catch (error) {
      console.warn('⚠️ 無法保存會議背景:', error);
    }
    
    this.updateParagraphStatus(context ? '會議背景已更新' : '會議背景已清除');
    console.log('📋 會議背景已更新:', context);
  }

  async loadMeetingContext() {
    try {
      const result = await chrome.storage.local.get(['meetingContext']);
      if (result.meetingContext) {
        document.getElementById('meetingContext').value = result.meetingContext;
        this.smartOrganizer.meetingContext = result.meetingContext;
        console.log('📋 已載入保存的會議背景');
      }
    } catch (error) {
      console.warn('⚠️ 無法載入會議背景:', error);
    }
  }

  addToSmartOrganizer(text, speakerInfo) {
    if (!this.smartOrganizer.isEnabled) {
      return;
    }
    
    const now = Date.now();
    this.smartOrganizer.lastSpeechTime = now;
    
    // 添加到語音緩衝區
    this.smartOrganizer.speechBuffer.push({
      text: text,
      timestamp: now,
      speaker: speakerInfo?.name || '未知說話者',
      confidence: speakerInfo?.features?.avgConfidence || 0.8
    });
    
    // 檢查是否需要分段
    const shouldBreak = this.shouldBreakParagraph(text);
    
    if (shouldBreak || this.smartOrganizer.forceBreakFlag) {
      this.finalizeParagraph();
      this.smartOrganizer.forceBreakFlag = false;
    } else {
      // 添加到當前段落
      this.smartOrganizer.currentParagraph += (this.smartOrganizer.currentParagraph ? ' ' : '') + text;
      
      // 檢查段落長度限制
      if (this.smartOrganizer.currentParagraph.length > this.smartOrganizer.maxParagraphLength) {
        this.finalizeParagraph();
      }
    }
    
    this.updateParagraphStatus(`收集中... (${this.smartOrganizer.speechBuffer.length} 片段)`);
    
    // 定時檢查是否需要自動分段
    setTimeout(() => this.checkAutoBreak(), this.smartOrganizer.paragraphBreakInterval);
  }

  shouldBreakParagraph(text) {
    // 檢查句子結束標點
    const hasEndPunctuation = /[。！？.!?]$/.test(text.trim());
    
    // 檢查話題轉換詞彙
    const topicChangeWords = [
      '接下來', '然後', '另外', '此外', '最後', '總結',
      'next', 'then', 'also', 'furthermore', 'finally', 'in conclusion'
    ];
    
    const hasTopicChange = topicChangeWords.some(word => 
      text.toLowerCase().includes(word.toLowerCase())
    );
    
    // 檢查時間間隔
    const timeSinceLastSpeech = Date.now() - this.smartOrganizer.lastSpeechTime;
    const hasLongPause = timeSinceLastSpeech > this.smartOrganizer.paragraphBreakInterval;
    
    return hasEndPunctuation && (hasTopicChange || hasLongPause);
  }

  checkAutoBreak() {
    if (!this.smartOrganizer.isEnabled || !this.smartOrganizer.currentParagraph) {
      return;
    }
    
    const timeSinceLastSpeech = Date.now() - this.smartOrganizer.lastSpeechTime;
    
    if (timeSinceLastSpeech >= this.smartOrganizer.paragraphBreakInterval) {
      console.log('⏰ 自動分段：時間間隔超過限制');
      this.finalizeParagraph();
    }
  }

  forceBreakParagraph() {
    if (this.smartOrganizer.currentParagraph) {
      this.finalizeParagraph();
      this.updateParagraphStatus('手動分段完成');
      console.log('✂️ 手動強制分段');
    } else {
      this.smartOrganizer.forceBreakFlag = true;
      this.updateParagraphStatus('下一句將開始新段落');
      console.log('✂️ 設置下一句強制分段');
    }
  }

  async finalizeParagraph() {
    if (!this.smartOrganizer.currentParagraph.trim()) {
      return;
    }
    
    const paragraph = {
      id: this.generateSessionId(),
      content: this.smartOrganizer.currentParagraph.trim(),
      timestamp: new Date(),
      rawSpeechBuffer: [...this.smartOrganizer.speechBuffer],
      speakers: [...new Set(this.smartOrganizer.speechBuffer.map(s => s.speaker))],
      isProcessed: false
    };
    
    this.smartOrganizer.organizedParagraphs.push(paragraph);
    
    // 顯示原始段落
    this.displayParagraph(paragraph);
    
    // 異步進行AI整理
    this.processParagraphWithAI(paragraph);
    
    // 重置當前段落和緩衝區
    this.smartOrganizer.currentParagraph = '';
    this.smartOrganizer.speechBuffer = [];
    
    console.log('📝 段落已完成:', paragraph.content.substring(0, 50) + '...');
  }

  displayParagraph(paragraph) {
    const summaryContent = document.getElementById('summaryContent');
    
    // 移除placeholder
    const placeholder = summaryContent.querySelector('.placeholder');
    if (placeholder) {
      placeholder.remove();
    }
    
    const paragraphElement = document.createElement('div');
    paragraphElement.className = 'summary-paragraph';
    paragraphElement.id = paragraph.id;
    
    const speakerInfo = paragraph.speakers.length > 0 ? 
      ` | 說話者: ${paragraph.speakers.join(', ')}` : '';
    
    paragraphElement.innerHTML = `
      <div class="paragraph-header">
        <span>${paragraph.timestamp.toLocaleTimeString()}</span>
        <span>${paragraph.rawSpeechBuffer.length} 片段${speakerInfo}</span>
      </div>
      <div class="paragraph-content">${paragraph.content}</div>
    `;
    
    summaryContent.appendChild(paragraphElement);
    summaryContent.scrollTop = summaryContent.scrollHeight;
  }

  async processParagraphWithAI(paragraph) {
    if (this.smartOrganizer.isProcessing) {
      console.log('⏳ AI正在處理其他段落，等待中...');
      setTimeout(() => this.processParagraphWithAI(paragraph), 2000);
      return;
    }
    
    this.smartOrganizer.isProcessing = true;
    
    try {
      const prompt = this.buildAIPrompt(paragraph);
      const organizedText = await this.callAIForOrganization(prompt);
      
      if (organizedText && organizedText !== paragraph.content) {
        this.updateParagraphContent(paragraph.id, organizedText);
        paragraph.isProcessed = true;
        console.log('🤖 AI整理完成:', organizedText.substring(0, 50) + '...');
      }
    } catch (error) {
      console.error('🤖 AI整理失敗:', error);
      this.updateParagraphStatus('AI整理失敗');
    } finally {
      this.smartOrganizer.isProcessing = false;
    }
  }

  buildAIPrompt(paragraph) {
    const contextPrompt = this.smartOrganizer.meetingContext ? 
      `會議背景：${this.smartOrganizer.meetingContext}\n\n` : '';
    
    return `${contextPrompt}請將以下破碎的語音識別內容整理成流暢完整的段落：

原始內容：
${paragraph.content}

要求：
1. 修正語法錯誤和標點符號
2. 合併重複或相似的語句
3. 保持原意不變
4. 輸出完整流暢的段落
5. 不要添加原文中沒有的信息

整理後的內容：`;
  }

  async callAIForOrganization(prompt) {
    // 優先使用已設定的翻譯服務
    const provider = this.settings.translationProvider || 'free';
    
    if (provider === 'openai' && this.settings.openaiKey) {
      return await this.callOpenAIForOrganization(prompt);
    } else {
      // 使用簡單的文本整理邏輯作為備用
      return this.basicTextOrganization(prompt);
    }
  }

  async callOpenAIForOrganization(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ 
          role: 'user', 
          content: prompt 
        }],
        max_tokens: 800,
        temperature: 0.3,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API錯誤: ${response.status}`);
    }

    const result = await response.json();
    return result.choices[0].message.content.trim();
  }

  basicTextOrganization(prompt) {
    // 從prompt中提取原始內容
    const contentMatch = prompt.match(/原始內容：\n(.*?)\n\n要求：/s);
    if (!contentMatch) return null;
    
    let text = contentMatch[1].trim();
    
    // 基本整理邏輯
    text = text
      .replace(/\s+/g, ' ') // 合併多個空格
      .replace(/([。！？.!?])\s*([a-zA-Z\u4e00-\u9fff])/g, '$1 $2') // 句號後加空格
      .replace(/，\s*，/g, '，') // 移除重複逗號
      .replace(/。\s*。/g, '。') // 移除重複句號
      .replace(/([a-zA-Z\u4e00-\u9fff])\s*([，。！？,.!?])/g, '$1$2') // 標點符號前不要空格
      .trim();
    
    // 確保句子以適當的標點結束
    if (!/[。！？.!?]$/.test(text)) {
      text += '。';
    }
    
    return text;
  }

  updateParagraphContent(paragraphId, newContent) {
    const paragraphElement = document.getElementById(paragraphId);
    if (paragraphElement) {
      const contentDiv = paragraphElement.querySelector('.paragraph-content');
      if (contentDiv) {
        contentDiv.innerHTML = newContent;
        paragraphElement.style.background = '#e8f5e8'; // 標記為已處理
      }
    }
  }

  reorganizeParagraphs() {
    this.updateParagraphStatus('重新整理中...');
    
    // 重新處理所有未處理的段落
    const unprocessedParagraphs = this.smartOrganizer.organizedParagraphs.filter(p => !p.isProcessed);
    
    unprocessedParagraphs.forEach((paragraph, index) => {
      setTimeout(() => {
        this.processParagraphWithAI(paragraph);
      }, index * 1000); // 每秒處理一個段落
    });
    
    console.log(`🔄 開始重新整理 ${unprocessedParagraphs.length} 個段落`);
  }

  clearSummary() {
    const summaryContent = document.getElementById('summaryContent');
    summaryContent.innerHTML = `
      <div class="placeholder">
        AI將根據語音內容自動整理成完整段落...<br>
        <small>• 自動合併破碎語句</small><br>
        <small>• 修正語法和標點</small><br>
        <small>• 提取重點內容</small>
      </div>
    `;
    
    this.smartOrganizer.organizedParagraphs = [];
    this.smartOrganizer.currentParagraph = '';
    this.smartOrganizer.speechBuffer = [];
    
    this.updateParagraphStatus('智能整理已清除');
    console.log('🗑️ 智能整理內容已清除');
  }

  updateParagraphStatus(message) {
    const statusElement = document.getElementById('paragraphStatus');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  // 更新錄音按鈕狀態
  updateRecordingButton() {
    const toggleBtn = document.getElementById('toggleBtn');
    if (!toggleBtn) {
      console.warn('⚠️ 找不到錄音按鈕元素');
      return;
    }
    
    // 確保按鈕可以點擊（移除可能的禁用狀態）
    toggleBtn.disabled = false;
    
    if (this.isRecording) {
      toggleBtn.textContent = '🛑 停止錄音';
      toggleBtn.classList.add('recording');
      toggleBtn.style.backgroundColor = '#dc3545';
      toggleBtn.style.color = 'white';
      toggleBtn.title = '點擊停止錄音';
    } else {
      toggleBtn.textContent = '🎤 開始錄音';
      toggleBtn.classList.remove('recording');
      toggleBtn.style.backgroundColor = '#007cba';
      toggleBtn.style.color = 'white';
      toggleBtn.title = '點擊開始錄音';
    }
    
    console.log('🔄 錄音按鈕狀態已更新:', this.isRecording ? '錄音中' : '停止');
  }

  // 處理點擊外部區域關閉面板
  handleOutsideClick(event) {
    const settingsPanel = document.getElementById('settingsPanel');
    const historyPanel = document.getElementById('historyPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const historyBtn = document.getElementById('historyBtn');

    // 檢查設定面板
    if (settingsPanel && settingsPanel.classList.contains('open')) {
      // 如果點擊的不是設定面板內部或設定按鈕，則關閉設定面板
      if (!settingsPanel.contains(event.target) && !settingsBtn.contains(event.target)) {
        console.log('⚙️ 點擊外部區域觸發關閉設定面板');
        this.closeSettings();
      }
    }

    // 檢查歷程面板
    if (historyPanel && historyPanel.classList.contains('open')) {
      // 如果點擊的不是歷程面板內部或歷程按鈕，則關閉歷程面板
      if (!historyPanel.contains(event.target) && !historyBtn.contains(event.target)) {
        historyPanel.classList.remove('open');
        // 清除定時器
        if (this.sessionInfoTimer) {
          clearInterval(this.sessionInfoTimer);
          this.sessionInfoTimer = null;
        }
        console.log('📚 歷程面板已關閉（點擊外部）');
      }
    }
  }

  // 啟動語音識別監控機制
  startWatchdog() {
    this.stopWatchdog(); // 先停止現有的監控
    
    console.log('🐕 啟動語音識別監控機制');
    
    // 定期檢查語音識別活動狀態
    this.watchdogTimer = setInterval(() => {
      if (!this.isRecording) {
        this.stopWatchdog();
        return;
      }
      
      const inactiveTime = Date.now() - this.lastActivityTime;
      
      if (inactiveTime > this.maxInactiveTime) {
        console.warn(`🐕 語音識別無活動超過 ${this.maxInactiveTime}ms，強制重啟`);
        this.showStatus('🔄 語音識別無響應，正在重啟...', 'warning');
        this.forceRestart();
      } else {
        console.log(`🐕 監控正常，無活動時間: ${inactiveTime}ms`);
      }
    }, this.watchdogInterval);
    
    // 定期強制重啟（防止長時間累積導致的問題）
    this.forceRestartTimer = setInterval(() => {
      if (!this.isRecording) {
        return;
      }
      
      console.log('🔄 定期強制重啟語音識別（防止累積問題）');
      this.showStatus('🔄 定期重啟語音識別...', 'info');
      this.forceRestart();
    }, this.forceRestartInterval);
  }
  
  // 停止語音識別監控機制
  stopWatchdog() {
    if (this.watchdogTimer) {
      console.log('🐕 停止語音識別監控機制');
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    
    if (this.forceRestartTimer) {
      console.log('🔄 停止強制重啟計時器');
      clearInterval(this.forceRestartTimer);
      this.forceRestartTimer = null;
    }
  }
  
  // 強制重啟語音識別
  forceRestart() {
    if (!this.isRecording) {
      return;
    }
    
    console.log('💪 強制重啟語音識別');
    
    // 標記為重啟狀態
    this.isRestarting = true;
    
    // 停止當前的識別
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('⚠️ 停止識別時出錯:', error);
      }
    }
    
    // 等待短暫時間後重新啟動
    setTimeout(() => {
      if (this.isRecording) {
        console.log('💪 重新初始化並啟動語音識別');
        
        // 重新初始化
        const initialized = this.initializeSpeechRecognition();
        
        if (initialized && this.recognition) {
          try {
            this.recognition.start();
            this.isRestarting = false;
            this.lastActivityTime = Date.now();
            console.log('✅ 強制重啟成功');
          } catch (error) {
            console.error('❌ 強制重啟失敗:', error);
            this.isRestarting = false;
            
            // 如果強制重啟也失敗，嘗試普通重啟
            this.attemptRestart();
          }
        } else {
          console.error('❌ 重新初始化失敗');
          this.isRestarting = false;
          this.showStatus('❌ 語音識別重啟失敗，請手動重新開始', 'error');
        }
      } else {
        this.isRestarting = false;
      }
    }, 1000);
  }

  // 檢測說話者變化
  detectSpeakerChange(text, confidence) {
    const now = Date.now();
    const timeSinceLastSpeech = now - this.speakerDetection.lastSpeechTime;
    
    // 更新上次語音時間
    this.speakerDetection.lastSpeechTime = now;
    
    // 分析語音特徵
    const speechFeatures = this.analyzeSpeechFeatures(text, confidence, timeSinceLastSpeech);
    
    // 判斷是否需要切換說話者
    const speakerInfo = this.determineSpeaker(speechFeatures, timeSinceLastSpeech);
    
    console.log('🗣️ 說話者檢測結果:', speakerInfo);
    
    return speakerInfo;
  }

  // 分析語音特徵
  analyzeSpeechFeatures(text, confidence, timeSinceLastSpeech) {
    return {
      textLength: text.length,
      confidence: confidence,
      timeSinceLastSpeech: timeSinceLastSpeech,
      hasQuestionMark: text.includes('?') || text.includes('？'),
      hasExclamation: text.includes('!') || text.includes('！'),
      wordCount: text.split(/\s+/).length,
      chineseCharCount: (text.match(/[\u4e00-\u9fff]/g) || []).length,
      englishWordCount: (text.match(/[a-zA-Z]+/g) || []).length,
      sentiment: this.analyzeSentiment(text), // 情感分析
      speakingStyle: this.analyzeSpeakingStyle(text) // 說話風格
    };
  }

  // 簡單情感分析
  analyzeSentiment(text) {
    const positiveWords = ['好', '棒', '對', '是', '可以', '謝謝', 'good', 'yes', 'great', 'thanks', 'sure'];
    const negativeWords = ['不', '沒', '錯', '壞', 'no', 'bad', 'wrong', 'sorry', 'not'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    const lowerText = text.toLowerCase();
    
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // 分析說話風格
  analyzeSpeakingStyle(text) {
    const style = {
      formal: false,
      casual: false,
      questioning: false,
      commanding: false
    };
    
    // 正式語言特徵
    if (text.includes('您') || text.includes('請') || text.includes('謝謝您')) {
      style.formal = true;
    }
    
    // 非正式語言特徵
    if (text.includes('嗯') || text.includes('呃') || text.includes('就是')) {
      style.casual = true;
    }
    
    // 疑問特徵
    if (text.includes('?') || text.includes('？') || text.includes('嗎') || text.includes('呢')) {
      style.questioning = true;
    }
    
    // 命令特徵
    if (text.includes('請') || text.includes('要') || text.endsWith('吧')) {
      style.commanding = true;
    }
    
    return style;
  }

  // 確定說話者
  determineSpeaker(features, timeSinceLastSpeech) {
    const { speakers, currentSpeaker, silenceThreshold, speakerChangeThreshold } = this.speakerDetection;
    
    // 如果靜默時間超過閾值，可能是說話者切換
    const possibleSpeakerChange = timeSinceLastSpeech > speakerChangeThreshold;
    
    // 如果是第一次說話或沒有當前說話者
    if (!currentSpeaker || speakers.length === 0) {
      const newSpeaker = this.createNewSpeaker(features, 'Speaker 1');
      this.speakerDetection.currentSpeaker = newSpeaker;
      this.speakerDetection.speakers.push(newSpeaker);
      return newSpeaker;
    }
    
    // 檢查是否與當前說話者匹配
    const currentSpeakerMatch = this.calculateSpeakerMatch(features, currentSpeaker);
    
    // 如果匹配度高且沒有長時間靜默，繼續使用當前說話者
    if (currentSpeakerMatch > 0.7 && !possibleSpeakerChange) {
      this.updateSpeakerFeatures(currentSpeaker, features);
      return currentSpeaker;
    }
    
    // 如果可能是說話者切換，檢查是否是已知說話者
    if (possibleSpeakerChange) {
      for (const speaker of speakers) {
        if (speaker.id !== currentSpeaker.id) {
          const match = this.calculateSpeakerMatch(features, speaker);
          if (match > 0.6) {
            console.log(`🔄 切換到已知說話者: ${speaker.name}`);
            this.speakerDetection.currentSpeaker = speaker;
            this.updateSpeakerFeatures(speaker, features);
            return speaker;
          }
        }
      }
      
      // 如果不匹配任何已知說話者，創建新說話者
      const newSpeaker = this.createNewSpeaker(features, `Speaker ${speakers.length + 1}`);
      console.log(`👤 檢測到新說話者: ${newSpeaker.name}`);
      this.speakerDetection.currentSpeaker = newSpeaker;
      this.speakerDetection.speakers.push(newSpeaker);
      return newSpeaker;
    }
    
    // 預設情況：更新當前說話者特徵
    this.updateSpeakerFeatures(currentSpeaker, features);
    return currentSpeaker;
  }

  // 創建新說話者
  createNewSpeaker(features, name) {
    return {
      id: this.generateSessionId(),
      name: name,
      features: {
        avgConfidence: features.confidence,
        avgTextLength: features.textLength,
        avgWordCount: features.wordCount,
        preferredLanguage: features.chineseCharCount > features.englishWordCount ? 'zh' : 'en',
        speakingStyle: features.speakingStyle,
        sentiment: features.sentiment
      },
      speechCount: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      color: this.assignSpeakerColor(name) // 為說話者分配顏色
    };
  }

  // 分配說話者顏色
  assignSpeakerColor(speakerName) {
    const colors = [
      '#3498db', // 藍色
      '#e74c3c', // 紅色
      '#2ecc71', // 綠色
      '#f39c12', // 橙色
      '#9b59b6', // 紫色
      '#1abc9c', // 青色
      '#34495e', // 深灰
      '#e67e22'  // 深橙
    ];
    
    const index = this.speakerDetection.speakers.length % colors.length;
    return colors[index];
  }

  // 計算說話者匹配度
  calculateSpeakerMatch(features, speaker) {
    const speakerFeatures = speaker.features;
    let score = 0;
    let factors = 0;
    
    // 置信度相似性
    const confidenceDiff = Math.abs(features.confidence - speakerFeatures.avgConfidence);
    score += Math.max(0, 1 - confidenceDiff);
    factors++;
    
    // 文字長度相似性
    const lengthDiff = Math.abs(features.textLength - speakerFeatures.avgTextLength) / Math.max(features.textLength, speakerFeatures.avgTextLength);
    score += Math.max(0, 1 - lengthDiff);
    factors++;
    
    // 語言偏好
    const currentLang = features.chineseCharCount > features.englishWordCount ? 'zh' : 'en';
    if (currentLang === speakerFeatures.preferredLanguage) {
      score += 0.5;
    }
    factors++;
    
    // 說話風格匹配
    const styleMatch = this.compareSpeakingStyles(features.speakingStyle, speakerFeatures.speakingStyle);
    score += styleMatch;
    factors++;
    
    return factors > 0 ? score / factors : 0;
  }

  // 比較說話風格
  compareSpeakingStyles(style1, style2) {
    let matches = 0;
    let total = 0;
    
    for (const key in style1) {
      if (style1[key] === style2[key]) {
        matches++;
      }
      total++;
    }
    
    return total > 0 ? matches / total : 0;
  }

  // 更新說話者特徵
  updateSpeakerFeatures(speaker, features) {
    const count = speaker.speechCount;
    const newCount = count + 1;
    
    // 使用移動平均更新特徵
    speaker.features.avgConfidence = (speaker.features.avgConfidence * count + features.confidence) / newCount;
    speaker.features.avgTextLength = (speaker.features.avgTextLength * count + features.textLength) / newCount;
    speaker.features.avgWordCount = (speaker.features.avgWordCount * count + features.wordCount) / newCount;
    
    // 更新最新的說話風格和情感
    speaker.features.speakingStyle = features.speakingStyle;
    speaker.features.sentiment = features.sentiment;
    
    speaker.speechCount = newCount;
    speaker.lastSeen = Date.now();
  }

  // 更新說話者統計顯示
  updateSpeakerStatsDisplay() {
    if (!this.speakerDetection.enabled || this.speakerDetection.speakers.length === 0) {
      return;
    }

    let statsPanel = document.getElementById('speakerStatsPanel');
    if (!statsPanel) {
      statsPanel = document.createElement('div');
      statsPanel.id = 'speakerStatsPanel';
      statsPanel.className = 'speaker-stats';
      document.body.appendChild(statsPanel);
    }

    const stats = this.getSpeakerStats();
    const totalSpeechCount = stats.reduce((sum, speaker) => sum + speaker.speechCount, 0);

    statsPanel.innerHTML = `
      <h3>🗣️ 說話者統計</h3>
      ${stats.map(speaker => `
        <div class="speaker-item">
          <div class="speaker-color" style="background-color: ${speaker.color};"></div>
          <div class="speaker-info">
            <div class="speaker-name">${speaker.name}</div>
            <div class="speaker-details">
              發言 ${speaker.speechCount} 次 (${((speaker.speechCount / totalSpeechCount) * 100).toFixed(1)}%)
              <br>置信度: ${speaker.avgConfidence.toFixed(2)}
            </div>
          </div>
        </div>
      `).join('')}
      <div style="text-align: center; margin-top: 10px;">
        <button onclick="window.subtitleApp.toggleSpeakerStats()" style="background: none; border: 1px solid white; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px;">隱藏</button>
      </div>
    `;

    // 自動顯示統計面板（如果有多個說話者）
    if (stats.length > 1) {
      statsPanel.classList.add('show');
    }
  }

  // 切換說話者統計顯示
  toggleSpeakerStats() {
    const statsPanel = document.getElementById('speakerStatsPanel');
    if (statsPanel) {
      statsPanel.classList.toggle('show');
    }
  }

  // 開始錄音時清除說話者歷史（可選）
  async startRecordingEnhanced() {
    // 詢問是否清除說話者歷史
    if (this.speakerDetection.enabled && this.speakerDetection.speakers.length > 0) {
      if (confirm('開始新的錄音會議？這將清除當前的說話者記錄。')) {
        this.clearSpeakerHistory();
      }
    }
    
    return this.startRecording();
  }

  // 限制字幕數量顯示
  limitSubtitleCount() {
    const container = document.getElementById('subtitleContainer');
    if (!container) return;
    
    const subtitles = container.querySelectorAll('.subtitle-item:not(.interim-subtitle)');
    const maxSubtitles = 50;
    
    if (subtitles.length > maxSubtitles) {
      // 移除最舊的字幕
      for (let i = 0; i < subtitles.length - maxSubtitles; i++) {
        subtitles[i].remove();
      }
    }
  }
}

// 當視窗載入完成後初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOM 已載入，開始初始化字幕視窗...');
  window.subtitleWindow = new SubtitleWindow();
  await window.subtitleWindow.init();
});

// 監聽來自 background script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (window.subtitleWindow) {
    switch (request.action) {
      case 'toggleRecording':
        window.subtitleWindow.toggleRecording();
        sendResponse({ success: true });
        break;
      case 'toggleSmartPanel':
        window.subtitleWindow.toggleSmartPanel();
        sendResponse({ success: true });
        break;
      case 'openSettings':
        console.log('📨 收到開啟設定面板的訊息');
        // 直接開啟設定面板
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel && !settingsPanel.classList.contains('open')) {
          window.subtitleWindow.toggleSettings();
        }
        sendResponse({ success: true });
        break;
      case 'settingsUpdated':
        console.log('📨 收到設定更新訊息:', request.settings);
        // 重新載入設定
        if (window.subtitleWindow) {
          window.subtitleWindow.loadSettings();
        }
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ success: false, error: '未知的動作' });
    }
  } else {
    sendResponse({ success: false, error: '應用程式未初始化' });
  }
  return true;
});