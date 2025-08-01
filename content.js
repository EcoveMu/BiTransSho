// 內容腳本 - 簡化版使用核心模組的語音識別和字幕顯示系統

// 等待核心模組載入
function waitForModules() {
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

class SpeechTranslationApp {
  constructor() {
    this.isRecording = false;
    this.subtitleContainer = null;
    this.settings = {
      targetLanguages: ['zh-tw', 'en'],
      translationProvider: 'free',
      speechRecognitionLanguage: 'zh-TW',
      speechRecognitionEngine: 'browser',
      audioInputDevice: 'default',
      openaiKey: ''
    };
    
    // 核心模組實例
    this.speechEngine = null;
    this.audioManager = null;
    this.settingsManager = null;
    this.subtitleCore = null;
    this.historyCore = null;
    
    // 增強功能：完整記錄系統
    this.sessionHistory = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      records: [],
      totalDuration: 0
    };
    
    // 界面狀態管理
    this.currentView = 'live'; // live, history, translation
    this.subtitlePanels = {};
    
    this.initialize();
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async initialize() {
    console.log('🚀 初始化簡化版語音翻譯應用...');
    
    try {
      // 等待核心模組載入
      await waitForModules();
    
    // 載入設定
    await this.loadSettings();
      
      // 初始化核心模組
      await this.initializeCoreModules();
    
    // 創建增強版字幕容器
    this.createEnhancedSubtitleContainer();
    
      console.log('✅ 簡化版語音翻譯應用初始化完成');
    } catch (error) {
      console.error('❌ 簡化版應用初始化失敗:', error);
    }
  }

  async loadSettings() {
    try {
      if (this.settingsManager) {
        // 使用統一的設定管理器
        this.settings = this.settingsManager.getAllSettings();
        console.log('✅ content.js設定載入成功:', this.settings);
      } else {
        console.warn('⚠️ 設定管理器尚未初始化，使用預設設定');
      }
    } catch (error) {
      console.error('❌ content.js設定載入失敗:', error);
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
        onStatusUpdate: (data) => this.showMessage(data.message, data.type)
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
        onError: (data) => this.showMessage(data.message, 'error'),
        onStatusUpdate: (data) => this.showMessage(data.message, data.type),
        onVirtualDeviceDetected: (device) => this.onVirtualDeviceDetected(device)
      });
      
      // 初始化音頻管理
      await this.audioManager.initialize();
      
      // 初始化字幕核心
      this.subtitleCore = new window.SubtitleCore({
        maxSubtitleLines: this.settings.maxSubtitleLines || 50,
        autoScroll: true,
        showTimestamp: true,
        showSpeakerInfo: true,
        enableInterimResults: true,
        subtitleAnimations: true
      });
      
      // 設定字幕核心回調
      this.subtitleCore.setCallbacks({
        onSubtitleDisplayed: (data) => this.onSubtitleDisplayed(data),
        onSubtitleUpdated: (data) => this.onSubtitleUpdated(data),
        onSubtitleCleared: (data) => this.onSubtitleCleared(data),
        onError: (data) => this.showMessage(data.error, 'error'),
        onContainerReady: (data) => this.onSubtitleContainerReady(data)
      });
      
      // 初始化字幕容器
      this.subtitleCore.initializeContainer('speech-translation-subtitles', {
        bottom: '20px',
        maxWidth: '90%',
        maxHeight: '40%',
        zIndex: 10000
      });
      
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
        onError: (data) => this.showMessage(data.error, 'error'),
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

  createEnhancedSubtitleContainer() {
    // 移除舊的容器
    const existingContainer = document.getElementById('speech-translation-subtitles');
    if (existingContainer) {
      existingContainer.remove();
    }

    // 創建主容器
    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.id = 'speech-translation-subtitles';
    this.subtitleContainer.className = 'enhanced-subtitles-container';
    
    // 創建標題欄
    const titleBar = document.createElement('div');
    titleBar.className = 'subtitle-title-bar';
    titleBar.innerHTML = `
      <div class="title-left">
        <div class="drag-handle">⋮⋮</div>
        <span class="title-text">🎤 網頁即時字幕 (簡化版)</span>
      </div>
      <div class="title-controls">
        <button class="view-btn ${this.currentView === 'live' ? 'active' : ''}" data-view="live">📺 即時</button>
        <button class="view-btn ${this.currentView === 'history' ? 'active' : ''}" data-view="history">📚 記錄</button>
        <button class="view-btn ${this.currentView === 'translation' ? 'active' : ''}" data-view="translation">🌐 翻譯</button>
        <button class="minimize-btn">─</button>
        <button class="close-btn">×</button>
      </div>
    `;
    
    // 創建內容區域
    const contentArea = document.createElement('div');
    contentArea.className = 'subtitle-content-area';
    
    // 創建即時字幕面板
    this.createLivePanel(contentArea);
    
    // 創建歷史記錄面板
    this.createHistoryPanel(contentArea);
    
    // 創建翻譯面板
    this.createTranslationPanel(contentArea);
    
    // 創建狀態欄
    const statusBar = document.createElement('div');
    statusBar.className = 'subtitle-status-bar';
    statusBar.innerHTML = `
      <div class="status-left">
        <span class="recording-status">⏸️ 待機中</span>
        <span class="session-info">會話：${this.sessionHistory.sessionId.slice(-8)}</span>
      </div>
      <div class="status-right">
        <span class="record-count">記錄：0</span>
        <span class="language-info">引擎：${this.settings.speechRecognitionEngine}</span>
      </div>
    `;
    
    // 組裝容器
    this.subtitleContainer.appendChild(titleBar);
    this.subtitleContainer.appendChild(contentArea);
    this.subtitleContainer.appendChild(statusBar);
    
    // 設置事件監聽器
    this.setupEnhancedEventListeners();
    
    // 添加拖拽功能
    this.makeDraggable(this.subtitleContainer, titleBar.querySelector('.drag-handle'));
    
    // 初始隱藏
    this.subtitleContainer.style.display = 'none';
    
    document.body.appendChild(this.subtitleContainer);
  }

  makeDraggable(element, handle) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    handle.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      
      if (e.target === handle) {
        isDragging = true;
        handle.style.cursor = 'grabbing';
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        
        element.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    }

    function dragEnd() {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      handle.style.cursor = 'grab';
    }
  }

  // 語音識別結果處理
  handleRecognitionResult(data) {
    const { transcript, isFinal, confidence, engine } = data;
    
        if (!this.isRecording) return;
    
    if (!isFinal) {
      // 顯示即時識別結果
      this.showInterimSubtitle(transcript);
    } else {
      // 處理最終結果
      console.log('最終識別結果:', transcript, `(${engine}, 信心度: ${confidence})`);
      this.processRecognizedText(transcript);
    }
  }

  // 語音識別錯誤處理
  handleRecognitionError(data) {
    const { error, engine } = data;
    console.error(`${engine} 語音識別錯誤:`, error);
    
    // 根據錯誤類型顯示適當的訊息
    if (typeof error === 'string') {
      if (error.includes('not-allowed') || error.includes('NotAllowedError')) {
        this.showMessage('麥克風權限被拒絕', 'error');
        this.isRecording = false;
      } else if (error.includes('no-speech')) {
        // 靜音不顯示錯誤
      } else if (error.includes('network')) {
        this.showMessage('網路錯誤', 'error');
      } else {
        this.showMessage(`語音識別錯誤: ${error}`, 'error');
      }
    }
  }

  // 語音識別開始回調
  onRecognitionStart() {
        console.log('語音識別已啟動');
        this.showMessage('🎤 開始聽取語音...', 'success');
    this.updateStatusBar();
  }

  // 語音識別結束回調
  onRecognitionEnd() {
    console.log('語音識別結束');
    this.updateStatusBar();
  }

  // 音頻設備列表更新
  onAudioDevicesUpdated(devices) {
    console.log('🎙️ 音頻設備列表已更新:', devices.length, '個設備');
  }

  // 音頻設備變更
  onAudioDeviceChanged(devices) {
    console.log('🎙️ 檢測到音頻設備變更');
    this.showMessage('🎙️ 音頻設備已變更', 'info');
  }

  // 虛擬設備檢測
  onVirtualDeviceDetected(device) {
    console.log('🔧 檢測到虛擬音頻設備:', device.label);
    
    // 如果當前使用瀏覽器引擎，建議切換到 Whisper
    if (this.settings.speechRecognitionEngine === 'browser') {
      setTimeout(() => {
        this.showMessage(`🔧 檢測到虛擬設備 ${device.label}，建議使用 Whisper 引擎以獲得更好效果`, 'info');
      }, 2000);
    }
  }

  // 設定變更回調
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
    
    // 更新狀態欄
    this.updateStatusBar();
    
    this.showMessage('⚙️ 設定已更新', 'info');
  }

  // 設定遷移完成回調
  onMigrationComplete(data) {
    console.log('🔄 設定遷移完成:', data);
    this.showMessage(`🔄 設定已自動遷移: ${data.migrations.length} 項變更`, 'success');
  }

  // 設定驗證錯誤回調
  onValidationError(data) {
    console.warn('⚠️ 設定驗證錯誤:', data);
    this.showMessage(`⚠️ 設定驗證錯誤: ${data.errors ? data.errors.join(', ') : data.error}`, 'warning');
  }

  // 設定同步完成回調
  onSyncComplete(data) {
    console.log('✅ 設定同步完成');
    // 靜默處理，不顯示消息避免過多通知
  }

  // 字幕核心回調
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
    // 更新內部容器引用
    this.subtitleContainer = data.container;
    this.subtitleContent = data.content;
  }

  // 歷程記錄核心回調
  onHistoryRecordAdded(data) {
    console.log('📚 歷程記錄已添加:', data.record.id);
    // 更新統計面板
    this.updateStatusBar();
  }

  onHistoryRecordUpdated(data) {
    console.log('📝 歷程記錄已更新:', data.recordId);
    // 更新歷程面板顯示
    this.updateHistoryPanel();
  }

  onHistoryCleared(data) {
    console.log('🧹 歷程記錄已清除');
    this.showMessage(`已清除 ${data.clearedRecords} 條記錄`, 'success');
    this.updateStatusBar();
  }

  onHistoryExportComplete(data) {
    console.log('📤 歷程匯出完成:', data.format);
    this.showMessage(`${data.format.toUpperCase()} 匯出完成 - ${data.recordCount} 條記錄`, 'success');
  }

  onHistoryStatisticsUpdated(data) {
    console.log('📊 歷程統計已更新');
    // 可以在這裡更新統計顯示
  }



  async processRecognizedText(text) {
    if (!text || text.trim().length === 0) return;
    
    try {
      console.log('🎯 處理識別文本:', text);
      
      // 使用歷程核心創建記錄條目
      const recordEntry = this.historyCore.createRecordEntry(text, {
        source: 'speech_recognition',
        engine: this.settings.speechRecognitionEngine,
        language: this.settings.speechRecognitionLanguage,
        confidence: 0.8 // 這裡可以從語音引擎獲取實際置信度
      });
      
      // 使用字幕核心顯示原文
      this.subtitleCore.displayOriginalTextWithSpeaker(
        text,
        recordEntry.subtitleId,
        recordEntry.id,
        recordEntry.speakerInfo
      );
      
      // 發送翻譯請求
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
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
        
        this.showMessage(`翻譯失敗: ${response?.error || '未知錯誤'}`, 'error');
      }
    } catch (error) {
      console.error('❌ 處理文本失敗:', error);
      this.showMessage(`處理失敗: ${error.message}`, 'error');
    }
  }

  createRecordEntry(text) {
    const recordEntry = {
      id: 'record_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      originalText: text,
      translations: [],
      translationStatus: 'pending', // pending, completed, failed
      translationError: null,
      confidence: 0.8, // 預設信心度
      speakerInfo: {
        speaker: `講者 ${this.sessionHistory.records.length + 1}`,
        isNewSpeaker: true
      }
    };
    
    return recordEntry;
  }

  displayInLivePanel(recordEntry) {
    const liveContent = document.getElementById('liveContent');
    if (!liveContent) return;
    
    // 隱藏 no-content 提示
    const noContent = liveContent.querySelector('.no-content');
    if (noContent) {
      noContent.style.display = 'none';
    }
    
    // 創建即時字幕項目
    const liveItem = document.createElement('div');
    liveItem.className = 'live-subtitle-item';
    liveItem.id = `live_${recordEntry.id}`;
    liveItem.innerHTML = `
      <div class="live-item-header">
        <span class="timestamp">${recordEntry.timestamp.toLocaleTimeString()}</span>
        <span class="speaker">${recordEntry.speakerInfo.speaker}</span>
        <span class="translation-status loading">🔄 翻譯中...</span>
      </div>
      <div class="original-text">${recordEntry.originalText}</div>
      <div class="translation-area" id="translation_${recordEntry.id}">
        <div class="loading-indicator">正在翻譯...</div>
      </div>
    `;
    
    liveContent.appendChild(liveItem);
    
    // 自動滾動到最新內容
    liveContent.scrollTop = liveContent.scrollHeight;
    
    // 顯示容器
    this.subtitleContainer.style.display = 'block';
  }

  updateLivePanelTranslation(recordId, translationData) {
    const translationArea = document.getElementById(`translation_${recordId}`);
    const statusElement = document.querySelector(`#live_${recordId} .translation-status`);
    
    if (!translationArea) return;
    
    // 更新狀態
    if (statusElement) {
      statusElement.className = 'translation-status completed';
      statusElement.textContent = '✅ 完成';
    }
    
    // 清空加載指示器
    translationArea.innerHTML = '';
    
    // 顯示翻譯結果
    if (translationData.translations && Array.isArray(translationData.translations)) {
      translationData.translations.forEach(translation => {
        if (translation.text !== translationData.original) {
          const translationElement = document.createElement('div');
          translationElement.className = 'translation-item';
          translationElement.innerHTML = `
            <span class="lang-label">${this.getLanguageName(translation.language)}:</span>
            <span class="translation-text">${translation.text}</span>
          `;
          translationArea.appendChild(translationElement);
        }
      });
    }
  }

  addToHistory(recordEntry) {
    // 添加到會話歷史
    this.sessionHistory.records.push(recordEntry);
    
    // 更新歷史面板
    this.updateHistoryPanel();
  }

  updateHistoryPanel() {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    // 清空現有內容
    historyContent.innerHTML = '';
    
    if (this.sessionHistory.records.length === 0) {
      historyContent.innerHTML = '<div class="no-content">尚無會話記錄</div>';
      return;
    }
    
    // 顯示所有記錄
    this.sessionHistory.records.forEach(record => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `
        <div class="history-header">
          <span class="timestamp">${record.timestamp.toLocaleTimeString()}</span>
          <span class="speaker">${record.speakerInfo.speaker}</span>
          <span class="record-id">#${record.id.slice(-6)}</span>
        </div>
        <div class="original-text">${record.originalText}</div>
        <div class="translations">
          ${this.renderTranslations(record.translations)}
        </div>
      `;
      historyContent.appendChild(historyItem);
    });
  }

  updateTranslationPanel(recordEntry) {
    const translationContent = document.getElementById('translationContent');
    if (!translationContent) return;
    
    // 隱藏 no-content 提示
    const noContent = translationContent.querySelector('.no-content');
    if (noContent) {
      noContent.style.display = 'none';
    }
    
    // 創建翻譯項目
    const translationItem = document.createElement('div');
    translationItem.className = 'translation-entry';
    translationItem.innerHTML = `
      <div class="translation-header">
        <span class="timestamp">${recordEntry.timestamp.toLocaleTimeString()}</span>
        <span class="original-preview">${recordEntry.originalText.substring(0, 50)}${recordEntry.originalText.length > 50 ? '...' : ''}</span>
      </div>
      <div class="translation-results">
        ${this.renderTranslations(recordEntry.translations)}
      </div>
    `;
    
    translationContent.appendChild(translationItem);
    
    // 自動滾動
    translationContent.scrollTop = translationContent.scrollHeight;
  }

  renderTranslations(translations) {
    if (!translations || !Array.isArray(translations)) {
      return '<div class="no-translation">無翻譯結果</div>';
    }
    
    return translations.map(translation => `
      <div class="translation-result">
        <span class="lang-label">${this.getLanguageName(translation.language)}</span>
        <span class="translation-text">${translation.text}</span>
      </div>
    `).join('');
  }

  showInterimSubtitle(text) {
    // 使用字幕核心顯示臨時字幕
    if (this.subtitleCore) {
      this.subtitleCore.showInterimSubtitle(text);
    }
  }

  displaySubtitles(translationData) {
    // 使用字幕核心顯示完整字幕
    if (this.subtitleCore) {
      this.subtitleCore.displaySubtitles(translationData);
    }
  }

  getLanguageName(langCode) {
    // 使用字幕核心的語言名稱功能
    if (this.subtitleCore) {
      return this.subtitleCore.getLanguageName(langCode);
    }
    // 備用方案
    return langCode.toUpperCase();
  }

  showMessage(message, type = 'info') {
    console.log(`狀態消息: ${message} (${type})`);
    
    if (this.subtitleContainer) {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${type}`;
      messageElement.textContent = message;
      this.subtitleContainer.appendChild(messageElement);
      
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageElement.remove();
        }
      }, 3000);
    }
  }

  async startRecording() {
    console.log('🎤 開始錄音...');
    
    // 檢測Teams環境
    const isTeamsEnvironment = this.detectTeamsEnvironment();
    if (isTeamsEnvironment) {
      console.log('🟡 檢測到Teams環境，開啟增強模式');
      this.showMessage('🟡 Teams環境檢測到，正在啟動增強模式...', 'info');
    }
    
    try {
      // 更新語音引擎設定
      this.speechEngine.updateSettings({
        speechRecognitionLanguage: this.settings.speechRecognitionLanguage,
        speechRecognitionEngine: this.settings.speechRecognitionEngine,
        audioInputDevice: this.settings.audioInputDevice,
        openaiKey: this.settings.openaiKey
      });
      
      // 更新音頻管理設定
      this.audioManager.updateSettings({
        audioInputDevice: this.settings.audioInputDevice
      });
      
      // 啟動語音識別
      await this.speechEngine.startRecognition();
      
      this.isRecording = true;
      this.showMessage('🎤 語音識別已啟動 - 請開始說話', 'success');
      
      // 顯示字幕容器
      if (this.subtitleContainer) {
        this.subtitleContainer.style.display = 'block';
      }
      
      // Teams環境的特殊提示
      if (isTeamsEnvironment) {
        setTimeout(() => {
          this.showMessage('💡 Teams環境：請確保您有在說話或Teams有聲音輸出', 'info');
        }, 2000);
      }
      
      return true;
    } catch (error) {
      console.error('❌ 啟動語音識別失敗:', error);
      this.showMessage(`❌ 啟動失敗: ${error.message}`, 'error');
      
      this.isRecording = false;
      return false;
    }
  }

  // 檢測是否在Teams環境
  detectTeamsEnvironment() {
    const url = window.location.href;
    const userAgent = navigator.userAgent;
    
    const isTeams = url.includes('teams.microsoft.com') || 
                   url.includes('teams.live.com') ||
                   document.title.includes('Teams') ||
                   document.querySelector('[data-app-name*="teams"]') !== null;
    
    console.log('🔍 環境檢測:', {
      url: url,
      isTeams: isTeams,
      title: document.title
    });
    
    return isTeams;
  }

  // 音頻診斷 - 增強版，專門針對Teams環境
  async performAudioDiagnostic() {
    console.log('🔧 開始音頻環境診斷...');
    
    try {
      // 檢查當前URL和環境
      const isTeams = this.detectTeamsEnvironment();
      console.log('🏢 Teams環境:', isTeams);
      
      // 檢查音頻設備
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      console.log('🎤 可用音頻設備:', audioInputs.map(d => ({
        label: d.label || '預設設備',
        deviceId: d.deviceId,
        groupId: d.groupId
      })));
      
      // Teams環境特殊檢查
      if (isTeams) {
        // 檢查Teams是否正在使用音頻
        const teamsAudioElements = document.querySelectorAll('audio[autoplay], video[autoplay]');
        console.log('📹 Teams音頻/視頻元素:', teamsAudioElements.length);
        
        // 檢查Teams會議狀態
        const meetingIndicators = document.querySelectorAll('[data-tid*="call"], [aria-label*="會議"], [aria-label*="通話"]');
        console.log('📞 Teams會議狀態指標:', meetingIndicators.length);
        
        if (meetingIndicators.length > 0) {
          this.showMessage('🔍 檢測到Teams會議進行中，可能影響麥克風存取', 'warning');
        }
      }
      
      // 檢查瀏覽器音頻權限狀態
      if (navigator.permissions) {
        try {
          const micPermission = await navigator.permissions.query({ name: 'microphone' });
          console.log('🔐 麥克風權限狀態:', micPermission.state);
          
          if (micPermission.state === 'denied') {
            this.showMessage('❌ 麥克風權限被永久拒絕，請在瀏覽器設定中重新允許', 'error');
          } else if (micPermission.state === 'prompt') {
            this.showMessage('🔔 需要麥克風權限確認', 'info');
          }
        } catch (permError) {
          console.warn('⚠️ 無法檢查權限狀態:', permError);
        }
      }
      
      // 檢查頁面音頻狀態
      const audioElements = document.querySelectorAll('audio, video');
      console.log('🔊 頁面音頻元素:', audioElements.length);
      
      // 檢查是否有其他應用可能佔用音頻
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { sampleRate: 8000 } // 使用較低要求測試
        });
        console.log('✅ 基本麥克風存取測試成功');
        testStream.getTracks().forEach(track => track.stop());
      } catch (testError) {
        console.error('❌ 基本麥克風存取測試失敗:', testError.name, testError.message);
        
        if (isTeams && testError.name === 'NotReadableError') {
          this.showMessage('⚠️ 麥克風被Teams佔用，建議退出會議後再啟動字幕', 'warning');
        }
      }
      
      // 檢查音頻context狀態
      if (window.AudioContext || window.webkitAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const testContext = new AudioContext();
        console.log('🎵 音頻Context狀態:', testContext.state);
        
        if (testContext.state === 'suspended') {
          console.log('🔄 音頻Context被暫停，嘗試喚醒');
          await testContext.resume();
        }
        
        testContext.close();
      }
      
      // Teams環境建議
      if (isTeams) {
        setTimeout(() => {
          this.showMessage('💡 Teams環境建議：在加入會議前先啟動字幕，或使用獨立字幕視窗', 'info');
        }, 2000);
      }
      
    } catch (error) {
      console.warn('⚠️ 音頻診斷部分失敗:', error);
      this.showMessage('⚠️ 音頻環境診斷異常，請檢查瀏覽器控制台', 'warning');
    }
  }

  // Teams音頻設置處理
  async handleTeamsAudioSetup() {
    console.log('🟡 處理Teams音頻設置...');
    
    // 等待Teams頁面穩定
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 檢查Teams是否在通話中
    const isInCall = document.querySelector('[data-tid="call-roster"]') !== null ||
                    document.querySelector('[aria-label*="會議"]') !== null ||
                    document.querySelector('[aria-label*="通話"]') !== null;
    
    if (isInCall) {
      console.log('📞 檢測到Teams通話進行中');
      this.showMessage('📞 檢測到Teams通話，正在優化音頻設定...', 'info');
    }
  }

  // 錯誤分析
  analyzeAudioError(error) {
    const errorMessages = {
      'NotAllowedError': '麥克風權限被拒絕。請點擊網址列的麥克風圖標允許權限。',
      'NotFoundError': '找不到麥克風設備。請檢查您的音頻設備連接。',
      'NotReadableError': '麥克風被其他應用程式占用。請關閉其他使用麥克風的程式。',
      'OverconstrainedError': '音頻設定限制過嚴。將使用預設設定重試。',
      'SecurityError': '安全限制阻止了麥克風訪問。',
      'AbortError': '音頻請求被中止。'
    };
    
    return errorMessages[error.name] || `未知錯誤: ${error.message}`;
  }

  // Teams特殊指導 - 增強版
  showTeamsSpecificGuidance(error) {
    setTimeout(() => {
      let guidance = '';
      let actions = [];
      
      if (error.name === 'NotAllowedError') {
        guidance = '🔧 Teams麥克風權限解決方案：';
        actions = [
          '1. 點擊網址列左側的 🔒 鎖頭圖標',
          '2. 在彈出選單中找到「麥克風」選項',
          '3. 選擇「允許」或「詢問」',
          '4. 重新載入頁面 (Ctrl+F5)',
          '5. 重新啟動字幕功能',
          '💡 如果仍有問題，請嘗試使用獨立字幕視窗'
        ];
      } else if (error.name === 'NotReadableError') {
        guidance = '🔧 Teams音頻設備衝突解決：';
        actions = [
          '1. 暫時退出Teams會議（保持Teams頁面開啟）',
          '2. 重新載入Teams頁面 (F5)',
          '3. 啟動字幕功能並測試麥克風',
          '4. 確認字幕正常工作後，重新加入會議',
          '⚠️ 或者使用獨立字幕視窗避免衝突'
        ];
      } else if (error.name === 'NotFoundError') {
        guidance = '🔧 Teams音頻設備問題：';
        actions = [
          '1. 檢查麥克風是否正確連接',
          '2. 在Teams設定中測試麥克風',
          '3. 嘗試重新插拔麥克風設備',
          '4. 檢查Windows音頻設定',
          '5. 重新啟動瀏覽器'
        ];
      } else {
        guidance = '🔧 Teams環境一般解決方案：';
        actions = [
          '1. 刷新頁面並重新嘗試 (Ctrl+F5)',
          '2. 檢查Teams是否有聲音輸出',
          '3. 嘗試使用獨立字幕視窗模式',
          '4. 確保沒有其他應用佔用麥克風',
          '5. 如需協助請查看控制台錯誤訊息'
        ];
      }
      
      // 顯示主要指導信息
      this.showMessage(guidance, 'info');
      
      // 逐步顯示詳細步驟
      actions.forEach((action, index) => {
        setTimeout(() => {
          this.showMessage(action, 'info');
        }, (index + 1) * 1500);
      });
      
      // 最後顯示快捷鍵提示
      setTimeout(() => {
        this.showMessage('⌨️ 快捷鍵：Ctrl+Shift+W 開啟獨立字幕視窗', 'success');
      }, (actions.length + 1) * 1500);
      
    }, 2000);
  }

  async stopRecording() {
    console.log('🛑 停止錄音...');
    
    this.isRecording = false;
    
    try {
      if (this.speechEngine) {
        await this.speechEngine.stopRecognition();
    }
    
    this.showMessage('🛑 語音識別已停止', 'info');
      this.updateStatusBar();
    } catch (error) {
      console.error('停止語音識別時出錯:', error.message);
    }
  }

  async toggleRecording() {
    console.log('切換錄音狀態，當前狀態:', this.isRecording);
    
    if (this.isRecording) {
      await this.stopRecording();
      return true;
    } else {
      return await this.startRecording();
    }
  }

  hideSubtitles() {
    // 使用字幕核心隱藏字幕
    if (this.subtitleCore) {
      this.subtitleCore.hideContainer();
    }
  }

  clearSubtitles() {
    // 使用字幕核心清除字幕
    if (this.subtitleCore) {
      this.subtitleCore.clearAllSubtitles();
    }
    
    // 同時清除歷程記錄（如果需要）
    if (this.historyCore) {
      // 這裡可以選擇是否清除歷程，或者只清除顯示
      console.log('📚 字幕已清除，歷程記錄保留');
    }
  }

  createLivePanel(contentArea) {
    const livePanel = document.createElement('div');
    livePanel.className = 'subtitle-panel live-panel active';
    livePanel.innerHTML = `
      <div class="panel-header">
        <h3>📺 即時字幕</h3>
        <div class="live-controls">
          <button class="clear-live-btn">🗑️ 清除</button>
        </div>
      </div>
      <div class="live-content" id="liveContent">
        <div class="no-content">點擊開始錄音，即時顯示語音識別結果</div>
      </div>
    `;
    
    this.subtitlePanels.live = livePanel;
    contentArea.appendChild(livePanel);
  }

  createHistoryPanel(contentArea) {
    const historyPanel = document.createElement('div');
    historyPanel.className = 'subtitle-panel history-panel';
    historyPanel.innerHTML = `
      <div class="panel-header">
        <h3>📚 會話記錄</h3>
        <div class="history-controls">
          <button class="export-btn">📤 匯出</button>
          <button class="clear-history-btn">🗑️ 清除</button>
        </div>
      </div>
      <div class="history-content" id="historyContent">
        <div class="no-content">尚無會話記錄</div>
      </div>
    `;
    
    this.subtitlePanels.history = historyPanel;
    contentArea.appendChild(historyPanel);
  }

  createTranslationPanel(contentArea) {
    const translationPanel = document.createElement('div');
    translationPanel.className = 'subtitle-panel translation-panel';
    translationPanel.innerHTML = `
      <div class="panel-header">
        <h3>🌐 翻譯結果</h3>
        <div class="translation-controls">
          <select class="target-language-select" id="targetLanguageSelect">
            <option value="zh-tw">繁體中文</option>
            <option value="zh-cn">簡體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
          <button class="refresh-translation-btn">🔄 重新翻譯</button>
        </div>
      </div>
      <div class="translation-content" id="translationContent">
        <div class="no-content">翻譯結果將在此顯示</div>
      </div>
    `;
    
    this.subtitlePanels.translation = translationPanel;
    contentArea.appendChild(translationPanel);
  }

  setupEnhancedEventListeners() {
    // 視圖切換
    this.subtitleContainer.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-view');
        this.switchView(view);
      });
    });
    
    // 最小化/關閉
    this.subtitleContainer.querySelector('.minimize-btn').addEventListener('click', () => {
      this.minimizeContainer();
    });
    
    this.subtitleContainer.querySelector('.close-btn').addEventListener('click', () => {
      this.hideSubtitles();
    });
    
    // 面板內控制
    this.subtitleContainer.querySelector('.clear-live-btn').addEventListener('click', () => {
      this.clearLiveContent();
    });
    
    this.subtitleContainer.querySelector('.export-btn').addEventListener('click', () => {
      this.exportHistory();
    });
    
    this.subtitleContainer.querySelector('.clear-history-btn').addEventListener('click', () => {
      this.clearHistory();
    });
    
    this.subtitleContainer.querySelector('.refresh-translation-btn').addEventListener('click', () => {
      this.refreshTranslations();
    });
  }

  switchView(view) {
    // 更新按鈕狀態
    this.subtitleContainer.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.subtitleContainer.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // 切換面板顯示
    Object.values(this.subtitlePanels).forEach(panel => {
      panel.classList.remove('active');
    });
    
    if (this.subtitlePanels[view]) {
      this.subtitlePanels[view].classList.add('active');
    }
    
    this.currentView = view;
  }

  minimizeContainer() {
    if (this.subtitleContainer) {
      this.subtitleContainer.style.display = 'none';
      this.subtitleContainer.style.transform = 'translate(0, 0)'; // 重置位置
      this.subtitleContainer.style.width = 'auto'; // 恢復寬度
      this.subtitleContainer.style.height = 'auto'; // 恢復高度
      this.subtitleContainer.style.minWidth = '0'; // 最小寬度
      this.subtitleContainer.style.minHeight = '0'; // 最小高度
      this.subtitleContainer.style.maxWidth = 'none'; // 最大寬度
      this.subtitleContainer.style.maxHeight = 'none'; // 最大高度
      this.subtitleContainer.style.overflow = 'hidden'; // 隱藏溢出
      this.subtitleContainer.style.opacity = '0'; // 隱藏
      this.subtitleContainer.style.transition = 'all 0.3s ease-in-out';
      this.subtitleContainer.style.zIndex = '1'; // 確保在最上層
    }
  }

  maximizeContainer() {
    if (this.subtitleContainer) {
      this.subtitleContainer.style.display = 'block';
      this.subtitleContainer.style.transform = 'translate(0, 0)'; // 重置位置
      this.subtitleContainer.style.width = '100%'; // 最大化寬度
      this.subtitleContainer.style.height = '100%'; // 最大化高度
      this.subtitleContainer.style.minWidth = '0'; // 最小寬度
      this.subtitleContainer.style.minHeight = '0'; // 最小高度
      this.subtitleContainer.style.maxWidth = 'none'; // 最大寬度
      this.subtitleContainer.style.maxHeight = 'none'; // 最大高度
      this.subtitleContainer.style.overflow = 'auto'; // 允許滾動
      this.subtitleContainer.style.opacity = '1'; // 顯示
      this.subtitleContainer.style.transition = 'all 0.3s ease-in-out';
      this.subtitleContainer.style.zIndex = '1000'; // 確保在最上層
    }
  }

  clearLiveContent() {
    const liveContent = document.getElementById('liveContent');
    if (liveContent) {
      liveContent.innerHTML = '<div class="no-content">即時字幕已清除</div>';
    }
  }

  exportHistory() {
    if (this.sessionHistory.records.length === 0) {
      alert('沒有記錄可以匯出');
      return;
    }
    
    const content = this.sessionHistory.records.map(record => {
      const translations = record.translations.map(t => 
        `${this.getLanguageName(t.language)}: ${t.text}`
      ).join('\n  ');
      
      return `[${record.timestamp.toLocaleString()}] ${record.speakerInfo.speaker}\n原文: ${record.originalText}\n翻譯:\n  ${translations}\n---`;
    }).join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `會話記錄_${this.sessionHistory.sessionId}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearHistory() {
    if (confirm('確定要清除所有會話記錄嗎？')) {
      this.sessionHistory.records = [];
      this.updateHistoryPanel();
      this.updateStatusBar();
    }
  }

  refreshTranslations() {
    // 重新翻譯最近的幾條記錄
    const recentRecords = this.sessionHistory.records.slice(-5);
    
    recentRecords.forEach(async (record) => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'translate',
          text: record.originalText,
          targetLanguages: this.settings.targetLanguages || ['zh-tw', 'en']
        });
        
        if (response && response.success) {
          record.translations = response.data.translations;
          record.translationStatus = 'completed';
          
          // 更新顯示
          this.updateHistoryPanel();
          this.updateTranslationPanel(record);
        }
      } catch (error) {
        console.error('重新翻譯失敗:', error);
      }
    });
  }

  updateStatusBar() {
    // 使用歷程核心獲取統計數據
    let recordCount = 0;
    if (this.historyCore) {
      const stats = this.historyCore.getHistoryStats();
      recordCount = stats.sessionInfo.totalRecords;
    }
    
    // 更新狀態顯示
    const recordCountElement = this.subtitleContainer?.querySelector('.record-count');
    const recordingStatusElement = this.subtitleContainer?.querySelector('.recording-status');
    
    if (recordCountElement) {
      recordCountElement.textContent = `記錄：${recordCount}`;
    }
    
    if (recordingStatusElement) {
      recordingStatusElement.textContent = this.isRecording ? '🎤 錄音中' : '⏸️ 待機中';
    }
    
    console.log(`📊 狀態更新: ${recordCount} 條記錄, ${this.isRecording ? '錄音中' : '待機中'}`);
  }
}

// 全域應用實例
let speechApp = null;

// 監聽來自popup的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到訊息:', request);
  
  if (request.action === 'toggleRecording') {
    if (!speechApp) {
      console.log('初始化簡化版語音翻譯應用...');
      speechApp = new SpeechTranslationApp();
      
      // 等待初始化完成
      setTimeout(async () => {
        try {
          const success = await speechApp.toggleRecording();
          sendResponse({ 
            success: true, 
            isRecording: speechApp.isRecording,
            message: success ? '切換成功' : '啟動失敗'
          });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message,
            isRecording: false
          });
        }
      }, 1000); // 增加等待時間確保核心模組載入
      return true;
    } else {
      speechApp.toggleRecording().then(success => {
        sendResponse({ 
          success: true, 
          isRecording: speechApp.isRecording,
          message: success ? '切換成功' : '操作失敗'
        });
      }).catch(error => {
        sendResponse({ 
          success: false, 
          error: error.message,
          isRecording: false
        });
      });
      return true;
    }
  }
  
  if (request.action === 'hideSubtitles') {
    if (speechApp) {
      speechApp.hideSubtitles();
    }
    sendResponse({ success: true });
  }
  
  if (request.action === 'clearSubtitles') {
    if (speechApp) {
      speechApp.clearSubtitles();
    }
    sendResponse({ success: true });
  }
  
  if (request.action === 'updateSettings') {
    if (speechApp && speechApp.settingsManager) {
      console.log('📨 content.js收到設定更新:', request.settings);
      
      try {
        // 使用設定管理器更新設定
        const changedKeys = speechApp.settingsManager.updateSettings(request.settings);
        
        if (changedKeys.length > 0) {
          // 保存設定
          speechApp.settingsManager.saveSettings(false); // 不觸發通知，避免循環
          
          // 同步到本地
          speechApp.settings = speechApp.settingsManager.getAllSettings();
          
          // 更新核心模組設定
          if (speechApp.speechEngine) {
            speechApp.speechEngine.updateSettings(speechApp.settings);
          }
          if (speechApp.audioManager) {
            speechApp.audioManager.updateSettings(speechApp.settings);
          }
          
          // 更新狀態欄
          speechApp.updateStatusBar();
        }
        
        sendResponse({ success: true, changedKeys });
      } catch (error) {
        console.error('❌ 設定更新失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    } else {
      console.warn('⚠️ 語音應用或設定管理器未初始化');
      sendResponse({ success: false, error: '應用未初始化' });
    }
  }

  if (request.action === 'settingsUpdated') {
    console.log('📨 content.js收到設定更新通知:', request.settings);
    
    if (speechApp && speechApp.settingsManager) {
      // 異步處理設定重新載入
      speechApp.settingsManager.loadSettings().then(() => {
        // 同步到本地
        speechApp.settings = speechApp.settingsManager.getAllSettings();
        
        // 更新核心模組設定
        if (speechApp.speechEngine) {
          speechApp.speechEngine.updateSettings(speechApp.settings);
        }
        if (speechApp.audioManager) {
          speechApp.audioManager.updateSettings(speechApp.settings);
        }
        
        // 更新狀態欄
        speechApp.updateStatusBar();
        
    sendResponse({ success: true });
      }).catch(error => {
        console.error('❌ 設定重新載入失敗:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // 保持消息通道開放
    } else {
      sendResponse({ success: false, error: '應用未初始化' });
    }
  }
  
  if (request.action === 'checkStatus') {
    sendResponse({ 
      success: true, 
      isRecording: speechApp ? speechApp.isRecording : false,
      hasRecognition: speechApp ? !!speechApp.speechEngine : false
    });
  }
});

// 頁面載入完成後準備初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('頁面載入完成，準備簡化版語音翻譯功能');
  });
} else {
  console.log('頁面已載入，準備簡化版語音翻譯功能');
} 