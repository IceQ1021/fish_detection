/**
 * 检测结果渲染控制器
 * 负责处理图像/视频检测结果的可视化展示及界面管理
 */
export class DetectionRenderer {
  constructor() {
    // 初始化DOM元素引用
    this.canvasElements = {
      resultCanvas: document.getElementById('resultCanvas'),
      videoOverlay: document.getElementById('videoOverlay')
    };
    this.videoElements = {
      processedVideo: document.getElementById('processedVideo')
    };

    // 初始化检测数据存储
    this.detectionData = {
      videoDetections: {},    // 视频检测结果存储（帧号: 结果数组）
      currentVideoFrame: 0,   // 当前视频帧号
      videoFPS: 30            // 视频帧率（默认30fps）
    };
  }

  /* ========================
     公共操作方法
  ======================== */

  /**
   * 展示图像检测结果
   * @param {File} file - 图像文件对象
   * @param {Array} detections - 检测结果数组
   */
  displayImageResults(file, detections) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = this._calculateScale(img);
        this._drawImage(img, scale);
        this._drawDetectionBoxes(detections, scale);
        this.updateResultTable(detections);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * 处理视频检测结果
   * @param {File} file - 视频文件对象
   * @param {Array} detections - 检测结果数组
   * @param {number} fps - 视频帧率
   */
  processVideoResults(file, detections, fps) {
    this._showVideoResult();
    this.detectionData.videoFPS = fps;
    this._storeDetections(detections);
    this._setupVideoSource(file);
  }

  /**
   * 重置视频检测状态
   */
  resetVideo() {
    const video = this.videoElements.processedVideo;
    video.pause();
    video.src = ""; 
    video.currentTime = 0;

    // 清理叠加层画布
    const overlayCtx = this.canvasElements.videoOverlay.getContext('2d');
    overlayCtx.clearRect(0, 0, 
      this.canvasElements.videoOverlay.width, 
      this.canvasElements.videoOverlay.height
    );

    this.updateResultTable([]); 
    URL.revokeObjectURL(video.src);
    this.showImageResult();
  }

  /**
   * 清空所有检测结果
   */
  clearResults() {
    // 清理图像画布
    const imageCtx = this.canvasElements.resultCanvas.getContext('2d');
    imageCtx.clearRect(0, 0, 
      this.canvasElements.resultCanvas.width, 
      this.canvasElements.resultCanvas.height
    );

    // 清理视频叠加层
    const videoCtx = this.canvasElements.videoOverlay.getContext('2d');
    videoCtx.clearRect(0, 0, 
      this.canvasElements.videoOverlay.width, 
      this.canvasElements.videoOverlay.height
    );

    this.updateResultTable([]);

    // 重置视频元素
    if (this.videoElements.processedVideo) {
      this.videoElements.processedVideo.pause();
      this.videoElements.processedVideo.src = '';
    }

    this.showImageResult();
  }

  /* ========================
     界面更新方法
  ======================== */

  /**
   * 更新结果表格数据
   * @param {Array} detections - 检测结果数组
   */
  updateResultTable(detections) {
    const tbody = document.getElementById('resultTableBody');
    tbody.innerHTML = detections?.length 
      ? detections.map((det, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${det.fish_cn} (${det.fish_en})</td>
            <td>${det.count || 1}</td>
            <td>${det.confidence.toFixed(2)}</td>
            <td>${det.time ? det.time.toFixed(2) + 's' : '-'}</td>
            <td>[${det.bbox.join(', ')}]</td>
          </tr>
        `).join('')
      : '<tr><td colspan="6">未检测到鱼类</td></tr>';
  }

  /**
   * 切换至图像结果显示模式
   */
  showImageResult() {
    document.getElementById('imageResult').style.display = 'block';
    document.getElementById('videoResult').style.display = 'none';
  }

  /* ========================
     内部工具方法
  ======================== */

  /**
   * 计算图像缩放比例
   * @param {HTMLImageElement} img - 图像元素
   * @returns {number} 缩放比例
   */
  _calculateScale(img) {
    const maxWidth = this.canvasElements.resultCanvas.parentElement.clientWidth;
    const maxHeight = this.canvasElements.resultCanvas.parentElement.clientHeight;
    return Math.min(maxWidth / img.width, maxHeight / img.height);
  }

  /**
   * 绘制基础图像到画布
   * @param {HTMLImageElement} img - 图像元素
   * @param {number} scale - 缩放比例
   */
  _drawImage(img, scale) {
    const ctx = this.canvasElements.resultCanvas.getContext('2d');
    const canvas = this.canvasElements.resultCanvas;
    
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  /**
   * 绘制检测边界框
   * @param {Array} detections - 检测结果数组
   * @param {number} scale - 缩放比例
   */
  _drawDetectionBoxes(detections, scale) {
    const ctx = this.canvasElements.resultCanvas.getContext('2d');
    
    detections.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox.map(v => v * scale);
      
      // 绘制矩形框
      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 绘制标签文字
      ctx.fillStyle = 'red';
      ctx.font = '16px Arial';
      ctx.fillText(`${det.fish_cn} (${det.confidence.toFixed(2)})`, x1, y1 - 5);
    });
  }

  /**
   * 存储视频检测结果（按帧号分组）
   * @param {Array} detections - 检测结果数组
   */
  _storeDetections(detections) {
    this.detectionData.videoDetections = detections.reduce((acc, det) => {
      (acc[det.frame] || (acc[det.frame] = [])).push(det);
      return acc;
    }, {});
  }

  /**
   * 初始化视频源并设置元数据
   * @param {File} file - 视频文件对象
   */
  _setupVideoSource(file) {
    const video = this.videoElements.processedVideo;
    video.src = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      const overlay = this.canvasElements.videoOverlay;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    };
    
    video.ontimeupdate = () => this._updateVideoDetection();
  }

  /**
   * 更新视频帧检测结果
   */
  _updateVideoDetection() {
    const video = this.videoElements.processedVideo;
    const frame = Math.floor(video.currentTime * this.detectionData.videoFPS);
    
    if (frame !== this.detectionData.currentVideoFrame && 
        this.detectionData.videoDetections[frame]) {
      this.detectionData.currentVideoFrame = frame;
      
      // 清理并绘制当前帧结果
      const ctx = this.canvasElements.videoOverlay.getContext('2d');
      ctx.clearRect(0, 0, 
        this.canvasElements.videoOverlay.width, 
        this.canvasElements.videoOverlay.height
      );

      this.detectionData.videoDetections[frame].forEach(det => {
        const [x1, y1, x2, y2] = det.bbox;
        
        ctx.beginPath();
        ctx.rect(x1, y1, x2 - x1, y2 - y1);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.fillText(`${det.fish_cn} (${det.confidence.toFixed(2)})`, x1, y1 - 5);
      });

      this.updateResultTable(this.detectionData.videoDetections[frame]);
    }
  }

  /**
   * 切换至视频结果显示模式
   */
  _showVideoResult() {
    document.getElementById('imageResult').style.display = 'none';
    document.getElementById('videoResult').style.display = 'block';
  }
}