/**
 * 欠账管理服务 - 统一抽奖架构核心组件
 *
 * @description 提供欠账管理相关的业务逻辑封装
 *              包括欠账看板数据、趋势分析、冲销操作、上限配置等
 *              遵循路由层合规性规范：路由不直连 models，事务收口到 Service
 *
 * @module services/DebtManagementService
 * @version 1.0.0
 * @since 2026-01-18 路由层合规性治理
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../utils/logger')

/**
 * 延迟加载 models，避免循环依赖
 * @returns {Object} 所有需要的模型
 */
function getModels() {
  const models = require('../models')
  return models
}

/**
 * 获取欠账来源显示名称
 *
 * @param {string} source - 欠账来源代码
 * @returns {string} 来源中文名称
 */
function getDebtSourceName(source) {
  const sourceNames = {
    user_budget: '用户预算',
    pool_budget: '活动池预算',
    pool_quota: '池+配额预算'
  }
  return sourceNames[source] || '未知来源'
}

/**
 * 欠账管理服务
 *
 * @class DebtManagementService
 * @description 封装所有欠账管理相关的数据库操作和业务逻辑
 */
class DebtManagementService {
  /**
   * 获取欠账看板总览数据
   *
   * @description 统计系统级欠账数据，包括库存欠账和预算欠账的总览信息
   * @returns {Promise<Object>} 欠账看板数据
   */
  static async getDashboard() {
    const { PresetInventoryDebt, PresetBudgetDebt, PresetDebtLimit } = getModels()

    // 库存欠账总览
    const inventoryStats = await PresetInventoryDebt.findOne({
      attributes: [
        [fn('COUNT', col('preset_inventory_debt_id')), 'total_count'],
        [fn('SUM', col('debt_quantity')), 'total_quantity'],
        [fn('SUM', col('cleared_quantity')), 'cleared_quantity'],
        [fn('COUNT', literal("CASE WHEN status = 'pending' THEN 1 END")), 'pending_count'],
        [fn('COUNT', literal("CASE WHEN status = 'written_off' THEN 1 END")), 'written_off_count']
      ],
      raw: true
    })

    // 预算欠账总览
    const budgetStats = await PresetBudgetDebt.findOne({
      attributes: [
        [fn('COUNT', col('preset_budget_debt_id')), 'total_count'],
        [fn('SUM', col('debt_amount')), 'total_amount'],
        [fn('SUM', col('cleared_amount')), 'cleared_amount'],
        [fn('COUNT', literal("CASE WHEN status = 'pending' THEN 1 END")), 'pending_count'],
        [fn('COUNT', literal("CASE WHEN status = 'written_off' THEN 1 END")), 'written_off_count']
      ],
      raw: true
    })

    // 按预算来源分组的预算欠账
    const budgetBySource = await PresetBudgetDebt.findAll({
      attributes: [
        'debt_source',
        [fn('COUNT', col('preset_budget_debt_id')), 'count'],
        [fn('SUM', col('debt_amount')), 'total_amount'],
        [fn('SUM', col('cleared_amount')), 'cleared_amount']
      ],
      where: { status: 'pending' },
      group: ['debt_source'],
      raw: true
    })

    // 活跃活动的欠账上限配置数量
    const debtLimitCount = await PresetDebtLimit.count({
      where: { status: 'active' }
    })

    return {
      inventory_debt: {
        total_count: parseInt(inventoryStats?.total_count, 10) || 0,
        total_quantity: parseInt(inventoryStats?.total_quantity, 10) || 0,
        cleared_quantity: parseInt(inventoryStats?.cleared_quantity, 10) || 0,
        remaining_quantity:
          (parseInt(inventoryStats?.total_quantity, 10) || 0) -
          (parseInt(inventoryStats?.cleared_quantity, 10) || 0),
        pending_count: parseInt(inventoryStats?.pending_count, 10) || 0,
        written_off_count: parseInt(inventoryStats?.written_off_count, 10) || 0
      },
      budget_debt: {
        total_count: parseInt(budgetStats?.total_count, 10) || 0,
        total_amount: parseInt(budgetStats?.total_amount, 10) || 0,
        cleared_amount: parseInt(budgetStats?.cleared_amount, 10) || 0,
        remaining_amount:
          (parseInt(budgetStats?.total_amount, 10) || 0) -
          (parseInt(budgetStats?.cleared_amount, 10) || 0),
        pending_count: parseInt(budgetStats?.pending_count, 10) || 0,
        written_off_count: parseInt(budgetStats?.written_off_count, 10) || 0,
        by_source: budgetBySource.map(item => ({
          source: item.debt_source,
          source_name: getDebtSourceName(item.debt_source),
          count: parseInt(item.count, 10) || 0,
          total_amount: parseInt(item.total_amount, 10) || 0,
          cleared_amount: parseInt(item.cleared_amount, 10) || 0,
          remaining_amount:
            (parseInt(item.total_amount, 10) || 0) - (parseInt(item.cleared_amount, 10) || 0)
        }))
      },
      debt_limit_config_count: debtLimitCount
    }
  }

  /**
   * 按活动汇总欠账
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.debt_type='all'] - 欠账类型: inventory|budget|all
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 按活动分组的欠账数据
   */
  static async getDebtByCampaign(options = {}) {
    const { PresetInventoryDebt, PresetBudgetDebt, LotteryCampaign } = getModels()

    const page = Math.max(1, parseInt(options.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(options.page_size, 10) || 20))
    const debtType = options.debt_type || 'all'
    const offset = (page - 1) * pageSize

    const results = []

    // 获取有欠账的活动列表
    const inventoryCampaigns =
      debtType === 'budget'
        ? []
        : await PresetInventoryDebt.findAll({
            attributes: [
              'lottery_campaign_id',
              [fn('COUNT', col('preset_inventory_debt_id')), 'inventory_debt_count'],
              [fn('SUM', col('debt_quantity')), 'inventory_debt_quantity'],
              [fn('SUM', col('cleared_quantity')), 'inventory_cleared_quantity']
            ],
            where: { status: 'pending' },
            group: ['lottery_campaign_id'],
            raw: true
          })

    const budgetCampaigns =
      debtType === 'inventory'
        ? []
        : await PresetBudgetDebt.findAll({
            attributes: [
              'lottery_campaign_id',
              [fn('COUNT', col('preset_budget_debt_id')), 'budget_debt_count'],
              [fn('SUM', col('debt_amount')), 'budget_debt_amount'],
              [fn('SUM', col('cleared_amount')), 'budget_cleared_amount']
            ],
            where: { status: 'pending' },
            group: ['lottery_campaign_id'],
            raw: true
          })

    // 合并活动ID
    const campaignIds = new Set()
    inventoryCampaigns.forEach(c => campaignIds.add(c.lottery_campaign_id))
    budgetCampaigns.forEach(c => campaignIds.add(c.lottery_campaign_id))

    // 获取活动信息
    const campaigns = await LotteryCampaign.findAll({
      where: { lottery_campaign_id: { [Op.in]: Array.from(campaignIds) } },
      attributes: ['lottery_campaign_id', 'campaign_name', 'status']
    })

    const campaignMap = {}
    campaigns.forEach(c => {
      campaignMap[c.lottery_campaign_id] = c
    })

    // 合并数据
    campaignIds.forEach(campaignId => {
      const campaign = campaignMap[campaignId]
      const invDebt = inventoryCampaigns.find(i => i.lottery_campaign_id === campaignId)
      const budDebt = budgetCampaigns.find(b => b.lottery_campaign_id === campaignId)

      results.push({
        lottery_campaign_id: campaignId,
        campaign_name: campaign ? campaign.campaign_name : `活动#${campaignId}`,
        campaign_status: campaign ? campaign.status : 'unknown',
        inventory_debt: invDebt
          ? {
              count: parseInt(invDebt.inventory_debt_count, 10) || 0,
              total_quantity: parseInt(invDebt.inventory_debt_quantity, 10) || 0,
              cleared_quantity: parseInt(invDebt.inventory_cleared_quantity, 10) || 0,
              remaining_quantity:
                (parseInt(invDebt.inventory_debt_quantity, 10) || 0) -
                (parseInt(invDebt.inventory_cleared_quantity, 10) || 0)
            }
          : null,
        budget_debt: budDebt
          ? {
              count: parseInt(budDebt.budget_debt_count, 10) || 0,
              total_amount: parseInt(budDebt.budget_debt_amount, 10) || 0,
              cleared_amount: parseInt(budDebt.budget_cleared_amount, 10) || 0,
              remaining_amount:
                (parseInt(budDebt.budget_debt_amount, 10) || 0) -
                (parseInt(budDebt.budget_cleared_amount, 10) || 0)
            }
          : null
      })
    })

    // 分页
    const total = results.length
    const pagedResults = results.slice(offset, offset + pageSize)

    return {
      items: pagedResults,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    }
  }

  /**
   * 按奖品汇总库存欠账
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.lottery_campaign_id] - 活动ID（可选）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 按奖品分组的库存欠账数据
   */
  static async getDebtByPrize(options = {}) {
    const { PresetInventoryDebt, LotteryPrize } = getModels()

    const campaignId = options.lottery_campaign_id
      ? parseInt(options.lottery_campaign_id, 10)
      : null
    const page = Math.max(1, parseInt(options.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(options.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const whereCondition = { status: 'pending' }
    if (campaignId) {
      whereCondition.lottery_campaign_id = campaignId
    }

    // 按奖品分组统计
    const prizeDebts = await PresetInventoryDebt.findAll({
      attributes: [
        'lottery_prize_id',
        'lottery_campaign_id',
        [fn('COUNT', col('preset_inventory_debt_id')), 'debt_count'],
        [fn('SUM', col('debt_quantity')), 'total_quantity'],
        [fn('SUM', col('cleared_quantity')), 'cleared_quantity']
      ],
      where: whereCondition,
      group: ['lottery_prize_id', 'lottery_campaign_id'],
      raw: true
    })

    // 获取奖品信息
    const prizeIds = prizeDebts.map(p => p.lottery_prize_id)
    const prizes = await LotteryPrize.findAll({
      where: { lottery_prize_id: { [Op.in]: prizeIds } },
      attributes: ['lottery_prize_id', 'prize_name', 'prize_type', 'stock_quantity']
    })

    const prizeMap = {}
    prizes.forEach(p => {
      prizeMap[p.lottery_prize_id] = p
    })

    // 构建结果
    const results = prizeDebts.map(item => {
      const prize = prizeMap[item.lottery_prize_id]
      return {
        lottery_prize_id: item.lottery_prize_id,
        prize_name: prize ? prize.prize_name : `奖品#${item.lottery_prize_id}`,
        prize_type: prize ? prize.prize_type : 'unknown',
        current_stock: prize ? prize.stock_quantity : 0,
        lottery_campaign_id: item.lottery_campaign_id,
        debt_count: parseInt(item.debt_count, 10) || 0,
        total_quantity: parseInt(item.total_quantity, 10) || 0,
        cleared_quantity: parseInt(item.cleared_quantity, 10) || 0,
        remaining_quantity:
          (parseInt(item.total_quantity, 10) || 0) - (parseInt(item.cleared_quantity, 10) || 0)
      }
    })

    // 分页
    const total = results.length
    const pagedResults = results.slice(offset, offset + pageSize)

    return {
      items: pagedResults,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    }
  }

  /**
   * 按责任人汇总欠账
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 按责任人分组的欠账数据
   */
  static async getDebtByCreator(options = {}) {
    const { PresetInventoryDebt, PresetBudgetDebt, LotteryPreset, User } = getModels()

    const page = Math.max(1, parseInt(options.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(options.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    // 获取有欠账的预设列表
    const presetIds = new Set()

    const inventoryPresets = await PresetInventoryDebt.findAll({
      attributes: ['lottery_preset_id'],
      where: {
        lottery_preset_id: { [Op.ne]: null },
        status: 'pending'
      },
      group: ['lottery_preset_id'],
      raw: true
    })

    const budgetPresets = await PresetBudgetDebt.findAll({
      attributes: ['lottery_preset_id'],
      where: {
        lottery_preset_id: { [Op.ne]: null },
        status: 'pending'
      },
      group: ['lottery_preset_id'],
      raw: true
    })

    inventoryPresets.forEach(p => presetIds.add(p.lottery_preset_id))
    budgetPresets.forEach(p => presetIds.add(p.lottery_preset_id))

    // 获取预设信息和创建人
    const presets = await LotteryPreset.findAll({
      where: { lottery_preset_id: { [Op.in]: Array.from(presetIds) } },
      attributes: ['lottery_preset_id', 'created_by']
    })

    // 按创建人分组统计
    const creatorStats = {}
    for (const preset of presets) {
      const creatorId = preset.created_by
      if (!creatorStats[creatorId]) {
        creatorStats[creatorId] = {
          creator_id: creatorId,
          preset_count: 0,
          inventory_debt_quantity: 0,
          budget_debt_amount: 0
        }
      }
      creatorStats[creatorId].preset_count++
    }

    // 批量查询所有预设的欠账统计
    const presetIdArray = Array.from(presetIds)

    // 库存欠账按预设分组统计
    const invDebtByPreset = await PresetInventoryDebt.findAll({
      attributes: ['lottery_preset_id', [fn('SUM', col('debt_quantity')), 'total']],
      where: {
        lottery_preset_id: { [Op.in]: presetIdArray },
        status: 'pending'
      },
      group: ['lottery_preset_id'],
      raw: true
    })

    // 预算欠账按预设分组统计
    const budDebtByPreset = await PresetBudgetDebt.findAll({
      attributes: ['lottery_preset_id', [fn('SUM', col('debt_amount')), 'total']],
      where: {
        lottery_preset_id: { [Op.in]: presetIdArray },
        status: 'pending'
      },
      group: ['lottery_preset_id'],
      raw: true
    })

    // 将欠账统计归并到创建人
    for (const preset of presets) {
      const creatorId = preset.created_by

      const invDebt = invDebtByPreset.find(i => i.lottery_preset_id === preset.lottery_preset_id)
      if (invDebt && invDebt.total) {
        creatorStats[creatorId].inventory_debt_quantity += parseInt(invDebt.total, 10) || 0
      }

      const budDebt = budDebtByPreset.find(b => b.lottery_preset_id === preset.lottery_preset_id)
      if (budDebt && budDebt.total) {
        creatorStats[creatorId].budget_debt_amount += parseInt(budDebt.total, 10) || 0
      }
    }

    // 获取创建人信息
    const creatorIds = Object.keys(creatorStats).map(id => parseInt(id, 10))
    const users = await User.findAll({
      where: { user_id: { [Op.in]: creatorIds } },
      attributes: ['user_id', 'nickname', 'mobile'] // 修复：使用正确的字段名 mobile
    })

    const userMap = {}
    users.forEach(u => {
      userMap[u.user_id] = u
    })

    // 构建结果
    const results = Object.values(creatorStats).map(stat => {
      const user = userMap[stat.creator_id]
      return {
        creator_id: stat.creator_id,
        creator_name: user ? user.nickname : `用户#${stat.creator_id}`,
        creator_mobile: user ? user.mobile : null, // 修复：使用正确的字段名 mobile
        preset_count: stat.preset_count,
        inventory_debt_quantity: stat.inventory_debt_quantity,
        budget_debt_amount: stat.budget_debt_amount
      }
    })

    // 排序：按总欠账金额降序
    results.sort(
      (a, b) =>
        b.inventory_debt_quantity +
        b.budget_debt_amount -
        (a.inventory_debt_quantity + a.budget_debt_amount)
    )

    // 分页
    const total = results.length
    const pagedResults = results.slice(offset, offset + pageSize)

    return {
      items: pagedResults,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    }
  }

  /**
   * 获取欠账趋势数据
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.period='day'] - 时间粒度: day|week|month
   * @param {number} [options.days=30] - 查询天数
   * @param {string} [options.debt_type='all'] - 欠账类型: inventory|budget|all
   * @returns {Promise<Object>} 欠账趋势数据
   */
  static async getDebtTrend(options = {}) {
    const { PresetInventoryDebt, PresetBudgetDebt } = getModels()

    const period = options.period || 'day'
    const days = Math.min(365, Math.max(1, parseInt(options.days, 10) || 30))
    const debtType = options.debt_type || 'all'

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // 根据 period 确定日期格式
    let dateFormat
    switch (period) {
      case 'week':
        dateFormat = '%Y-%u' // 年-周
        break
      case 'month':
        dateFormat = '%Y-%m'
        break
      default:
        dateFormat = '%Y-%m-%d'
    }

    const trend = {
      inventory_trend: [],
      budget_trend: []
    }

    // 库存欠账趋势
    if (debtType === 'all' || debtType === 'inventory') {
      trend.inventory_trend = await PresetInventoryDebt.findAll({
        attributes: [
          [fn('DATE_FORMAT', col('created_at'), dateFormat), 'period'],
          [fn('COUNT', col('preset_inventory_debt_id')), 'count'],
          [fn('SUM', col('debt_quantity')), 'quantity']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: [fn('DATE_FORMAT', col('created_at'), dateFormat)],
        order: [[fn('DATE_FORMAT', col('created_at'), dateFormat), 'ASC']],
        raw: true
      })
    }

    // 预算欠账趋势
    if (debtType === 'all' || debtType === 'budget') {
      trend.budget_trend = await PresetBudgetDebt.findAll({
        attributes: [
          [fn('DATE_FORMAT', col('created_at'), dateFormat), 'period'],
          [fn('COUNT', col('preset_budget_debt_id')), 'count'],
          [fn('SUM', col('debt_amount')), 'amount']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: [fn('DATE_FORMAT', col('created_at'), dateFormat)],
        order: [[fn('DATE_FORMAT', col('created_at'), dateFormat), 'ASC']],
        raw: true
      })
    }

    return {
      period,
      days,
      start_date: startDate.toISOString().split('T')[0],
      ...trend
    }
  }

  /**
   * 查询待冲销欠账
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.debt_type='inventory'] - 欠账类型: inventory|budget
   * @param {number} [options.lottery_campaign_id] - 活动ID（可选）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 待冲销欠账列表
   */
  static async getPendingDebts(options = {}) {
    const { PresetInventoryDebt, PresetBudgetDebt, LotteryCampaign, LotteryPrize, User } =
      getModels()

    const debtType = options.debt_type || 'inventory'
    const campaignId = options.lottery_campaign_id
      ? parseInt(options.lottery_campaign_id, 10)
      : null
    const page = Math.max(1, parseInt(options.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(options.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const whereCondition = { status: 'pending' }
    if (campaignId) {
      whereCondition.lottery_campaign_id = campaignId
    }

    let model
    let includeOptions

    if (debtType === 'inventory') {
      model = PresetInventoryDebt
      includeOptions = [
        { model: LotteryCampaign, as: 'campaign', attributes: ['campaign_name'] },
        { model: LotteryPrize, as: 'prize', attributes: ['prize_name', 'prize_type'] }
      ]
    } else {
      model = PresetBudgetDebt
      includeOptions = [
        { model: LotteryCampaign, as: 'campaign', attributes: ['campaign_name'] },
        { model: User, as: 'user', attributes: ['nickname', 'mobile'] } // 修复：使用正确的字段名 mobile
      ]
    }

    const { count, rows } = await model.findAndCountAll({
      where: whereCondition,
      include: includeOptions,
      order: [['created_at', 'ASC']],
      limit: pageSize,
      offset
    })

    const items = rows.map(item => item.toSummary())

    return {
      debt_type: debtType,
      items,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      }
    }
  }

  /**
   * 执行欠账清偿
   *
   * @param {Object} params - 清偿参数
   * @param {string} params.debt_type - 欠账类型: inventory|budget
   * @param {number} params.debt_id - 欠账ID
   * @param {number} params.amount - 清偿数量/金额
   * @param {number} params.admin_id - 操作管理员ID
   * @param {string} [params.remark] - 备注
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.transaction] - 外部事务（如果不提供则自动创建）
   * @returns {Promise<Object>} 清偿结果
   */
  static async clearDebt(params, options = {}) {
    const { PresetInventoryDebt, PresetBudgetDebt, sequelize } = getModels()

    const { debt_type: debtType, debt_id: debtId, amount, admin_id: adminId, remark } = params

    // 参数验证
    if (!debtType || !debtId || !amount) {
      throw new Error('缺少必要参数: debt_type, debt_id, amount')
    }

    if (amount <= 0) {
      throw new Error('清偿数量/金额必须大于0')
    }

    // 确定模型
    let model
    if (debtType === 'inventory') {
      model = PresetInventoryDebt
    } else if (debtType === 'budget') {
      model = PresetBudgetDebt
    } else {
      throw new Error('无效的欠账类型，必须是 inventory 或 budget')
    }

    // 使用外部事务或创建新事务
    const transaction = options.transaction || (await sequelize.transaction())
    const isExternalTransaction = !!options.transaction

    try {
      // 查找欠账记录
      const debt = await model.findByPk(debtId, { transaction })
      if (!debt) {
        throw new Error('欠账记录不存在')
      }

      // 检查是否可清偿
      if (!debt.canClear()) {
        throw new Error('该欠账记录不可清偿（状态非 pending）')
      }

      // 执行清偿
      const isFullyCleared = await debt.clearDebt(amount, {
        clearedByUserId: adminId,
        clearedByMethod: 'manual',
        clearedNotes: remark || '后台手动清偿',
        transaction
      })

      // 如果不是外部事务，则提交
      if (!isExternalTransaction) {
        await transaction.commit()
      }

      logger.info('[DebtManagementService] 欠账清偿成功', {
        debt_id: debtId,
        debt_type: debtType,
        amount,
        admin_id: adminId,
        fully_cleared: isFullyCleared,
        remark: remark || ''
      })

      return {
        debt_id: debtId,
        debt_type: debtType,
        cleared_amount: amount,
        is_fully_cleared: isFullyCleared,
        new_status: debt.status,
        cleared_by: adminId
      }
    } catch (error) {
      // 如果不是外部事务，则回滚
      if (!isExternalTransaction) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 获取欠账上限配置列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.lottery_campaign_id] - 活动ID（可选）
   * @param {string} [options.limit_level] - 限制级别: global|campaign|prize
   * @param {string} [options.status] - 状态: active|inactive
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 欠账上限配置列表
   */
  static async getDebtLimits(options = {}) {
    const { PresetDebtLimit, User, LotteryCampaign } = getModels()

    const campaignId = options.lottery_campaign_id
      ? parseInt(options.lottery_campaign_id, 10)
      : null
    const limitLevel = options.limit_level
    const status = options.status
    const page = Math.max(1, parseInt(options.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(options.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const whereCondition = {}
    if (campaignId) {
      whereCondition.limit_level = 'campaign'
      whereCondition.reference_id = campaignId
    }
    if (limitLevel) {
      whereCondition.limit_level = limitLevel
    }
    if (status) {
      whereCondition.status = status
    }

    const { count, rows } = await PresetDebtLimit.findAndCountAll({
      where: whereCondition,
      include: [
        { model: User, as: 'creator', attributes: ['user_id', 'nickname'] },
        { model: User, as: 'updater', attributes: ['user_id', 'nickname'] }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    })

    // 批量获取活动名称
    const campaignReferenceIds = rows
      .filter(limit => limit.limit_level === 'campaign' && limit.reference_id)
      .map(limit => limit.reference_id)

    const campaignMap = new Map()
    if (campaignReferenceIds.length > 0) {
      const campaigns = await LotteryCampaign.findAll({
        where: { lottery_campaign_id: { [Op.in]: campaignReferenceIds } },
        attributes: ['lottery_campaign_id', 'campaign_name', 'status']
      })
      campaigns.forEach(c => campaignMap.set(c.lottery_campaign_id, c))
    }

    const items = rows.map(limit => {
      const summary = limit.toSummary()
      if (limit.limit_level === 'campaign' && limit.reference_id) {
        const campaign = campaignMap.get(limit.reference_id)
        summary.campaign_name = campaign ? campaign.campaign_name : null
        summary.campaign_status = campaign ? campaign.status : null
      }
      return summary
    })

    return {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      }
    }
  }

  /**
   * 获取指定活动的欠账上限配置
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 欠账上限配置及当前欠账统计
   */
  static async getCampaignDebtLimit(campaignId) {
    const { PresetDebtLimit, PresetInventoryDebt, PresetBudgetDebt, LotteryCampaign } = getModels()

    // 检查活动是否存在
    const campaign = await LotteryCampaign.findByPk(campaignId, {
      attributes: ['lottery_campaign_id', 'campaign_name', 'status']
    })
    if (!campaign) {
      throw new Error('活动不存在')
    }

    // 获取或创建欠账上限配置
    const limit = await PresetDebtLimit.getOrCreateForCampaign(campaignId)

    // 获取当前欠账统计
    const inventoryStats = await PresetInventoryDebt.getDebtStatsByCampaign(campaignId)
    const budgetStats = await PresetBudgetDebt.getDebtStatsByCampaign(campaignId)

    return {
      limit: limit.toSummary(),
      campaign: {
        lottery_campaign_id: campaign.lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        status: campaign.status
      },
      current_debt: {
        inventory: inventoryStats,
        budget: budgetStats
      },
      utilization: {
        inventory_percent:
          limit.inventory_debt_limit > 0
            ? ((inventoryStats.remaining_debt_quantity / limit.inventory_debt_limit) * 100).toFixed(
                2
              )
            : 0,
        budget_percent:
          limit.budget_debt_limit > 0
            ? ((budgetStats.remaining_debt_amount / limit.budget_debt_limit) * 100).toFixed(2)
            : 0
      }
    }
  }

  /**
   * 更新欠账上限配置
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} updateData - 更新数据
   * @param {number} [updateData.inventory_debt_limit] - 最大库存欠账数量
   * @param {number} [updateData.budget_debt_limit] - 最大预算欠账金额
   * @param {string} [updateData.description] - 配置说明
   * @param {string} [updateData.status] - 状态: active|inactive
   * @param {number} adminId - 操作管理员ID
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.transaction] - 外部事务
   * @returns {Promise<Object>} 更新后的配置
   */
  static async updateCampaignDebtLimit(campaignId, updateData, adminId, options = {}) {
    const { PresetDebtLimit, LotteryCampaign, sequelize } = getModels()

    // 使用外部事务或创建新事务
    const transaction = options.transaction || (await sequelize.transaction())
    const isExternalTransaction = !!options.transaction

    try {
      // 检查活动是否存在
      const campaign = await LotteryCampaign.findByPk(campaignId, { transaction })
      if (!campaign) {
        throw new Error('活动不存在')
      }

      // 获取或创建欠账上限配置
      const limit = await PresetDebtLimit.getOrCreateForCampaign(campaignId, { transaction })

      // 构建更新数据
      const updates = { updated_by: adminId }
      if (updateData.inventory_debt_limit !== undefined) {
        updates.inventory_debt_limit = Math.max(0, parseInt(updateData.inventory_debt_limit, 10))
      }
      if (updateData.budget_debt_limit !== undefined) {
        updates.budget_debt_limit = Math.max(0, parseInt(updateData.budget_debt_limit, 10))
      }
      if (updateData.description !== undefined) {
        updates.description = updateData.description
      }
      if (updateData.status !== undefined && ['active', 'inactive'].includes(updateData.status)) {
        updates.status = updateData.status
      }

      // 更新配置
      await limit.update(updates, { transaction })

      // 如果不是外部事务，则提交
      if (!isExternalTransaction) {
        await transaction.commit()
      }

      logger.info('[DebtManagementService] 欠账上限配置更新', {
        lottery_campaign_id: campaignId,
        admin_id: adminId,
        updates
      })

      return limit.toSummary()
    } catch (error) {
      if (!isExternalTransaction) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 检查活动欠账告警状态
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 告警检查结果
   */
  static async checkAlertStatus(campaignId) {
    const { PresetDebtLimit, PresetInventoryDebt, PresetBudgetDebt } = getModels()

    // 获取当前欠账统计
    const inventoryStats = await PresetInventoryDebt.getDebtStatsByCampaign(campaignId)
    const budgetStats = await PresetBudgetDebt.getDebtStatsByCampaign(campaignId)

    // 检查告警状态
    const alertResult = await PresetDebtLimit.checkAlertThreshold(
      { campaignId },
      {
        inventory: inventoryStats.remaining_debt_quantity,
        budget: budgetStats.remaining_debt_amount
      }
    )

    return {
      lottery_campaign_id: campaignId,
      current_debt: {
        inventory: inventoryStats,
        budget: budgetStats
      },
      alert: alertResult
    }
  }
}

module.exports = DebtManagementService
