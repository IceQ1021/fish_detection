/**
 * 摄像头控制核心类
 * 负责摄像头设备访问、视频流控制和帧捕获功能
 */
export class CameraController {
  /**
   * 初始化摄像头控制器
   * @param {HTMLVideoElement} videoElement - 视频显示元素
   * @param {HTMLElement} statusElement - 状态显示元素
   */
  constructor(videoElement, statusElement) {
    // DOM元素绑定
    this.videoElement = videoElement;
    this.statusElement = statusElement;

    // 摄像头配置参数
    this.constraints = {
      video: { 
        width: { ideal: 640 },  // 推荐分辨率宽度
        height: { ideal: 480 }, // 推荐分辨率高度
        facingMode: 'environment' // 优先使用后置摄像头
      },
      audio: false // 禁用音频
    };

    // 运行时状态
    this.stream = null;          // 媒体流对象
    this.animationFrameId = null; // 动画帧ID
    this.isDetecting = false;    // 检测状态标志
  }

  /* ========================
     公共操作方法
  ======================== */

  /**
   * 启动摄像头并开始视频流
   * @returns {Promise<boolean>} 启动是否成功
   * @throws {Error} 摄像头访问失败时抛出错误
   */
  async start() {
    try {
      this._updateStatus('正在访问摄像头...');
      
      // 获取摄像头访问权限
      this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
      
      // 绑定视频流并播放
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this._updateStatus('摄像头已开启');
      return true;
    } catch (error) {
      console.error('摄像头访问错误:', error);
      this._updateStatus(`摄像头访问失败: ${error.message}`, true);
      throw error;
    }
  }

  /**
   * 停止摄像头并释放资源
   */
  stop() {
    // 停止所有媒体轨道
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;

    // 取消帧捕获循环
    cancelAnimationFrame(this.animationFrameId);

    // 重置视频元素
    this.videoElement.srcObject = null;
    this._updateStatus('检测已停止');
  }

  /**
   * 启动帧捕获循环
   * @param {Function} callback - 每帧的回调函数
   */
  captureFrame(callback) {
    if (!this.stream) return;

    const frameCapture = () => {
      if (!this.isDetecting) return;

      // 创建绘制画布
      const canvas = document.createElement('canvas');
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;

      // 绘制当前帧
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      // 执行回调并继续循环
      callback(canvas);
      this.animationFrameId = requestAnimationFrame(frameCapture);
    };

    this.animationFrameId = requestAnimationFrame(frameCapture);
  }

  /* ========================
     内部工具方法
  ======================== */

  /**
   * 更新状态显示
   * @param {string} message - 状态信息
   * @param {boolean} [isError=false] - 是否为错误状态
   */
  _updateStatus(message, isError = false) {
    this.statusElement.textContent = message;
    this.statusElement.style.color = isError ? 'red' : 'inherit';
  }

  /* ========================
     静态工具方法
  ======================== */

  /**
   * 获取默认摄像头配置
   * @returns {Object} 摄像头配置参数
   */
  static getCameraSettings() {
    return {
      resolution: { width: 640, height: 480 }, // 默认分辨率
      frameRate: 30,                          // 推荐帧率
      facingMode: 'environment'               // 默认摄像头方向
    };
  }

  /**
   * 检测摄像头设备支持情况
   * @returns {Promise<boolean>} 是否支持摄像头
   */
  static async checkCameraSupport() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('设备检测失败:', error);
      return false;
    }
  }
}