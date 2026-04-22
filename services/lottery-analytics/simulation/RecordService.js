'use strict'

/**
 * SimulationRecordService - 模拟记录 CRUD
 *
 * 方法：saveSimulationRecord, getSimulationHistory, getSimulationRecord
 */
class SimulationRecordService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 保存模拟记录到数据库
   *
   * @param {Object} recordData - 记录数据
   * @param {number} recordData.lottery_campaign_id - 活动ID
   * @param {string|null} recordData.simulation_name - 模拟名称
   * @param {number} recordData.simulation_count - 迭代次数
   * @param {Object} recordData.proposed_config - 提议参数
   * @param {Object} recordData.scenario - 场景配置
   * @param {Object} recordData.simulation_result - 模拟结果
   * @param {Object} recordData.comparison - 对比分析
   * @param {Object} recordData.risk_assessment - 风险评估
   * @param {number|null} recordData.created_by - 创建者用户ID
   * @returns {Promise<Object>} 创建的记录
   */
  async saveSimulationRecord(recordData) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.create(recordData)
  }

  /**
   * 获取指定活动的模拟历史列表
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {number} options.page_size - 返回条数（兼容 options.limit）
   * @param {number} options.offset - 偏移量
   * @returns {Promise<{rows: Object[], count: number}>} 分页历史列表
   */
  async getSimulationHistory(lottery_campaign_id, options = {}) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.getHistoryByCampaign(lottery_campaign_id, options)
  }

  /**
   * 获取单条模拟记录详情
   *
   * @param {number} lottery_simulation_record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情，不存在返回 null
   */
  async getSimulationRecord(lottery_simulation_record_id) {
    const { LotterySimulationRecord } = this.models
    return LotterySimulationRecord.findByPk(lottery_simulation_record_id)
  }
}

module.exports = SimulationRecordService
