/**
 * WebSocket 连接管理器
 * 负责视频流传输、帧捕获、自动重连及状态管理
 */
export class WebSocketManager {
  /**
   * 初始化 WebSocket 管理器
   * @param {Object} config - 配置参数
   * @param {string} config.wsUrl - WebSocket 服务地址
   * @param {Object} callbacks - 回调函数集合
   * @param {Function} [callbacks.onOpen] - 连接成功回调
   * @param {Function} [callbacks.onMessage] - 消息接收回调
   * @param {Function} [callbacks.onClose] - 连接关闭回调
   * @param {Function} [callbacks.onError] - 错误处理回调
   */
  constructor(config, callbacks) {
    // 配置参数
    this.config = config;
    this.callbacks = callbacks;

    // 连接状态管理
    this.ws = null;
    this.isDetecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000;

    // 视频帧处理
    this.videoElement = null;
    this.frameQuality = 0.8;
    this.animationFrameId = null;
  }

  /* ========================
     连接管理
  ======================== */
  
  /**
   * 建立 WebSocket 连接
   * @param {HTMLVideoElement} videoElement - 视频源元素
   */
  connect(videoElement) {
    if (this.ws || !videoElement) return;

    // 初始化视频源
    this.videoElement = videoElement;
    
    // 创建 WebSocket 实例
    this.ws = new WebSocket(this.config.wsUrl);

    // 绑定事件处理器
    this.ws.onopen = this._handleOpen.bind(this);
    this.ws.onmessage = this._handleMessage.bind(this);
    this.ws.onclose = this._handleClose.bind(this);
    this.ws.onerror = this._handleError.bind(this);
  }

  /**
   * 安全断开连接
   */
  disconnect() {
    this.isDetecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts;

    // 停止帧捕获循环
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 关闭 WebSocket 连接
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /* ========================
     事件处理器
  ======================== */
  
  /**
   * 连接建立处理
   * @private
   */
  _handleOpen() {
    this.reconnectAttempts = 0;
    this.isDetecting = true;
    this.callbacks.onOpen?.();
    this._startFrameCapture();
  }

  /**
   * 消息接收处理
   * @param {MessageEvent} event - 消息事件对象
   * @private
   */
  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.callbacks.onMessage?.(data.detections);
    } catch (error) {
      this.callbacks.onError?.(`消息解析失败: ${error.message}`);
    }
  }

  /**
   * 连接关闭处理
   * @param {CloseEvent} event - 关闭事件对象
   * @private
   */
  _handleClose(event) {
    this.isDetecting = false;
    this.callbacks.onClose?.(event);

    // 异常断开时尝试重连
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectInterval);
      this.callbacks.onError?.(`连接断开，尝试第 ${this.reconnectAttempts} 次重连...`);
    }
  }

  /**
   * 错误处理
   * @param {Event} error - 错误事件对象
   * @private
   */
  _handleError(error) {
    this.callbacks.onError?.(`WebSocket 错误: ${error.message}`);
    this.ws.close();
  }

  /* ========================
     视频帧处理
  ======================== */
  
  /**
   * 启动帧捕获循环
   * @private
   */
  _startFrameCapture() {
    const captureFrame = () => {
      // 双重状态检查确保连接有效
      if (!this._isConnectionValid()) return;

      // 创建绘制画布
      const canvas = document.createElement('canvas');
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;

      // 绘制当前帧
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      // 压缩并发送帧数据
      canvas.toBlob(blob => {
        if (blob && this._isConnectionValid()) {
          this.ws.send(blob);
        }
      }, 'image/jpeg', this.frameQuality);

      // 保持循环
      this.animationFrameId = requestAnimationFrame(captureFrame);
    };

    this.animationFrameId = requestAnimationFrame(captureFrame);
  }

  /**
   * 验证当前连接有效性
   * @returns {boolean} 是否有效连接
   * @private
   */
  _isConnectionValid() {
    return this.ws && 
           this.ws.readyState === WebSocket.OPEN && 
           this.videoElement;
  }

  /* ========================
     配置调整
  ======================== */
  
  /**
   * 动态调整帧质量
   * @param {number} quality - 压缩质量 (0.3-0.9)
   */
  adjustFrameQuality(quality) {
    this.frameQuality = Math.min(0.9, Math.max(0.3, quality));
  }
}