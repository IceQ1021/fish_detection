/**
 * Ollama 模型交互接口
 * 提供与本地Ollama服务的问答交互能力
 */
export class OllamaAPI {
  /**
   * 执行模型查询请求
   * @param {string} prompt - 用户提问内容
   * @param {Object} [context] - 上下文检测数据
   * @returns {Promise<string>} 模型生成的回答
   * @throws {Error} 请求失败时抛出错误
   */
  static async query(prompt, context) {
    try {
      // 构建授权头
      const authToken = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      };

      // 构造请求体
      const body = JSON.stringify({
        prompt: this._buildPrompt(prompt, context)
      });

      // 发送模型请求
      const response = await fetch('http://localhost:8000/ask-question', {
        method: 'POST',
        headers,
        body
      });

      // 处理响应状态
      if (!response.ok) {
        throw new Error(`请求失败: ${response.statusText}`);
      }

      // 解析响应数据
      const data = await response.json();
      return data.response || data.error;

    } catch (error) {
      throw new Error(`模型请求失败: ${error.message}`);
    }
  }

  /**
   * 构建模型提示词（私有方法）
   * @param {string} question - 用户原始问题
   * @param {Object} [context] - 上下文检测数据
   * @returns {string} 结构化提示词
   * @private
   */
  static _buildPrompt(question, context) {
    // 安全获取检测上下文
    const safeContext = context?.detections?.[0] || {};
    const confidence = (safeContext.confidence * 100).toFixed(1); // 转换为百分比

    // 结构化提示模板
    return `
      [当前检测] 名称：${safeContext.fish_cn || '未知'}，置信度：${confidence}%
      [用户问题] ${question}
      [回答要求] 专业鱼类知识，不超过200字
    `.trim();
  }
}