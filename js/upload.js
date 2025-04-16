import { config } from './config.js';
import { DetectionRenderer } from './detection.js';

/**
 * 文件上传管理器
 * 处理图像/视频文件的上传、验证及结果展示
 */
export class FileUploader {
  /**
   * 初始化上传控制器
   * @param {DetectionRenderer} detectionRenderer - 检测结果渲染器实例
   */
  constructor(detectionRenderer) {
    // 依赖注入检测结果渲染器
    this.detectionRenderer = detectionRenderer;

    // 延迟初始化的DOM元素引用
    this.dom = {
      imageInput: null,
      videoInput: null,
      statusMessage: null,
      imageResult: null,
      videoResult: null
    };
  }

  /* ========================
     公共接口方法
  ======================== */
  
  /**
   * 初始化DOM绑定及事件监听
   */
  init() {
    // 获取DOM元素引用
    this.dom.imageInput = document.getElementById('imageInput');
    this.dom.videoInput = document.getElementById('videoInput');
    this.dom.statusMessage = document.getElementById('statusMessage');
    this.dom.imageResult = document.getElementById('imageResult');
    this.dom.videoResult = document.getElementById('videoResult');

    // 绑定交互事件
    document.getElementById('uploadImageBtn').addEventListener('click', () => this.uploadImage());
    document.getElementById('uploadVideoBtn').addEventListener('click', () => this.uploadVideo());
  }

  /**
   * 执行图片文件上传
   */
  uploadImage() {
    this._uploadFile('image', this.dom.imageInput.files[0], 'image');
  }

  /**
   * 执行视频文件上传
   */
  uploadVideo() {
    this._uploadFile('video', this.dom.videoInput.files[0], 'video');
  }

  /* ========================
     核心上传逻辑
  ======================== */
  
  /**
   * 通用文件上传方法
   * @param {string} endpoint - 接口端点类型
   * @param {File} file - 上传文件对象
   * @param {'image'|'video'} type - 文件类型标识
   */
  async _uploadFile(endpoint, file, type) {
    try {
      // 前置清理与验证
      this.detectionRenderer.clearResults();
      if (!this._validateFile(file, type)) return;

      // 更新上传状态
      this.dom.statusMessage.textContent = '上传中...';

      // 构造表单数据
      const formData = new FormData();
      formData.append('file', file);

      // 执行上传请求
      const response = await fetch(`${config.apiBase}/upload/${type}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${config.credentials.username}:${config.credentials.password}`)
        },
        body: formData
      });

      // 处理响应结果
      if (!response.ok) throw new Error('上传失败');
      const data = await response.json();

      // 分发结果处理
      type === 'image'
        ? this.detectionRenderer.displayImageResults(file, data.detections)
        : this.detectionRenderer.processVideoResults(file, data.detections, data.fps || 30);

      this._showSuccess(type);
    } catch (error) {
      this._handleError(type, error);
    }
  }

  /* ========================
     验证工具方法
  ======================== */
  
  /**
   * 文件格式与大小验证
   * @param {File} file - 待验证文件
   * @param {'image'|'video'} type - 文件类型
   * @returns {boolean} 是否通过验证
   */
  _validateFile(file, type) {
    const validationRules = {
      image: {
        types: ['image/jpeg', 'image/png'],
        size: 5 * 1024 * 1024 // 5MB
      },
      video: {
        types: ['video/mp4', 'video/quicktime'],
        size: 100 * 1024 * 1024 // 100MB
      }
    };

    // 空文件检查
    if (!file) {
      alert(`请选择${type}文件`);
      return false;
    }

    // 文件类型检查
    if (!validationRules[type].types.includes(file.type)) {
      alert(`仅支持 ${validationRules[type].types.join(',')} 格式`);
      return false;
    }

    // 文件大小检查
    if (file.size > validationRules[type].size) {
      alert(`文件大小超过限制（最大${validationRules[type].size/1024/1024}MB）`);
      return false;
    }

    return true;
  }

  /* ========================
     状态反馈方法
  ======================== */
  
  /**
   * 上传成功处理
   * @param {'image'|'video'} type - 文件类型标识
   */
  _showSuccess(type) {
    this.dom.statusMessage.textContent = `${type === 'image' ? '图片' : '视频'}上传成功`;
    if (type === 'video') {
      document.querySelector('.video-container').style.display = 'block';
    }
  }

  /**
   * 错误统一处理
   * @param {'image'|'video'} type - 文件类型标识
   * @param {Error} error - 错误对象
   */
  _handleError(type, error) {
    console.error(`${type}上传失败:`, error);
    this.dom.statusMessage.textContent = `${type}上传失败: ${error.message}`;
    alert(`上传失败: ${error.message}`);
  }
}