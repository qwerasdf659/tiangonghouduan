/**
 * Lottery服务模块索引
 * 提供统一的抽奖服务访问接口
 *
 * @description 基于snake_case命名格式的服务容器，移除冗余的LotteryExecutionService
 * @version 4.0.0
 * @date 2025-09-25
 */

const LotteryUserService = require('./LotteryUserService')
const LotteryHistoryService = require('./LotteryHistoryService')

/**
 * 抽奖服务容器
 *
 * 业务场景：
 * - 统一管理抽奖相关的服务实例
 * - 提供单例模式的服务访问接口
 * - 消除服务重复实例化的问题
 *
 * 管理的服务：
 * - LotteryUserService：用户抽奖资格验证服务
 * - LotteryHistoryService：抽奖历史查询服务
 *
 * 设计模式：
 * - 单例模式：确保每个服务只有一个实例
 * - 容器模式：统一管理多个相关服务
 * - 懒加载：仅在首次访问时创建服务实例
 *
 * 命名约定：
 * - 使用snake_case命名（符合项目统一规范）
 * - 服务实例：user_service、history_service
 * - 访问方法：get_user_service()、get_history_service()
 *
 * 使用方式：
 * ```javascript
 * const { lottery_service_container } = require('./services/lottery')
 *
 * // 获取用户服务
 * const userService = lottery_service_container.get_user_service()
 *
 * // 获取历史服务
 * const historyService = lottery_service_container.get_history_service()
 *
 * // 获取所有服务
 * const allServices = lottery_service_container.get_all_services()
 * ```
 *
 * 性能优化：
 * - 单例模式避免重复实例化（减少内存占用）
 * - 统一容器管理（便于依赖注入和测试）
 *
 * 创建时间：2025年09月25日
 * 最后更新：2025年10月30日
 *
 * @class LotteryServiceContainer
 */
class LotteryServiceContainer {
  /**
   * 构造函数 - 初始化抽奖服务容器
   *
   * 功能说明：
   * - 实例化LotteryUserService（用户服务）
   * - 实例化LotteryHistoryService（历史服务）
   * - 使用snake_case命名存储服务实例
   *
   * 设计决策：
   * - 在构造函数中立即实例化所有服务（而非懒加载）
   * - 确保服务实例在容器生命周期内保持不变
   *
   * @constructor
   */
  constructor () {
    // LotteryUserService 和 LotteryHistoryService 都是类，需要实例化
    this.user_service = new LotteryUserService()
    this.history_service = new LotteryHistoryService()
  }

  /**
   * 获取用户服务实例
   * @returns {LotteryUserService} 用户抽奖资格验证服务实例
   */
  get_user_service () {
    return this.user_service
  }

  /**
   * 获取历史服务实例
   * @returns {LotteryHistoryService} 抽奖历史查询服务实例
   */
  get_history_service () {
    return this.history_service
  }

  /**
   * 获取所有服务实例
   * @returns {Object} 包含所有服务实例的对象 {user_service, history_service}
   */
  get_all_services () {
    return {
      user_service: this.user_service,
      history_service: this.history_service
    }
  }
}

// 创建单例实例
const lottery_service_container = new LotteryServiceContainer()

module.exports = {
  LotteryUserService,
  LotteryHistoryService,
  LotteryServiceContainer,
  lottery_service_container
}
