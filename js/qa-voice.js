/**
 * 智能语音问答模块
 * 集成语音识别、自然语言处理及交互界面管理
 */
import { OllamaAPI } from './ollama-api.js';

export class QAVoiceModule {
  constructor() {
    // 初始化状态管理
    this.currentModel = 'ollama';       // 当前使用的AI模型
    this.isRecognizing = false;         // 语音识别状态标志
    this.chatHistory = [];              // 对话历史记录
    // this.voiceAdapter = new XunfeiVoiceAdapter(); // 预留其他语音适配器

    // 初始化核心组件
    this.initDOMRefs();    // DOM元素引用
    this.bindEvents();     // 事件绑定
    this.initRecognition(); // 语音识别初始化
  }

  /* ========================
     DOM 元素管理
  ======================== */
  initDOMRefs() {
    // 主容器组件
    this.qaRoot = document.getElementById('qa-module-root');
    
    // 交互元素
    this.trigger = this.qaRoot.querySelector('.qa-trigger');
    this.panel = this.qaRoot.querySelector('.qa-panel');
    this.voiceBtn = document.getElementById('qa-voice-btn');
    this.sendBtn = document.getElementById('qa-send-btn');
    this.inputField = document.getElementById('qa-input');
    
    // 状态显示元素
    this.statusElement = this.qaRoot.querySelector('#recognition-status');
  }

  /* ========================
     事件绑定管理
  ======================== */
  bindEvents() {
    // 面板切换
    this.trigger.addEventListener('click', this.togglePanel.bind(this));
    
    // 文本输入处理
    this.sendBtn.addEventListener('click', this.handleTextInput.bind(this));
    this.inputField.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !e.shiftKey) this.handleTextInput();
    });
    
    // 语音输入控制
    this.voiceBtn.addEventListener('click', e => {
      e.preventDefault();
      this.toggleRecognition();
    });
  }

  /* ========================
     语音识别控制
  ======================== */
  initRecognition() {
    this.recognition = null;
    this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  toggleRecognition() {
    this.isRecognizing ? this.stopRecognition() : this.startRecognition();
  }

  startRecognition() {
    try {
      // 浏览器兼容性检查
      if (!this.SpeechRecognition) {
        this.showStatus('浏览器不支持语音识别', 'error');
        return;
      }

      // 初始化识别实例
      this.recognition = new this.SpeechRecognition();
      this.recognition.continuous = false;   // 单次识别模式
      this.recognition.interimResults = false; // 不返回中间结果
      this.recognition.lang = 'zh-CN';       // 设置中文识别

      // 事件回调绑定
      this.recognition.onsoundstart = this.handleSoundStart.bind(this);
      this.recognition.onresult = this.handleRecognitionResult.bind(this);
      
      // 超时处理
      this.recognitionTimeout = setTimeout(() => 
        this.handleError('no-speech'), 5000
      );

      // 启动识别
      this.recognition.start();
      this.isRecognizing = true;
      this.voiceBtn.classList.add('recording');
      this.showStatus('正在聆听...', 'recording');

    } catch (error) {
      this.handleError(error.name);
    }
  }

  stopRecognition() {
    if (this.recognition) this.recognition.stop();
    this.isRecognizing = false;
    this.voiceBtn.classList.remove('recording');
    this.showStatus('', '');
  }

  /* ========================
     语音事件处理
  ======================== */
  handleSoundStart() {
    console.log('检测到语音输入开始');
    clearTimeout(this.recognitionTimeout);
  }

  handleRecognitionResult(event) {
    const results = event.results;
    console.log('原始识别结果:', results);
    
    if (results.length > 0 && results[0].isFinal) {
      const transcript = results[0][0].transcript.trim();
      console.log('有效识别内容:', transcript);
      this.inputField.value = transcript;
      this.showStatus('识别成功', 'success');
    }
  }

  handleError(error) {
    const errorMessages = {
      'no-speech': '未检测到语音',
      'audio-capture': '无法捕获音频',
      'not-allowed': '麦克风访问被拒绝',
      'aborted': '识别已中止'
    };
    this.showStatus(errorMessages[error] || '识别发生错误', 'error');
  }

  /* ========================
     问答处理逻辑
  ======================== */
  async handleQuestionSubmit(question) {
    if (!question) return;

    // 添加用户提问记录
    this.addMessage(question, 'user');
    
    try {
      // 获取上下文并查询AI
      const context = this.getDetectionContext();
      const answer = await OllamaAPI.query(question, context);
      
      // 添加AI回答记录
      this.addMessage(answer, 'bot');
      this._updateChatHistory(question, answer);

    } catch (error) {
      this.addMessage(error.message, 'error');
    }
  }

  handleTextInput() {
    const question = this.inputField.value.trim();
    if (!question) return;
    
    this.inputField.value = '';
    this.handleQuestionSubmit(question);
  }

  /* ========================
     界面交互管理
  ======================== */
  togglePanel() {
    const isExpanded = this.trigger.dataset.state === 'expanded';
    this.trigger.dataset.state = isExpanded ? 'collapsed' : 'expanded';
  }

  showStatus(message, type) {
    this.statusElement.textContent = message;
    this.statusElement.className = type;
  }

  addMessage(content, type = 'user') {
    const historyDiv = document.getElementById('qa-history');
    const msgElem = document.createElement('div');
    
    msgElem.className = `msg-${type}`;
    msgElem.textContent = content;
    historyDiv.appendChild(msgElem);
    historyDiv.scrollTop = historyDiv.scrollHeight;
  }

  /* ========================
     数据管理
  ======================== */
  getDetectionContext() {
    return window.appState?.currentDetection || {};
  }

  _updateChatHistory(question, answer) {
    this.chatHistory.push({ question, answer });
    localStorage.setItem('qaHistory', JSON.stringify(this.chatHistory));
  }
}