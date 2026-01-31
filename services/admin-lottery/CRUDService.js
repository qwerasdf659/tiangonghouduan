/**
 * V4.7.0 管理后台抽奖活动 CRUD 服务（LotteryCampaignCRUDService）
 *
 * 业务场景：管理员对抽奖活动的 CRUD 操作
 *
 * 核心功能：
 * 1. createCampaign - 创建抽奖活动
 * 2. updateCampaign - 更新抽奖活动
 * 3. updateCampaignStatus - 更新活动状态
 * 4. deleteCampaign - 删除抽奖活动
 *
 * 架构规范：
 * - 所有写操作通过此服务层统一处理
 * - 路由层不直接操作 LotteryCampaign 模型的写方法
 * - 遵循 "Service + options.transaction" 模式
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作强制要求外部事务传入（options.transaction）
 * - 未提供事务时直接报错，由入口层统一管理事务
 *
 * 创建时间：2026-01-31
 * 拆分自：routes/v4/console/system-data.js（路由层直接操作模型）
 */

const { LotteryCampaign, LotteryPrize } = require('../../models')
const logger = require('../../utils/logger').logger
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 抽奖活动 CRUD 服务类
 *
 * @class LotteryCampaignCRUDService
 * @description 封装抽奖活动的 CRUD 操作，统一写操作入口
 */
class LotteryCampaignCRUDService {
  /**
   * 创建抽奖活动
   *
   * 业务场景：
   * - 管理员创建新的抽奖活动
   * - 设置活动基本信息、时间范围、预算配置等
   *
   * @param {Object} campaignData - 活动数据
   * @param {string} campaignData.campaign_name - 活动名称（必填）
   * @param {string} campaignData.campaign_code - 活动代码（必填，唯一标识）
   * @param {string} campaignData.campaign_type - 活动类型（必填）
   * @param {string} [campaignData.description] - 活动描述
   * @param {Date} [campaignData.start_time] - 开始时间
   * @param {Date} [campaignData.end_time] - 结束时间
   * @param {string} [campaignData.status='draft'] - 活动状态
   * @param {string} [campaignData.rules_text] - 活动规则文本
   * @param {string} [campaignData.budget_mode='user'] - 预算模式
   * @param {number} [campaignData.cost_per_draw=10] - 单次抽奖消耗积分
   * @param {number} [campaignData.max_draws_per_user_daily=3] - 每日最大抽奖次数
   * @param {number} [campaignData.max_draws_per_user_total] - 总最大抽奖次数
   * @param {number} [campaignData.total_prize_pool=0] - 总奖池
   * @param {number} [campaignData.remaining_prize_pool=0] - 剩余奖池
   * @param {Object} [campaignData.prize_distribution_config] - 奖品分布配置
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 创建的活动对象
   * @throws {Error} 必填字段缺失、活动代码重复等
   *
   * @example
   * const campaign = await LotteryCampaignCRUDService.createCampaign(
   *   { campaign_name: '新年活动', campaign_code: 'NY2026', campaign_type: 'normal' },
   *   { transaction, operator_user_id: 123 }
   * )
   */
  static async createCampaign(campaignData, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.createCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    // 验证必填字段
    const { campaign_name, campaign_code, campaign_type } = campaignData
    if (!campaign_name) {
      const error = new Error('活动名称不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }
    if (!campaign_code) {
      const error = new Error('活动代码不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }
    if (!campaign_type) {
      const error = new Error('活动类型不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }

    logger.info('开始创建抽奖活动', {
      campaign_name,
      campaign_code,
      campaign_type,
      operator_user_id
    })

    // 检查活动代码是否已存在
    const existingCampaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })

    if (existingCampaign) {
      const error = new Error(`活动代码 ${campaign_code} 已存在`)
      error.code = 'DUPLICATE_CAMPAIGN_CODE'
      error.statusCode = 409
      throw error
    }

    // 创建活动
    const campaign = await LotteryCampaign.create(
      {
        campaign_name,
        campaign_code,
        campaign_type,
        description: campaignData.description || '',
        start_time: campaignData.start_time ? new Date(campaignData.start_time) : null,
        end_time: campaignData.end_time ? new Date(campaignData.end_time) : null,
        status: campaignData.status || 'draft',
        rules_text: campaignData.rules_text || '',
        budget_mode: campaignData.budget_mode || 'user',
        cost_per_draw: campaignData.cost_per_draw || 10,
        max_draws_per_user_daily: campaignData.max_draws_per_user_daily || 3,
        max_draws_per_user_total: campaignData.max_draws_per_user_total || null,
        total_prize_pool: campaignData.total_prize_pool || 0,
        remaining_prize_pool: campaignData.remaining_prize_pool || 0,
        prize_distribution_config: campaignData.prize_distribution_config || { tiers: [] },
        created_by: operator_user_id
      },
      { transaction }
    )

    logger.info('创建抽奖活动成功', {
      campaign_id: campaign.campaign_id,
      campaign_name,
      campaign_code,
      operator_user_id
    })

    return campaign
  }

  /**
   * 更新抽奖活动
   *
   * 业务场景：
   * - 管理员修改抽奖活动的基本信息
   * - 注意：campaign_code 不可修改
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} updateData - 更新数据（不包括 campaign_code）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 更新后的活动对象
   * @throws {Error} 活动不存在等
   *
   * @example
   * const campaign = await LotteryCampaignCRUDService.updateCampaign(
   *   123,
   *   { campaign_name: '新名称', status: 'active' },
   *   { transaction, operator_user_id: 456 }
   * )
   */
  static async updateCampaign(campaign_id, updateData, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.updateCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    logger.info('开始更新抽奖活动', {
      campaign_id,
      update_fields: Object.keys(updateData),
      operator_user_id
    })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 构建更新数据（campaign_code 不可修改）
    const allowedFields = [
      'campaign_name',
      'campaign_type',
      'description',
      'start_time',
      'end_time',
      'status',
      'rules_text',
      'budget_mode',
      'cost_per_draw',
      'max_draws_per_user_daily',
      'max_draws_per_user_total',
      'total_prize_pool',
      'remaining_prize_pool',
      'prize_distribution_config'
    ]

    const filteredData = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        // 特殊处理时间字段
        if (field === 'start_time' || field === 'end_time') {
          filteredData[field] = updateData[field] ? new Date(updateData[field]) : null
        } else {
          filteredData[field] = updateData[field]
        }
      }
    }

    if (Object.keys(filteredData).length === 0) {
      logger.warn('更新抽奖活动：无有效更新字段', { campaign_id, operator_user_id })
      return campaign
    }

    // 执行更新
    await campaign.update(filteredData, { transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(parseInt(campaign_id), 'campaign_updated')
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    logger.info('更新抽奖活动成功', {
      campaign_id,
      updated_fields: Object.keys(filteredData),
      operator_user_id
    })

    return campaign
  }

  /**
   * 更新抽奖活动状态
   *
   * 业务场景：
   * - 管理员单独更新活动状态（上线、暂停、结束等）
   * - 状态流转：draft → active → paused/ended
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} status - 新状态（draft/active/paused/ended）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 更新后的活动对象
   * @throws {Error} 活动不存在、状态无效等
   *
   * @example
   * const campaign = await LotteryCampaignCRUDService.updateCampaignStatus(
   *   123,
   *   'active',
   *   { transaction, operator_user_id: 456 }
   * )
   */
  static async updateCampaignStatus(campaign_id, status, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.updateCampaignStatus'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    // 验证状态值
    const validStatuses = ['draft', 'active', 'paused', 'ended']
    if (!status || !validStatuses.includes(status)) {
      const error = new Error(`无效的状态值：${status}（允许值：${validStatuses.join('/')}）`)
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }

    logger.info('开始更新抽奖活动状态', {
      campaign_id,
      new_status: status,
      operator_user_id
    })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const oldStatus = campaign.status

    // 执行更新
    await campaign.update({ status }, { transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(campaign_id),
        `status_change_${oldStatus}_to_${status}`
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    logger.info('更新抽奖活动状态成功', {
      campaign_id,
      old_status: oldStatus,
      new_status: status,
      operator_user_id
    })

    return campaign
  }

  /**
   * 删除抽奖活动
   *
   * 业务场景：
   * - 管理员删除不再使用的抽奖活动
   * - 如果活动下存在奖品，则不允许删除（数据完整性保护）
   *
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<Object>} 删除结果 { campaign_id, campaign_name, deleted: true }
   * @throws {Error} 活动不存在、存在关联数据等
   *
   * @example
   * const result = await LotteryCampaignCRUDService.deleteCampaign(
   *   123,
   *   { transaction, operator_user_id: 456 }
   * )
   */
  static async deleteCampaign(campaign_id, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.deleteCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    logger.info('开始删除抽奖活动', { campaign_id, operator_user_id })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 检查是否有关联的奖品
    const prizeCount = await LotteryPrize.count({
      where: { campaign_id: parseInt(campaign_id) },
      transaction
    })

    if (prizeCount > 0) {
      const error = new Error(`活动下存在 ${prizeCount} 个奖品，无法删除`)
      error.code = 'HAS_RELATED_DATA'
      error.statusCode = 400
      error.data = { prize_count: prizeCount }
      throw error
    }

    const campaignName = campaign.campaign_name

    // 执行硬删除
    await campaign.destroy({ transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(parseInt(campaign_id), 'campaign_deleted')
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    logger.info('删除抽奖活动成功', {
      campaign_id,
      campaign_name: campaignName,
      operator_user_id
    })

    return {
      campaign_id: parseInt(campaign_id),
      campaign_name: campaignName,
      deleted: true
    }
  }
}

module.exports = LotteryCampaignCRUDService
