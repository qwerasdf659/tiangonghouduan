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

class LotteryServiceContainer {
  constructor () {
    this.user_service = new LotteryUserService()
    this.history_service = new LotteryHistoryService()
  }

  /**
   * 获取用户服务实例
   * @returns {LotteryUserService}
   */
  get_user_service () {
    return this.user_service
  }

  /**
   * 获取历史服务实例
   * @returns {LotteryHistoryService}
   */
  get_history_service () {
    return this.history_service
  }

  /**
   * 获取所有服务实例
   * @returns {Object}
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
