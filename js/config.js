/**
 * 系统全局配置模块
 * 包含API接口、WebSocket连接及认证凭据等配置项
 */

export const config = {
  // ======================
  // 后端服务配置
  // ======================
  /** 
   * API基础地址 
   * @type {string}
   * @example 'http://api.example.com/v1'
   */
  apiBase: 'http://localhost:8000',

  /**
   * WebSocket服务地址
   * @type {string}
   * @example 'wss://api.example.com/ws'
   */
  wsUrl: 'ws://localhost:8000/ws/fish-detection',

  // ======================
  // 认证配置
  // ======================
  /** 
   * 测试环境认证凭据
   * @warning 生产环境必须替换为安全认证方式
   * @type {Object}
   * @property {string} username - 测试用户名
   * @property {string} password - 测试密码
   */
  credentials: {
    username: 'admin',
    password: 'admin123'
  },

  // ======================
  // 功能开关（预留扩展）
  // ======================
  /** 
   * 调试模式开关
   * @type {boolean}
   * @default false
   */
  debugMode: false
};