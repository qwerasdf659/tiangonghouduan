/**
 * 测试协调器 (Test Coordinator) V4 - 简化版
 * 提供测试请求封装和认证管理
 * 创建时间：2025年01月21日 北京时间
 * 更新时间：2025年10月31日 北京时间
 * 使用模型：Claude Sonnet 4
 * 优化说明：
 * - 移除未使用的测试套件初始化（security、performance、business、mysql、quality）
 * - 保留实际使用的核心功能（请求封装、认证管理）
 * - 添加缺失的waitForV4Engine方法
 *
 * 核心功能：
 * 1. 提供统一的HTTP请求封装
 * 2. 管理测试用户认证
 * 3. 等待V4引擎启动
 * 4. 清理测试资源
 */

const BaseTestManager = require('./core/base_test_manager')

/**
 * 测试协调器类
 * @class TestCoordinator
 * @extends BaseTestManager
 */
class TestCoordinator extends BaseTestManager {
  /**
   * 创建测试协调器实例
   * @param {string} baseUrl - API基础URL
   */
  constructor(baseUrl = 'http://localhost:3000') {
    super(baseUrl)
    console.log('[TestCoordinator] 测试协调器初始化完成')
  }

  /**
   * ⏰ 等待V4引擎启动就绪
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<boolean>} 是否就绪
   */
  async waitForV4Engine(timeout = 30000) {
    console.log('⏰ 等待V4统一引擎启动就绪...')
    const start_time = Date.now()
    const check_interval = 1000 // 每秒检查一次

    while (Date.now() - start_time < timeout) {
      try {
        const response = await this.make_request('GET', '/api/v4/lottery/health')
        if (response.status === 200 && response.data.success) {
          const elapsed = Math.round((Date.now() - start_time) / 1000)
          console.log(`✅ V4引擎已就绪 (等待${elapsed}秒)`)
          return true
        }
      } catch (error) {
        // 引擎尚未就绪，继续等待
      }

      // 等待后再次检查
      await new Promise(resolve => setTimeout(resolve, check_interval))
    }

    throw new Error(`V4引擎启动超时 (${timeout}ms)`)
  }
}

module.exports = TestCoordinator
