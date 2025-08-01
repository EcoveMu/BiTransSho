// 設定管理核心模組
// 統一管理設定加載、保存、驗證、遷移和同步

class SettingsManager {
  constructor(options = {}) {
    // 預設設定結構
    this.defaultSettings = {
      // 翻譯設定
      translationProvider: 'free',
      microsoftApiKey: '',
      openaiApiKey: '',
      microsoftRegion: 'eastus',
      targetLanguages: ['zh-tw', 'en'],
      
      // 語音識別設定  
      speechRecognitionLanguage: 'zh-TW',
      speechRecognitionEngine: 'browser',
      audioInputDevice: 'default',
      
      // 進階設定
      enableHistoryRecording: true,
      confidenceThreshold: 0.6,
      enableTextCorrection: true,
      enableSpeakerDiarization: true,
      speakerChangeThreshold: 2.0,
      showSpeakerStats: true,
      
      // UI 設定
      subtitlePosition: 'bottom',
      fontSize: 16,
      maxSubtitleLines: 3,
      autoHideSubtitles: false,
      
      // 系統設定
      enableAutoSave: true,
      backupInterval: 300000, // 5分鐘
      maxHistoryEntries: 1000,
      
      // 舊版兼容
      microsoftKey: '',
      openaiKey: '',
      translationApiKey: ''
    };
    
    // 當前設定
    this.currentSettings = { ...this.defaultSettings };
    
    // 設定變更監聽器
    this.listeners = new Set();
    
    // 設定同步狀態
    this.isSyncing = false;
    this.lastSyncTime = 0;
    
    // API 金鑰驗證快取
    this.keyValidationCache = new Map();
    
    // 事件回調
    this.callbacks = {
      onSettingsChanged: null,
      onMigrationComplete: null,
      onValidationError: null,
      onSyncComplete: null
    };
    
    // 初始化設定
    this.initialize(options);
  }

  // 設定事件回調
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // 初始化設定管理器
  async initialize(options = {}) {
    console.log('🔧 初始化設定管理器');
    
    try {
      // 設定模組選項
      if (options.enableAutoMigration !== false) {
        this.enableAutoMigration = true;
      }
      
      if (options.enableAutoSync !== false) {
        this.enableAutoSync = true;
      }
      
      // 載入設定
      await this.loadSettings();
      
      // 設定存儲監聽器
      this.setupStorageListener();
      
      console.log('✅ 設定管理器初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 設定管理器初始化失敗:', error);
      throw error;
    }
  }

  // 載入設定
  async loadSettings() {
    console.log('📖 載入設定...');
    
    try {
      // 獲取所有可能的設定鍵
      const allKeys = this.getAllSettingKeys();
      const result = await chrome.storage.sync.get(allKeys);
      
      console.log('🔍 從存儲載入的原始設定:', result);
      
      // 檢查是否需要遷移
      const needsMigration = this.checkMigrationNeeded(result);
      if (needsMigration) {
        console.log('🔄 檢測到需要設定遷移');
        await this.migrateSettings(result);
      }
      
      // 合併設定，優先使用儲存的值
      this.currentSettings = this.mergeSettings(result);
      
      // 驗證設定
      this.validateSettings();
      
      // 如果發生了變更，保存回去
      if (needsMigration) {
        await this.saveSettings(false); // 不觸發通知，避免循環
      }
      
      console.log('✅ 設定載入完成:', this.currentSettings);
      
      // 觸發回調
      this.emitCallback('onSyncComplete', this.currentSettings);
      
      return this.currentSettings;
    } catch (error) {
      console.error('❌ 載入設定失敗:', error);
      
      // 使用預設設定
      this.currentSettings = { ...this.defaultSettings };
      throw error;
    }
  }

  // 保存設定
  async saveSettings(notify = true) {
    if (this.isSyncing) {
      console.log('⏳ 設定同步中，跳過保存請求');
      return;
    }

    console.log('💾 保存設定...');
    this.isSyncing = true;
    
    try {
      // 驗證設定
      this.validateSettings();
      
      // 準備要保存的設定（移除不需要存儲的字段）
      const settingsToSave = this.prepareSettingsForStorage();
      
      console.log('📋 準備保存的設定:', settingsToSave);
      
      // 保存到 Chrome Storage
      await chrome.storage.sync.set(settingsToSave);
      
      this.lastSyncTime = Date.now();
      
      console.log('✅ 設定保存成功');
      
      // 通知變更
      if (notify) {
        this.notifySettingsChanged();
      }
      
      // 觸發回調
      this.emitCallback('onSyncComplete', this.currentSettings);
      
      return true;
    } catch (error) {
      console.error('❌ 保存設定失敗:', error);
      this.emitCallback('onValidationError', { error: error.message });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // 獲取設定值
  get(key, defaultValue = null) {
    if (key in this.currentSettings) {
      return this.currentSettings[key];
    }
    
    if (key in this.defaultSettings) {
      return this.defaultSettings[key];
    }
    
    return defaultValue;
  }

  // 設定設定值
  set(key, value) {
    if (key in this.defaultSettings) {
      const oldValue = this.currentSettings[key];
      this.currentSettings[key] = value;
      
      console.log(`🔧 設定更新: ${key} = ${value} (舊值: ${oldValue})`);
      
      // 即時驗證
      this.validateSingleSetting(key, value);
      
      return true;
    } else {
      console.warn(`⚠️ 未知的設定鍵: ${key}`);
      return false;
    }
  }

  // 批量更新設定
  updateSettings(newSettings) {
    const changedKeys = [];
    
    for (const [key, value] of Object.entries(newSettings)) {
      if (key in this.defaultSettings) {
        const oldValue = this.currentSettings[key];
        if (oldValue !== value) {
          this.currentSettings[key] = value;
          changedKeys.push(key);
          console.log(`🔧 設定更新: ${key} = ${value} (舊值: ${oldValue})`);
        }
      } else {
        console.warn(`⚠️ 忽略未知設定鍵: ${key}`);
      }
    }
    
    if (changedKeys.length > 0) {
      console.log(`📝 批量更新完成，變更了 ${changedKeys.length} 個設定:`, changedKeys);
      
      // 驗證變更的設定
      changedKeys.forEach(key => {
        this.validateSingleSetting(key, this.currentSettings[key]);
      });
    }
    
    return changedKeys;
  }

  // 重置設定
  resetSettings(keys = null) {
    if (keys === null) {
      // 重置所有設定
      this.currentSettings = { ...this.defaultSettings };
      console.log('🔄 重置所有設定為預設值');
    } else if (Array.isArray(keys)) {
      // 重置指定設定
      keys.forEach(key => {
        if (key in this.defaultSettings) {
          this.currentSettings[key] = this.defaultSettings[key];
          console.log(`🔄 重置設定: ${key} = ${this.defaultSettings[key]}`);
        }
      });
    }
  }

  // 獲取所有設定
  getAllSettings() {
    return { ...this.currentSettings };
  }

  // 檢查是否需要遷移
  checkMigrationNeeded(loadedSettings) {
    // 檢查舊版 API 金鑰
    const hasOldMicrosoftKey = loadedSettings.microsoftKey && !loadedSettings.microsoftApiKey;
    const hasOldOpenaiKey = loadedSettings.openaiKey && !loadedSettings.openaiApiKey;
    const hasOldTranslationKey = loadedSettings.translationApiKey && !loadedSettings.microsoftApiKey;
    
    // 檢查舊版翻譯提供者設定
    const hasOldProvider = loadedSettings.translationProvider === 'google';
    
    return hasOldMicrosoftKey || hasOldOpenaiKey || hasOldTranslationKey || hasOldProvider;
  }

  // 遷移舊版設定
  async migrateSettings(loadedSettings) {
    console.log('🔄 開始設定遷移...');
    
    const migrations = [];
    
    // 遷移 API 金鑰
    if (loadedSettings.microsoftKey && !loadedSettings.microsoftApiKey) {
      loadedSettings.microsoftApiKey = loadedSettings.microsoftKey;
      migrations.push('Microsoft API Key');
    }
    
    if (loadedSettings.openaiKey && !loadedSettings.openaiApiKey) {
      loadedSettings.openaiApiKey = loadedSettings.openaiKey;
      migrations.push('OpenAI API Key');
    }
    
    if (loadedSettings.translationApiKey && !loadedSettings.microsoftApiKey) {
      loadedSettings.microsoftApiKey = loadedSettings.translationApiKey;
      migrations.push('Translation API Key → Microsoft API Key');
    }
    
    // 遷移翻譯提供者
    if (loadedSettings.translationProvider === 'google') {
      loadedSettings.translationProvider = 'free';
      migrations.push('Google Translate → Free Translation');
    }
    
    // 新增缺失的預設設定
    for (const [key, defaultValue] of Object.entries(this.defaultSettings)) {
      if (!(key in loadedSettings)) {
        loadedSettings[key] = defaultValue;
        migrations.push(`新增預設設定: ${key}`);
      }
    }
    
    if (migrations.length > 0) {
      console.log('✅ 設定遷移完成:', migrations);
      this.emitCallback('onMigrationComplete', { migrations, settings: loadedSettings });
    }
    
    return loadedSettings;
  }

  // 合併設定
  mergeSettings(loadedSettings) {
    const merged = { ...this.defaultSettings };
    
    // 合併載入的設定，忽略無效值
    for (const [key, value] of Object.entries(loadedSettings)) {
      if (key in merged && value !== undefined && value !== null) {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  // 驗證設定
  validateSettings() {
    const errors = [];
    
    // 驗證語言設定
    if (!this.isValidLanguage(this.currentSettings.speechRecognitionLanguage)) {
      errors.push(`無效的語音識別語言: ${this.currentSettings.speechRecognitionLanguage}`);
      this.currentSettings.speechRecognitionLanguage = this.defaultSettings.speechRecognitionLanguage;
    }
    
    // 驗證引擎設定
    if (!['browser', 'whisper'].includes(this.currentSettings.speechRecognitionEngine)) {
      errors.push(`無效的語音識別引擎: ${this.currentSettings.speechRecognitionEngine}`);
      this.currentSettings.speechRecognitionEngine = this.defaultSettings.speechRecognitionEngine;
    }
    
    // 驗證翻譯提供者
    if (!['free', 'microsoft', 'openai'].includes(this.currentSettings.translationProvider)) {
      errors.push(`無效的翻譯提供者: ${this.currentSettings.translationProvider}`);
      this.currentSettings.translationProvider = this.defaultSettings.translationProvider;
    }
    
    // 驗證數值範圍
    if (this.currentSettings.confidenceThreshold < 0 || this.currentSettings.confidenceThreshold > 1) {
      errors.push(`信心度閾值超出範圍: ${this.currentSettings.confidenceThreshold}`);
      this.currentSettings.confidenceThreshold = this.defaultSettings.confidenceThreshold;
    }
    
    if (this.currentSettings.speakerChangeThreshold < 0.5 || this.currentSettings.speakerChangeThreshold > 10) {
      errors.push(`說話者切換閾值超出範圍: ${this.currentSettings.speakerChangeThreshold}`);
      this.currentSettings.speakerChangeThreshold = this.defaultSettings.speakerChangeThreshold;
    }
    
    // 驗證目標語言
    if (!Array.isArray(this.currentSettings.targetLanguages) || this.currentSettings.targetLanguages.length === 0) {
      errors.push('目標語言設定無效');
      this.currentSettings.targetLanguages = this.defaultSettings.targetLanguages;
    }
    
    if (errors.length > 0) {
      console.warn('⚠️ 設定驗證發現問題:', errors);
      this.emitCallback('onValidationError', { errors });
    }
    
    return errors.length === 0;
  }

  // 驗證單一設定
  validateSingleSetting(key, value) {
    switch (key) {
      case 'speechRecognitionLanguage':
        if (!this.isValidLanguage(value)) {
          throw new Error(`無效的語音識別語言: ${value}`);
        }
        break;
        
      case 'speechRecognitionEngine':
        if (!['browser', 'whisper'].includes(value)) {
          throw new Error(`無效的語音識別引擎: ${value}`);
        }
        break;
        
      case 'translationProvider':
        if (!['free', 'microsoft', 'openai'].includes(value)) {
          throw new Error(`無效的翻譯提供者: ${value}`);
        }
        break;
        
      case 'confidenceThreshold':
        if (typeof value !== 'number' || value < 0 || value > 1) {
          throw new Error(`信心度閾值必須在0-1之間: ${value}`);
        }
        break;
        
      case 'speakerChangeThreshold':
        if (typeof value !== 'number' || value < 0.5 || value > 10) {
          throw new Error(`說話者切換閾值必須在0.5-10之間: ${value}`);
        }
        break;
        
      case 'targetLanguages':
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error('目標語言必須是非空陣列');
        }
        break;
    }
  }

  // 驗證 API 金鑰
  async validateApiKey(provider, apiKey) {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API 金鑰為空' };
    }
    
    // 檢查快取
    const cacheKey = `${provider}_${apiKey}`;
    if (this.keyValidationCache.has(cacheKey)) {
      const cached = this.keyValidationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5分鐘快取
        return cached.result;
      }
    }
    
    try {
      let isValid = false;
      
      switch (provider) {
        case 'microsoft':
          isValid = await this.validateMicrosoftKey(apiKey);
          break;
          
        case 'openai':
          isValid = await this.validateOpenAIKey(apiKey);
          break;
          
        default:
          return { valid: false, error: '不支援的提供者' };
      }
      
      const result = { valid: isValid, error: isValid ? null : 'API 金鑰無效' };
      
      // 快取結果
      this.keyValidationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      const result = { valid: false, error: error.message };
      this.keyValidationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      return result;
    }
  }

  // 驗證 Microsoft API 金鑰
  async validateMicrosoftKey(apiKey) {
    const testEndpoint = 'https://api.cognitive.microsofttranslator.com/languages?api-version=3.0';
    
    try {
      const response = await fetch(testEndpoint, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Ocp-Apim-Subscription-Region': this.currentSettings.microsoftRegion
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Microsoft API 金鑰驗證失敗:', error);
      return false;
    }
  }

  // 驗證 OpenAI API 金鑰
  async validateOpenAIKey(apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('OpenAI API 金鑰驗證失敗:', error);
      return false;
    }
  }

  // 檢查語言代碼是否有效
  isValidLanguage(langCode) {
    const validLanguages = [
      'zh-TW', 'zh-CN', 'zh', 'en-US', 'en', 'ja-JP', 'ja', 
      'ko-KR', 'ko', 'fr-FR', 'fr', 'de-DE', 'de', 'es-ES', 'es',
      'it-IT', 'it', 'pt-PT', 'pt', 'ru-RU', 'ru', 'auto'
    ];
    return validLanguages.includes(langCode);
  }

  // 準備要存儲的設定
  prepareSettingsForStorage() {
    const settings = { ...this.currentSettings };
    
    // 移除不需要存儲的運行時字段
    delete settings.isSyncing;
    delete settings.lastSyncTime;
    
    return settings;
  }

  // 獲取所有設定鍵
  getAllSettingKeys() {
    return Object.keys(this.defaultSettings);
  }

  // 設定存儲變更監聽器
  setupStorageListener() {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && !this.isSyncing) {
          console.log('📡 檢測到外部設定變更:', changes);
          this.handleExternalSettingsChange(changes);
        }
      });
    }
  }

  // 處理外部設定變更
  async handleExternalSettingsChange(changes) {
    const relevantChanges = {};
    
    // 篩選相關的設定變更
    for (const [key, change] of Object.entries(changes)) {
      if (key in this.defaultSettings) {
        relevantChanges[key] = change.newValue;
      }
    }
    
    if (Object.keys(relevantChanges).length > 0) {
      console.log('🔄 同步外部設定變更:', relevantChanges);
      
      // 更新本地設定
      this.updateSettings(relevantChanges);
      
      // 驗證設定
      this.validateSettings();
      
      // 通知變更
      this.notifySettingsChanged(relevantChanges);
    }
  }

  // 註冊設定變更監聽器
  addSettingsListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 通知設定變更
  notifySettingsChanged(changedSettings = null) {
    const notification = {
      settings: this.getAllSettings(),
      changedSettings: changedSettings || {},
      timestamp: Date.now()
    };
    
    console.log('📢 通知設定變更:', notification);
    
    // 通知所有監聽器
    this.listeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('設定變更監聽器錯誤:', error);
      }
    });
    
    // 觸發回調
    this.emitCallback('onSettingsChanged', notification);
  }

  // 匯出設定
  exportSettings() {
    const exportData = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      settings: this.getAllSettings()
    };
    
    console.log('📤 匯出設定:', exportData);
    return exportData;
  }

  // 匯入設定
  async importSettings(importData) {
    try {
      if (!importData || !importData.settings) {
        throw new Error('匯入數據格式無效');
      }
      
      console.log('📥 匯入設定:', importData);
      
      // 驗證並合併設定
      const validSettings = {};
      for (const [key, value] of Object.entries(importData.settings)) {
        if (key in this.defaultSettings) {
          validSettings[key] = value;
        }
      }
      
      // 批量更新設定
      this.updateSettings(validSettings);
      
      // 驗證設定
      this.validateSettings();
      
      // 保存設定
      await this.saveSettings();
      
      console.log('✅ 設定匯入完成');
      return true;
    } catch (error) {
      console.error('❌ 設定匯入失敗:', error);
      throw error;
    }
  }

  // 發出回調事件
  emitCallback(eventName, data) {
    if (this.callbacks[eventName]) {
      try {
        this.callbacks[eventName](data);
      } catch (error) {
        console.error(`回調事件 ${eventName} 執行失敗:`, error);
      }
    }
  }

  // 清理資源
  destroy() {
    console.log('🧹 清理設定管理器資源');
    
    this.listeners.clear();
    this.keyValidationCache.clear();
    this.callbacks = {};
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsManager;
} else {
  window.SettingsManager = SettingsManager;
}