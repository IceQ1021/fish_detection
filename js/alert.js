/**
 * 实时警报管理系统
 * 处理WebSocket连接、智能检测合并、冷却时间控制等核心功能
 */
export class AlertManager {
    constructor() {
      // 初始化基础配置
      this.threshold = 0.5;      // 报警置信度阈值
      this.cooldown = 5000;      // 报警冷却时间（毫秒）
      
      // 运行时状态管理
      this.alertHistory = new Map();   // 历史报警记录：指纹 -> 时间戳
      this.pendingAlerts = new Set();  // 待合并报警队列
      this.lastAlertTime = 0;          // 最后报警时间戳
  
      // 初始化DOM容器
      this.alertContainer = this.createAlertContainer();
      this.websocket = this.setupWebSocket();
    }
  
    /* ========================
       核心初始化方法
    ======================== */
    
    /**
     * 创建全局报警容器
     * @returns {HTMLElement} 创建的容器元素
     */
    createAlertContainer() {
      const container = document.createElement('div');
      container.id = 'alert-container';
      Object.assign(container.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '1000'
      });
      document.body.appendChild(container);
      return container;
    }
  
    /**
     * 初始化WebSocket连接
     * @returns {WebSocket} WebSocket实例
     */
    setupWebSocket() {
      const ws = new WebSocket('ws://localhost:8000/ws/fish-detection');
      
      // 消息处理路由
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.alert) this.handleBatchAlert(data.alert);
        if (data.detections) this.handleSmartDetection(data.detections);
      };
  
      return ws;
    }
  
    /* ========================
       报警处理逻辑
    ======================== */
  
    /**
     * 处理智能检测结果（核心方法）
     * @param {Array} detections - 检测结果数组
     */
    handleSmartDetection(detections) {
      const now = Date.now();
      
      detections.forEach(detection => {
        // 生成目标唯一指纹
        const fingerprint = this.generateFingerprint(detection);
        
        // 冷却时间验证
        if (this.shouldAlert(fingerprint, now)) {
          this.pendingAlerts.add(detection.fish_cn);
          this.alertHistory.set(fingerprint, now);
        }
      });
  
      this.highlightLowConfidence(detections);
    }
  
    /**
     * 处理批量报警（简单计数模式）
     * @param {string} alertMessage - 原始报警消息
     */
    handleBatchAlert(alertMessage) {
      const now = Date.now();
      if (now - this.lastAlertTime < 1000) return; // 节流控制
      
      const count = parseInt(alertMessage.match(/\d+/)[0]) || 1;
      this.pendingAlerts.add(`发现${count}个低置信目标`);
      this.lastAlertTime = now;
    }
  
    /* ========================
       工具方法
    ======================== */
  
    /**
     * 生成目标指纹（位置+类型哈希）
     * @param {Object} detection - 检测结果对象
     * @returns {string} 唯一指纹
     */
    generateFingerprint(detection) {
      return `${detection.fish_cn}|${detection.bbox.join(',')}`;
    }
  
    /**
     * 判断是否需要触发报警
     * @param {string} fingerprint - 目标指纹
     * @param {number} currentTime - 当前时间戳
     * @returns {boolean} 是否满足报警条件
     */
    shouldAlert(fingerprint, currentTime) {
      const lastAlert = this.alertHistory.get(fingerprint);
      return !lastAlert || (currentTime - lastAlert) > this.cooldown;
    }
  
    /* ========================
       报警显示管理
    ======================== */
  
    /**
     * 定时刷新合并报警（每秒执行）
     */
    flushAlerts() {
      if (this.pendingAlerts.size === 0) return;
  
      const alertMessage = [...this.pendingAlerts].join('，');
      this.showAlert(alertMessage);
      this.pendingAlerts.clear();
    }
  
    /**
     * 显示可视化报警（含动画效果）
     * @param {string} message - 报警内容
     */
    showAlert(message) {
      // 清理过期历史记录（防止内存泄漏）
      const now = Date.now();
      this.alertHistory.forEach((timestamp, fingerprint) => {
        if (now - timestamp > this.cooldown * 2) {
          this.alertHistory.delete(fingerprint);
        }
      });
  
      // 创建报警元素
      const alertElement = document.createElement('div');
      alertElement.className = 'alert-message';
      alertElement.innerHTML = `
        <span class="alert-icon">⚠️</span>
        <span class="alert-text">${message}</span>
      `;
  
      // 动画参数配置
      alertElement.style.animation = 'slide-in 0.5s, fade-out 1s 9s';
      this.alertContainer.appendChild(alertElement);
  
      // 自动移除机制（总持续时间10秒）
      setTimeout(() => {
        alertElement.style.opacity = '0';
        setTimeout(() => alertElement.remove(), 1000);
      }, 10000);
    }
  
    /* ========================
       辅助功能
    ======================== */
    
    /**
     * 初始化全局样式
     */
    setupGlobalStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .alert-message {
          /* 入场动画 */
          animation: slide-in 0.5s forwards;
          opacity: 1;
          /* 样式设计 */
          background: #fff3cd;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
  
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
  
        @keyframes fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
  
        .low-confidence {
          border: 2px solid #ffc107;
          background: rgba(255,193,7,0.1);
        }
      `;
      document.head.appendChild(style);
    }
  
    /**
     * 初始化系统（主入口）
     */
    init() {
      this.setupGlobalStyles();
      setInterval(() => this.flushAlerts(), 1000);
    }
  }