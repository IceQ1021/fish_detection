import { AuthService } from './auth.js';
import * as echarts from 'https://cdn.jsdelivr.net/npm/echarts@5.4.2/dist/echarts.esm.min.js';

/**
 * 管理端数据看板核心类
 * 处理数据加载、可视化展示和用户交互
 */
export class Dashboard {
  constructor() {
    // 初始化流程控制
    this.initAuthCheck();
    if (!AuthService.checkPermission(AuthService.roles.ADMIN)) return;

    this.initChart();          // 图表初始化
    this.loadData();           // 初始数据加载
    this.setupAutoRefresh();   // 自动刷新定时器
    this.bindUIEvents();       // 用户事件绑定
  }

  /**
   * 初始化权限验证
   * 检测管理员权限，未授权用户跳转登录页
   */
  initAuthCheck() {
    const user = AuthService.getCurrentUser();
    if (user?.role !== AuthService.roles.ADMIN) {
      this.showAuthError();
      setTimeout(() => AuthService.logout(), 1500);
    }
  }

  /**
   * 加载仪表盘数据
   * 从后端API获取最新数据并更新视图
   */
  async loadData() {
    try {
      const response = await fetch('http://localhost:8000/dashboard');
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      
      const data = await response.json();
      this.updateStats(data);          // 更新统计卡片
      this.generateTrendData(data);    // 生成趋势数据
    } catch (error) {
      console.error('数据加载失败:', error);
      this.showError('数据加载失败，请检查网络连接');
    }
  }

  /**
   * 更新统计卡片数据
   * @param {Object} data - 后端返回的统计数据
   */
  updateStats(data) {
    // 图像检测数据
    this.updateElement('totalDetections', data.total_image_detections);
    this.updateElement('todayDetections', data.today_image_detections);
    this.updateElement('totalAlerts', data.total_image_alerts);
    this.updateElement('todayAlerts', data.today_image_alerts);

    // 视频检测数据 
    this.updateElement('totalVideoDetections', data.total_video_detections);
    this.updateElement('todayVideoDetections', data.today_video_detections);
    this.updateElement('totalVideoAlerts', data.total_video_alerts);
    this.updateElement('todayVideoAlerts', data.today_video_alerts);

    // 问答数据
    this.updateElement('qaCount', data.question_answer_count);
  }

  /**
   * 生成模拟趋势数据（示例实现）
   * @param {Object} apiData - 基础数据源
   */
  generateTrendData(apiData) {
    const trendData = [];
    const baseDate = new Date();
    
    // 生成最近7天数据
    for (let i = 6; i >= 0; i--) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() - i);
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 20) + apiData.total_image_alerts % 10
      });
    }
    
    this.updateChart(trendData);
  }

  /**
   * 初始化ECharts图表实例
   */
  initChart() {
    this.chart = echarts.init(document.getElementById('trendChart'));
    this.chart.setOption({
      title: { 
        text: '预警趋势分析',
        left: 'center',
        textStyle: {
          color: '#2c3e50',
          fontSize: 18
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: '{b}<br />预警数量: {c}'
      },
      xAxis: {
        type: 'category',
        axisLabel: { color: '#666' }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#666' }
      },
      series: [{
        name: '预警数量',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#e74c3c' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(231, 76, 60, 0.2)' },
            { offset: 1, color: 'rgba(231, 76, 60, 0.05)' }
          ])
        }
      }],
      grid: {
        containLabel: true,
        left: '3%',
        right: '3%'
      }
    });
  }

  /**
   * 更新图表数据
   * @param {Array} data - 趋势数据数组
   */
  updateChart(data) {
    this.chart.setOption({
      xAxis: { data: data.map(d => d.date) },
      series: [{ data: data.map(d => d.count) }]
    });
  }

  /**
   * 更新DOM元素内容
   * @param {string} id - 元素ID
   * @param {number} value - 要显示的值
   */
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value.toLocaleString();
      element.classList.add('value-updated');
      setTimeout(() => element.classList.remove('value-updated'), 500);
    }
  }

  /**
   * 设置30秒自动刷新
   */
  setupAutoRefresh() {
    setInterval(() => this.loadData(), 30000);
  }

  /**
   * 绑定所有UI事件
   */
  bindUIEvents() {
    this.bindLogoutEvent();
    this.bindHistoryEvent();
  }

  /**
   * 绑定退出登录事件
   */
  bindLogoutEvent() {
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      if (confirm('确定要退出登录吗？')) {
        AuthService.logout();
      }
    });
  }

  /**
   * 绑定历史记录跳转事件
   */
  bindHistoryEvent() {
    document.getElementById('historyBtn')?.addEventListener('click', () => {
      window.location.href = './history.html';
    });
  }

  /**
   * 显示权限错误提示
   */
  showAuthError() {
    document.body.innerHTML = `
      <div class="auth-error">
        <h2>权限不足</h2>
        <p>正在跳转至登录页面...</p>
      </div>
    `;
  }

  /**
   * 显示临时错误提示
   * @param {string} message - 要显示的错误信息
   */
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <div class="error-content">
        <span>⚠️</span>
        <p>${message}</p>
      </div>
    `;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }
}

// 初始化看板实例
new Dashboard();