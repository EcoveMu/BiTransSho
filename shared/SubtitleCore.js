// 字幕處理核心模組
// 統一管理字幕顯示、渲染、格式化和布局邏輯

class SubtitleCore {
  constructor(options = {}) {
    // 字幕容器和相關元素
    this.container = null;
    this.content = null;
    
    // 字幕管理設定
    this.settings = {
      maxSubtitleLines: 50,
      autoScroll: true,
      showTimestamp: true,
      showSpeakerInfo: true,
      enableInterimResults: true,
      subtitleAnimations: true,
      fontSize: 16,
      lineHeight: 1.4,
      fadeOutOldSubtitles: true,
      maxDisplayTime: 300000, // 5分鐘後淡出
      ...options
    };
    
    // 字幕狀態管理
    this.subtitleItems = new Map();
    this.interimSubtitle = null;
    this.lastSubtitleTime = Date.now();
    
    // 語言名稱映射
    this.languageNames = {
      'zh-tw': '繁體中文',
      'zh-cn': '簡體中文', 
      'zh': '中文',
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어',
      'fr': 'Français',
      'de': 'Deutsch',
      'es': 'Español',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Русский',
      'auto': '自動檢測'
    };
    
    // 說話者顏色池
    this.speakerColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    this.speakerColorIndex = 0;
    
    // 事件回調
    this.callbacks = {
      onSubtitleDisplayed: null,
      onSubtitleUpdated: null,
      onSubtitleCleared: null,
      onError: null,
      onContainerReady: null
    };
    
    // 字幕動畫和效果
    this.animationQueue = [];
    this.isProcessingAnimations = false;
    
    console.log('🎬 字幕核心模組初始化完成');
  }

  // 設定回調函數
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // 初始化字幕容器
  initializeContainer(containerId, options = {}) {
    try {
      // 查找或創建容器
      this.container = document.getElementById(containerId);
      if (!this.container) {
        this.container = this.createSubtitleContainer(containerId, options);
      }
      
      // 初始化內容區域
      this.content = this.container.querySelector('.subtitle-content') || this.createContentArea();
      
      // 應用樣式設定
      this.applyContainerStyles(options);
      
      // 設定事件監聽器
      this.setupEventListeners();
      
      console.log('🎬 字幕容器初始化完成:', containerId);
      
      // 觸發回調
      this.emitCallback('onContainerReady', { container: this.container, content: this.content });
      
      return true;
    } catch (error) {
      console.error('❌ 字幕容器初始化失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'initializeContainer' });
      return false;
    }
  }

  // 創建字幕容器
  createSubtitleContainer(containerId, options) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'subtitle-container';
    
    // 設定基本樣式
    container.style.cssText = `
      position: fixed;
      bottom: ${options.bottom || '20px'};
      left: ${options.left || '50%'};
      transform: translateX(-50%);
      max-width: ${options.maxWidth || '90%'};
      max-height: ${options.maxHeight || '40%'};
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 8px;
      padding: 12px;
      z-index: ${options.zIndex || '10000'};
      font-family: 'Microsoft JhengHei', 'Arial', sans-serif;
      font-size: ${this.settings.fontSize}px;
      line-height: ${this.settings.lineHeight};
      display: none;
      overflow-y: auto;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(container);
    return container;
  }

  // 創建內容區域
  createContentArea() {
    const content = document.createElement('div');
    content.className = 'subtitle-content';
    content.style.cssText = `
      max-height: 300px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    `;
    
    this.container.appendChild(content);
    return content;
  }

  // 應用容器樣式
  applyContainerStyles(options) {
    if (!this.container) return;
    
    // 字體大小
    if (this.settings.fontSize) {
      this.container.style.fontSize = `${this.settings.fontSize}px`;
    }
    
    // 行高
    if (this.settings.lineHeight) {
      this.container.style.lineHeight = this.settings.lineHeight;
    }
    
    // 動畫效果
    if (this.settings.subtitleAnimations) {
      this.container.style.transition = 'all 0.3s ease';
    }
  }

  // 設定事件監聽器
  setupEventListeners() {
    if (!this.container) return;
    
    // 鼠標懸停效果
    this.container.addEventListener('mouseenter', () => {
      this.container.style.opacity = '0.9';
    });
    
    this.container.addEventListener('mouseleave', () => {
      this.container.style.opacity = '1';
    });
    
    // 滾輪事件
    this.content.addEventListener('wheel', (e) => {
      e.stopPropagation();
    });
  }

  // 顯示原文字幕（帶說話者信息）
  displayOriginalTextWithSpeaker(text, subtitleId, recordId, speakerInfo = null) {
    if (!this.container || !this.content) {
      console.warn('⚠️ 字幕容器未初始化');
      return null;
    }

    try {
      // 創建字幕元素
      const subtitleElement = this.createSubtitleElement(subtitleId, 'original');
      
      // 處理說話者信息
      const { speakerPrefix, speakerStyle } = this.processSpeakerInfo(speakerInfo);
      
      // 構建字幕內容
      subtitleElement.innerHTML = `
        <div class="subtitle-content-wrapper" ${speakerStyle}>
          <div class="original-text">${speakerPrefix}${text}</div>
          <div class="translated-text loading">
            <div class="loading-indicator">
              <span class="loading-dots">翻譯中</span>
            </div>
          </div>
          <div class="subtitle-meta">
            <span class="timestamp">${this.formatTimestamp(new Date())}</span>
            ${speakerInfo ? `<span class="confidence">置信度: ${(speakerInfo.confidence || 0.8).toFixed(2)}</span>` : ''}
            ${speakerInfo ? `<span class="speaker-id" data-speaker="${speakerInfo.id}">${speakerInfo.name}</span>` : ''}
          </div>
        </div>
      `;

      // 設置數據屬性
      if (recordId) subtitleElement.dataset.recordId = recordId;
      if (speakerInfo) {
        subtitleElement.dataset.speakerId = speakerInfo.id;
        subtitleElement.dataset.speakerName = speakerInfo.name;
      }

      // 插入到容器
      this.insertSubtitleElement(subtitleElement);
      
      // 記錄字幕項目
      this.subtitleItems.set(subtitleId, {
        element: subtitleElement,
        text: text,
        timestamp: new Date(),
        status: 'pending_translation',
        speakerInfo: speakerInfo
      });
      
      // 更新顯示管理
      this.updateDisplayManagement();
      
      console.log('🎬 原文字幕已顯示:', subtitleId);
      
      // 觸發回調
      this.emitCallback('onSubtitleDisplayed', {
        subtitleId,
        text,
        type: 'original',
        speakerInfo
      });
      
      return subtitleElement;
    } catch (error) {
      console.error('❌ 顯示原文字幕失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'displayOriginalText' });
      return null;
    }
  }

  // 顯示原文字幕（向後兼容）
  displayOriginalText(text, subtitleId, recordId) {
    return this.displayOriginalTextWithSpeaker(text, subtitleId, recordId, null);
  }

  // 顯示臨時字幕
  showInterimSubtitle(text) {
    if (!this.container || !this.content) return;
    
    try {
      // 移除現有的臨時字幕
      this.clearInterimSubtitle();
      
      // 創建臨時字幕元素
      this.interimSubtitle = document.createElement('div');
      this.interimSubtitle.className = 'subtitle-item interim-subtitle';
      this.interimSubtitle.innerHTML = `
        <div class="subtitle-content-wrapper interim">
          <div class="original-text interim-text">${text}</div>
          <div class="interim-indicator">
            <span class="interim-label">即時識別中...</span>
          </div>
        </div>
      `;
      
      // 插入到容器頂部
      this.content.insertBefore(this.interimSubtitle, this.content.firstChild);
      
      // 自動滾動
      if (this.settings.autoScroll) {
        this.autoScroll();
      }
      
      console.log('🎬 臨時字幕已顯示:', text.substring(0, 20));
    } catch (error) {
      console.error('❌ 顯示臨時字幕失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'showInterimSubtitle' });
    }
  }

  // 更新字幕翻譯
  updateSubtitleTranslations(subtitleId, translationData) {
    if (!subtitleId || !translationData) {
      console.warn('⚠️ 無效的字幕ID或翻譯數據');
      return false;
    }

    try {
      const subtitleItem = this.subtitleItems.get(subtitleId);
      if (!subtitleItem) {
        console.error('❌ 找不到字幕項目:', subtitleId);
        return false;
      }

      const element = subtitleItem.element;
      const translationsDiv = element.querySelector('.translated-text');
      
      if (!translationsDiv) {
        console.error('❌ 找不到翻譯容器:', subtitleId);
        return false;
      }

      // 驗證翻譯數據格式
      if (!this.validateTranslationData(translationData)) {
        this.showTranslationError(subtitleId, '翻譯數據格式異常');
        return false;
      }

      // 移除加載狀態
      translationsDiv.classList.remove('loading');
      translationsDiv.innerHTML = '';

      // 渲染翻譯結果
      if (translationData.translations && translationData.translations.length > 0) {
        translationData.translations.forEach((translation, index) => {
          if (this.isValidTranslation(translation)) {
            const translationElement = this.createTranslationElement(translation);
            translationsDiv.appendChild(translationElement);
          }
        });
      } else {
        translationsDiv.innerHTML = '<div class="no-translation">無翻譯結果</div>';
      }

      // 更新字幕項目狀態
      subtitleItem.status = 'completed';
      subtitleItem.translations = translationData.translations;
      
      // 添加完成樣式
      element.classList.add('translation-completed');
      
      console.log('✅ 字幕翻譯已更新:', subtitleId);
      
      // 觸發回調
      this.emitCallback('onSubtitleUpdated', {
        subtitleId,
        translationData,
        element: element
      });
      
      return true;
    } catch (error) {
      console.error('❌ 更新字幕翻譯失敗:', error);
      this.showTranslationError(subtitleId, error.message);
      this.emitCallback('onError', { error: error.message, action: 'updateSubtitleTranslations' });
      return false;
    }
  }

  // 顯示翻譯錯誤
  showTranslationError(subtitleId, errorMessage) {
    try {
      const subtitleItem = this.subtitleItems.get(subtitleId);
      if (!subtitleItem) return;

      const element = subtitleItem.element;
      const translationsDiv = element.querySelector('.translated-text');
      
      if (translationsDiv) {
        translationsDiv.classList.remove('loading');
        translationsDiv.innerHTML = `
          <div class="translation-error">
            <span class="error-icon">⚠️</span>
            <span class="error-message">翻譯失敗: ${errorMessage}</span>
            <button class="retry-button" onclick="retryTranslation('${subtitleId}')">重試</button>
          </div>
        `;
        
        // 更新狀態
        subtitleItem.status = 'failed';
        subtitleItem.error = errorMessage;
        
        // 添加錯誤樣式
        element.classList.add('translation-error');
      }
      
      console.log('❌ 翻譯錯誤已顯示:', subtitleId, errorMessage);
    } catch (error) {
      console.error('❌ 顯示翻譯錯誤失敗:', error);
    }
  }

  // 顯示完整字幕（原文+翻譯）
  displaySubtitles(translationData) {
    if (!this.container || !this.content) return;

    try {
      // 清除臨時字幕
      this.clearInterimSubtitle();

      // 驗證數據格式
      if (!this.validateTranslationData(translationData)) {
        console.error('❌ 翻譯數據格式異常:', translationData);
        return;
      }

      // 創建字幕項目
      const subtitleId = `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const subtitleItem = this.createSubtitleElement(subtitleId, 'complete');

      // 構建內容
      const originalElement = document.createElement('div');
      originalElement.className = 'subtitle-original';
      originalElement.textContent = translationData.original;

      const translationsDiv = document.createElement('div');
      translationsDiv.className = 'subtitle-translations';

      // 渲染翻譯
      if (translationData.translations && translationData.translations.length > 0) {
        translationData.translations.forEach(translation => {
          if (this.isValidTranslation(translation)) {
            const translationElement = this.createTranslationElement(translation);
            translationsDiv.appendChild(translationElement);
          }
        });
      }

      // 組裝字幕
      subtitleItem.appendChild(originalElement);
      subtitleItem.appendChild(translationsDiv);

      // 插入容器
      this.content.appendChild(subtitleItem);

      // 記錄字幕項目
      this.subtitleItems.set(subtitleId, {
        element: subtitleItem,
        text: translationData.original,
        timestamp: new Date(),
        status: 'completed',
        translations: translationData.translations
      });

      // 更新顯示管理
      this.updateDisplayManagement();

      console.log('✅ 完整字幕已顯示');
      
      // 觸發回調
      this.emitCallback('onSubtitleDisplayed', {
        subtitleId,
        translationData,
        type: 'complete'
      });
      
    } catch (error) {
      console.error('❌ 顯示完整字幕失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'displaySubtitles' });
    }
  }

  // 創建字幕元素
  createSubtitleElement(subtitleId, type = 'default') {
    const element = document.createElement('div');
    element.id = subtitleId;
    element.className = `subtitle-item ${type}`;
    element.dataset.type = type;
    element.dataset.timestamp = Date.now();
    
    // 動畫效果
    if (this.settings.subtitleAnimations) {
      element.style.cssText = `
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s ease;
      `;
      
      // 延遲顯示動畫
      setTimeout(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }, 50);
    }
    
    return element;
  }

  // 處理說話者信息
  processSpeakerInfo(speakerInfo) {
    if (!speakerInfo || !this.settings.showSpeakerInfo) {
      return { speakerPrefix: '', speakerStyle: '' };
    }

    // 分配說話者顏色
    if (!speakerInfo.color) {
      speakerInfo.color = this.speakerColors[this.speakerColorIndex % this.speakerColors.length];
      this.speakerColorIndex++;
    }

    const speakerPrefix = `<span class="speaker-label" style="color: ${speakerInfo.color}; background-color: ${speakerInfo.color}20; padding: 2px 6px; border-radius: 4px; margin-right: 8px; font-size: 0.9em;">${speakerInfo.name}:</span> `;
    const speakerStyle = `style="--speaker-color: ${speakerInfo.color}; border-left: 3px solid ${speakerInfo.color}; padding-left: 8px;"`;

    return { speakerPrefix, speakerStyle };
  }

  // 創建翻譯元素
  createTranslationElement(translation) {
    const element = document.createElement('div');
    element.className = 'translation-item';
    element.dataset.language = translation.language;
    
    element.innerHTML = `
      <span class="lang-label">${this.getLanguageName(translation.language)}:</span>
      <span class="translation-text">${translation.text}</span>
    `;
    
    return element;
  }

  // 插入字幕元素
  insertSubtitleElement(element) {
    if (!this.content) return;
    
    // 插入到容器頂部
    this.content.insertBefore(element, this.content.firstChild);
    
    // 自動滾動
    if (this.settings.autoScroll) {
      this.autoScroll();
    }
  }

  // 更新顯示管理
  updateDisplayManagement() {
    this.limitSubtitleCount();
    this.fadeOldSubtitles();
    this.showContainer();
  }

  // 限制字幕數量
  limitSubtitleCount() {
    if (!this.content) return;
    
    const subtitleItems = this.content.querySelectorAll('.subtitle-item:not(.interim-subtitle)');
    const maxItems = this.settings.maxSubtitleLines;
    
    if (subtitleItems.length > maxItems) {
      const itemsToRemove = subtitleItems.length - maxItems;
      
      for (let i = 0; i < itemsToRemove; i++) {
        const oldestItem = subtitleItems[subtitleItems.length - 1 - i];
        if (oldestItem) {
          // 從記錄中移除
          const subtitleId = oldestItem.id;
          this.subtitleItems.delete(subtitleId);
          
          // 淡出動畫
          if (this.settings.subtitleAnimations) {
            oldestItem.style.transition = 'all 0.3s ease';
            oldestItem.style.opacity = '0';
            oldestItem.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
              if (oldestItem.parentNode) {
                oldestItem.remove();
              }
            }, 300);
          } else {
            oldestItem.remove();
          }
        }
      }
    }
  }

  // 淡出舊字幕
  fadeOldSubtitles() {
    if (!this.settings.fadeOutOldSubtitles) return;
    
    const now = Date.now();
    const maxAge = this.settings.maxDisplayTime;
    
    this.subtitleItems.forEach((item, subtitleId) => {
      const age = now - item.timestamp.getTime();
      if (age > maxAge) {
        const element = item.element;
        if (element && element.parentNode) {
          element.style.opacity = '0.5';
          element.classList.add('faded');
        }
      }
    });
  }

  // 清除臨時字幕
  clearInterimSubtitle() {
    if (this.interimSubtitle && this.interimSubtitle.parentNode) {
      this.interimSubtitle.remove();
      this.interimSubtitle = null;
    }
  }

  // 清除所有字幕
  clearAllSubtitles() {
    if (!this.content) return;
    
    try {
      // 清除所有字幕元素
      this.content.innerHTML = '';
      
      // 清除記錄
      this.subtitleItems.clear();
      this.interimSubtitle = null;
      
      // 隱藏容器
      this.hideContainer();
      
      console.log('🧹 所有字幕已清除');
      
      // 觸發回調
      this.emitCallback('onSubtitleCleared', { timestamp: new Date() });
      
    } catch (error) {
      console.error('❌ 清除字幕失敗:', error);
      this.emitCallback('onError', { error: error.message, action: 'clearAllSubtitles' });
    }
  }

  // 顯示容器
  showContainer() {
    if (this.container && this.container.style.display === 'none') {
      this.container.style.display = 'block';
      
      if (this.settings.subtitleAnimations) {
        this.container.style.opacity = '0';
        this.container.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
          this.container.style.opacity = '1';
          this.container.style.transform = 'translateY(0)';
        }, 50);
      }
    }
  }

  // 隱藏容器
  hideContainer() {
    if (this.container) {
      if (this.settings.subtitleAnimations) {
        this.container.style.transition = 'all 0.3s ease';
        this.container.style.opacity = '0';
        this.container.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
          this.container.style.display = 'none';
        }, 300);
      } else {
        this.container.style.display = 'none';
      }
    }
  }

  // 自動滾動
  autoScroll() {
    if (this.content && this.settings.autoScroll) {
      this.content.scrollTop = this.content.scrollHeight;
    }
  }

  // 格式化時間戳
  formatTimestamp(date) {
    if (!this.settings.showTimestamp) return '';
    
    return date.toLocaleTimeString('zh-TW', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // 獲取語言名稱
  getLanguageName(langCode) {
    return this.languageNames[langCode] || langCode.toUpperCase();
  }

  // 驗證翻譯數據
  validateTranslationData(translationData) {
    if (!translationData) return false;
    if (typeof translationData.original !== 'string') return false;
    if (!Array.isArray(translationData.translations)) return false;
    return true;
  }

  // 驗證翻譯項目
  isValidTranslation(translation) {
    return translation && 
           typeof translation.language === 'string' && 
           typeof translation.text === 'string' &&
           translation.text.trim().length > 0;
  }

  // 更新設定
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // 重新應用樣式
    this.applyContainerStyles();
    
    console.log('⚙️ 字幕核心設定已更新:', newSettings);
  }

  // 獲取字幕統計
  getSubtitleStats() {
    return {
      totalSubtitles: this.subtitleItems.size,
      pendingTranslations: Array.from(this.subtitleItems.values()).filter(item => item.status === 'pending_translation').length,
      completedSubtitles: Array.from(this.subtitleItems.values()).filter(item => item.status === 'completed').length,
      failedSubtitles: Array.from(this.subtitleItems.values()).filter(item => item.status === 'failed').length,
      hasInterimSubtitle: !!this.interimSubtitle,
      containerVisible: this.container && this.container.style.display !== 'none'
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
    console.log('🧹 清理字幕核心模組資源');
    
    // 清除所有字幕
    this.clearAllSubtitles();
    
    // 移除容器
    if (this.container && this.container.parentNode) {
      this.container.remove();
    }
    
    // 清除引用
    this.container = null;
    this.content = null;
    this.subtitleItems.clear();
    this.interimSubtitle = null;
    this.callbacks = {};
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleCore;
} else {
  window.SubtitleCore = SubtitleCore;
}