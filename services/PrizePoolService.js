/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 奖品池服务（PrizePoolService）
 *
 * 业务场景：管理奖品池的完整生命周期，包括奖品的添加、查询、更新、删除、库存管理等所有奖品池相关业务
 *
 * 核心功能：
 * 1. 奖品添加管理（批量添加、概率验证、sort_order唯一性保证）
 * 2. 奖品查询业务（获取奖品列表、按活动查询、统计信息）
 * 3. 奖品更新操作（更新奖品信息、补充库存、状态管理）
 * 4. 奖品删除管理（检查中奖记录、业务规则验证）
 * 5. 数据格式转换（DECIMAL字段转换、字段映射）
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 业务流程：
 *
 * 1. **批量添加奖品流程**（事务保护）
 *    - 验证活动存在性 → 验证概率总和=1 → 查询最大sort_order
 *    - 批量创建奖品 → 自动分配sort_order → 提交事务
 *
 * 2. **更新奖品流程**
 *    - 查询奖品存在性 → 验证库存合法性（不能小于已使用数量）
 *    - 更新奖品信息 → 记录更新时间
 *
 * 3. **删除奖品流程**
 *    - 查询奖品存在性 → 检查中奖记录 → 执行删除（事务保护）
 *
 * 设计原则：
 * - **数据模型统一**：只使用LotteryPrize + LotteryCampaign表，保持数据一致性
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **业务规则严格**：概率总和验证、sort_order唯一性、库存合法性检查
 * - **审计完整性**：每次操作都记录时间戳
 * - **数据转换标准**：DECIMAL字段统一转换为数字类型
 *
 * 关键方法列表：
 * - batchAddPrizes(campaign_id, prizes, options) - 批量添加奖品
 * - getPrizesByCampaign(campaign_code) - 获取指定活动的奖品池
 * - getAllPrizes(filters) - 获取所有奖品列表
 * - updatePrize(prize_id, updateData, options) - 更新奖品信息
 * - addStock(prize_id, quantity, options) - 补充库存
 * - deletePrize(prize_id, options) - 删除奖品
 *
 * 数据模型关联：
 * - LotteryPrize：奖品表（核心数据：prize_id、campaign_id、prize_name、win_probability）
 * - LotteryCampaign：活动表（关联查询：campaign_code、campaign_name、status）
 *
 * 事务支持：
 * - 所有写操作强制要求外部事务传入（options.transaction参数）
 * - 批量添加使用事务保证原子性
 * - 删除操作使用事务保护
 *
 * 创建时间：2025年12月09日
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const { LotteryPrize, LotteryCampaign } = require('../models')
const DecimalConverter = require('../utils/formatters/DecimalConverter')
const AuditLogService = require('./AuditLogService') // 审计日志服务
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper') // 缓存失效服务

const logger = require('../utils/logger').logger

/**
 * 奖品池服务类
 * 职责：管理奖品池的增删改查、库存管理等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式
 */
class PrizePoolService {
  /**
   * 批量添加奖品到奖品池
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} campaign_id - 活动ID
   * @param {Array<Object>} prizes - 奖品列表
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.created_by - 创建者ID（可选）
   * @returns {Promise<Object>} 添加结果
   * @returns {number} return.campaign_id - 活动ID
   * @returns {number} return.added_prizes - 添加的奖品数量
   * @returns {Array<Object>} return.prizes - 添加的奖品列表
   */
  static async batchAddPrizes(campaign_id, prizes, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'PrizePoolService.batchAddPrizes')
    const { created_by } = options

    logger.info('开始批量添加奖品', {
      campaign_id,
      prize_count: prizes.length,
      created_by
    })

    // 1. 验证概率总和必须为1
    const totalProbability = prizes.reduce((sum, p) => {
      const prob = parseFloat(p.win_probability || p.probability) || 0
      return sum + prob
    }, 0)

    if (Math.abs(totalProbability - 1.0) > 0.001) {
      throw new Error(`奖品概率总和必须为1，当前为${totalProbability.toFixed(4)}`)
    }

    // 2. 查找活动
    const campaign = await LotteryCampaign.findByPk(campaign_id, {
      transaction
    })
    if (!campaign) {
      throw new Error('活动不存在')
    }

    // 3. 获取活动现有奖品的最大sort_order（避免重复）
    const maxSortOrder = await LotteryPrize.max('sort_order', {
      where: { campaign_id: parseInt(campaign_id) },
      transaction
    })
    let nextSortOrder = (maxSortOrder || 0) + 1

    // 4. 批量创建奖品
    const createdPrizes = []
    for (const prizeData of prizes) {
      // sort_order唯一性保证：如果前端没提供，自动分配递增的唯一值
      const sortOrder = prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

      // eslint-disable-next-line no-await-in-loop -- 需要在事务中顺序创建奖品，确保原子性和sort_order验证
      const prize = await LotteryPrize.create(
        {
          campaign_id: parseInt(campaign_id),
          prize_name: prizeData.name, // 前端字段映射：name → prize_name
          prize_type: prizeData.type, // 前端字段映射：type → prize_type
          prize_value: prizeData.value || 0, // 前端字段映射：value → prize_value
          /**
           * 双账户模型：内部预算成本（系统内部）
           * - 兼容字段：prize_value_points / value_points / budget_cost_points
           * - 语义：用于 remaining_budget_points 的筛奖与扣减
           */
          prize_value_points:
            parseInt(
              prizeData.prize_value_points ??
                prizeData.value_points ??
                prizeData.budget_cost_points ??
                0
            ) || 0,
          // 双账户模型：虚拟奖品扩展字段（可选）
          virtual_amount:
            prizeData.virtual_amount !== undefined && prizeData.virtual_amount !== null
              ? parseInt(prizeData.virtual_amount) || 0
              : null,
          category: prizeData.category || null,
          stock_quantity: parseInt(prizeData.quantity), // 前端字段映射：quantity → stock_quantity
          win_probability: prizeData.win_probability || prizeData.probability || 0, // 中奖概率（前端兼容）
          prize_description: prizeData.description || '', // 前端字段映射：description → prize_description
          image_id: prizeData.image_id || null, // 图片ID
          angle: prizeData.angle || 0, // 转盘角度
          color: prizeData.color || '#FF6B6B', // 转盘颜色
          cost_points: prizeData.cost_points || 100, // 抽奖消耗积分
          status: 'active', // 默认激活状态
          sort_order: sortOrder, // 自动分配唯一的sort_order
          max_daily_wins: prizeData.max_daily_wins || null // 每日最大中奖次数
        },
        { transaction }
      )

      createdPrizes.push(prize)

      // 🎯 2026-01-08 图片存储架构修复：绑定图片 context_id（避免被24h定时清理误删）
      if (prizeData.image_id) {
        try {
          const ImageService = require('./ImageService')
          // eslint-disable-next-line no-await-in-loop -- 需要在事务中顺序绑定图片
          await ImageService.updateImageContextId(prizeData.image_id, prize.prize_id, transaction)
          logger.info('[奖品池] 奖品图片绑定成功', {
            prize_id: prize.prize_id,
            image_id: prizeData.image_id
          })
        } catch (bindError) {
          // 绑定失败记录警告但不阻塞创建
          logger.warn('[奖品池] 奖品图片绑定失败（非致命）', {
            prize_id: prize.prize_id,
            image_id: prizeData.image_id,
            error: bindError.message
          })
        }
      }
    }

    /*
     * 5. 记录审计日志（批量添加奖品）
     * 【决策5/6/7】：
     * - 决策5：prize_create 是关键操作，失败阻断业务
     * - 决策6：幂等键由 campaign_id + 奖品IDs 派生，确保同一批奖品不会重复记录
     * - 决策7：同一事务内
     */
    const prizeIdsStr = createdPrizes.map(p => p.prize_id).join('_')
    await AuditLogService.logOperation({
      operator_id: created_by || 1, // 操作员ID（如果没有传入，使用系统用户1）
      operation_type: 'prize_create', // 操作类型：奖品创建
      target_type: 'LotteryCampaign', // 目标对象类型（活动）
      target_id: parseInt(campaign_id), // 目标对象ID（活动ID）
      action: 'batch_create', // 操作动作：批量创建
      before_data: {
        prize_count: 0
      },
      after_data: {
        prize_count: createdPrizes.length,
        prize_ids: createdPrizes.map(p => p.prize_id)
      },
      reason: `批量添加${createdPrizes.length}个奖品到活动${campaign_id}`,
      idempotency_key: `prize_batch_create_${campaign_id}_prizes_${prizeIdsStr}`, // 决策6：业务主键派生
      is_critical_operation: true, // 决策5：关键操作
      transaction // 事务对象
    })

    logger.info('批量添加奖品成功', {
      campaign_id,
      prize_count: createdPrizes.length,
      created_by
    })

    // 6. 转换DECIMAL字段为数字类型（修复前端TypeError）
    const convertedPrizes = DecimalConverter.convertPrizeData(createdPrizes.map(p => p.toJSON()))

    // 7. 缓存失效：奖品池变更后立即失效活动配置缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(campaign_id),
        'prizes_batch_added'
      )
      logger.info('[缓存] 活动配置缓存已失效（奖品批量添加）', { campaign_id })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程，依赖 TTL 过期
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    return {
      campaign_id: parseInt(campaign_id),
      added_prizes: createdPrizes.length,
      prizes: convertedPrizes
    }
  }

  /**
   * 获取指定活动的奖品池
   *
   * @param {string} campaign_code - 活动代码
   * @returns {Promise<Object>} 奖品池信息
   * @returns {Object} return.campaign - 活动信息
   * @returns {Object} return.statistics - 统计信息
   * @returns {Array<Object>} return.prizes - 奖品列表
   */
  static async getPrizesByCampaign(campaign_code) {
    try {
      logger.info('获取活动奖品池', { campaign_code })

      // 1. 通过campaign_code查找活动信息
      const campaign = await LotteryCampaign.findOne({
        where: { campaign_code }
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_code}`)
      }

      // 2. 获取奖品列表
      const prizes = await LotteryPrize.findAll({
        where: { campaign_id: campaign.campaign_id },
        order: [['created_at', 'DESC']],
        attributes: [
          'prize_id',
          'campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points',
          'virtual_amount',
          'category',
          'stock_quantity',
          'win_probability',
          'prize_description',
          'image_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'created_at',
          'updated_at'
        ]
      })

      // 3. 计算统计信息
      const totalPrizes = prizes.length
      const totalQuantity = prizes.reduce((sum, prize) => sum + (prize.stock_quantity || 0), 0)
      const remainingQuantity = prizes.reduce((sum, prize) => {
        const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
        return sum + Math.max(0, remaining)
      }, 0)
      const usedQuantity = prizes.reduce((sum, prize) => sum + (prize.total_win_count || 0), 0)

      // 4. 格式化奖品数据
      const formattedPrizes = prizes.map(prize => ({
        prize_id: prize.prize_id,
        campaign_id: prize.campaign_id,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        prize_value_points: prize.prize_value_points,
        virtual_amount: prize.virtual_amount,
        category: prize.category,
        stock_quantity: prize.stock_quantity,
        remaining_quantity: Math.max(0, (prize.stock_quantity || 0) - (prize.total_win_count || 0)),
        win_probability: prize.win_probability,
        prize_description: prize.prize_description,
        image_id: prize.image_id,
        angle: prize.angle,
        color: prize.color,
        cost_points: prize.cost_points,
        status: prize.status,
        sort_order: prize.sort_order,
        total_win_count: prize.total_win_count,
        daily_win_count: prize.daily_win_count,
        max_daily_wins: prize.max_daily_wins,
        created_at: prize.created_at,
        updated_at: prize.updated_at
      }))

      // 5. 转换DECIMAL字段为数字类型
      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      logger.info('获取活动奖品池成功', {
        campaign_code,
        prize_count: totalPrizes
      })

      return {
        campaign: {
          campaign_code: campaign.campaign_code,
          campaign_name: campaign.campaign_name,
          status: campaign.status
        },
        statistics: {
          total_prizes: totalPrizes,
          total_quantity: totalQuantity,
          remaining_quantity: remainingQuantity,
          used_quantity: usedQuantity,
          usage_rate: totalQuantity > 0 ? ((usedQuantity / totalQuantity) * 100).toFixed(2) : 0
        },
        prizes: convertedPrizes
      }
    } catch (error) {
      logger.error('获取活动奖品池失败', {
        error: error.message,
        campaign_code
      })
      throw error
    }
  }

  /**
   * 获取所有奖品列表（支持过滤）
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.campaign_id - 活动ID（可选）
   * @param {string} filters.status - 状态（可选）
   * @returns {Promise<Object>} 奖品列表和统计信息
   */
  static async getAllPrizes(filters = {}) {
    try {
      const { campaign_id, status } = filters

      logger.info('获取奖品列表', { filters })

      // 1. 构建查询条件
      const where = {}
      if (campaign_id) where.campaign_id = parseInt(campaign_id)
      if (status) where.status = status

      // 2. 查询奖品列表
      const prizes = await LotteryPrize.findAll({
        where,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_code', 'campaign_name', 'status']
          }
        ],
        order: [['created_at', 'DESC']],
        attributes: [
          'prize_id',
          'campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_value_points',
          'virtual_amount',
          'category',
          'stock_quantity',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'win_probability',
          'prize_description',
          'image_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'created_at',
          'updated_at'
        ]
      })

      // 3. 计算统计信息
      const statistics = {
        total: prizes.length,
        active: prizes.filter(p => p.status === 'active').length,
        inactive: prizes.filter(p => p.status === 'inactive').length,
        out_of_stock: prizes.filter(p => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return remaining <= 0
        }).length,
        total_stock: prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
        remaining_stock: prizes.reduce((sum, p) => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return sum + Math.max(0, remaining)
        }, 0)
      }

      // 4. 格式化奖品数据
      const formattedPrizes = prizes.map(prize => ({
        prize_id: prize.prize_id,
        campaign_id: prize.campaign_id,
        campaign_name: prize.campaign?.campaign_name || '未关联活动',
        campaign_code: prize.campaign?.campaign_code,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        prize_value_points: prize.prize_value_points,
        virtual_amount: prize.virtual_amount,
        category: prize.category,
        stock_quantity: prize.stock_quantity,
        remaining_quantity: Math.max(0, (prize.stock_quantity || 0) - (prize.total_win_count || 0)),
        total_win_count: prize.total_win_count || 0,
        daily_win_count: prize.daily_win_count || 0,
        max_daily_wins: prize.max_daily_wins,
        win_probability: prize.win_probability,
        prize_description: prize.prize_description,
        image_id: prize.image_id,
        angle: prize.angle,
        color: prize.color,
        cost_points: prize.cost_points,
        status: prize.status,
        sort_order: prize.sort_order,
        created_at: prize.created_at,
        updated_at: prize.updated_at
      }))

      // 5. 转换DECIMAL字段为数字类型
      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      logger.info('获取奖品列表成功', { count: prizes.length })

      return {
        prizes: convertedPrizes,
        statistics
      }
    } catch (error) {
      logger.error('获取奖品列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 更新奖品信息
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
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
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'PrizePoolService.updatePrize')
    const { updated_by } = options

    logger.info('开始更新奖品', { prize_id, updated_by })

    // 1. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, { transaction })
    if (!prize) {
      throw new Error('奖品不存在')
    }

    // 保存更新前的数据（用于审计日志和图片处理）
    const beforeData = {
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      prize_value: prize.prize_value,
      prize_value_points: prize.prize_value_points,
      virtual_amount: prize.virtual_amount,
      category: prize.category,
      stock_quantity: prize.stock_quantity,
      win_probability: prize.win_probability,
      probability: prize.probability,
      status: prize.status,
      image_id: prize.image_id // 记录旧的图片ID
    }

    // 2. 字段映射（前端字段 → 数据库字段）
    const allowedFields = {
      name: 'prize_name',
      type: 'prize_type',
      value: 'prize_value',
      // 双账户模型：内部预算成本（系统内部）
      prize_value_points: 'prize_value_points',
      value_points: 'prize_value_points',
      budget_cost_points: 'prize_value_points',
      // 双账户模型：虚拟奖品扩展字段
      virtual_amount: 'virtual_amount',
      category: 'category',
      quantity: 'stock_quantity',
      probability: 'win_probability', // 前端probability映射到数据库win_probability
      win_probability: 'win_probability',
      description: 'prize_description',
      image_id: 'image_id',
      angle: 'angle',
      color: 'color',
      cost_points: 'cost_points',
      sort_order: 'sort_order',
      max_daily_wins: 'max_daily_wins',
      status: 'status'
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
    if (filteredUpdateData.stock_quantity !== undefined) {
      const newQuantity = parseInt(filteredUpdateData.stock_quantity)
      const currentUsed = prize.total_win_count || 0

      if (newQuantity < currentUsed) {
        throw new Error(`新库存(${newQuantity})不能小于已使用数量(${currentUsed})`)
      }
    }

    // 🎯 2026-01-08 图片存储架构：处理图片更换逻辑
    const oldImageId = beforeData.image_id
    const newImageId = filteredUpdateData.image_id
    const isImageChanging = filteredUpdateData.image_id !== undefined && newImageId !== oldImageId

    // 4. 更新奖品
    await prize.update(filteredUpdateData, { transaction })

    // 5. 处理图片绑定和旧图片删除（2026-01-08 P0修复）
    if (isImageChanging) {
      const ImageService = require('./ImageService')

      // 5a. 绑定新图片的 context_id 到 prize_id（如有新图片）
      if (newImageId) {
        try {
          const bindSuccess = await ImageService.updateImageContextId(
            newImageId,
            prize_id,
            transaction
          )
          if (bindSuccess) {
            logger.info('[图片存储] 新图片已绑定到奖品', {
              prize_id,
              new_image_id: newImageId
            })
          } else {
            logger.warn('[图片存储] 新图片绑定失败（图片可能不存在）', {
              prize_id,
              new_image_id: newImageId
            })
          }
        } catch (bindError) {
          logger.warn('[图片存储] 新图片绑定异常（非致命）', {
            error: bindError.message,
            prize_id,
            new_image_id: newImageId
          })
        }
      }

      // 5b. 删除旧图片（如有）
      if (oldImageId) {
        try {
          const deleted = await ImageService.deleteImage(oldImageId, transaction)
          if (deleted) {
            logger.info('[图片存储] 奖品旧图片已物理删除', {
              prize_id,
              old_image_id: oldImageId
            })
          }
        } catch (imageError) {
          // 图片删除失败不阻塞主流程，记录警告日志
          logger.warn('[图片存储] 删除奖品旧图片异常（非致命）', {
            error: imageError.message,
            prize_id,
            old_image_id: oldImageId
          })
        }
      }
    }

    // 5. 记录审计日志（奖品配置修改）
    const afterData = {
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      prize_value: prize.prize_value,
      prize_value_points: prize.prize_value_points,
      virtual_amount: prize.virtual_amount,
      category: prize.category,
      stock_quantity: prize.stock_quantity,
      win_probability: prize.win_probability,
      probability: prize.probability,
      status: prize.status
    }

    // 生成操作详情
    const changedFields = Object.keys(filteredUpdateData)
    let operationDetail = `奖品${prize_id}配置修改: ${changedFields.join(', ')}`

    // 如果涉及库存调整，特别说明
    if (filteredUpdateData.stock_quantity !== undefined) {
      operationDetail += ` (库存: ${beforeData.stock_quantity} → ${afterData.stock_quantity})`
    }

    /*
     * 【决策5/6/7】记录审计日志（奖品配置更新）：
     * - 决策5：prize_config 是关键操作，失败阻断业务
     * - 决策6：幂等键由 prize_id + 更新后的数据版本号派生
     * - 决策7：同一事务内
     */
    const updateVersion = prize.updated_at ? new Date(prize.updated_at).getTime() : Date.now()
    await AuditLogService.logOperation({
      operator_id: updated_by || 1, // 操作员ID（如果没有传入，使用系统用户1）
      operation_type: 'prize_config', // 操作类型：奖品配置
      target_type: 'LotteryPrize', // 目标对象类型
      target_id: prize_id, // 目标对象ID（奖品ID）
      action: 'update', // 操作动作：更新
      before_data: beforeData,
      after_data: afterData,
      reason: operationDetail,
      idempotency_key: `prize_config_${prize_id}_v${updateVersion}`, // 决策6：业务主键派生
      is_critical_operation: true, // 决策5：关键操作
      transaction // 事务对象
    })

    logger.info('奖品更新成功', {
      prize_id,
      updated_fields: Object.keys(filteredUpdateData),
      updated_by
    })

    // 6. 重新查询更新后的奖品
    const updatedPrize = await LotteryPrize.findByPk(prize_id, {
      transaction
    })

    // 7. 格式化奖品数据
    const updatedPrizeData = {
      prize_id: updatedPrize.prize_id,
      campaign_id: updatedPrize.campaign_id,
      prize_name: updatedPrize.prize_name,
      prize_type: updatedPrize.prize_type,
      prize_value: updatedPrize.prize_value,
      prize_value_points: updatedPrize.prize_value_points,
      virtual_amount: updatedPrize.virtual_amount,
      category: updatedPrize.category,
      stock_quantity: updatedPrize.stock_quantity,
      remaining_quantity: Math.max(
        0,
        (updatedPrize.stock_quantity || 0) - (updatedPrize.total_win_count || 0)
      ),
      win_probability: updatedPrize.win_probability,
      prize_description: updatedPrize.prize_description,
      image_id: updatedPrize.image_id,
      angle: updatedPrize.angle,
      color: updatedPrize.color,
      cost_points: updatedPrize.cost_points,
      status: updatedPrize.status,
      sort_order: updatedPrize.sort_order,
      total_win_count: updatedPrize.total_win_count,
      daily_win_count: updatedPrize.daily_win_count,
      max_daily_wins: updatedPrize.max_daily_wins,
      created_at: updatedPrize.created_at,
      updated_at: updatedPrize.updated_at
    }

    // 8. 转换DECIMAL字段为数字类型
    const convertedPrizeData = DecimalConverter.convertPrizeData(updatedPrizeData)

    // 9. 缓存失效：奖品配置变更后立即失效活动配置缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(prize.campaign_id, 'prize_updated')
      logger.info('[缓存] 活动配置缓存已失效（奖品更新）', {
        prize_id,
        campaign_id: prize.campaign_id
      })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程，依赖 TTL 过期
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        campaign_id: prize.campaign_id
      })
    }

    return {
      prize_id: updatedPrize.prize_id,
      updated_fields: Object.keys(filteredUpdateData),
      prize: convertedPrizeData
    }
  }

  /**
   * 补充库存
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} prize_id - 奖品ID
   * @param {number} quantity - 补充数量
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.operated_by - 操作者ID（可选）
   * @returns {Promise<Object>} 补充结果
   */
  static async addStock(prize_id, quantity, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'PrizePoolService.addStock')
    const { operated_by } = options

    logger.info('开始补充库存', { prize_id, quantity, operated_by })

    // 1. 验证补充数量
    if (!quantity || quantity <= 0) {
      throw new Error('补充数量必须大于0')
    }

    // 2. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, {
      transaction
    })
    if (!prize) {
      throw new Error('奖品不存在')
    }

    const oldQuantity = prize.stock_quantity || 0
    const newQuantity = oldQuantity + parseInt(quantity)

    // 3. 更新库存
    await prize.update({ stock_quantity: newQuantity }, { transaction })

    // 4. 如果之前是out_of_stock状态，自动恢复为active
    if (prize.status === 'out_of_stock') {
      await prize.update({ status: 'active' }, { transaction })
    }

    /*
     * 5. 记录审计日志（奖品库存调整）
     * 【决策5/6/7】：
     * - 决策5：prize_stock_adjust 是关键操作，失败阻断业务
     * - 决策6：幂等键由 prize_id + 新库存量派生，确保同一调整结果不会重复记录
     * - 决策7：同一事务内
     */
    await AuditLogService.logOperation({
      operator_id: operated_by || 1, // 操作员ID（如果没有传入，使用系统用户1）
      operation_type: 'prize_stock_adjust', // 操作类型：奖品库存调整
      target_type: 'LotteryPrize', // 目标对象类型
      target_id: prize_id, // 目标对象ID（奖品ID）
      action: 'adjust', // 操作动作：调整
      before_data: {
        stock_quantity: oldQuantity
      },
      after_data: {
        stock_quantity: newQuantity
      },
      reason: `奖品库存调整: ${oldQuantity} → ${newQuantity}（补充${quantity}）`,
      idempotency_key: `stock_adjust_${prize_id}_from${oldQuantity}_to${newQuantity}`, // 决策6：业务主键派生
      is_critical_operation: true, // 决策5：关键操作
      transaction // 事务对象
    })

    logger.info('库存补充成功', {
      prize_id,
      old_quantity: oldQuantity,
      add_quantity: quantity,
      new_quantity: newQuantity,
      operated_by
    })

    // 6. 缓存失效：库存变更后立即失效活动配置缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(prize.campaign_id, 'prize_stock_added')
      logger.info('[缓存] 活动配置缓存已失效（库存补充）', {
        prize_id,
        campaign_id: prize.campaign_id
      })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程，依赖 TTL 过期
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        campaign_id: prize.campaign_id
      })
    }

    return {
      prize_id,
      old_quantity: oldQuantity,
      add_quantity: parseInt(quantity),
      new_quantity: newQuantity,
      remaining_quantity: newQuantity - (prize.total_win_count || 0)
    }
  }

  /**
   * 删除奖品
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 🎯 2026-01-08 图片存储架构：
   * - 删除奖品时联动删除关联的图片（Sealos对象存储 + DB记录）
   * - 确保"删 DB + 删对象存储"闭环
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.deleted_by - 删除者ID（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deletePrize(prize_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'PrizePoolService.deletePrize')
    const { deleted_by } = options

    logger.info('开始删除奖品', { prize_id, deleted_by })

    // 1. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, {
      transaction
    })
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
     * 【决策5/6/7】：
     * - 决策5：prize_delete 是关键操作，失败阻断业务
     * - 决策6：幂等键由 prize_id 派生（删除是幂等的，同一ID只能删除一次）
     * - 决策7：同一事务内
     */
    await AuditLogService.logOperation({
      operator_id: deleted_by || 1, // 操作员ID（如果没有传入，使用系统用户1）
      operation_type: 'prize_delete', // 操作类型：奖品删除
      target_type: 'LotteryPrize', // 目标对象类型
      target_id: prize_id, // 目标对象ID（奖品ID）
      action: 'delete', // 操作动作：删除
      before_data: {
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        stock_quantity: prize.stock_quantity,
        win_probability: prize.win_probability,
        status: prize.status,
        image_id: prize.image_id // 记录关联的图片ID
      },
      after_data: null, // 删除操作后数据为空
      reason: `删除奖品：${prize.prize_name}（ID: ${prize_id}）`,
      idempotency_key: `prize_delete_${prize_id}`, // 决策6：业务主键派生（删除操作天然幂等）
      is_critical_operation: true, // 决策5：关键操作
      transaction // 事务对象
    })

    // 4. 保存关联的活动ID和图片ID（删除前，用于缓存失效和图片清理）
    const campaignIdForCache = prize.campaign_id
    const imageIdToDelete = prize.image_id

    // 5. 删除奖品
    await prize.destroy({ transaction })

    logger.info('奖品删除成功', {
      prize_id,
      prize_name: prize.prize_name,
      image_id: imageIdToDelete,
      deleted_by
    })

    // 6. 联动删除关联图片（2026-01-08 图片存储架构 P0修复）
    if (imageIdToDelete) {
      try {
        const ImageService = require('./ImageService')
        const deleted = await ImageService.deleteImage(imageIdToDelete, transaction)
        if (deleted) {
          logger.info('[图片存储] 奖品关联图片已物理删除', {
            prize_id,
            image_id: imageIdToDelete
          })
        } else {
          logger.warn('[图片存储] 奖品关联图片删除失败或不存在', {
            prize_id,
            image_id: imageIdToDelete
          })
        }
      } catch (imageError) {
        // 图片删除失败不阻塞主流程，记录警告日志
        logger.warn('[图片存储] 删除奖品图片异常（非致命）', {
          error: imageError.message,
          prize_id,
          image_id: imageIdToDelete
        })
      }
    }

    // 7. 缓存失效：奖品删除后立即失效活动配置缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(campaignIdForCache, 'prize_deleted')
      logger.info('[缓存] 活动配置缓存已失效（奖品删除）', {
        prize_id,
        campaign_id: campaignIdForCache
      })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程，依赖 TTL 过期
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        campaign_id: campaignIdForCache
      })
    }

    return {
      prize_id,
      deleted_image_id: imageIdToDelete || null
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

      // 查找奖品
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

module.exports = PrizePoolService
