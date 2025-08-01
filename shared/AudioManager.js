// 音頻設備管理核心模組
// 統一管理音頻設備枚舉、檢測、切換和虛擬設備識別

class AudioManager {
  constructor(options = {}) {
    this.settings = {
      audioInputDevice: 'default',
      preferVirtualDevice: true,
      autoRefreshDevices: true,
      ...options
    };
    
    // 設備列表
    this.audioDevices = [];
    this.previousDeviceCount = 0;
    
    // 狀態管理
    this.deviceChangeListenerSet = false;
    this.isEnumerating = false;
    this.lastEnumerationTime = 0;
    this.enumerationCooldown = 1000; // 1秒冷卻時間
    
    // 虛擬設備檢測規則
    this.virtualDevicePatterns = [
      // Windows
      'virtual',
      'cable',
      'vb-audio',
      'vb-cable',
      'voicemeeter',
      'stereo mix',
      'what u hear',
      
      // macOS
      'soundflower',
      'blackhole',
      'loopback',
      
      // Linux
      'pulseaudio',
      'monitor',
      'sink',
      'loopback',
      
      // 通用
      'virtual audio',
      'virtual input',
      'virtual microphone'
    ];
    
    // 事件回調
    this.callbacks = {
      onDeviceListUpdate: null,
      onDeviceChange: null,
      onError: null,
      onStatusUpdate: null,
      onVirtualDeviceDetected: null
    };
  }

  // 設定事件回調
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // 更新設定
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  // 初始化音頻設備管理
  async initialize() {
    console.log('🎙️ 初始化音頻設備管理');
    
    try {
      await this.enumerateAudioDevices();
      this.setupDeviceChangeListener();
      
      this.emitStatusUpdate('✅ 音頻設備管理初始化完成', 'success');
      return true;
    } catch (error) {
      console.error('❌ 音頻設備管理初始化失敗:', error);
      this.emitStatusUpdate('❌ 音頻設備管理初始化失敗', 'error');
      throw error;
    }
  }

  // 枚舉音頻設備
  async enumerateAudioDevices(force = false) {
    // 防止重複枚舉
    const now = Date.now();
    if (!force && this.isEnumerating) {
      console.log('🎙️ 設備枚舉進行中，跳過重複請求');
      return this.audioDevices;
    }
    
    if (!force && (now - this.lastEnumerationTime) < this.enumerationCooldown) {
      console.log('🎙️ 設備枚舉冷卻中，跳過請求');
      return this.audioDevices;
    }

    this.isEnumerating = true;
    this.lastEnumerationTime = now;

    try {
      console.log('🎙️ 開始枚舉音頻設備...');
      
      // 先嘗試不需要權限的枚舉
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      console.log('🎙️ 初始設備枚舉結果:', audioInputs.length, '個音頻設備');
      
      // 如果設備沒有標籤，嘗試獲取權限後重新枚舉
      if (audioInputs.length === 0 || audioInputs.every(device => !device.label)) {
        console.log('🎙️ 設備標籤為空，嘗試獲取麥克風權限...');
        
        try {
          const stream = await this.requestAudioPermission();
          
          // 立即停止流，我們只需要權限
          stream.getTracks().forEach(track => track.stop());
          
          // 重新枚舉設備，現在應該有標籤了
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter(device => device.kind === 'audioinput');
          
          console.log('🎙️ 權限獲取後的設備列表:', audioInputs.length, '個音頻設備');
        } catch (permissionError) {
          console.warn('⚠️ 無法獲取麥克風權限:', permissionError.message);
          // 即使沒有權限，也繼續使用已找到的設備
        }
      }
      
      // 處理設備列表
      this.audioDevices = this.processDeviceList(audioInputs);
      
      // 檢測虛擬設備
      this.detectVirtualDevices();
      
      // 記錄設備變化
      const deviceCountChanged = this.audioDevices.length !== this.previousDeviceCount;
      if (deviceCountChanged) {
        console.log('🎙️ 設備數量變化:', `${this.previousDeviceCount} → ${this.audioDevices.length}`);
        this.previousDeviceCount = this.audioDevices.length;
      }
      
      console.log('🎙️ 最終音頻設備列表:', this.audioDevices.length, '個設備');
      this.logDeviceList();
      
      // 觸發回調
      this.emitCallback('onDeviceListUpdate', this.audioDevices);
      
      return this.audioDevices;
      
    } catch (error) {
      console.error('❌ 枚舉音頻設備失敗:', error);
      
      // 添加預設設備作為回退
      this.audioDevices = this.createFallbackDeviceList();
      this.emitStatusUpdate('❌ 無法獲取音頻設備列表，使用預設設備', 'error');
      
      throw error;
    } finally {
      this.isEnumerating = false;
    }
  }

  // 處理設備列表
  processDeviceList(audioInputs) {
    const deviceList = [];
    
    // 添加預設設備選項
    deviceList.push({
      deviceId: 'default',
      kind: 'audioinput',
      label: '🎙️ 系統預設麥克風',
      groupId: 'default',
      isDefault: true,
      isVirtual: false
    });
    
    // 添加找到的設備
    audioInputs.forEach((device, index) => {
      const label = device.label || `🎙️ 麥克風 ${index + 1} (${device.deviceId.substring(0, 8)}...)`;
      const isVirtual = this.isVirtualDevice(label);
      
      deviceList.push({
        deviceId: device.deviceId,
        kind: 'audioinput',
        label: isVirtual ? `🔧 ${label}` : label, // 虛擬設備添加特殊圖標
        groupId: device.groupId,
        isDefault: false,
        isVirtual: isVirtual,
        rawLabel: device.label
      });
    });
    
    // 按照虛擬設備優先、然後按名稱排序
    return deviceList.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.isVirtual && !b.isVirtual) return -1;
      if (!a.isVirtual && b.isVirtual) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  // 檢測是否為虛擬設備
  isVirtualDevice(deviceLabel) {
    if (!deviceLabel) return false;
    
    const label = deviceLabel.toLowerCase();
    return this.virtualDevicePatterns.some(pattern => 
      label.includes(pattern.toLowerCase())
    );
  }

  // 檢測虛擬設備並發出通知
  detectVirtualDevices() {
    const virtualDevices = this.audioDevices.filter(device => device.isVirtual);
    
    if (virtualDevices.length > 0) {
      console.log('🔧 檢測到虛擬音頻設備:', virtualDevices.map(d => d.label));
      
      virtualDevices.forEach(device => {
        this.emitCallback('onVirtualDeviceDetected', device);
      });
      
      // 如果設定為優先使用虛擬設備，且當前使用預設設備
      if (this.settings.preferVirtualDevice && this.settings.audioInputDevice === 'default') {
        const recommendedDevice = virtualDevices[0];
        this.emitStatusUpdate(
          `🔧 檢測到虛擬音頻設備: ${recommendedDevice.label}，建議切換使用`, 
          'info'
        );
      }
    }
  }

  // 創建回退設備列表
  createFallbackDeviceList() {
    return [{
      deviceId: 'default',
      kind: 'audioinput',
      label: '🎙️ 系統預設麥克風 (回退)',
      groupId: 'default',
      isDefault: true,
      isVirtual: false
    }];
  }

  // 請求音頻權限
  async requestAudioPermission() {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: audioConstraints 
    });
    
    console.log('✅ 麥克風權限獲取成功');
    return stream;
  }

  // 設定設備變更監聽器
  setupDeviceChangeListener() {
    if (this.deviceChangeListenerSet || !this.settings.autoRefreshDevices) {
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', () => {
      console.log('🎙️ 檢測到設備變更，重新枚舉...');
      
      // 延遲重新枚舉，避免頻繁操作
      setTimeout(() => {
        this.enumerateAudioDevices(true).then(devices => {
          this.emitCallback('onDeviceChange', devices);
        }).catch(error => {
          console.error('設備變更後重新枚舉失敗:', error);
        });
      }, 1000);
    });
    
    this.deviceChangeListenerSet = true;
    console.log('🎙️ 設備變更監聽器已設置');
  }

  // 手動刷新音頻設備
  async refreshAudioDevices() {
    console.log('🔄 手動刷新音頻設備列表');
    
    this.emitStatusUpdate('🔄 正在刷新音頻設備列表...', 'info');
    
    try {
      // 重置監聽器標記，允許重新設置
      this.deviceChangeListenerSet = false;
      
      // 強制重新枚舉設備
      const devices = await this.enumerateAudioDevices(true);
      
      this.emitStatusUpdate('✅ 音頻設備列表已更新', 'success');
      console.log('✅ 音頻設備手動刷新完成');
      
      return devices;
    } catch (error) {
      console.error('❌ 手動刷新音頻設備失敗:', error);
      this.emitStatusUpdate('❌ 刷新設備列表失敗: ' + error.message, 'error');
      throw error;
    }
  }

  // 測試音頻設備
  async testAudioDevice(deviceId = null) {
    const targetDeviceId = deviceId || this.settings.audioInputDevice;
    
    console.log('🧪 測試音頻設備:', targetDeviceId);
    
    try {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      
      // 如果指定了設備ID
      if (targetDeviceId && targetDeviceId !== 'default') {
        audioConstraints.deviceId = { exact: targetDeviceId };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints 
      });
      
      // 檢查音頻軌道信息
      const audioTracks = stream.getAudioTracks();
      let testResult = {
        success: true,
        deviceId: targetDeviceId,
        tracksCount: audioTracks.length
      };
      
      if (audioTracks.length > 0) {
        const track = audioTracks[0];
        testResult = {
          ...testResult,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          actualDeviceId: track.getSettings().deviceId,
          settings: track.getSettings()
        };
        
        console.log('🎙️ 音頻軌道詳情:', testResult);
        
        // 檢查是否成功使用了指定的設備
        if (targetDeviceId !== 'default' && testResult.actualDeviceId !== targetDeviceId) {
          console.warn('⚠️ 警告：實際使用的設備與請求的設備不同');
          testResult.warning = '可能無法正確使用指定的音頻設備';
        }
      }
      
      // 進行音頻訊號檢測
      const signalLevel = await this.checkAudioSignalLevel(stream);
      testResult.signalLevel = signalLevel;
      
      // 停止流
      stream.getTracks().forEach(track => track.stop());
      
      this.emitStatusUpdate('✅ 音頻設備測試成功', 'success');
      return testResult;
      
    } catch (error) {
      console.error('❌ 音頻設備測試失敗:', error);
      this.emitStatusUpdate('❌ 音頻設備測試失敗: ' + error.message, 'error');
      
      return {
        success: false,
        deviceId: targetDeviceId,
        error: error.message
      };
    }
  }

  // 檢查音頻訊號強度
  async checkAudioSignalLevel(stream, duration = 3000) {
    return new Promise((resolve) => {
      console.log('📊 開始音頻訊號檢測...');
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      microphone.connect(analyser);
      analyser.fftSize = 256;
      
      let maxLevel = 0;
      let avgLevel = 0;
      let sampleCount = 0;
      
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const currentLevel = sum / dataArray.length;
        
        maxLevel = Math.max(maxLevel, currentLevel);
        avgLevel = (avgLevel * sampleCount + currentLevel) / (sampleCount + 1);
        sampleCount++;
      };
      
      const interval = setInterval(checkLevel, 100);
      
      setTimeout(() => {
        clearInterval(interval);
        audioContext.close();
        
        const result = {
          maxLevel,
          avgLevel,
          sampleCount,
          hasSignal: maxLevel > 10, // 閾值可調整
          quality: maxLevel > 50 ? 'good' : maxLevel > 20 ? 'fair' : 'poor'
        };
        
        console.log('📊 音頻訊號檢測完成:', result);
        resolve(result);
      }, duration);
    });
  }

  // 根據設備ID獲取設備信息
  getDeviceInfo(deviceId) {
    return this.audioDevices.find(device => device.deviceId === deviceId);
  }

  // 獲取所有虛擬設備
  getVirtualDevices() {
    return this.audioDevices.filter(device => device.isVirtual);
  }

  // 獲取推薦的設備
  getRecommendedDevice() {
    // 優先推薦虛擬設備
    const virtualDevices = this.getVirtualDevices();
    if (virtualDevices.length > 0) {
      return virtualDevices[0];
    }
    
    // 否則返回第一個非預設設備
    const nonDefaultDevices = this.audioDevices.filter(device => !device.isDefault);
    if (nonDefaultDevices.length > 0) {
      return nonDefaultDevices[0];
    }
    
    // 最後返回預設設備
    return this.audioDevices.find(device => device.isDefault);
  }

  // 輸出設備列表到控制台
  logDeviceList() {
    this.audioDevices.forEach((device, index) => {
      const indicator = device.isVirtual ? '🔧' : device.isDefault ? '🏠' : '🎙️';
      console.log(`  ${index + 1}. ${indicator} ${device.label} (${device.deviceId})`);
    });
  }

  // 診斷音頻環境
  async performAudioDiagnostic() {
    console.log('🔧 開始音頻環境診斷...');
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      browser: navigator.userAgent,
      devices: [],
      permissions: {},
      support: {},
      recommendations: []
    };
    
    try {
      // 檢查API支援
      diagnostic.support = {
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        enumerateDevices: !!navigator.mediaDevices?.enumerateDevices,
        webAudio: !!(window.AudioContext || window.webkitAudioContext),
        speechRecognition: !!window.SpeechRecognition || !!window.webkitSpeechRecognition
      };
      
      // 檢查權限狀態
      if (navigator.permissions) {
        try {
          const microphonePermission = await navigator.permissions.query({ name: 'microphone' });
          diagnostic.permissions.microphone = microphonePermission.state;
        } catch (error) {
          diagnostic.permissions.microphone = 'unknown';
        }
      }
      
      // 枚舉設備
      await this.enumerateAudioDevices(true);
      diagnostic.devices = this.audioDevices.map(device => ({
        deviceId: device.deviceId,
        label: device.label,
        isVirtual: device.isVirtual,
        isDefault: device.isDefault
      }));
      
      // 生成建議
      if (diagnostic.devices.length === 0) {
        diagnostic.recommendations.push('未檢測到音頻設備，請檢查硬體連接');
      } else if (diagnostic.devices.filter(d => d.isVirtual).length === 0) {
        diagnostic.recommendations.push('未檢測到虛擬音頻設備，如需捕獲系統音頻請安裝 VB-Cable 或類似軟體');
      }
      
      if (diagnostic.permissions.microphone === 'denied') {
        diagnostic.recommendations.push('麥克風權限被拒絕，請在瀏覽器設定中允許音頻權限');
      }
      
      console.log('🔧 音頻環境診斷完成:', diagnostic);
      return diagnostic;
      
    } catch (error) {
      console.error('❌ 音頻環境診斷失敗:', error);
      diagnostic.error = error.message;
      return diagnostic;
    }
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
    console.log('🧹 清理音頻設備管理資源');
    
    this.audioDevices = [];
    this.callbacks = {};
    this.deviceChangeListenerSet = false;
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioManager;
} else {
  window.AudioManager = AudioManager;
}