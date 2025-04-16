/**
 * 认证服务模块
 * 处理用户登录、权限验证、会话管理等核心功能
 */
export class AuthService {
  // 角色枚举定义
  static roles = {
    ADMIN: 'admin',
    USER: 'user'
  }

  // 测试账户配置（开发环境使用）
  static testAccounts = {
    admin: { password: 'admin123', role: this.roles.ADMIN },
    user: { password: 'user123', role: this.roles.USER }
  }

  /**
   * 用户登录方法
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<{token: string, role: string}>} 认证令牌和角色
   * @throws {Error} 登录失败时抛出错误
   */
  static async login(username, password) {
    return new Promise((resolve, reject) => {
      // 模拟网络延迟（500ms）
      setTimeout(() => {
        const account = this.testAccounts[username];
        
        // 验证账户凭证
        if (account && account.password === password) {
          resolve({
            token: btoa(`${username}:${password}`), // Base64编码令牌
            role: account.role
          });
        } else {
          reject(new Error('用户名或密码错误'));
        }
      }, 500);
    });
  }

  /**
   * 获取当前登录用户信息
   * @returns {Object|null} 用户信息对象或null
   */
  static getCurrentUser() {
    const authData = localStorage.getItem('auth');
    return authData ? JSON.parse(authData) : null;
  }

  /**
   * 用户注销方法
   * 清除本地存储并跳转至登录页
   */
  static logout() {
    localStorage.removeItem('auth');
    window.location.href = '../html/login.html';
  }

  /**
   * 权限验证方法
   * @param {Array<string>} requiredRoles - 允许访问的角色数组
   * @returns {boolean} 是否具有访问权限
   */
  static checkPermission(requiredRoles) {
    const user = this.getCurrentUser();
    const hasPermission = user && requiredRoles.includes(user.role);
    
    // 无权限时自动注销
    if (!hasPermission) {
      this.logout();
      return false;
    }
    return true;
  }
}

// ========================
// 登录表单事件绑定
// ========================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    // 获取表单输入
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // 执行登录认证
    const { token, role } = await AuthService.login(username, password);
    
    // 保存会话信息
    localStorage.setItem('auth', JSON.stringify({ token, role }));
    
    // 根据角色跳转页面
    const redirectPath = role === AuthService.roles.ADMIN 
      ? './admin.html' 
      : '../index.html';
    window.location.href = redirectPath;

  } catch (error) {
    // 显示错误提示
    const errorMessage = document.getElementById('loginMessage');
    errorMessage.textContent = error.message;
    errorMessage.style.display = 'block';
  }
});