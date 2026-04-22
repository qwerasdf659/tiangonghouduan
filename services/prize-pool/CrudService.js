'use strict'

const { LotteryPrize, LotteryCampaign, MaterialAssetType } = require('../../models')
const DecimalConverter = require('../../utils/formatters/DecimalConverter')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const { AssetCode } = require('../../constants/AssetCode')

const logger = require('../../utils/logger').logger

/**
 * 奖品 CRUD 服务
 * 职责：奖品的添加、更新、删除、查询（单个）
 */
class PrizeCrudService {
  /**
   * 批量添加奖品到奖品池
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Array<Object>} prizes - 奖品列表
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.created_by - 创建者ID（可选）
   * @returns {Promise<Object>} 添加结果
   */
  static async batchAddPrizes(lottery_campaign_id, prizes, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.batchAddPrizes')
    const { created_by } = options

    logger.info('开始批量添加奖品', {
      lottery_campaign_id,
      prize_count: prizes.length,
      created_by
    })

    // 1. 查找活动（需要 pick_method 来决定校验逻辑）
    const campaign = await LotteryCampaign.findByPk(lottery_campaign_id, {
      transaction
    })
    if (!campaign) {
      throw new Error('活动不存在')
    }

    // 2. normalize 模式概率校验
    if (campaign.pick_method === 'normalize') {
      const existing_prizes = await LotteryPrize.findAll({
        where: { lottery_campaign_id: parseInt(lottery_campaign_id), status: 'active' },
        attributes: ['win_probability'],
        transaction
      })
      const existing_sum = existing_prizes.reduce(
        (sum, p) => sum + (parseFloat(p.win_probability) || 0),
        0
      )
      const new_sum = prizes.reduce((sum, p) => sum + (parseFloat(p.win_probability) || 0), 0)
      const total_probability = existing_sum + new_sum
      if (Math.abs(total_probability - 1.0) > 0.01) {
        logger.warn('[normalize 概率校验] win_probability 总和不等于 1.0（柔性提醒）', {
          lottery_campaign_id,
          existing_sum: existing_sum.toFixed(4),
          new_sum: new_sum.toFixed(4),
          total: total_probability.toFixed(4),
          deviation: Math.abs(total_probability - 1.0).toFixed(4)
        })
      }
    }

    // 3. 获取活动现有奖品的最大sort_order
    const maxSortOrder = await LotteryPrize.max('sort_order', {
      where: { lottery_campaign_id: parseInt(lottery_campaign_id) },
      transaction
    })
    let nextSortOrder = (maxSortOrder || 0) + 1

    // 4. 批量创建奖品
    const createdPrizes = []
    for (const prizeData of prizes) {
      const sortOrder = prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

      /*
       * 按奖品类型分治计算 budget_cost（决定 1 方案 D）
       * - 虚拟物品（非 star_stone）：强制 material_amount × budget_value_points
       * - star_stone / 保底：固定 0
       * - 传统奖品：接受运营填写，回退到 pvp
       */
      // eslint-disable-next-line no-await-in-loop -- 碎片奖品需要查询 MaterialAssetType 计算 budget_cost
      let computed_budget_cost
      if (prizeData.material_asset_code && prizeData.material_asset_code !== AssetCode.STAR_STONE) {
        const assetType = await MaterialAssetType.findOne({
          where: { asset_code: prizeData.material_asset_code },
          transaction
        })
        computed_budget_cost =
          (parseInt(prizeData.material_amount) || 0) * (assetType?.budget_value_points || 0)
      } else if (prizeData.material_asset_code === AssetCode.STAR_STONE || prizeData.is_fallback) {
        computed_budget_cost = 0
      } else {
        computed_budget_cost =
          parseInt(prizeData.budget_cost ?? prizeData.prize_value_points ?? 0) || 0
      }

      /*
       * 图片完整性保障：points 类型奖品自动关联 POINTS 材料图标
       */
      let resolvedMaterialAssetCode = prizeData.material_asset_code || null
      if (!resolvedMaterialAssetCode && !prizeData.primary_media_id) {
        if (prizeData.prize_type === 'points') {
          resolvedMaterialAssetCode = AssetCode.POINTS
          logger.info('[奖品池] 积分类奖品自动关联 POINTS 材料图标', {
            prize_name: prizeData.prize_name
          })
        } else {
          logger.warn('[奖品池] 奖品缺少图片来源（无 primary_media_id 且无 material_asset_code）', {
            prize_name: prizeData.prize_name,
            prize_type: prizeData.prize_type
          })
        }
      }

      // eslint-disable-next-line no-await-in-loop -- 需要在事务中顺序创建奖品，确保原子性和sort_order验证
      const prize = await LotteryPrize.create(
        {
          lottery_campaign_id: parseInt(lottery_campaign_id),
          prize_name: prizeData.prize_name,
          prize_type: prizeData.prize_type,
          prize_value: prizeData.prize_value || 0,
          /** 分层阈值标记（仅用于 BudgetTierCalculator 档位准入，非扣减金额） */
          prize_value_points: parseInt(prizeData.prize_value_points ?? 0) || 0,
          /** 奖品总预算成本（过滤+扣减用） */
          budget_cost: computed_budget_cost,
          stock_quantity: parseInt(prizeData.stock_quantity),
          win_probability: prizeData.win_probability || 0,
          prize_description: prizeData.prize_description || '',
          primary_media_id: prizeData.primary_media_id ?? null,
          angle: prizeData.angle || 0,
          color: prizeData.color || '#FF6B6B',
          cost_points: prizeData.cost_points || 100,
          status: 'active',
          sort_order: sortOrder,
          max_daily_wins: prizeData.max_daily_wins || null,
          /**
           * 稀有度代码（面向前端的视觉稀有度等级）
           * @外键关联 rarity_defs.rarity_code
           * @枚举值 common/uncommon/rare/epic/legendary
           * @注意 与 reward_tier（后端概率档位）是独立维度
           */
          rarity_code: prizeData.rarity_code || 'common',
          /** 选奖权重（tier_first 模式下的概率控制字段） */
          win_weight: parseInt(prizeData.win_weight) || 0,
          /** 所属档位（high/mid/low） */
          reward_tier: prizeData.reward_tier || 'low',
          /** 是否为兜底奖品（所有档位无可用奖品时发放） */
          is_fallback: prizeData.is_fallback ? 1 : 0,
          /** 材质资产编码（碎片/水晶等虚拟物品的资产类型标识） */
          material_asset_code: resolvedMaterialAssetCode,
          /** 材质数量（虚拟物品发放数量） */
          material_amount: prizeData.material_amount ? parseInt(prizeData.material_amount) : null
        },
        { transaction }
      )

      createdPrizes.push(prize)

      // 🎯 2026-01-08 图片存储架构修复：绑定图片 context_id
      const mediaId = prizeData.primary_media_id
      if (mediaId) {
        try {
          const mediaService = this.serviceManager
            ? this.serviceManager.getService('media')
            : new (require('../MediaService'))()
          await mediaService.attach(
            mediaId,
            'lottery_prize',
            prize.lottery_prize_id,
            'primary',
            0,
            null,
            transaction
          )
          logger.info('[奖品池] 奖品图片绑定成功', {
            lottery_prize_id: prize.lottery_prize_id,
            primary_media_id: mediaId
          })
        } catch (bindError) {
          logger.warn('[奖品池] 奖品图片绑定失败（非致命）', {
            lottery_prize_id: prize.lottery_prize_id,
            primary_media_id: mediaId,
            error: bindError.message
          })
        }
      }
    }

    /*
     * 5. 记录审计日志（批量添加奖品）
     * 【决策5/6/7】：
     * - 决策5：prize_create 是关键操作，失败阻断业务
     * - 决策6：幂等键由 lottery_campaign_id + 奖品IDs 派生
     * - 决策7：同一事务内
     */
    const prizeIdsStr = createdPrizes.map(p => p.lottery_prize_id).join('_')
    await AuditLogService.logOperation({
      operator_id: created_by || 1,
      operation_type: 'prize_create',
      target_type: 'LotteryCampaign',
      target_id: parseInt(lottery_campaign_id),
      action: 'batch_create',
      before_data: { prize_count: 0 },
      after_data: {
        prize_count: createdPrizes.length,
        prize_ids: createdPrizes.map(p => p.lottery_prize_id)
      },
      reason: `批量添加${createdPrizes.length}个奖品到活动${lottery_campaign_id}`,
      idempotency_key: `prize_batch_create_${lottery_campaign_id}_prizes_${prizeIdsStr}`,
      is_critical_operation: true,
      transaction
    })

    logger.info('批量添加奖品成功', {
      lottery_campaign_id,
      prize_count: createdPrizes.length,
      created_by
    })

    // 6. 转换DECIMAL字段为数字类型
    const convertedPrizes = DecimalConverter.convertPrizeData(createdPrizes.map(p => p.toJSON()))

    // 7. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'prizes_batch_added'
      )
      logger.info('[缓存] 活动配置缓存已失效（奖品批量添加）', { lottery_campaign_id })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    return {
      lottery_campaign_id: parseInt(lottery_campaign_id),
      added_prizes: createdPrizes.length,
      prizes: convertedPrizes
    }
  }

  /**
   * 为指定活动添加单个奖品
   * 自动分配 sort_order，根据 pick_method 做不同校验
   *
   * @param {string} campaign_code - 活动业务码
   * @param {Object} prizeData - 奖品数据
   * @param {Object} options - { created_by, transaction }
   * @returns {Promise<Object>} 创建结果
   */
  static async addPrizeToCampaign(campaign_code, prizeData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.addPrizeToCampaign')
    const { created_by } = options

    logger.info('为活动添加单个奖品', { campaign_code, prize_name: prizeData.prize_name })

    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })
    if (!campaign) {
      throw new Error(`活动不存在: ${campaign_code}`)
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
   * 更新奖品信息
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   *
   * 🎯 2026-01-08 图片存储架构：
   * - 更换图片时删除旧图片（如有）
   * - 更新新图片的 context_id 绑定到 prize_id
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.updated_by - 更新者ID（可选）
   * @returns {Promise<Object>} 更新结果
   */
  static async updatePrize(prize_id, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.updatePrize')
    const { updated_by } = options

    logger.info('开始更新奖品', { prize_id, updated_by })

    // 1. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, { transaction })
    if (!prize) {
      throw new Error('奖品不存在')
    }

    const beforeData = {
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      prize_value: prize.prize_value,
      prize_value_points: prize.prize_value_points,
      budget_cost: prize.budget_cost || 0,
      material_asset_code: prize.material_asset_code || null,
      material_amount: prize.material_amount || null,
      stock_quantity: prize.stock_quantity,
      win_probability: prize.win_probability,
      status: prize.status,
      primary_media_id: prize.primary_media_id
    }

    /**
     * 2. 字段映射（前端字段 → 数据库字段）
     */
    const allowedFields = {
      name: 'prize_name',
      prize_name: 'prize_name',
      type: 'prize_type',
      prize_type: 'prize_type',
      value: 'prize_value',
      prize_value: 'prize_value',
      /** 分层阈值标记 */
      prize_value_points: 'prize_value_points',
      quantity: 'stock_quantity',
      stock_quantity: 'stock_quantity',
      win_probability: 'win_probability',
      description: 'prize_description',
      prize_description: 'prize_description',
      primary_media_id: 'primary_media_id',
      angle: 'angle',
      color: 'color',
      cost_points: 'cost_points',
      sort_order: 'sort_order',
      max_daily_wins: 'max_daily_wins',
      status: 'status',
      /**
       * 稀有度代码（面向前端的视觉稀有度等级）
       * @外键关联 rarity_defs.rarity_code
       * @枚举值 common/uncommon/rare/epic/legendary
       * @注意 与 reward_tier（后端概率档位）是独立维度
       */
      rarity_code: 'rarity_code',
      /** 选奖权重（tier_first 模式下实际生效的概率控制字段） */
      win_weight: 'win_weight',
      /** 所属档位（high/mid/low） */
      reward_tier: 'reward_tier',
      /** 是否为兜底奖品 */
      is_fallback: 'is_fallback',
      /** 奖品总预算成本 */
      budget_cost: 'budget_cost',
      /** 材质资产编码 */
      material_asset_code: 'material_asset_code',
      /** 材质数量 */
      material_amount: 'material_amount'
    }

    const filteredUpdateData = {}
    for (const [frontendKey, value] of Object.entries(updateData)) {
      const dbField = allowedFields[frontendKey]
      if (dbField) {
        filteredUpdateData[dbField] = value
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      throw new Error('没有有效的更新字段')
    }

    // 3. 特殊处理库存数量更新（验证库存合法性）
    const warnings = []

    if (filteredUpdateData.stock_quantity !== undefined) {
      const newQuantity = parseInt(filteredUpdateData.stock_quantity)
      const currentUsed = prize.total_win_count || 0

      if (newQuantity < currentUsed) {
        throw new Error(`新库存(${newQuantity})不能小于已使用数量(${currentUsed})`)
      }

      if (newQuantity === 0) {
        warnings.push({
          code: 'ZERO_STOCK',
          message: '库存已设为0，该奖品将无法被抽中',
          field: 'stock_quantity'
        })
      }

      const remainingStock = newQuantity - currentUsed
      if (remainingStock > 0 && remainingStock <= 10) {
        warnings.push({
          code: 'LOW_STOCK',
          message: `剩余可用库存仅 ${remainingStock} 件，建议及时补货`,
          field: 'stock_quantity',
          remaining: remainingStock
        })
      }
    }

    // 3b. 实物奖品上架强制图片校验
    if (filteredUpdateData.status === 'active' && prize.status !== 'active') {
      const prizeType = filteredUpdateData.prize_type || prize.prize_type
      if (prizeType === 'physical') {
        const targetImageId = filteredUpdateData.primary_media_id ?? prize.primary_media_id
        if (!targetImageId) {
          throw new Error('实物奖品上架必须上传图片（primary_media_id 不能为空）')
        }
      }
    }

    const oldImageId = beforeData.primary_media_id
    const newImageId = filteredUpdateData.primary_media_id
    const isImageChanging =
      filteredUpdateData.primary_media_id !== undefined && newImageId !== oldImageId

    /*
     * 4a. budget_cost 分治重算
     */
    const mac = filteredUpdateData.material_asset_code ?? prize.material_asset_code
    const ma = filteredUpdateData.material_amount ?? prize.material_amount
    const isFallback = filteredUpdateData.is_fallback ?? prize.is_fallback
    if (mac && mac !== AssetCode.STAR_STONE) {
      const assetType = await MaterialAssetType.findOne({
        where: { asset_code: mac },
        transaction
      })
      filteredUpdateData.budget_cost = (parseInt(ma) || 0) * (assetType?.budget_value_points || 0)
    } else if (mac === AssetCode.STAR_STONE || isFallback) {
      filteredUpdateData.budget_cost = 0
    }

    // 4b. 更新奖品
    await prize.update(filteredUpdateData, { transaction })

    // 5. 处理图片绑定和旧图片删除
    if (isImageChanging) {
      const mediaService = this.serviceManager
        ? this.serviceManager.getService('media')
        : new (require('../MediaService'))()

      // 5a. 绑定新图片到奖品
      if (newImageId) {
        try {
          await mediaService.attach(
            newImageId,
            'lottery_prize',
            prize_id,
            'primary',
            0,
            null,
            transaction
          )
          logger.info('[媒体服务] 新图片已绑定到奖品', {
            prize_id,
            primary_media_id: newImageId
          })
        } catch (bindError) {
          logger.warn('[媒体服务] 新图片绑定异常（非致命）', {
            error: bindError.message,
            prize_id,
            primary_media_id: newImageId
          })
        }
      }

      // 5b. 解绑旧图片
      if (oldImageId) {
        try {
          await mediaService.detach('lottery_prize', prize_id, 'primary', transaction)
          logger.info('[媒体服务] 奖品旧图片已解绑', {
            prize_id,
            old_media_id: oldImageId
          })
        } catch (imageError) {
          logger.warn('[媒体服务] 解绑奖品旧图片异常（非致命）', {
            error: imageError.message,
            prize_id,
            old_media_id: oldImageId
          })
        }
      }
    }

    /*
     * 5. 记录审计日志（奖品配置修改）
     */
    const afterData = {
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      prize_value: prize.prize_value,
      prize_value_points: prize.prize_value_points,
      budget_cost: prize.budget_cost || 0,
      material_asset_code: prize.material_asset_code || null,
      material_amount: prize.material_amount || null,
      stock_quantity: prize.stock_quantity,
      win_probability: prize.win_probability,
      status: prize.status
    }

    const changedFields = Object.keys(filteredUpdateData)
    let operationDetail = `奖品${prize_id}配置修改: ${changedFields.join(', ')}`

    if (filteredUpdateData.stock_quantity !== undefined) {
      operationDetail += ` (库存: ${beforeData.stock_quantity} → ${afterData.stock_quantity})`
    }

    await AuditLogService.logOperation({
      operator_id: updated_by || 1,
      operation_type: 'prize_config',
      target_type: 'LotteryPrize',
      target_id: prize_id,
      action: 'update',
      before_data: beforeData,
      after_data: afterData,
      reason: operationDetail,
      idempotency_key: `prize_config_${prize_id}_${Date.now()}_${changedFields.sort().join('_')}`,
      is_critical_operation: true,
      transaction
    })

    logger.info('奖品更新成功', {
      prize_id,
      updated_fields: Object.keys(filteredUpdateData),
      updated_by
    })

    // 6. 重新查询更新后的奖品
    const updatedPrize = await LotteryPrize.findByPk(prize_id, { transaction })

    // 7. 格式化奖品数据
    const updatedPrizeData = {
      lottery_prize_id: updatedPrize.lottery_prize_id,
      lottery_campaign_id: updatedPrize.lottery_campaign_id,
      prize_name: updatedPrize.prize_name,
      prize_type: updatedPrize.prize_type,
      prize_value: updatedPrize.prize_value,
      prize_value_points: updatedPrize.prize_value_points,
      budget_cost: updatedPrize.budget_cost || 0,
      material_asset_code: updatedPrize.material_asset_code || null,
      material_amount: updatedPrize.material_amount || null,
      stock_quantity: updatedPrize.stock_quantity,
      remaining_quantity: Math.max(
        0,
        (updatedPrize.stock_quantity || 0) - (updatedPrize.total_win_count || 0)
      ),
      win_probability: updatedPrize.win_probability,
      prize_description: updatedPrize.prize_description,
      primary_media_id: updatedPrize.primary_media_id,
      angle: updatedPrize.angle,
      color: updatedPrize.color,
      cost_points: updatedPrize.cost_points,
      status: updatedPrize.status,
      sort_order: updatedPrize.sort_order,
      rarity_code: updatedPrize.rarity_code || 'common',
      win_weight: updatedPrize.win_weight || 0,
      reward_tier: updatedPrize.reward_tier || 'low',
      is_fallback: updatedPrize.is_fallback || false,
      total_win_count: updatedPrize.total_win_count,
      daily_win_count: updatedPrize.daily_win_count,
      max_daily_wins: updatedPrize.max_daily_wins,
      created_at: updatedPrize.created_at,
      updated_at: updatedPrize.updated_at
    }

    // 8. 转换DECIMAL字段为数字类型
    const convertedPrizeData = DecimalConverter.convertPrizeData(updatedPrizeData)

    // 9. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        prize.lottery_campaign_id,
        'prize_updated'
      )
      logger.info('[缓存] 活动配置缓存已失效（奖品更新）', {
        prize_id,
        lottery_campaign_id: prize.lottery_campaign_id
      })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        lottery_campaign_id: prize.lottery_campaign_id
      })
    }

    // 10. normalize 模式概率校验
    if (filteredUpdateData.win_probability !== undefined) {
      try {
        const ownerCampaign = await LotteryCampaign.findByPk(updatedPrize.lottery_campaign_id, {
          attributes: ['pick_method'],
          transaction
        })
        if (ownerCampaign && ownerCampaign.pick_method === 'normalize') {
          const all_prizes = await LotteryPrize.findAll({
            where: {
              lottery_campaign_id: updatedPrize.lottery_campaign_id,
              status: 'active'
            },
            attributes: ['win_probability'],
            transaction
          })
          const total_prob = all_prizes.reduce(
            (sum, p) => sum + (parseFloat(p.win_probability) || 0),
            0
          )
          if (Math.abs(total_prob - 1.0) > 0.01) {
            warnings.push({
              code: 'NORMALIZE_PROBABILITY_SUM_OFF',
              message: `normalize 模式下 win_probability 总和为 ${total_prob.toFixed(4)}，应为 1.0`,
              field: 'win_probability'
            })
          }
        }
      } catch (probCheckError) {
        logger.warn('[normalize 概率校验] 检查失败（非致命）', { error: probCheckError.message })
      }
    }

    // 11. 零库存风险警告
    if ((updatedPrize.stock_quantity || 0) === 0 && (updatedPrize.win_weight || 0) > 0) {
      warnings.push({
        code: 'ZERO_STOCK_POSITIVE_WEIGHT',
        message: `${updatedPrize.prize_name}：库存为 0 但权重 ${updatedPrize.win_weight} > 0，算法选中后将触发降级`,
        field: 'stock_quantity'
      })
    }

    return {
      lottery_prize_id: updatedPrize.lottery_prize_id,
      updated_fields: Object.keys(filteredUpdateData),
      prize: convertedPrizeData,
      warnings
    }
  }

  /**
   * 删除奖品
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   *
   * 🎯 2026-01-08 图片存储架构：
   * - 删除奖品时联动删除关联的图片
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.deleted_by - 删除者ID（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deletePrize(prize_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeCrudService.deletePrize')
    const { deleted_by } = options

    logger.info('开始删除奖品', { prize_id, deleted_by })

    // 1. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, { transaction })
    if (!prize) {
      throw new Error('奖品不存在')
    }

    // 2. 检查是否已有用户中奖
    const totalWins = prize.total_win_count || 0
    if (totalWins > 0) {
      throw new Error(`该奖品已被中奖${totalWins}次，不能删除。建议改为停用状态。`)
    }

    /*
     * 3. 记录审计日志（奖品删除）
     */
    await AuditLogService.logOperation({
      operator_id: deleted_by || 1,
      operation_type: 'prize_delete',
      target_type: 'LotteryPrize',
      target_id: prize_id,
      action: 'delete',
      before_data: {
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        stock_quantity: prize.stock_quantity,
        win_probability: prize.win_probability,
        status: prize.status,
        primary_media_id: prize.primary_media_id
      },
      after_data: null,
      reason: `删除奖品：${prize.prize_name}（ID: ${prize_id}）`,
      idempotency_key: `prize_delete_${prize_id}`,
      is_critical_operation: true,
      transaction
    })

    // 4. 保存关联的活动ID和媒体ID
    const campaignIdForCache = prize.lottery_campaign_id
    const primaryMediaId = prize.primary_media_id

    // 5. 删除奖品
    await prize.destroy({ transaction })

    logger.info('奖品删除成功', {
      prize_id,
      prize_name: prize.prize_name,
      primary_media_id: primaryMediaId,
      deleted_by
    })

    // 6. 联动解除/删除关联图片
    if (primaryMediaId) {
      try {
        const mediaService = this.serviceManager
          ? this.serviceManager.getService('media')
          : new (require('../MediaService'))()
        await mediaService.detach('lottery_prize', prize_id, null, transaction)
        logger.info('[媒体] 奖品主图已解除关联', { prize_id, primary_media_id: primaryMediaId })
      } catch (mediaError) {
        logger.warn('[媒体] 解除奖品主图关联异常（非致命）', {
          error: mediaError.message,
          prize_id,
          primary_media_id: primaryMediaId
        })
      }
    }

    // 7. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(campaignIdForCache, 'prize_deleted')
      logger.info('[缓存] 活动配置缓存已失效（奖品删除）', {
        prize_id,
        lottery_campaign_id: campaignIdForCache
      })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        lottery_campaign_id: campaignIdForCache
      })
    }

    return {
      prize_id,
      deleted_primary_media_id: primaryMediaId || null
    }
  }

  /**
   * 根据ID获取奖品
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 奖品信息
   * @throws {Error} 奖品不存在
   */
  static async getPrizeById(prize_id, options = {}) {
    const { transaction } = options

    try {
      logger.info('查询奖品信息', { prize_id })

      const prize = await LotteryPrize.findByPk(prize_id, { transaction })

      if (!prize) {
        throw new Error('奖品不存在')
      }

      logger.info('奖品查询成功', { prize_id, prize_name: prize.prize_name })

      return prize
    } catch (error) {
      logger.error('查询奖品失败', { error: error.message, prize_id })
      throw error
    }
  }
}

module.exports = PrizeCrudService
