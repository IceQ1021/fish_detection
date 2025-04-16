/**
 * 系统主入口模块
 * 负责初始化核心组件、管理全局状态及协调模块间通信
 */
import { config } from './config.js';
import { CameraController } from './camera.js';
import { WebSocketManager } from './websocket.js';
import { FileUploader } from './upload.js';
import { DetectionRenderer } from './detection.js';
import { QAVoiceModule } from './qa-voice.js';
import { AuthService } from './auth.js';
import { AlertManager } from './alert.js';

// ========================
// DOM 元素管理
// ========================
/** 
 * 全局DOM元素引用集合
 * @typedef {Object} DOMElements
 * @property {HTMLButtonElement} startCameraBtn - 摄像头启动按钮
 * @property {HTMLButtonElement} startDetectionBtn - 检测启动按钮
 * @property {HTMLButtonElement} stopCameraBtn - 摄像头停止按钮
 * @property {HTMLVideoElement} videoElement - 视频元素
 * @property {HTMLElement} statusMessage - 状态显示元素
 */

let domElements;

/**
 * 初始化全局DOM元素引用
 */
function initDOMElements() {
  domElements = {
    startCameraBtn: document.getElementById('startCameraBtn'),
    startDetectionBtn: document.getElementById('startDetectionBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    uploadImageBtn: document.getElementById('uploadImageBtn'),
    uploadVideoBtn: document.getElementById('uploadVideoBtn'),
    videoElement: document.getElementById('videoElement'),
    statusMessage: document.getElementById('statusMessage'),
    imageResult: document.getElementById('imageResult'),
    videoResult: document.getElementById('videoResult'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    stopVideoBtn: document.getElementById('stopVideoBtn')
  };
}

// ========================
// 模块实例化
// ========================
let cameraController;   // 摄像头控制器实例
let wsManager;          // WebSocket管理器实例
let fileUploader;       // 文件上传器实例
let detectionRenderer;  // 检测结果渲染器实例

// ========================
// 全局状态管理
// ========================
/**
 * 应用全局状态对象
 * @typedef {Object} AppState
 * @property {boolean} isDetecting - 是否处于检测状态
 * @property {'image'|'video'} currentMode - 当前检测模式
 * @property {Object|null} currentDetection - 当前检测结果
 */
const appState = {
  isDetecting: false,
  currentMode: 'image',
  currentDetection: null
};

// 暴露到全局用于调试（生产环境应移除）
window.appState = appState;

// ========================
// 事件监听管理
// ========================
/**
 * 初始化全局事件监听
 */
function initEventListeners() {
  _initCameraControls();
  _initDetectionControls();
}

/**
 * 初始化摄像头相关控制事件
 */
function _initCameraControls() {
  // 摄像头启动
  domElements.startCameraBtn.addEventListener('click', async () => {
    try {
      await cameraController.start();
      domElements.startDetectionBtn.disabled = false;
      domElements.stopCameraBtn.disabled = false;
      domElements.statusMessage.textContent = '摄像头已就绪';
    } catch (error) {
      console.error('摄像头启动失败:', error);
      domElements.statusMessage.textContent = `错误：${error.message}`;
    }
  });

  // 摄像头停止
  domElements.stopCameraBtn.addEventListener('click', () => {
    wsManager.disconnect();
    cameraController.stop();
    domElements.startDetectionBtn.disabled = true;
    domElements.stopCameraBtn.disabled = true;
  });
}

/**
 * 初始化检测相关控制事件
 */
function _initDetectionControls() {
  // 实时检测启动
  domElements.startDetectionBtn.addEventListener('click', () => {
    detectionRenderer.clearResults();

    if (!cameraController.stream?.active) {
      alert('请先开启有效的摄像头');
      return;
    }

    // 启动帧捕获循环
    cameraController.captureFrame(frame => {
      wsManager.sendFrame(frame);
    });

    // 连接WebSocket服务
    wsManager.connect(domElements.videoElement);
    appState.isDetecting = true;
  });

  // 视频播放控制
  domElements.playPauseBtn.addEventListener('click', () => {
    const video = detectionRenderer.videoElements.processedVideo;
    video.paused ? video.play() : video.pause();
  });

  // 视频停止
  domElements.stopVideoBtn.addEventListener('click', () => {
    detectionRenderer.resetVideo();
  });
}

// ========================
// 用户认证管理
// ========================
/**
 * 初始化登出功能
 */
function initLogoutButton() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('确定要退出登录吗？')) {
      AuthService.logout();
      window.location.href = 'html/login.html';
    }
  });
}

// ========================
// 主初始化流程
// ========================
document.addEventListener('DOMContentLoaded', () => {
  // 初始化顺序说明：
  // 1. DOM元素 -> 2.核心模块 -> 3.辅助模块 -> 4.事件监听 -> 5.界面状态

  // 阶段1: DOM初始化
  initDOMElements();

  // 阶段2: 核心模块初始化
  cameraController = new CameraController(
    domElements.videoElement,
    domElements.statusMessage
  );
  detectionRenderer = new DetectionRenderer();
  fileUploader = new FileUploader(detectionRenderer);
  fileUploader.init();

  // 阶段3: 辅助模块初始化
  const alertManager = new AlertManager();
  alertManager.init();
  initLogoutButton();

  // 阶段4: 网络通信模块初始化
  wsManager = new WebSocketManager(config, {
    onOpen: () => {
      domElements.statusMessage.textContent = '已连接检测服务器';
      domElements.startDetectionBtn.disabled = true;
    },
    onMessage: detections => {
      if (detections?.length) {
        detectionRenderer.updateResultTable(detections);
        domElements.statusMessage.textContent = `检测到${detections.length}个目标`;
      }
    },
    onAlert: message => {
      alertManager.showAlert(message);
    },
    onError: error => {
      console.error('WebSocket 错误详情:', error);
      domElements.statusMessage.textContent = '连接异常，3秒后重试...';
      setTimeout(() => wsManager.connect(domElements.videoElement), 3000);
    }
  });

  // 阶段5: 事件监听绑定
  initEventListeners();

  // 阶段6: 初始化界面状态
  detectionRenderer.showImageResult();

  // 智能问答模块
  const qaModule = new QAVoiceModule();
  detectionRenderer.onDetectionComplete = (data) => {
    window.appState.currentDetection = data || {};
    qaModule?.updateDetectionContext(data);
  };
});