// 語音識別引擎核心模組
// 統一管理瀏覽器內建引擎和 OpenAI Whisper 引擎

class SpeechEngine {
  constructor(options = {}) {
    this.settings = {
      speechRecognitionLanguage: 'auto',
      speechRecognitionEngine: 'browser', // browser 或 whisper
      audioInputDevice: 'default',
      openaiKey: '',
      ...options
    };
    
    // 語音識別實例
    this.recognition = null;
    this.whisperStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
    
    // 狀態管理
    this.isRecording = false;
    this.isInitialized = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.isRestarting = false;
    
    // 監控和錯誤處理
    this.lastActivityTime = Date.now();
    this.watchdogTimer = null;
    this.watchdogInterval = 10000; // 10秒檢查一次
    this.maxInactiveTime = 15000; // 15秒無活動則重啟
    
    // 語音識別結果處理
    this.recognitionBuffer = [];
    this.lastConfidenceThreshold = 0.6;
    this.speechPatterns = this.initializeSpeechPatterns();
    
    // 說話者分離功能
    this.speakerDetection = {
      enabled: true,
      speakers: [],
      currentSpeaker: null,
      lastSpeechTime: 0,
      silenceThreshold: 1500,
      speakerChangeThreshold: 2000,
      audioAnalyser: null,
      volumeHistory: [],
      pitchHistory: []
    };
    
    // 事件回調
    this.callbacks = {
      onResult: null,
      onError: null,
      onStart: null,
      onEnd: null,
      onStatusUpdate: null
    };
  }

  // 設定事件回調
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // 更新設定
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // 如果語音識別已初始化且語言發生變化，需要重新設定
    if (this.recognition && this.settings.speechRecognitionEngine === 'browser') {
      this.updateBrowserRecognitionLanguage();
    }
  }

  // 初始化語音識別引擎
  async initialize() {
    console.log('🚀 初始化語音識別引擎:', this.settings.speechRecognitionEngine);
    
    try {
      if (this.settings.speechRecognitionEngine === 'whisper') {
        await this.initializeWhisperEngine();
      } else {
        await this.initializeBrowserEngine();
      }
      
      this.isInitialized = true;
      this.emitStatusUpdate('✅ 語音識別引擎初始化完成', 'success');
      return true;
    } catch (error) {
      console.error('❌ 語音識別初始化失敗:', error);
      this.emitStatusUpdate('❌ 語音識別初始化失敗', 'error');
      throw error;
    }
  }

  // 初始化瀏覽器語音識別引擎
  async initializeBrowserEngine() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('瀏覽器不支援語音識別');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    // 設定語音識別參數
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 5;
    
    // 設定語言
    this.updateBrowserRecognitionLanguage();
    
    // 設定事件處理器
    this.recognition.onresult = (event) => {
      if (!this.isRecording) return;
      this.lastActivityTime = Date.now();
      this.handleBrowserRecognitionResult(event);
    };

    this.recognition.onerror = (event) => {
      console.error('瀏覽器語音識別錯誤:', event.error);
      this.handleRecognitionError(event);
    };

    this.recognition.onend = () => {
      console.log('瀏覽器語音識別結束');
      if (this.isRecording && !this.isRestarting) {
        // 自動重啟
        setTimeout(() => {
          if (this.isRecording && this.recognition) {
            try {
              this.recognition.start();
            } catch (error) {
              console.error('重新啟動識別失敗:', error);
              this.handleRecognitionError({ error: error.message });
            }
          }
        }, 1000);
      }
    };

    this.recognition.onstart = () => {
      console.log('瀏覽器語音識別已啟動');
      this.emitCallback('onStart');
    };
  }

  // 初始化 Whisper 語音識別引擎
  async initializeWhisperEngine() {
    if (!this.settings.openaiKey) {
      throw new Error('使用 Whisper 引擎需要設定 OpenAI API 金鑰');
    }

    // Whisper 需要的是 MediaRecorder，不需要預先初始化
    console.log('✅ Whisper 引擎準備就緒');
  }

  // 更新瀏覽器語音識別語言
  updateBrowserRecognitionLanguage() {
    if (!this.recognition) return;
    
    let language = this.settings.speechRecognitionLanguage;
    
    // 自動語言檢測邏輯
    if (language === 'auto') {
      language = this.detectBestLanguage();
    }
    
    this.recognition.lang = language;
    console.log('🗣️ 語音識別語言設定為:', language);
  }

  // 自動檢測最佳語言
  detectBestLanguage() {
    // 根據瀏覽器語言和使用者偏好決定
    const browserLang = navigator.language || navigator.userLanguage;
    
    if (browserLang.startsWith('zh')) {
      return browserLang.includes('TW') || browserLang.includes('HK') ? 'zh-TW' : 'zh-CN';
    } else if (browserLang.startsWith('en')) {
      return 'en-US';
    } else if (browserLang.startsWith('ja')) {
      return 'ja-JP';
    } else if (browserLang.startsWith('ko')) {
      return 'ko-KR';
    }
    
    return 'zh-TW'; // 預設
  }

  // 檢查音頻權限
  async checkAudioPermission() {
    console.log('🔍 檢查音頻權限...');
    
    try {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      
      // 如果指定了設備
      const selectedDevice = this.settings.audioInputDevice;
      if (selectedDevice && selectedDevice !== 'default') {
        audioConstraints.deviceId = { exact: selectedDevice };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints 
      });
      
      // 檢查音頻軌道
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log('🎙️ 使用的音頻設備:', {
          label: audioTracks[0].label,
          deviceId: audioTracks[0].getSettings().deviceId
        });
      }
      
      // 立即停止串流
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (error) {
      console.error('❌ 音頻權限檢查失敗:', error);
      throw new Error(`音頻權限被拒絕: ${error.message}`);
    }
  }

  // 開始語音識別
  async startRecognition() {
    if (this.isRecording) {
      console.warn('⚠️ 語音識別已在進行中');
      return;
    }

    console.log('🎤 開始語音識別');
    
    try {
      // 檢查權限
      await this.checkAudioPermission();
      
      // 確保已初始化
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      this.isRecording = true;
      this.retryCount = 0;
      this.lastActivityTime = Date.now();
      
      if (this.settings.speechRecognitionEngine === 'whisper') {
        await this.startWhisperRecognition();
      } else {
        await this.startBrowserRecognition();
      }
      
      // 啟動監控
      this.startWatchdog();
      
    } catch (error) {
      this.isRecording = false;
      console.error('❌ 啟動語音識別失敗:', error);
      this.emitStatusUpdate('❌ 啟動語音識別失敗', 'error');
      throw error;
    }
  }

  // 啟動瀏覽器語音識別
  async startBrowserRecognition() {
    if (!this.recognition) {
      throw new Error('瀏覽器語音識別未初始化');
    }

    // 警告使用者瀏覽器引擎的限制
    if (this.settings.audioInputDevice !== 'default') {
      this.emitStatusUpdate('⚠️ 瀏覽器引擎不支援指定音頻設備，建議使用 Whisper 引擎', 'warning');
    }

    try {
      this.recognition.start();
      this.emitStatusUpdate('🎤 瀏覽器語音識別已啟動', 'success');
    } catch (error) {
      throw new Error(`啟動瀏覽器語音識別失敗: ${error.message}`);
    }
  }

  // 啟動 Whisper 語音識別
  async startWhisperRecognition() {
    console.log('🎤 啟動 Whisper 語音識別');
    
    try {
      // 構建音頻約束
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      };
      
      // 指定設備
      const selectedDevice = this.settings.audioInputDevice;
      if (selectedDevice && selectedDevice !== 'default') {
        audioConstraints.deviceId = { exact: selectedDevice };
        this.emitStatusUpdate(`🎙️ Whisper 使用指定設備`, 'info');
      }
      
      // 獲取音頻串流
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      this.whisperStream = stream;
      
      // 檢查支援的格式
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
      
      if (!selectedMimeType) {
        throw new Error('瀏覽器不支援任何錄音格式');
      }
      
      // 建立 MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, { 
        mimeType: selectedMimeType 
      });
      
      this.recordingChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.processWhisperRecording();
      };
      
      // 開始錄音，每5秒處理一次
      this.mediaRecorder.start(5000);
      this.emitStatusUpdate('🎤 Whisper 語音識別已啟動', 'success');
      
    } catch (error) {
      throw new Error(`啟動 Whisper 語音識別失敗: ${error.message}`);
    }
  }

  // 停止語音識別
  async stopRecognition() {
    if (!this.isRecording) {
      console.warn('⚠️ 語音識別未在進行中');
      return;
    }

    console.log('🛑 停止語音識別');
    this.isRecording = false;
    
    // 停止監控
    this.stopWatchdog();
    
    if (this.settings.speechRecognitionEngine === 'whisper') {
      await this.stopWhisperRecognition();
    } else {
      await this.stopBrowserRecognition();
    }
    
    this.emitStatusUpdate('🛑 語音識別已停止', 'info');
  }

  // 停止瀏覽器語音識別
  async stopBrowserRecognition() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('停止瀏覽器語音識別錯誤:', error);
      }
    }
  }

  // 停止 Whisper 語音識別
  async stopWhisperRecognition() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.whisperStream) {
      this.whisperStream.getTracks().forEach(track => track.stop());
      this.whisperStream = null;
    }
  }

  // 處理瀏覽器語音識別結果
  handleBrowserRecognitionResult(event) {
    const results = Array.from(event.results);
    const lastResult = results[results.length - 1];
    
    if (lastResult) {
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence || 0;
      const isFinal = lastResult.isFinal;
      
      this.emitCallback('onResult', {
        transcript,
        confidence,
        isFinal,
        engine: 'browser'
      });
    }
  }

  // 處理 Whisper 錄音
  async processWhisperRecording() {
    if (this.recordingChunks.length === 0) return;
    
    try {
      const audioBlob = new Blob(this.recordingChunks, { type: 'audio/webm' });
      this.recordingChunks = [];
      
      // 發送到 Whisper API
      const transcript = await this.sendToWhisperAPI(audioBlob);
      
      if (transcript && transcript.trim()) {
        this.emitCallback('onResult', {
          transcript: transcript.trim(),
          confidence: 0.9, // Whisper 通常有較高的置信度
          isFinal: true,
          engine: 'whisper'
        });
      }
      
    } catch (error) {
      console.error('處理 Whisper 錄音失敗:', error);
      this.emitCallback('onError', { error: error.message, engine: 'whisper' });
    }
  }

  // 發送音頻到 Whisper API
  async sendToWhisperAPI(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    // 設定語言（如果不是自動檢測）
    if (this.settings.speechRecognitionLanguage !== 'auto') {
      const language = this.convertToWhisperLanguage(this.settings.speechRecognitionLanguage);
      if (language) {
        formData.append('language', language);
      }
    }
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.openaiKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Whisper API 錯誤: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.text;
  }

  // 轉換語言代碼為 Whisper 支援的格式
  convertToWhisperLanguage(language) {
    const mapping = {
      'zh-TW': 'zh',
      'zh-CN': 'zh',
      'en-US': 'en',
      'ja-JP': 'ja',
      'ko-KR': 'ko'
    };
    return mapping[language] || null;
  }

  // 處理識別錯誤
  handleRecognitionError(event) {
    const errorMessage = event.error || event;
    console.error('語音識別錯誤:', errorMessage);
    
    this.emitCallback('onError', { 
      error: errorMessage, 
      engine: this.settings.speechRecognitionEngine 
    });
    
    // 重試邏輯
    if (this.retryCount < this.maxRetries && this.isRecording) {
      this.retryCount++;
      console.log(`🔄 嘗試重新啟動語音識別 (${this.retryCount}/${this.maxRetries})`);
      
      setTimeout(async () => {
        if (this.isRecording) {
          try {
            await this.restartRecognition();
          } catch (error) {
            console.error('重啟語音識別失敗:', error);
          }
        }
      }, 2000);
    } else {
      this.emitStatusUpdate('❌ 語音識別錯誤次數過多，已停止', 'error');
      this.stopRecognition();
    }
  }

  // 重啟語音識別
  async restartRecognition() {
    this.isRestarting = true;
    
    try {
      await this.stopRecognition();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.startRecognition();
    } finally {
      this.isRestarting = false;
    }
  }

  // 啟動監控定時器
  startWatchdog() {
    this.stopWatchdog();
    
    this.watchdogTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - this.lastActivityTime;
      
      if (timeSinceLastActivity > this.maxInactiveTime) {
        console.warn('⚠️ 語音識別長時間無活動，重新啟動');
        this.restartRecognition();
      }
    }, this.watchdogInterval);
  }

  // 停止監控定時器
  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  // 初始化語音模式
  initializeSpeechPatterns() {
    return {
      commonWords: ['你好', 'hello', '謝謝', 'thank you'],
      punctuation: /[。！？，、；：""''（）]/g,
      numbers: /\d+/g
    };
  }

  // 發出回調事件
  emitCallback(eventName, data) {
    if (this.callbacks[eventName]) {
      this.callbacks[eventName](data);
    }
  }

  // 發出狀態更新
  emitStatusUpdate(message, type = 'info') {
    console.log(`${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'} ${message}`);
    this.emitCallback('onStatusUpdate', { message, type });
  }

  // 清理資源
  destroy() {
    console.log('🧹 清理語音識別引擎資源');
    
    this.stopRecognition();
    this.stopWatchdog();
    
    this.recognition = null;
    this.whisperStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
    this.callbacks = {};
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechEngine;
} else {
  window.SpeechEngine = SpeechEngine;
}