// 歷程記錄核心模組
// 統一管理會話記錄、歷程顯示、匯出功能和數據持久化

class HistoryCore {
  constructor(options = {}) {
    // 會話管理
    this.sessionHistory = {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      records: [],
      totalDuration: 0,
      metadata: {
        version: '2.0',
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
    };
    
    // 歷程管理設定
    this.settings = {
      enableHistoryRecording: true,
      maxHistoryEntries: 1000,
      autoSaveInterval: 300000, // 5分鐘自動保存
      enableCloudSync: false,
      compressionEnabled: true,
      exportFormats: ['csv', 'json', 'txt'],
      retentionDays: 30,
      ...options
    };
    
    // 記錄索引和快取
    this.recordIndex = new Map(); // 快速查找記錄
    this.speakerIndex = new Map(); // 說話者索引
    this.timelineIndex = new Map(); // 時間軸索引
    
    // 統計數據
    this.statistics = {
      totalRecords: 0,
      totalSpeakers: 0,
      totalDuration: 0,
      averageRecordLength: 0,
      languageDistribution: {},
      translationStats: {}
    };
    
    // 自動保存機制
    this.autoSaveTimer = null;
    this.pendingChanges = false;
    this.lastSaveTime = Date.now();
    
    // 事件回調
    this.callbacks = {
      onRecordAdded: null,
      onRecordUpdated: null,
      onRecordDeleted: null,
      onHistoryCleared: null,
      onExportComplete: null,
      onError: null,
      onStatisticsUpdated: null
    };
    
    // 初始化
    this.initialize();
    
    console.log('📚 歷程記錄核心模組初始化完成');
  }

  // 設定回調函數
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // 初始化歷程記錄系統
  async initialize() {
    try {
      // 載入歷史會話
      await this.loadHistoryFromStorage();
      
      // 啟動自動保存
      if (this.settings.autoSaveInterval > 0) {
        this.startAutoSave();
      }
      
      // 清理過期記錄
      this.cleanupExpiredRecords();
      
      // 更新統計數據
      this.updateStatistics();
      
      console.log('📚 歷程記錄系統初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 歷程記錄系統初始化失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'initialize' });
      return false;
    }
  }

  // 生成會話ID
  generateSessionId() {
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = timestamp.toTimeString().slice(0, 8).replace(/:/g, '');
    const randomStr = Math.random().toString(36).substr(2, 6);
    
    return `session_${dateStr}_${timeStr}_${randomStr}`;
  }

  // 生成記錄ID
  generateRecordId() {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `record_${timestamp}_${randomStr}`;
  }

  // 記錄到歷程
  recordToHistory(originalText, options = {}) {
    if (!this.settings.enableHistoryRecording) {
      console.log('⏹️ 歷程記錄已禁用');
      return null;
    }

    try {
      const record = {
        id: options.recordId || this.generateRecordId(),
        timestamp: options.timestamp || new Date(),
        originalText: originalText,
        translations: {},
        recognitionEngine: options.recognitionEngine || 'unknown',
        language: options.language || 'auto',
        confidence: options.confidence || 0,
        speakerInfo: options.speakerInfo || null,
        subtitleId: options.subtitleId || null,
        metadata: {
          processingTime: 0,
          retryCount: 0,
          source: options.source || 'speech_recognition'
        }
      };

      // 添加到記錄
      this.sessionHistory.records.push(record);
      
      // 更新索引
      this.updateRecordIndex(record);
      
      // 檢查記錄數量限制
      this.enforceRecordLimit();
      
      // 標記變更
      this.markChanges();
      
      // 更新統計
      this.updateStatistics();
      
      console.log('📚 已記錄到歷程:', record.id);
      
      // 觸發回調
      this.emitCallback('onRecordAdded', { record });
      
      return record.id;
    } catch (error) {
      console.error('❌ 記錄到歷程失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'recordToHistory' });
      return null;
    }
  }

  // 更新記錄的翻譯
  updateHistoryTranslations(recordId, translations) {
    try {
      const record = this.findRecordById(recordId);
      if (!record) {
        console.warn('⚠️ 找不到記錄:', recordId);
        return false;
      }

      // 更新翻譯
      record.translations = { ...record.translations, ...translations };
      record.metadata.lastUpdated = new Date();
      
      // 更新索引
      this.updateRecordIndex(record);
      
      // 標記變更
      this.markChanges();
      
      // 更新統計
      this.updateStatistics();
      
      console.log('📚 已更新歷程翻譯:', recordId);
      
      // 觸發回調
      this.emitCallback('onRecordUpdated', { recordId, translations, record });
      
      return true;
    } catch (error) {
      console.error('❌ 更新歷程翻譯失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'updateHistoryTranslations' });
      return false;
    }
  }

  // 創建記錄條目（增強版）
  createRecordEntry(originalText, options = {}) {
    const timestamp = new Date();
    const recordId = this.generateRecordId();
    const subtitleId = options.subtitleId || `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const recordEntry = {
      id: recordId,
      subtitleId: subtitleId,
      timestamp: timestamp,
      originalText: originalText,
      confidence: options.confidence || 0,
      speakerInfo: options.speakerInfo || this.createDefaultSpeakerInfo(),
      recognitionStatus: 'recorded',
      translationStatus: 'pending',
      translations: {},
      processingStartTime: Date.now(),
      metadata: {
        source: options.source || 'speech_recognition',
        engine: options.engine || 'browser',
        language: options.language || 'auto'
      }
    };
    
    // 記錄到歷程
    const historyRecordId = this.recordToHistory(originalText, {
      recordId: recordId,
      timestamp: timestamp,
      subtitleId: subtitleId,
      speakerInfo: recordEntry.speakerInfo,
      recognitionEngine: recordEntry.metadata.engine,
      language: recordEntry.metadata.language,
      confidence: recordEntry.confidence
    });
    
    recordEntry.historyRecordId = historyRecordId;
    
    console.log('📝 記錄條目已創建:', recordEntry.id);
    return recordEntry;
  }

  // 創建預設說話者信息
  createDefaultSpeakerInfo() {
    return {
      speaker: '用戶',
      speakerId: 'default_user',
      isNewSpeaker: false,
      speakerChange: false
    };
  }

  // 查找記錄
  findRecordById(recordId) {
    return this.recordIndex.get(recordId) || 
           this.sessionHistory.records.find(r => r.id === recordId);
  }

  // 根據時間範圍查找記錄
  findRecordsByTimeRange(startTime, endTime) {
    return this.sessionHistory.records.filter(record => {
      const recordTime = new Date(record.timestamp);
      return recordTime >= startTime && recordTime <= endTime;
    });
  }

  // 根據說話者查找記錄
  findRecordsBySpeaker(speakerId) {
    return this.sessionHistory.records.filter(record => 
      record.speakerInfo && record.speakerInfo.speakerId === speakerId
    );
  }

  // 搜索記錄
  searchRecords(query, options = {}) {
    const { 
      searchType = 'text', // 'text', 'translation', 'both'
      caseSensitive = false,
      exactMatch = false,
      language = null
    } = options;
    
    const searchTerm = caseSensitive ? query : query.toLowerCase();
    
    return this.sessionHistory.records.filter(record => {
      let matches = false;
      
      // 搜索原文
      if (searchType === 'text' || searchType === 'both') {
        const originalText = caseSensitive ? record.originalText : record.originalText.toLowerCase();
        matches = exactMatch ? originalText === searchTerm : originalText.includes(searchTerm);
      }
      
      // 搜索翻譯
      if (!matches && (searchType === 'translation' || searchType === 'both')) {
        const translations = Object.values(record.translations || {});
        matches = translations.some(translation => {
          const translationText = caseSensitive ? translation : translation.toLowerCase();
          return exactMatch ? translationText === searchTerm : translationText.includes(searchTerm);
        });
      }
      
      // 語言過濾
      if (matches && language) {
        matches = record.language === language;
      }
      
      return matches;
    });
  }

  // 更新記錄索引
  updateRecordIndex(record) {
    this.recordIndex.set(record.id, record);
    
    // 更新說話者索引
    if (record.speakerInfo && record.speakerInfo.speakerId) {
      const speakerId = record.speakerInfo.speakerId;
      if (!this.speakerIndex.has(speakerId)) {
        this.speakerIndex.set(speakerId, []);
      }
      this.speakerIndex.get(speakerId).push(record.id);
    }
    
    // 更新時間軸索引
    const timeKey = new Date(record.timestamp).toDateString();
    if (!this.timelineIndex.has(timeKey)) {
      this.timelineIndex.set(timeKey, []);
    }
    this.timelineIndex.get(timeKey).push(record.id);
  }

  // 強制記錄數量限制
  enforceRecordLimit() {
    const maxRecords = this.settings.maxHistoryEntries;
    if (this.sessionHistory.records.length > maxRecords) {
      const recordsToRemove = this.sessionHistory.records.length - maxRecords;
      const removedRecords = this.sessionHistory.records.splice(0, recordsToRemove);
      
      // 從索引中移除
      removedRecords.forEach(record => {
        this.recordIndex.delete(record.id);
      });
      
      console.log(`📚 已移除 ${recordsToRemove} 條舊記錄以符合限制`);
    }
  }

  // 清理過期記錄
  cleanupExpiredRecords() {
    if (this.settings.retentionDays <= 0) return;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.settings.retentionDays);
    
    const initialCount = this.sessionHistory.records.length;
    this.sessionHistory.records = this.sessionHistory.records.filter(record => {
      const recordDate = new Date(record.timestamp);
      const shouldKeep = recordDate >= cutoffDate;
      
      if (!shouldKeep) {
        this.recordIndex.delete(record.id);
      }
      
      return shouldKeep;
    });
    
    const removedCount = initialCount - this.sessionHistory.records.length;
    if (removedCount > 0) {
      console.log(`📚 已清理 ${removedCount} 條過期記錄`);
      this.markChanges();
    }
  }

  // 更新統計數據
  updateStatistics() {
    const records = this.sessionHistory.records;
    
    this.statistics = {
      totalRecords: records.length,
      totalSpeakers: this.speakerIndex.size,
      totalDuration: this.calculateTotalDuration(),
      averageRecordLength: this.calculateAverageRecordLength(),
      languageDistribution: this.calculateLanguageDistribution(),
      translationStats: this.calculateTranslationStats(),
      lastUpdated: new Date()
    };
    
    // 觸發回調
    this.emitCallback('onStatisticsUpdated', { statistics: this.statistics });
  }

  // 計算總持續時間
  calculateTotalDuration() {
    if (this.sessionHistory.records.length === 0) return 0;
    
    const firstRecord = this.sessionHistory.records[0];
    const lastRecord = this.sessionHistory.records[this.sessionHistory.records.length - 1];
    
    return new Date(lastRecord.timestamp) - new Date(firstRecord.timestamp);
  }

  // 計算平均記錄長度
  calculateAverageRecordLength() {
    if (this.sessionHistory.records.length === 0) return 0;
    
    const totalLength = this.sessionHistory.records.reduce((sum, record) => 
      sum + record.originalText.length, 0
    );
    
    return Math.round(totalLength / this.sessionHistory.records.length);
  }

  // 計算語言分佈
  calculateLanguageDistribution() {
    const distribution = {};
    
    this.sessionHistory.records.forEach(record => {
      const language = record.language || 'unknown';
      distribution[language] = (distribution[language] || 0) + 1;
    });
    
    return distribution;
  }

  // 計算翻譯統計
  calculateTranslationStats() {
    const stats = {
      totalTranslations: 0,
      languagePairs: {},
      avgTranslationLength: 0
    };
    
    let totalTranslationLength = 0;
    
    this.sessionHistory.records.forEach(record => {
      const translations = Object.entries(record.translations || {});
      stats.totalTranslations += translations.length;
      
      translations.forEach(([lang, text]) => {
        const pair = `${record.language || 'auto'} → ${lang}`;
        stats.languagePairs[pair] = (stats.languagePairs[pair] || 0) + 1;
        totalTranslationLength += text.length;
      });
    });
    
    if (stats.totalTranslations > 0) {
      stats.avgTranslationLength = Math.round(totalTranslationLength / stats.totalTranslations);
    }
    
    return stats;
  }

  // 匯出為 CSV
  exportAsCsv() {
    try {
      const headers = ['時間戳', '原文', '語言', '信心度', '說話者', '翻譯'];
      const rows = [headers];
      
      this.sessionHistory.records.forEach(record => {
        const translations = Object.entries(record.translations || {})
          .map(([lang, text]) => `${lang}: ${text}`)
          .join(' | ');
        
        rows.push([
          new Date(record.timestamp).toLocaleString(),
          record.originalText,
          record.language || 'auto',
          record.confidence || 0,
          record.speakerInfo?.speaker || '未知',
          translations
        ]);
      });
      
      const csvContent = rows.map(row => 
        row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      
      const filename = `subtitle_history_${this.sessionHistory.sessionId}_${new Date().toISOString().slice(0, 10)}.csv`;
      this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
      
      console.log('📤 CSV 匯出完成:', filename);
      
      // 觸發回調
      this.emitCallback('onExportComplete', { format: 'csv', filename, recordCount: this.sessionHistory.records.length });
      
      return true;
    } catch (error) {
      console.error('❌ CSV 匯出失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'exportAsCsv' });
      return false;
    }
  }

  // 匯出為 JSON
  exportAsJson() {
    try {
      const exportData = {
        version: '2.0',
        exportTime: new Date().toISOString(),
        sessionInfo: {
          sessionId: this.sessionHistory.sessionId,
          startTime: this.sessionHistory.startTime,
          totalRecords: this.sessionHistory.records.length,
          metadata: this.sessionHistory.metadata
        },
        statistics: this.statistics,
        records: this.sessionHistory.records
      };
      
      const jsonContent = JSON.stringify(exportData, null, 2);
      const filename = `subtitle_history_${this.sessionHistory.sessionId}_${new Date().toISOString().slice(0, 10)}.json`;
      this.downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
      
      console.log('📤 JSON 匯出完成:', filename);
      
      // 觸發回調
      this.emitCallback('onExportComplete', { format: 'json', filename, recordCount: this.sessionHistory.records.length });
      
      return true;
    } catch (error) {
      console.error('❌ JSON 匯出失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'exportAsJson' });
      return false;
    }
  }

  // 匯出為純文字
  exportAsText() {
    try {
      const lines = [];
      lines.push(`會話記錄 - ${this.sessionHistory.sessionId}`);
      lines.push(`匯出時間: ${new Date().toLocaleString()}`);
      lines.push(`總記錄數: ${this.sessionHistory.records.length}`);
      lines.push('=' .repeat(50));
      lines.push('');
      
      this.sessionHistory.records.forEach((record, index) => {
        lines.push(`${index + 1}. [${new Date(record.timestamp).toLocaleString()}] ${record.speakerInfo?.speaker || '用戶'}`);
        lines.push(`   原文: ${record.originalText}`);
        
        const translations = Object.entries(record.translations || {});
        if (translations.length > 0) {
          lines.push('   翻譯:');
          translations.forEach(([lang, text]) => {
            lines.push(`     ${lang}: ${text}`);
          });
        }
        
        lines.push('');
      });
      
      const textContent = lines.join('\n');
      const filename = `subtitle_history_${this.sessionHistory.sessionId}_${new Date().toISOString().slice(0, 10)}.txt`;
      this.downloadFile(textContent, filename, 'text/plain;charset=utf-8;');
      
      console.log('📤 文字匯出完成:', filename);
      
      // 觸發回調
      this.emitCallback('onExportComplete', { format: 'txt', filename, recordCount: this.sessionHistory.records.length });
      
      return true;
    } catch (error) {
      console.error('❌ 文字匯出失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'exportAsText' });
      return false;
    }
  }

  // 下載檔案
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  // 清除歷程
  clearHistory() {
    try {
      const recordCount = this.sessionHistory.records.length;
      
      // 清除記錄
      this.sessionHistory.records = [];
      this.sessionHistory.startTime = new Date();
      
      // 清除索引
      this.recordIndex.clear();
      this.speakerIndex.clear();
      this.timelineIndex.clear();
      
      // 重置統計
      this.updateStatistics();
      
      // 標記變更
      this.markChanges();
      
      console.log('🧹 歷程記錄已清除');
      
      // 觸發回調
      this.emitCallback('onHistoryCleared', { clearedRecords: recordCount, timestamp: new Date() });
      
      return true;
    } catch (error) {
      console.error('❌ 清除歷程失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'clearHistory' });
      return false;
    }
  }

  // 刪除單條記錄
  deleteRecord(recordId) {
    try {
      const recordIndex = this.sessionHistory.records.findIndex(r => r.id === recordId);
      if (recordIndex === -1) {
        console.warn('⚠️ 找不到要刪除的記錄:', recordId);
        return false;
      }
      
      const deletedRecord = this.sessionHistory.records.splice(recordIndex, 1)[0];
      
      // 從索引中移除
      this.recordIndex.delete(recordId);
      
      // 更新統計
      this.updateStatistics();
      
      // 標記變更
      this.markChanges();
      
      console.log('🗑️ 記錄已刪除:', recordId);
      
      // 觸發回調
      this.emitCallback('onRecordDeleted', { recordId, record: deletedRecord });
      
      return true;
    } catch (error) {
      console.error('❌ 刪除記錄失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'deleteRecord' });
      return false;
    }
  }

  // 從存儲載入歷程
  async loadHistoryFromStorage() {
    try {
      // 這裡可以實現從 Chrome Storage 或 IndexedDB 載入歷程
      console.log('📖 載入歷程記錄...');
      // 實現存儲載入邏輯
      return true;
    } catch (error) {
      console.error('❌ 載入歷程記錄失敗:', error);
      return false;
    }
  }

  // 保存歷程到存儲
  async saveHistoryToStorage() {
    try {
      // 這裡可以實現保存到 Chrome Storage 或 IndexedDB
      console.log('💾 保存歷程記錄...');
      // 實現存儲保存邏輯
      this.lastSaveTime = Date.now();
      this.pendingChanges = false;
      return true;
    } catch (error) {
      console.error('❌ 保存歷程記錄失敗:', error);
      return false;
    }
  }

  // 標記變更
  markChanges() {
    this.pendingChanges = true;
  }

  // 啟動自動保存
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      if (this.pendingChanges) {
        this.saveHistoryToStorage();
      }
    }, this.settings.autoSaveInterval);
  }

  // 停止自動保存
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // 更新設定
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // 重新啟動自動保存
    if (this.settings.autoSaveInterval > 0) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
    }
    
    console.log('⚙️ 歷程核心設定已更新:', newSettings);
  }

  // 獲取歷程統計
  getHistoryStats() {
    return {
      ...this.statistics,
      sessionInfo: {
        sessionId: this.sessionHistory.sessionId,
        startTime: this.sessionHistory.startTime,
        totalRecords: this.sessionHistory.records.length
      },
      storageInfo: {
        lastSaveTime: this.lastSaveTime,
        pendingChanges: this.pendingChanges,
        autoSaveEnabled: !!this.autoSaveTimer
      }
    };
  }

  // 觸發回調事件
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
    console.log('🧹 清理歷程記錄核心模組資源');
    
    // 停止自動保存
    this.stopAutoSave();
    
    // 保存待處理的變更
    if (this.pendingChanges) {
      this.saveHistoryToStorage();
    }
    
    // 清除記錄和索引
    this.sessionHistory.records = [];
    this.recordIndex.clear();
    this.speakerIndex.clear();
    this.timelineIndex.clear();
    
    // 清除回調
    this.callbacks = {};
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HistoryCore;
} else {
  window.HistoryCore = HistoryCore;
}