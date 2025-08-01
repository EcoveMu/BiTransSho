// 背景腳本 - 處理翻譯API和核心邏輯

class TranslationService {
  constructor() {
    this.microsoftKey = '';
    this.openaiKey = '';
    this.microsoftRegion = 'eastus';
    
    // 請求限流管理
    this.requestQueue = new Map(); // 按服務類型分組的請求佇列
    this.requestCounts = new Map(); // 請求計數器
    this.lastRequestTime = new Map(); // 最後請求時間
    
    // 限流配置
    this.rateLimits = {
      microsoft: { maxPerMinute: 100, minInterval: 100 }, // 每分鐘100次，最小間隔100ms
      openai: { maxPerMinute: 60, minInterval: 1000 },    // 每分鐘60次，最小間隔1s
      free: { maxPerMinute: 30, minInterval: 2000 }       // 每分鐘30次，最小間隔2s
    };
    
    // 清理計數器的定時器
    this.cleanupInterval = setInterval(() => {
      this.cleanupRequestCounts();
    }, 60000); // 每分鐘清理一次
  }

  // 清理過期的請求計數
  cleanupRequestCounts() {
    const now = Date.now();
    for (const [service, requests] of this.requestCounts) {
      // 移除超過1分鐘的請求記錄
      const filteredRequests = requests.filter(time => now - time < 60000);
      this.requestCounts.set(service, filteredRequests);
    }
  }

  // 檢查請求是否被限流
  async checkRateLimit(service) {
    const limits = this.rateLimits[service];
    if (!limits) return true;

    const now = Date.now();
    
    // 檢查最小間隔
    const lastTime = this.lastRequestTime.get(service) || 0;
    if (now - lastTime < limits.minInterval) {
      const waitTime = limits.minInterval - (now - lastTime);
      console.log(`⏱️ ${service} 服務請求間隔限制，等待 ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 檢查每分鐘請求數
    if (!this.requestCounts.has(service)) {
      this.requestCounts.set(service, []);
    }
    
    const requests = this.requestCounts.get(service);
    const recentRequests = requests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= limits.maxPerMinute) {
      throw new Error(`${service} 服務請求頻率超限，請稍後再試`);
    }

    // 記錄此次請求
    recentRequests.push(now);
    this.requestCounts.set(service, recentRequests);
    this.lastRequestTime.set(service, now);
    
    return true;
  }

  // 初始化API金鑰
  async initializeKeys() {
    const result = await chrome.storage.sync.get(['microsoftKey', 'openaiKey', 'microsoftRegion']);
    this.microsoftKey = result.microsoftKey || '';
    this.openaiKey = result.openaiKey || '';
    this.microsoftRegion = result.microsoftRegion || 'eastus';
  }

  // 使用微軟翻譯API - 改善版本
  async translateWithMicrosoft(text, fromLang, toLang) {
    if (!this.microsoftKey) {
      throw new Error('未設定微軟翻譯API金鑰');
    }

    // 檢查限流
    await this.checkRateLimit('microsoft');

    const endpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${fromLang}&to=${toLang}`;
    
    try {
      console.log(`🌐 微軟翻譯請求: ${fromLang} -> ${toLang}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.microsoftKey,
          'Ocp-Apim-Subscription-Region': this.microsoftRegion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text: text }])
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('微軟翻譯API錯誤:', response.status, errorText);
        
        if (response.status === 429) {
          throw new Error('微軟翻譯API請求頻率超限，請稍後再試');
        } else if (response.status === 401) {
          throw new Error('微軟翻譯API金鑰無效或已過期');
        } else {
          throw new Error(`微軟翻譯API錯誤: ${response.status}`);
        }
      }

      const result = await response.json();
      console.log('✅ 微軟翻譯成功');
      return result[0].translations[0].text;
    } catch (error) {
      console.error('微軟翻譯錯誤:', error);
      throw error;
    }
  }

  // 使用免費翻譯 - 改善版本
  async translateWithFree(text, fromLang, toLang) {
    if (!text || text.trim().length === 0) {
      throw new Error('文字內容為空');
    }

    // 檢查限流
    await this.checkRateLimit('free');

    // 語言代碼映射 (MyMemory API格式)
    const languageMap = {
      'zh-tw': 'zh-TW',
      'zh': 'zh-CN',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'it': 'it',
      'pt': 'pt',
      'ru': 'ru'
    };

    const sourceLanguage = languageMap[fromLang] || fromLang;
    const targetLanguage = languageMap[toLang] || toLang;

    if (sourceLanguage === targetLanguage) {
      return text; // 相同語言直接返回
    }

    try {
      console.log(`🌐 免費翻譯請求: ${sourceLanguage} -> ${targetLanguage}`);
      
      // 使用MyMemory免費翻譯API
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage}|${targetLanguage}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SubtitleTranslation/1.0'
        }
      });
      
      if (!response.ok) {
        console.error('免費翻譯API錯誤:', response.status);
        throw new Error(`免費翻譯API錯誤: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.responseStatus === 200 && result.responseData) {
        let translatedText = result.responseData.translatedText;
        
        // 如果翻譯品質太低，嘗試簡單的內置翻譯
        if (result.responseData.match < 0.3) {
          console.log('⚠️ 翻譯品質較低，使用備用翻譯');
          translatedText = await this.fallbackTranslate(text, fromLang, toLang);
        }
        
        console.log('✅ 免費翻譯成功');
        return translatedText;
      } else {
        throw new Error('免費翻譯回應格式異常');
      }
    } catch (error) {
      console.error('免費翻譯失敗:', error);
      // 備用方案：返回帶標記的原文
      return await this.fallbackTranslate(text, fromLang, toLang);
    }
  }

  // 備用翻譯方案
  async fallbackTranslate(text, fromLang, toLang) {
    // 簡單的關鍵字翻譯
    const commonTranslations = {
      'zh-tw': {
        'en': {
          '你好': 'Hello',
          '謝謝': 'Thank you',
          '對不起': 'Sorry',
          '是的': 'Yes',
          '不是': 'No',
          '請問': 'Excuse me',
          '再見': 'Goodbye'
        }
      },
      'en': {
        'zh-tw': {
          'hello': '你好',
          'thank you': '謝謝',
          'sorry': '對不起',
          'yes': '是的',
          'no': '不是',
          'excuse me': '請問',
          'goodbye': '再見'
        }
      }
    };

    const dict = commonTranslations[fromLang]?.[toLang];
    if (dict) {
      let translatedText = text;
      for (const [original, translation] of Object.entries(dict)) {
        translatedText = translatedText.replace(new RegExp(original, 'gi'), translation);
      }
      if (translatedText !== text) {
        return translatedText;
      }
    }

    // 如果沒有找到翻譯，返回原文加標記
    return `[${toLang}] ${text}`;
  }

  // 使用OpenAI API - 改善版本
  async translateWithOpenAI(text, fromLang, toLang) {
    if (!this.openaiKey) {
      throw new Error('未設定OpenAI API金鑰');
    }

    // 檢查限流
    await this.checkRateLimit('openai');

    // 語言名稱映射
    const languageNames = {
      'zh-tw': '繁體中文',
      'zh': '繁體中文',
      'en': '英文',
      'ja': '日文',
      'ko': '韓文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文'
    };

    const fromLanguage = languageNames[fromLang] || fromLang;
    const toLanguage = languageNames[toLang] || toLang;

    // 改進的提示詞
    const prompt = `請將以下${fromLanguage}文字翻譯成${toLanguage}。請保持原文的語氣和意思，並且只回傳翻譯結果，不要添加任何說明：

${text}`;

    console.log(`🌐 OpenAI翻譯請求: ${fromLanguage} -> ${toLanguage}`);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ 
            role: 'user', 
            content: prompt 
          }],
          max_tokens: 500,
          temperature: 0.3,
          top_p: 0.9
        })
      });

      console.log('OpenAI回應狀態:', response.status);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenAI API回應錯誤:', errorData);
        
        if (response.status === 401) {
          throw new Error('OpenAI API金鑰無效，請檢查設定');
        } else if (response.status === 429) {
          throw new Error('OpenAI API配額已用完或請求過於頻繁');
        } else if (response.status === 500) {
          throw new Error('OpenAI服務器錯誤，請稍後再試');
        } else {
          throw new Error(`OpenAI API錯誤 ${response.status}: ${errorData}`);
        }
      }

      const result = await response.json();
      
      if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error('OpenAI回應格式異常');
      }

      const translatedText = result.choices[0].message.content.trim();
      console.log('✅ OpenAI翻譯成功');
      
      return translatedText;
    } catch (error) {
      console.error('OpenAI翻譯詳細錯誤:', error);
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('網路連接失敗，請檢查網路狀態');
      } else {
        throw error;
      }
    }
  }

  // 自動偵測語言並翻譯
  async detectAndTranslate(text, targetLanguages) {
    await this.initializeKeys();
    
    if (!text || text.trim().length === 0) {
      throw new Error('文字內容為空');
    }
    
    console.log('開始翻譯:', text);
    console.log('API金鑰狀態:', {
      microsoftKey: !!this.microsoftKey,
      openaiKey: !!this.openaiKey
    });
    
    try {
      let detectedLang = 'auto';
      
      // 簡單的語言檢測邏輯
      const chineseRegex = /[\u4e00-\u9fff]/;
      const englishRegex = /[a-zA-Z]/;
      
      if (chineseRegex.test(text)) {
        detectedLang = 'zh';
      } else if (englishRegex.test(text)) {
        detectedLang = 'en';
      }
      
      // 如果有微軟翻譯API，使用更精確的語言檢測
      if (this.microsoftKey) {
        try {
          const detectEndpoint = 'https://api.cognitive.microsofttranslator.com/detect?api-version=3.0';
          const detectResponse = await fetch(detectEndpoint, {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': this.microsoftKey,
              'Ocp-Apim-Subscription-Region': this.microsoftRegion,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ text: text }])
          });

          if (detectResponse.ok) {
            const detectResult = await detectResponse.json();
            if (detectResult && detectResult[0] && detectResult[0].language) {
              detectedLang = detectResult[0].language;
            }
          }
        } catch (detectError) {
          console.warn('語言檢測失敗，使用預設檢測:', detectError);
        }
      }

      // 語言代碼標準化
      const normalizeLanguage = (lang) => {
        const langMap = {
          'zh': 'zh-tw',
          'zh-cn': 'zh-tw',
          'zh-tw': 'zh-tw',
          'en': 'en',
          'ja': 'ja',
          'ko': 'ko',
          'auto': 'zh-tw'
        };
        return langMap[lang] || lang;
      };

      detectedLang = normalizeLanguage(detectedLang);
      console.log('檢測到的語言:', detectedLang);

      // 智能翻譯邏輯
      const translations = {};
      const originalLangCode = detectedLang;
      
      // 添加原文
      translations[originalLangCode] = text;
      
      // 獲取翻譯服務提供者設定
      const settings = await chrome.storage.sync.get(['translationProvider']);
      const provider = settings.translationProvider || 'microsoft';
      console.log('使用翻譯服務:', provider);
      
      // 翻譯到其他語言
      for (const targetLang of targetLanguages) {
        const normalizedTarget = normalizeLanguage(targetLang);
        
        if (normalizedTarget !== originalLangCode) {
          try {
            let translatedText = '';
            
            // 根據設定選擇翻譯服務
            if (provider === 'free') {
              console.log(`使用免費翻譯: ${originalLangCode} -> ${normalizedTarget}`);
              translatedText = await this.translateWithFree(text, originalLangCode, normalizedTarget);
            } else if (provider === 'openai' && this.openaiKey) {
              console.log(`使用OpenAI翻譯: ${originalLangCode} -> ${normalizedTarget}`);
              translatedText = await this.translateWithOpenAI(text, originalLangCode, normalizedTarget);
            } else if (provider === 'microsoft' && this.microsoftKey) {
              console.log(`使用微軟翻譯: ${originalLangCode} -> ${normalizedTarget}`);
              translatedText = await this.translateWithMicrosoft(text, originalLangCode, normalizedTarget);
            } else {
              // 嘗試備用服務：優先使用免費翻譯
              console.log(`使用備用免費翻譯: ${originalLangCode} -> ${normalizedTarget}`);
              translatedText = await this.translateWithFree(text, originalLangCode, normalizedTarget);
            }
            
            translations[normalizedTarget] = translatedText;
            console.log(`翻譯成功 ${normalizedTarget}:`, translatedText);
            
          } catch (translateError) {
            console.error(`翻譯到${normalizedTarget}失敗:`, translateError);
            
            // 如果主要翻譯服務失敗，嘗試免費翻譯作為備用
            if (provider !== 'free') {
              try {
                console.log(`嘗試免費翻譯作為備用: ${originalLangCode} -> ${normalizedTarget}`);
                const fallbackTranslation = await this.translateWithFree(text, originalLangCode, normalizedTarget);
                translations[normalizedTarget] = fallbackTranslation;
                console.log(`備用翻譯成功 ${normalizedTarget}:`, fallbackTranslation);
              } catch (fallbackError) {
                console.error(`備用翻譯也失敗:`, fallbackError);
                translations[normalizedTarget] = `[翻譯失敗: ${translateError.message}] ${text}`;
              }
            } else {
              translations[normalizedTarget] = `[翻譯失敗: ${translateError.message}] ${text}`;
            }
          }
        }
      }

      return {
        originalText: text,
        detectedLanguage: originalLangCode,
        translations: translations
      };
    } catch (error) {
      console.error('翻譯處理錯誤:', error);
      
      // 錯誤時的備用邏輯
      const fallbackTranslations = {};
      targetLanguages.forEach(lang => {
        fallbackTranslations[lang] = `[系統錯誤: ${error.message}] ${text}`;
      });
      
      return {
        originalText: text,
        detectedLanguage: 'unknown',
        translations: fallbackTranslations
      };
    }
  }
}

// 全域翻譯服務實例
const translationService = new TranslationService();

// 字幕視窗管理
class SubtitleWindowManager {
  constructor() {
    this.subtitleWindowId = null;
    this.isRecording = false;
  }

  async openSubtitleWindow() {
    console.log('🪟 開始建立字幕視窗...');
    
    if (this.subtitleWindowId) {
      try {
        console.log('📋 視窗已存在，嘗試激活:', this.subtitleWindowId);
        // 如果視窗已存在，將其帶到前面
        await chrome.windows.update(this.subtitleWindowId, { focused: true });
        console.log('✅ 現有視窗已激活');
        return;
      } catch (error) {
        console.log('⚠️ 現有視窗無法激活，重新建立:', error.message);
        // 視窗可能已被關閉，重新建立
        this.subtitleWindowId = null;
      }
    }

    try {
      console.log('🚀 創建新的字幕視窗...');
      const window = await chrome.windows.create({
        url: 'subtitle-window.html',
        type: 'popup',
        width: 800,
        height: 600,
        left: 100,
        top: 100,
        focused: true
      });
      
      this.subtitleWindowId = window.id;
      console.log('✅ 字幕視窗創建成功，ID:', this.subtitleWindowId);
      
      // 監聽視窗關閉事件
      chrome.windows.onRemoved.addListener((windowId) => {
        if (windowId === this.subtitleWindowId) {
          console.log('🗑️ 字幕視窗已關閉');
          this.subtitleWindowId = null;
          this.isRecording = false;
        }
      });
      
    } catch (error) {
      console.error('❌ 建立字幕視窗失敗:', error);
      throw error; // 重新拋出錯誤以便上層處理
    }
  }

  async closeSubtitleWindow() {
    if (this.subtitleWindowId) {
      try {
        await chrome.windows.remove(this.subtitleWindowId);
        this.subtitleWindowId = null;
        this.isRecording = false;
      } catch (error) {
        console.error('關閉字幕視窗失敗:', error);
      }
    }
  }

  async toggleRecording() {
    if (this.subtitleWindowId) {
      try {
        // 發送切換錄音訊息到字幕視窗
        await chrome.tabs.query({ windowId: this.subtitleWindowId }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecording' });
          }
        });
      } catch (error) {
        console.error('切換錄音狀態失敗:', error);
      }
    } else {
      // 如果視窗未開啟，先開啟視窗
      await this.openSubtitleWindow();
    }
  }

  async toggleSmartPanelFromShortcut() {
    console.log('🧠 快捷鍵切換智能整理面板...');
    
    if (this.subtitleWindowId) {
      try {
        // 發送切換智能面板訊息到字幕視窗
        await chrome.tabs.query({ windowId: this.subtitleWindowId }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSmartPanel' });
          }
        });
      } catch (error) {
        console.error('❌ 切換智能面板失敗:', error);
      }
    } else {
      // 如果視窗未開啟，先開啟視窗然後顯示智能面板
      await this.openSubtitleWindow();
      setTimeout(async () => {
        try {
          await chrome.tabs.query({ windowId: this.subtitleWindowId }, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSmartPanel' });
            }
          });
        } catch (error) {
          console.error('❌ 無法在新視窗中開啟智能面板:', error);
        }
      }, 1000);
    }
  }

  async notifySettingsUpdate(settings) {
    // 通知subtitle-window更新設定（如果開啟）
    if (this.subtitleWindowId) {
      try {
        const tabs = await chrome.tabs.query({ windowId: this.subtitleWindowId });
        if (tabs.length > 0) {
          await chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'settingsUpdated', 
            settings: settings 
          });
          console.log('✅ 已通知subtitle-window更新設定');
        }
      } catch (error) {
        console.warn('⚠️ 無法通知subtitle-window更新設定:', error);
      }
    }

    // 通知所有content scripts更新設定
    try {
      const allTabs = await chrome.tabs.query({});
      const notifications = allTabs.map(async (tab) => {
        // 跳過chrome://和extension頁面
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          return;
        }
        
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'settingsUpdated', 
            settings: settings 
          });
          console.log(`✅ 已通知tab ${tab.id} 更新設定`);
        } catch (error) {
          // 如果沒有content script，就忽略錯誤
          console.log(`📝 tab ${tab.id} 沒有content script，跳過通知`);
        }
      });
      
      await Promise.allSettled(notifications);
      console.log('✅ 設定更新通知已發送到所有相關頁面');
    } catch (error) {
      console.warn('⚠️ 通知content scripts更新設定時發生錯誤:', error);
    }
  }

  async openSettings() {
    if (this.subtitleWindowId) {
      try {
        const tabs = await chrome.tabs.query({ windowId: this.subtitleWindowId });
        if (tabs.length > 0) {
          await chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'openSettings'
          });
          console.log('✅ 已通知subtitle-window開啟設定面板');
        }
      } catch (error) {
        console.warn('⚠️ 無法通知subtitle-window開啟設定面板:', error);
      }
    } else {
      console.warn('⚠️ subtitle-window未開啟，無法開啟設定面板');
    }
  }
}

const subtitleWindowManager = new SubtitleWindowManager();

// 監聽來自content script和subtitle window的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('🔄 收到訊息:', request);
  
  if (request.action === 'translate') {
    console.log('🌐 開始處理翻譯請求:', {
      text: request.text,
      targetLanguages: request.targetLanguages
    });
    
    // 處理翻譯並格式化回應
    translationService.detectAndTranslate(request.text, request.targetLanguages)
      .then(result => {
        console.log('✅ 翻譯處理成功:', result);
        
        const formattedResult = {
          original: result.originalText,
          detected: result.detectedLanguage,
          translations: Object.entries(result.translations).map(([lang, text]) => ({
            language: lang,
            text: text
          }))
        };
        
        console.log('📦 格式化翻譯結果:', formattedResult);
        sendResponse({ success: true, data: formattedResult });
      })
      .catch(error => {
        console.error('❌ 翻譯處理失敗:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道開放
  }
  
  if (request.action === 'saveSettings') {
    console.log('💾 保存設定:', request.settings);
    chrome.storage.sync.set(request.settings)
      .then(() => {
        console.log('✅ 設定保存成功');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('❌ 設定保存失敗:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'getSettings') {
    console.log('📥 取得設定請求');
    chrome.storage.sync.get(['microsoftKey', 'openaiKey', 'microsoftRegion', 'targetLanguages', 'translationProvider'])
      .then(result => {
        console.log('📋 返回設定:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('❌ 取得設定失敗:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'openSubtitleWindow') {
    console.log('🪟 開啟字幕視窗請求');
    subtitleWindowManager.openSubtitleWindow()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'closeSubtitleWindow') {
    console.log('❌ 關閉字幕視窗請求');
    subtitleWindowManager.closeSubtitleWindow()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'toggleRecording') {
    console.log('🎤 切換錄音狀態請求');
    subtitleWindowManager.toggleRecording()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'notifySettingsUpdate') {
    console.log('🔄 設定更新通知:', request.settings);
    // 通知subtitle-window更新設定（如果開啟）
    subtitleWindowManager.notifySettingsUpdate(request.settings)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'openSettings') {
    console.log('⚙️ 開啟設定面板請求');
    // 通知subtitle-window開啟設定面板
    subtitleWindowManager.openSettings()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 監聽快捷鍵命令
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'toggle-recording':
      subtitleWindowManager.toggleRecording();
      break;
    case 'open-subtitle-window':
      subtitleWindowManager.openSubtitleWindow();
      break;
    case 'toggle-smart-panel':
      subtitleWindowManager.toggleSmartPanelFromShortcut();
      break;
  }
});

// 插件安裝時的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('即時語音翻譯插件已安裝');
  
  // 設定預設值
  chrome.storage.sync.set({
    targetLanguages: ['zh-tw', 'en'],
    translationProvider: 'free',
    microsoftRegion: 'eastus'
  });
  
  // 確保在所有分頁注入content script
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(err => {
          console.log('注入content script失敗 (這是正常的):', err);
        });
      }
    });
  });
});

// 當分頁更新時重新注入content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => {
      console.log('重新注入content script失敗 (這是正常的):', err);
    });
  }
}); 