'use strict'

const BusinessError = require('../../utils/BusinessError')
const { LotteryCampaignPrize, PrizeDefinition, LotteryCampaign } = require('../../models')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

const logger = require('../../utils/logger').logger

/**
 * 活动奖品关联 CRUD 服务
 *
 * 职责：管理活动与奖品目录的关联关系（添加/更新/删除活动奖品配置）
 *
 * 集中奖品目录方案（2026-05-26）：
 * - 奖品定义（名称/类型/材料/稀有度/图片）统一在 prize_definitions 表管理
 * - 本服务只操作 lottery_campaign_prizes 关联表的活动级参数：
 *   win_weight, stock_quantity, reward_tier, is_fallback, sort_order, status, max_daily_wins, max_user_wins
 * - 不存储奖品名称/图片等信息，全部从 prize_definitions JOIN 获取
 */
class PrizeCrudService {
  /**
   * 批量添加奖品到活动奖品池
   *
   * 业务流程：从奖品目录选择奖品 → 配置活动级参数 → 创建关联记录
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Array<Object>} prizes - 奖品关联配置列表
   * @param {number} prizes[].prize_definition_id - 奖品定义ID（必填，FK→prize_definitions）
   * @param {number} prizes[].win_weight - 本活动中的权重（必填）
   * @param {number} [prizes[].stock_quantity=999999] - 本活动中的库存
   * @param {string} [prizes[].reward_tier='low'] - 本活动中的档位（high/mid/low）
   * @param {boolean} [prizes[].is_fallback=false] - 是否兜底奖品
   * @param {number} [prizes[].sort_order] - 排序（自动递增）
   * @param {number} [prizes[].max_daily_wins] - 每日最大中奖次数限制
   * @param {number} [prizes[].max_user_wins] - 每用户最大中奖次数限制
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.created_by] - 创建者ID
   * @returns {Promise<Object>} 添加结果
   */
  static async batchAddPrizes(lottery_campaign_id, prizes, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.batchAddPrizes')
    const { created_by } = options

    logger.info('开始批量添加活动奖品关联', {
      lottery_campaign_id,
      prize_count: prizes.length,
      created_by
    })

    // 1. 验证活动存在
    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id, { transaction })
    if (!campaign) {
      throw new BusinessError('活动不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    // 2. 验证所有 prize_definition_id 有效
    const definitionIds = prizes.map(p => p.prize_definition_id).filter(Boolean)
    if (definitionIds.length !== prizes.length) {
      throw new BusinessError('每个奖品必须指定 prize_definition_id', 'PRIZE_POOL_ERROR', 400)
    }

    const existingDefs = await PrizeDefinition.findAll({
      where: { prize_definition_id: definitionIds, is_enabled: 1 },
      attributes: ['prize_definition_id', 'display_name'],
      transaction
    })
    const validDefIds = new Set(existingDefs.map(d => d.prize_definition_id))
    const invalidIds = definitionIds.filter(id => !validDefIds.has(id))
    if (invalidIds.length > 0) {
      throw new BusinessError(
        `以下奖品定义不存在或已禁用: ${invalidIds.join(', ')}`,
        'PRIZE_POOL_ERROR',
        400
      )
    }

    // 3. 检查是否重复引用（同活动不能重复引用同一奖品定义）
    const existingLinks = await LotteryCampaignPrize.findAll({
      where: { lottery_campaign_id: parseInt(lottery_campaign_id) },
      attributes: ['prize_definition_id'],
      transaction
    })
    const existingDefIds = new Set(existingLinks.map(l => l.prize_definition_id))
    const duplicateIds = definitionIds.filter(id => existingDefIds.has(id))
    if (duplicateIds.length > 0) {
      throw new BusinessError(
        `以下奖品已在该活动中配置: ${duplicateIds.join(', ')}`,
        'PRIZE_POOL_ERROR',
        400
      )
    }

    // 4. 获取当前最大 sort_order
    const maxSortOrder = await LotteryCampaignPrize.max('sort_order', {
      where: { lottery_campaign_id: parseInt(lottery_campaign_id) },
      transaction
    })
    let nextSortOrder = (maxSortOrder || 0) + 1

    // 5. 批量创建关联记录
    const createdPrizes = []
    for (const prizeData of prizes) {
      const sortOrder = prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

      // eslint-disable-next-line no-await-in-loop -- 事务内顺序创建，确保原子性
      const campaignPrize = await LotteryCampaignPrize.create(
        {
          lottery_campaign_id: parseInt(lottery_campaign_id),
          prize_definition_id: prizeData.prize_definition_id,
          win_weight: parseInt(prizeData.win_weight) || 0,
          stock_quantity: parseInt(prizeData.stock_quantity ?? 999999),
          reward_tier: prizeData.reward_tier || 'low',
          is_fallback: prizeData.is_fallback ? 1 : 0,
          sort_order: sortOrder,
          status: 'active',
          max_daily_wins: prizeData.max_daily_wins || null,
          max_user_wins: prizeData.max_user_wins || null
        },
        { transaction }
      )

      createdPrizes.push(campaignPrize)
    }

    // 6. 审计日志
    const prizeIdsStr = createdPrizes.map(p => p.lottery_campaign_prize_id).join('_')
    await AuditLogService.logOperation({
      operator_id: created_by || 1,
      operation_type: 'prize_create',
      target_type: 'LotteryCampaign',
      target_id: parseInt(lottery_campaign_id),
      action: 'batch_create',
      before_data: { prize_count: existingLinks.length },
      after_data: {
        prize_count: existingLinks.length + createdPrizes.length,
        new_campaign_prize_ids: createdPrizes.map(p => p.lottery_campaign_prize_id)
      },
      reason: `批量添加${createdPrizes.length}个奖品到活动${lottery_campaign_id}`,
      idempotency_key: `prize_batch_create_${lottery_campaign_id}_${prizeIdsStr}`,
      is_critical_operation: true,
      transaction
    })

    // 7. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'prizes_batch_added'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('批量添加活动奖品关联成功', {
      lottery_campaign_id,
      prize_count: createdPrizes.length,
      created_by
    })

    return {
      lottery_campaign_id: parseInt(lottery_campaign_id),
      added_prizes: createdPrizes.length,
      prizes: createdPrizes.map(p => p.toJSON())
    }
  }

  /**
   * 为指定活动添加单个奖品（通过活动业务码）
   *
   * @param {string} campaign_code - 活动业务码
   * @param {Object} prizeData - 奖品关联配置
   * @param {number} prizeData.prize_definition_id - 奖品定义ID（必填）
   * @param {number} prizeData.win_weight - 权重（必填）
   * @param {Object} options - { created_by, transaction }
   * @returns {Promise<Object>} 创建结果
   */
  static async addPrizeToCampaign(campaign_code, prizeData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.addPrizeToCampaign')
    const { created_by } = options

    logger.info('为活动添加单个奖品', {
      campaign_code,
      prize_definition_id: prizeData.prize_definition_id
    })

    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })
    if (!campaign) {
      throw new BusinessError(`活动不存在: ${campaign_code}`, 'PRIZE_POOL_NOT_FOUND', 404)
    }

    const result = await PrizeCrudService.batchAddPrizes(
      campaign.lottery_campaign_id,
      [prizeData],
      { created_by, transaction }
    )

    return {
      lottery_campaign_id: campaign.lottery_campaign_id,
      campaign_code,
      prize: result.prizes[0]
    }
  }

  /**
   * 更新活动奖品关联配置
   *
   * 只允许更新活动级参数，不允许修改奖品定义信息（名称/图片/稀有度等在 prize_definitions 管理）
   *
   * @param {number} lottery_campaign_prize_id - 活动奖品关联ID
   * @param {Object} updateData - 允许更新的字段
   * @param {number} [updateData.win_weight] - 权重
   * @param {number} [updateData.stock_quantity] - 库存
   * @param {string} [updateData.reward_tier] - 档位（high/mid/low）
   * @param {boolean} [updateData.is_fallback] - 是否兜底
   * @param {number} [updateData.sort_order] - 排序
   * @param {string} [updateData.status] - 状态（active/inactive）
   * @param {number} [updateData.max_daily_wins] - 每日最大中奖次数
   * @param {number} [updateData.max_user_wins] - 每用户最大中奖次数
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.updated_by] - 更新者ID
   * @returns {Promise<Object>} 更新结果
   */
  static async updatePrize(lottery_campaign_prize_id, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.updatePrize')
    const { updated_by } = options

    logger.info('开始更新活动奖品配置', { lottery_campaign_prize_id, updated_by })

    // 1. 查找活动奖品关联
    const campaignPrize = await LotteryCampaignPrize.findByPk(lottery_campaign_prize_id, {
      transaction
    })
    if (!campaignPrize) {
      throw new BusinessError('活动奖品不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    // 2. 记录更新前状态
    const beforeData = {
      win_weight: campaignPrize.win_weight,
      stock_quantity: campaignPrize.stock_quantity,
      reward_tier: campaignPrize.reward_tier,
      is_fallback: campaignPrize.is_fallback,
      sort_order: campaignPrize.sort_order,
      status: campaignPrize.status,
      max_daily_wins: campaignPrize.max_daily_wins,
      max_user_wins: campaignPrize.max_user_wins
    }

    // 3. 白名单过滤 — 只允许活动级参数
    const allowedFields = [
      'win_weight',
      'stock_quantity',
      'reward_tier',
      'is_fallback',
      'sort_order',
      'status',
      'max_daily_wins',
      'max_user_wins'
    ]

    const filteredUpdate = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredUpdate[field] = updateData[field]
      }
    }

    if (Object.keys(filteredUpdate).length === 0) {
      throw new BusinessError('没有有效的更新字段', 'PRIZE_POOL_ERROR', 400)
    }

    // 4. 业务校验
    const warnings = []

    if (filteredUpdate.stock_quantity !== undefined) {
      const newQuantity = parseInt(filteredUpdate.stock_quantity)
      const currentUsed = campaignPrize.total_win_count || 0

      if (newQuantity < currentUsed) {
        throw new BusinessError(
          `新库存(${newQuantity})不能小于已使用数量(${currentUsed})`,
          'PRIZE_POOL_NOT_ALLOWED',
          400
        )
      }

      if (newQuantity === 0) {
        warnings.push({
          code: 'ZERO_STOCK',
          message: '库存已设为0，该奖品将无法被抽中',
          field: 'stock_quantity'
        })
      }

      filteredUpdate.stock_quantity = newQuantity
    }

    if (filteredUpdate.win_weight !== undefined) {
      filteredUpdate.win_weight = parseInt(filteredUpdate.win_weight) || 0
    }

    if (filteredUpdate.is_fallback !== undefined) {
      filteredUpdate.is_fallback = filteredUpdate.is_fallback ? 1 : 0
    }

    // 5. 执行更新
    await campaignPrize.update(filteredUpdate, { transaction })

    // 6. 审计日志
    const changedFields = Object.keys(filteredUpdate)
    await AuditLogService.logOperation({
      operator_id: updated_by || 1,
      operation_type: 'prize_config',
      target_type: 'LotteryCampaignPrize',
      target_id: lottery_campaign_prize_id,
      action: 'update',
      before_data: beforeData,
      after_data: filteredUpdate,
      reason: `活动奖品${lottery_campaign_prize_id}配置修改: ${changedFields.join(', ')}`,
      idempotency_key: `prize_config_${lottery_campaign_prize_id}_${Date.now()}`,
      is_critical_operation: true,
      transaction
    })

    // 7. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        campaignPrize.lottery_campaign_id,
        'prize_updated'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_prize_id
      })
    }

    // 8. 零库存风险警告
    const updatedPrize = await LotteryCampaignPrize.findByPk(lottery_campaign_prize_id, {
      transaction
    })
    if ((updatedPrize.stock_quantity || 0) === 0 && (updatedPrize.win_weight || 0) > 0) {
      warnings.push({
        code: 'ZERO_STOCK_POSITIVE_WEIGHT',
        message: '库存为 0 但权重 > 0，算法选中后将触发降级',
        field: 'stock_quantity'
      })
    }

    logger.info('活动奖品配置更新成功', {
      lottery_campaign_prize_id,
      updated_fields: changedFields,
      updated_by
    })

    return {
      lottery_campaign_prize_id: updatedPrize.lottery_campaign_prize_id,
      updated_fields: changedFields,
      prize: updatedPrize.toJSON(),
      warnings
    }
  }

  /**
   * 删除活动奖品关联（硬删除）
   *
   * 业务规则：已有中奖记录的奖品不允许删除，只能停用
   *
   * @param {number} lottery_campaign_prize_id - 活动奖品关联ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.deleted_by] - 删除者ID
   * @returns {Promise<Object>} 删除结果
   */
  static async deletePrize(lottery_campaign_prize_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.deletePrize')
    const { deleted_by } = options

    logger.info('开始删除活动奖品关联', { lottery_campaign_prize_id, deleted_by })

    // 1. 查找奖品关联
    const campaignPrize = await LotteryCampaignPrize.findByPk(lottery_campaign_prize_id, {
      include: [
        {
          model: PrizeDefinition,
          as: 'prizeDefinition',
          attributes: ['display_name', 'prize_code']
        }
      ],
      transaction
    })
    if (!campaignPrize) {
      throw new BusinessError('活动奖品不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    // 2. 检查是否已有中奖记录
    const totalWins = campaignPrize.total_win_count || 0
    if (totalWins > 0) {
      throw new BusinessError(
        `该奖品已被中奖${totalWins}次，不能删除。建议改为停用状态(status=inactive)。`,
        'PRIZE_POOL_NOT_ALLOWED',
        400
      )
    }

    const displayName = campaignPrize.prizeDefinition?.display_name || '未知奖品'

    // 3. 审计日志
    await AuditLogService.logOperation({
      operator_id: deleted_by || 1,
      operation_type: 'prize_delete',
      target_type: 'LotteryCampaignPrize',
      target_id: lottery_campaign_prize_id,
      action: 'delete',
      before_data: {
        prize_definition_id: campaignPrize.prize_definition_id,
        display_name: displayName,
        win_weight: campaignPrize.win_weight,
        stock_quantity: campaignPrize.stock_quantity,
        reward_tier: campaignPrize.reward_tier
      },
      after_data: null,
      reason: `删除活动奖品关联：${displayName}（ID: ${lottery_campaign_prize_id}）`,
      idempotency_key: `prize_delete_${lottery_campaign_prize_id}`,
      is_critical_operation: true,
      transaction
    })

    // 4. 保存活动ID用于缓存失效
    const campaignIdForCache = campaignPrize.lottery_campaign_id

    // 5. 硬删除
    await campaignPrize.destroy({ transaction })

    // 6. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(campaignIdForCache, 'prize_deleted')
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_prize_id
      })
    }

    logger.info('活动奖品关联删除成功', {
      lottery_campaign_prize_id,
      display_name: displayName,
      deleted_by
    })

    return { lottery_campaign_prize_id }
  }

  /**
   * 根据ID获取活动奖品关联（含奖品定义详情）
   *
   * @param {number} lottery_campaign_prize_id - 活动奖品关联ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 活动奖品关联信息（含 prizeDefinition）
   */
  static async getPrizeById(lottery_campaign_prize_id, options = {}) {
    const { transaction } = options

    const campaignPrize = await LotteryCampaignPrize.findByPk(lottery_campaign_prize_id, {
      include: [
        {
          model: PrizeDefinition,
          as: 'prizeDefinition'
        }
      ],
      transaction
    })

    if (!campaignPrize) {
      throw new BusinessError('活动奖品不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    return campaignPrize
  }
}

module.exports = PrizeCrudService
