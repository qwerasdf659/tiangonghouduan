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
 * - 所有写操作支持外部事务传入（options.transaction参数）
 * - 批量添加使用事务保证原子性
 * - 删除操作使用事务保护
 *
 * 使用示例：
 * ```javascript
 * // 示例1：批量添加奖品（带事务保护）
 * const transaction = await sequelize.transaction();
 * try {
 *   const result = await PrizePoolService.batchAddPrizes(
 *     campaignId,
 *     [
 *       { name: '一等奖', type: 'points', value: 1000, quantity: 10, probability: 0.1 },
 *       { name: '二等奖', type: 'points', value: 500, quantity: 20, probability: 0.2 }
 *     ],
 *     { transaction }
 *   );
 *   await transaction.commit();
 * } catch (error) {
 *   await transaction.rollback();
 * }
 *
 * // 示例2：获取活动奖品池
 * const prizePool = await PrizePoolService.getPrizesByCampaign('SUMMER2025');
 *
 * // 示例3：更新奖品信息
 * await PrizePoolService.updatePrize(prizeId, { status: 'inactive' });
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const { LotteryPrize, LotteryCampaign, sequelize } = require('../models')
const DecimalConverter = require('../utils/formatters/DecimalConverter')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const AuditLogService = require('./AuditLogService') // 审计日志服务

const logger = new Logger('PrizePoolService')

/**
 * 奖品池服务类
 * 职责：管理奖品池的增删改查、库存管理等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式
 */
class PrizePoolService {
  /**
   * 批量添加奖品到奖品池
   *
   * @param {number} campaign_id - 活动ID
   * @param {Array<Object>} prizes - 奖品列表
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {number} options.created_by - 创建者ID（可选）
   * @returns {Promise<Object>} 添加结果
   * @returns {number} return.campaign_id - 活动ID
   * @returns {number} return.added_prizes - 添加的奖品数量
   * @returns {Array<Object>} return.prizes - 添加的奖品列表
   */
  static async batchAddPrizes (campaign_id, prizes, options = {}) {
    const { transaction, created_by } = options

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      logger.info('开始批量添加奖品', {
        campaign_id,
        prize_count: prizes.length,
        created_by
      })

      // 1. 验证概率总和必须为1
      const totalProbability = prizes.reduce((sum, p) => {
        const prob = parseFloat(p.probability) || 0
        return sum + prob
      }, 0)

      if (Math.abs(totalProbability - 1.0) > 0.001) {
        throw new Error(`奖品概率总和必须为1，当前为${totalProbability.toFixed(4)}`)
      }

      // 2. 查找活动
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        transaction: internalTransaction
      })
      if (!campaign) {
        throw new Error('活动不存在')
      }

      // 3. 获取活动现有奖品的最大sort_order（避免重复）
      const maxSortOrder = await LotteryPrize.max('sort_order', {
        where: { campaign_id: parseInt(campaign_id) },
        transaction: internalTransaction
      })
      let nextSortOrder = (maxSortOrder || 0) + 1

      // 4. 批量创建奖品
      const createdPrizes = []
      for (const prizeData of prizes) {
        // sort_order唯一性保证：如果前端没提供，自动分配递增的唯一值
        const sortOrder =
          prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

        // eslint-disable-next-line no-await-in-loop -- 需要在事务中顺序创建奖品，确保原子性和sort_order验证
        const prize = await LotteryPrize.create(
          {
            campaign_id: parseInt(campaign_id),
            prize_name: prizeData.name, // 前端字段映射：name → prize_name
            prize_type: prizeData.type, // 前端字段映射：type → prize_type
            prize_value: prizeData.value || 0, // 前端字段映射：value → prize_value
            stock_quantity: parseInt(prizeData.quantity), // 前端字段映射：quantity → stock_quantity
            win_probability: prizeData.probability || 0, // 中奖概率
            probability: prizeData.wheelProbability || prizeData.probability || 0, // 转盘显示概率
            prize_description: prizeData.description || '', // 前端字段映射：description → prize_description
            image_id: prizeData.image_id || null, // 图片ID
            angle: prizeData.angle || 0, // 转盘角度
            color: prizeData.color || '#FF6B6B', // 转盘颜色
            cost_points: prizeData.cost_points || 100, // 抽奖消耗积分
            status: 'active', // 默认激活状态
            sort_order: sortOrder, // 自动分配唯一的sort_order
            max_daily_wins: prizeData.max_daily_wins || null // 每日最大中奖次数
          },
          { transaction: internalTransaction }
        )

        createdPrizes.push(prize)
      }

      // 5. 记录审计日志（批量添加奖品）
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
        business_id: `prize_batch_create_${campaign_id}_${Date.now()}`, // 业务关联ID（唯一标识）
        transaction: internalTransaction // 事务对象
      })

      // 6. 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      logger.info('批量添加奖品成功', {
        campaign_id,
        prize_count: createdPrizes.length,
        created_by
      })

      // 7. 转换DECIMAL字段为数字类型（修复前端TypeError）
      const convertedPrizes = DecimalConverter.convertPrizeData(createdPrizes.map(p => p.toJSON()))

      return {
        campaign_id: parseInt(campaign_id),
        added_prizes: createdPrizes.length,
        prizes: convertedPrizes
      }
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction) {
        await internalTransaction.rollback()
      }

      logger.error('批量添加奖品失败', {
        error: error.message,
        campaign_id
      })
      throw error
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
  static async getPrizesByCampaign (campaign_code) {
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
          'stock_quantity',
          'win_probability',
          'probability',
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
        stock_quantity: prize.stock_quantity,
        remaining_quantity: Math.max(0, (prize.stock_quantity || 0) - (prize.total_win_count || 0)),
        win_probability: prize.win_probability,
        probability: prize.probability,
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
  static async getAllPrizes (filters = {}) {
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
          'stock_quantity',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'win_probability',
          'probability',
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
        stock_quantity: prize.stock_quantity,
        remaining_quantity: Math.max(0, (prize.stock_quantity || 0) - (prize.total_win_count || 0)),
        total_win_count: prize.total_win_count || 0,
        daily_win_count: prize.daily_win_count || 0,
        max_daily_wins: prize.max_daily_wins,
        win_probability: prize.win_probability,
        probability: prize.probability,
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
   * @param {number} prize_id - 奖品ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {number} options.updated_by - 更新者ID（可选）
   * @returns {Promise<Object>} 更新结果
   */
  static async updatePrize (prize_id, updateData, options = {}) {
    const { transaction, updated_by } = options

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      logger.info('开始更新奖品', { prize_id, updated_by })

      // 1. 查找奖品
      const prize = await LotteryPrize.findByPk(prize_id, { transaction: internalTransaction })
      if (!prize) {
        throw new Error('奖品不存在')
      }

      // 保存更新前的数据（用于审计日志）
      const beforeData = {
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        stock_quantity: prize.stock_quantity,
        win_probability: prize.win_probability,
        probability: prize.probability,
        status: prize.status
      }

      // 2. 字段映射（前端字段 → 数据库字段）
      const allowedFields = {
        name: 'prize_name',
        type: 'prize_type',
        value: 'prize_value',
        quantity: 'stock_quantity',
        probability: 'win_probability',
        wheelProbability: 'probability',
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

      // 4. 更新奖品
      await prize.update(filteredUpdateData, { transaction: internalTransaction })

      // 5. 记录审计日志（奖品配置修改）
      const afterData = {
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
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

      await AuditLogService.logOperation({
        operator_id: updated_by || 1, // 操作员ID（如果没有传入，使用系统用户1）
        operation_type: 'prize_config', // 操作类型：奖品配置
        target_type: 'LotteryPrize', // 目标对象类型
        target_id: prize_id, // 目标对象ID（奖品ID）
        action: 'update', // 操作动作：更新
        before_data: beforeData,
        after_data: afterData,
        reason: operationDetail,
        business_id: `prize_update_${prize_id}_${Date.now()}`, // 业务关联ID（唯一标识）
        transaction: internalTransaction // 事务对象
      })

      // 6. 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      logger.info('奖品更新成功', {
        prize_id,
        updated_fields: Object.keys(filteredUpdateData),
        updated_by
      })

      // 7. 重新查询更新后的奖品
      const updatedPrize = await LotteryPrize.findByPk(prize_id, {
        transaction: internalTransaction
      })

      // 8. 格式化奖品数据
      const updatedPrizeData = {
        prize_id: updatedPrize.prize_id,
        campaign_id: updatedPrize.campaign_id,
        prize_name: updatedPrize.prize_name,
        prize_type: updatedPrize.prize_type,
        prize_value: updatedPrize.prize_value,
        stock_quantity: updatedPrize.stock_quantity,
        remaining_quantity: Math.max(
          0,
          (updatedPrize.stock_quantity || 0) - (updatedPrize.total_win_count || 0)
        ),
        win_probability: updatedPrize.win_probability,
        probability: updatedPrize.probability,
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

      // 9. 转换DECIMAL字段为数字类型
      const convertedPrizeData = DecimalConverter.convertPrizeData(updatedPrizeData)

      return {
        prize_id: updatedPrize.prize_id,
        updated_fields: Object.keys(filteredUpdateData),
        prize: convertedPrizeData
      }
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction) {
        await internalTransaction.rollback()
      }

      logger.error('更新奖品失败', { error: error.message, prize_id })
      throw error
    }
  }

  /**
   * 补充库存
   *
   * @param {number} prize_id - 奖品ID
   * @param {number} quantity - 补充数量
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {number} options.operated_by - 操作者ID（可选）
   * @returns {Promise<Object>} 补充结果
   */
  static async addStock (prize_id, quantity, options = {}) {
    const { transaction, operated_by } = options

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      logger.info('开始补充库存', { prize_id, quantity, operated_by })

      // 1. 验证补充数量
      if (!quantity || quantity <= 0) {
        throw new Error('补充数量必须大于0')
      }

      // 2. 查找奖品
      const prize = await LotteryPrize.findByPk(prize_id, {
        transaction: internalTransaction
      })
      if (!prize) {
        throw new Error('奖品不存在')
      }

      const oldQuantity = prize.stock_quantity || 0
      const newQuantity = oldQuantity + parseInt(quantity)

      // 3. 更新库存
      await prize.update({ stock_quantity: newQuantity }, { transaction: internalTransaction })

      // 4. 如果之前是out_of_stock状态，自动恢复为active
      if (prize.status === 'out_of_stock') {
        await prize.update({ status: 'active' }, { transaction: internalTransaction })
      }

      // 5. 记录审计日志（奖品库存调整）
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
        business_id: `stock_adjust_${prize_id}_${Date.now()}`, // 业务关联ID（唯一标识）
        transaction: internalTransaction // 事务对象
      })

      // 6. 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      logger.info('库存补充成功', {
        prize_id,
        old_quantity: oldQuantity,
        add_quantity: quantity,
        new_quantity: newQuantity,
        operated_by
      })

      return {
        prize_id,
        old_quantity: oldQuantity,
        add_quantity: parseInt(quantity),
        new_quantity: newQuantity,
        remaining_quantity: newQuantity - (prize.total_win_count || 0)
      }
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction) {
        await internalTransaction.rollback()
      }

      logger.error('补充库存失败', { error: error.message, prize_id })
      throw error
    }
  }

  /**
   * 删除奖品
   *
   * @param {number} prize_id - 奖品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @param {number} options.deleted_by - 删除者ID（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deletePrize (prize_id, options = {}) {
    const { transaction, deleted_by } = options

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      logger.info('开始删除奖品', { prize_id, deleted_by })

      // 1. 查找奖品
      const prize = await LotteryPrize.findByPk(prize_id, {
        transaction: internalTransaction
      })
      if (!prize) {
        throw new Error('奖品不存在')
      }

      // 2. 检查是否已有用户中奖
      const totalWins = prize.total_win_count || 0
      if (totalWins > 0) {
        throw new Error(`该奖品已被中奖${totalWins}次，不能删除。建议改为停用状态。`)
      }

      // 3. 记录审计日志（奖品删除）
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
          status: prize.status
        },
        after_data: null, // 删除操作后数据为空
        reason: `删除奖品：${prize.prize_name}（ID: ${prize_id}）`,
        business_id: `prize_delete_${prize_id}_${Date.now()}`, // 业务关联ID（唯一标识）
        transaction: internalTransaction // 事务对象
      })

      // 4. 删除奖品
      await prize.destroy({ transaction: internalTransaction })

      // 5. 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      logger.info('奖品删除成功', {
        prize_id,
        prize_name: prize.prize_name,
        deleted_by
      })

      return {
        prize_id
      }
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction) {
        await internalTransaction.rollback()
      }

      logger.error('删除奖品失败', { error: error.message, prize_id })
      throw error
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
  static async getPrizeById (prize_id, options = {}) {
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
