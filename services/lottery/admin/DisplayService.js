/**
 * V4.7.0 管理后台抽奖活动展示控制服务（LotteryCampaignDisplayService）
 *
 * 业务场景：管理员对抽奖活动的展示属性进行控制
 *
 * 核心功能：
 * 1. toggleFeatured - 切换活动精选状态
 * 2. toggleHidden - 切换活动隐藏状态
 * 3. updateDisplayConfig - 更新活动展示配置（标签、展示时间窗口）
 * 4. batchSort - 批量更新活动排序
 *
 * 拆分自：CRUDService.js（展示控制方法独立为子服务）
 */

const { LotteryCampaign } = require('../../../models')
const logger = require('../../../utils/logger').logger

class LotteryCampaignDisplayService {
  /**
   * 切换活动精选状态
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {boolean} is_featured - 是否精选
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的活动
   */
  static async toggleFeatured(lottery_campaign_id, is_featured, options = {}) {
    const { transaction } = options

    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id, { transaction })
    if (!campaign) {
      const err = new Error('活动不存在')
      err.statusCode = 404
      throw err
    }

    await campaign.update({ is_featured: is_featured ? 1 : 0 }, { transaction })
    logger.info('活动精选状态变更', { lottery_campaign_id, is_featured })
    return { lottery_campaign_id, is_featured: !!campaign.is_featured }
  }

  /**
   * 切换活动隐藏状态
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {boolean} is_hidden - 是否隐藏
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的活动
   */
  static async toggleHidden(lottery_campaign_id, is_hidden, options = {}) {
    const { transaction } = options

    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id, { transaction })
    if (!campaign) {
      const err = new Error('活动不存在')
      err.statusCode = 404
      throw err
    }

    await campaign.update({ is_hidden: is_hidden ? 1 : 0 }, { transaction })
    logger.info('活动隐藏状态变更', { lottery_campaign_id, is_hidden })
    return { lottery_campaign_id, is_hidden: !!campaign.is_hidden }
  }

  /**
   * 更新活动展示配置（标签、展示时间窗口）
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} displayConfig - 展示配置
   * @param {number} [displayConfig.sort_order] - 排序权重
   * @param {boolean} [displayConfig.is_featured] - 是否精选
   * @param {boolean} [displayConfig.is_hidden] - 是否隐藏
   * @param {Array} [displayConfig.display_tags] - 展示标签
   * @param {string} [displayConfig.display_start_time] - 展示开始时间
   * @param {string} [displayConfig.display_end_time] - 展示结束时间
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的活动
   */
  static async updateDisplayConfig(lottery_campaign_id, displayConfig, options = {}) {
    const { transaction } = options

    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id, { transaction })
    if (!campaign) {
      const err = new Error('活动不存在')
      err.statusCode = 404
      throw err
    }

    const allowedFields = [
      'sort_order',
      'is_featured',
      'is_hidden',
      'display_tags',
      'display_start_time',
      'display_end_time'
    ]
    const updateData = {}
    for (const field of allowedFields) {
      if (displayConfig[field] !== undefined) {
        updateData[field] = displayConfig[field]
      }
    }

    await campaign.update(updateData, { transaction })
    logger.info('活动展示配置更新', { lottery_campaign_id, fields: Object.keys(updateData) })
    return campaign.toJSON()
  }

  /**
   * 批量更新活动排序
   *
   * @param {Array<Object>} items - [{ lottery_campaign_id, sort_order }]
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新结果
   */
  static async batchSort(items, options = {}) {
    const { transaction } = options

    if (!Array.isArray(items) || items.length === 0) {
      const err = new Error('排序数据不能为空')
      err.statusCode = 400
      throw err
    }

    let updated = 0
    for (const { lottery_campaign_id, sort_order } of items) {
      if (!lottery_campaign_id || sort_order === undefined) continue
      const [count] = await LotteryCampaign.update(
        { sort_order: parseInt(sort_order) },
        { where: { lottery_campaign_id }, transaction }
      )
      updated += count
    }

    logger.info('活动批量排序完成', { total: items.length, updated })
    return { total: items.length, updated }
  }
}

module.exports = LotteryCampaignDisplayService
