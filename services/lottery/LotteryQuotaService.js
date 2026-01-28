const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 抽奖配额服务 - V4.0
 * 提供抽奖次数配额的规则计算、配额初始化、原子扣减等功能
 *
 * 业务场景：
 * - 实现四维度（全局/活动/角色/用户）抽奖次数配额控制
 * - 支持连抽场景的原子性扣减（10连抽一次扣减10次）
 * - 避免并发窗口期问题，保证配额不超限
 * - 支持客服临时加次数（bonus_draw_count）
 *
 * 核心功能：
 * 1. getEffectiveDailyLimit：获取用户在指定活动的生效每日配额上限
 * 2. ensureDailyQuota：确保用户当日配额行存在
 * 3. tryDeductQuota：原子扣减配额（支持连抽）
 * 4. getDailyQuotaStatus：获取用户当日配额状态
 * 5. addBonusDrawCount：为用户添加临时补偿次数
 *
 * 优先级链（写死，不可配置）：
 * 1. 用户级规则（user override）- 最高优先级
 * 2. 人群/角色规则（role/segment override）
 * 3. 活动级规则（campaign override）
 * 4. 全局默认规则（global default）
 *
 * 关键业务规则（写死，不可配置）：
 * - 规则变更当日不回算（配额行生成后当天不变）
 * - 连抽整笔成功或整笔失败（不支持部分成功）
 * - 每日凌晨00:00（北京时间）生成新配额行
 *
 * 集成模型：
 * - LotteryDrawQuotaRule：配额规则模型（规则层）
 * - LotteryUserDailyDrawQuota：用户每日配额模型（强一致扣减层）
 * - UserRole：用户角色关联模型（获取用户角色UUID列表）
 *
 * 使用方式：
 * ```javascript
 * const LotteryQuotaService = require('./LotteryQuotaService')
 *
 * // 获取用户生效的每日配额上限
 * const { limit_value, matched_rule } = await LotteryQuotaService.getEffectiveDailyLimit({
 *   user_id: 10001,
 *   campaign_id: 1
 * })
 *
 * // 在事务内原子扣减配额
 * const transaction = await sequelize.transaction()
 * const result = await LotteryQuotaService.tryDeductQuota({
 *   user_id: 10001,
 *   campaign_id: 1,
 *   draw_count: 10  // 10连抽
 * }, { transaction })
 *
 * if (!result.success) {
 *   // 配额不足，抛出错误
 *   throw new Error('DAILY_DRAW_LIMIT_EXCEEDED')
 * }
 * ```
 *
 * 创建时间：2025-12-23
 * 作者：Claude Code
 */

/**
 * 抽奖配额服务类
 *
 * @class LotteryQuotaService
 * @description 提供抽奖次数配额的规则计算、配额初始化、原子扣减等功能
 */
class LotteryQuotaService {
  /**
   * 获取用户在指定活动的生效每日配额上限
   *
   * 业务逻辑：
   * 1. 获取用户角色UUID列表
   * 2. 调用 LotteryDrawQuotaRule.getEffectiveDailyLimit() 按优先级查找规则
   * 3. 返回最终生效的 limit_value 和命中规则信息
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @returns {Promise<Object>} { limit_value, matched_rule, priority, debug }
   */
  static async getEffectiveDailyLimit({ user_id, campaign_id }) {
    try {
      const { LotteryDrawQuotaRule, UserRole, Role } = require('../../models')

      /*
       * 获取用户角色UUID列表
       * 🔧 修复：使用正确的关联别名 'role'（小写，与 UserRole.js 中定义的一致）
       */
      let role_uuids = []
      try {
        const userRoles = await UserRole.findAll({
          where: { user_id, is_active: true },
          include: [
            {
              model: Role,
              as: 'role', // ✅ 正确的别名：小写 'role'，对应 UserRole.belongsTo(Role, { as: 'role' })
              attributes: ['role_uuid']
            }
          ]
        })
        role_uuids = userRoles.map(ur => ur.role?.role_uuid).filter(Boolean)
      } catch (err) {
        logger.warn('获取用户角色UUID列表失败，将跳过角色级规则匹配:', err.message)
      }

      // 调用模型静态方法获取生效配额
      const result = await LotteryDrawQuotaRule.getEffectiveDailyLimit({
        user_id,
        campaign_id,
        role_uuids
      })

      logger.debug('获取用户生效配额:', {
        user_id,
        campaign_id,
        limit_value: result.limit_value,
        matched_rule: result.matched_rule
      })

      return result
    } catch (error) {
      logger.error('获取用户生效配额失败:', error)
      throw error
    }
  }

  /**
   * 确保用户当日配额行存在（不存在则创建）
   *
   * 业务逻辑：
   * 1. 查询是否已有当日配额行
   * 2. 如无，调用 getEffectiveDailyLimit() 获取 limit_value
   * 3. 创建配额行，使用 upsert 保证幂等
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 选项 { transaction }
   * @returns {Promise<Object>} 配额行对象
   */
  static async ensureDailyQuota({ user_id, campaign_id }, options = {}) {
    try {
      const { LotteryUserDailyDrawQuota, UserRole, Role } = require('../../models')

      /*
       * 获取用户角色UUID列表
       * 🔧 修复：使用正确的关联别名 'role'（小写，与 UserRole.js 中定义的一致）
       */
      let role_uuids = []
      try {
        const userRoles = await UserRole.findAll({
          where: { user_id, is_active: true },
          include: [
            {
              model: Role,
              as: 'role', // ✅ 正确的别名：小写 'role'，对应 UserRole.belongsTo(Role, { as: 'role' })
              attributes: ['role_uuid']
            }
          ]
        })
        role_uuids = userRoles.map(ur => ur.role?.role_uuid).filter(Boolean)
      } catch (err) {
        logger.warn('获取用户角色UUID列表失败，将跳过角色级规则匹配:', err.message)
      }

      // 调用模型静态方法确保配额行存在
      const quota = await LotteryUserDailyDrawQuota.ensureDailyQuota(
        {
          user_id,
          campaign_id,
          role_uuids
        },
        options
      )

      logger.debug('确保用户配额行存在:', {
        user_id,
        campaign_id,
        quota_id: quota?.quota_id,
        limit_value: quota?.limit_value
      })

      return quota
    } catch (error) {
      logger.error('确保用户配额行存在失败:', error)
      throw error
    }
  }

  /**
   * 原子扣减配额（核心方法：支持连抽）
   *
   * 业务逻辑：
   * 1. 确保配额行存在
   * 2. 使用原生SQL进行原子扣减（UPDATE ... WHERE 条件）
   * 3. 如果 affectedRows=0，说明配额不足，返回失败结果
   * 4. 返回扣减结果和最新配额状态
   *
   * 关键特性：
   * - 原子操作：并发请求只有一个能成功扣减
   * - 支持连抽：一次扣减 N 次（10连抽扣减10次）
   * - 事务安全：必须在事务内调用
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.draw_count - 本次抽奖次数（连抽场景 >1）
   * @param {Object} options - 选项 { transaction }（必需）
   * @returns {Promise<Object>} { success, remaining, limit, used, message }
   */
  static async tryDeductQuota({ user_id, campaign_id, draw_count = 1 }, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('tryDeductQuota 必须在事务内调用')
    }

    try {
      const { LotteryUserDailyDrawQuota } = require('../../models')

      // 确保配额行存在
      await this.ensureDailyQuota({ user_id, campaign_id }, { transaction })

      // 调用模型静态方法进行原子扣减
      const result = await LotteryUserDailyDrawQuota.tryDeductQuota(
        {
          user_id,
          campaign_id,
          draw_count
        },
        { transaction }
      )

      if (result.success) {
        logger.info('配额扣减成功:', {
          user_id,
          campaign_id,
          draw_count,
          remaining: result.remaining,
          used: result.used
        })
      } else {
        logger.warn('配额扣减失败（配额不足）:', {
          user_id,
          campaign_id,
          draw_count,
          remaining: result.remaining,
          limit: result.limit,
          message: result.message
        })
      }

      return result
    } catch (error) {
      logger.error('配额扣减失败:', error)
      throw error
    }
  }

  /**
   * 获取用户当日配额状态
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 选项 { transaction }
   * @returns {Promise<Object|null>} 配额状态对象或null
   */
  static async getDailyQuotaStatus({ user_id, campaign_id }, options = {}) {
    try {
      const { LotteryUserDailyDrawQuota } = require('../../models')

      const status = await LotteryUserDailyDrawQuota.getDailyQuotaStatus(
        {
          user_id,
          campaign_id
        },
        options
      )

      return status
    } catch (error) {
      logger.error('获取用户配额状态失败:', error)
      throw error
    }
  }

  /**
   * 为用户添加临时补偿次数（客服用）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.bonus_count - 补偿次数
   * @param {string} [params.reason] - 补偿原因
   * @param {Object} options - 选项 { transaction, admin_id }
   * @returns {Promise<Object>} 更新后的配额状态
   */
  static async addBonusDrawCount({ user_id, campaign_id, bonus_count, reason }, options = {}) {
    try {
      const { LotteryUserDailyDrawQuota } = require('../../models')

      const result = await LotteryUserDailyDrawQuota.addBonusDrawCount(
        {
          user_id,
          campaign_id,
          bonus_count,
          reason
        },
        options
      )

      logger.info('添加临时补偿次数成功:', {
        user_id,
        campaign_id,
        bonus_count,
        reason,
        new_total_available: result?.total_available
      })

      return result
    } catch (error) {
      logger.error('添加临时补偿次数失败:', error)
      throw error
    }
  }

  /**
   * 获取或初始化用户配额状态（用于API响应）
   *
   * 业务逻辑：
   * 1. 尝试获取用户当日配额状态
   * 2. 如果不存在，先计算生效配额上限
   * 3. 返回完整的配额信息（包括上限、已用、剩余等）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @returns {Promise<Object>} 配额状态对象
   */
  static async getOrInitQuotaStatus({ user_id, campaign_id }) {
    try {
      // 先尝试获取现有配额状态
      const status = await this.getDailyQuotaStatus({ user_id, campaign_id })

      if (status) {
        return status
      }

      // 如果不存在，计算生效配额上限
      const { limit_value, matched_rule } = await this.getEffectiveDailyLimit({
        user_id,
        campaign_id
      })

      const todayDate = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

      return {
        quota_id: null,
        user_id,
        campaign_id,
        quota_date: todayDate,
        limit_value,
        used_draw_count: 0,
        bonus_draw_count: 0,
        remaining: limit_value,
        total_available: limit_value,
        is_exhausted: false,
        last_draw_at: null,
        matched_rule_id: matched_rule?.rule_id || null,
        not_initialized: true
      }
    } catch (error) {
      logger.error('获取或初始化配额状态失败:', error)
      throw error
    }
  }

  /**
   * 验证配额是否充足（不扣减，仅检查）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.draw_count - 本次抽奖次数
   * @returns {Promise<Object>} { sufficient, remaining, limit, message }
   */
  static async checkQuotaSufficient({ user_id, campaign_id, draw_count = 1 }) {
    try {
      const status = await this.getOrInitQuotaStatus({ user_id, campaign_id })

      const sufficient = status.remaining >= draw_count

      return {
        sufficient,
        remaining: status.remaining,
        limit: status.limit_value,
        bonus: status.bonus_draw_count,
        used: status.used_draw_count,
        requested: draw_count,
        matched_rule_id: status.matched_rule_id,
        message: sufficient
          ? '配额充足'
          : `今日抽奖次数已达上限（${status.total_available}次），剩余${status.remaining}次，请求${draw_count}次`
      }
    } catch (error) {
      logger.error('检查配额是否充足失败:', error)
      throw error
    }
  }

  // ==================== 规则管理方法（2025-12-31 新增） ====================

  /**
   * 查询配额规则列表
   *
   * @param {Object} params - 查询参数
   * @param {string} params.rule_type - 规则类型（global/campaign/role/user，可选）
   * @param {number} params.campaign_id - 活动ID（可选）
   * @param {boolean} params.is_active - 是否激活（可选）
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.page_size - 每页数量（默认20）
   * @returns {Promise<Object>} { rules, pagination }
   */
  static async getRulesList({ rule_type, campaign_id, is_active, page = 1, page_size = 20 }) {
    const { LotteryDrawQuotaRule } = require('../../models')

    // 构建查询条件
    const whereClause = {}

    if (rule_type) {
      whereClause.scope_type = rule_type
    }

    if (campaign_id) {
      // 当前表结构仅对 campaign 维度存储 campaign_id（scope_id）
      if (!rule_type || rule_type === 'campaign') {
        whereClause.scope_type = 'campaign'
        whereClause.scope_id = String(parseInt(campaign_id))
      }
    }

    if (is_active !== undefined) {
      const active = is_active === 'true' || is_active === true
      whereClause.status = active ? 'active' : 'inactive'
    }

    // 分页查询
    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const { rows, count } = await LotteryDrawQuotaRule.findAndCountAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'], // 高优先级在前
        ['created_at', 'DESC']
      ],
      limit: parseInt(page_size),
      offset
    })

    logger.info('查询配额规则列表', {
      filters: { rule_type, campaign_id, is_active },
      total: count
    })

    return {
      rules: rows,
      pagination: {
        current_page: parseInt(page),
        page_size: parseInt(page_size),
        total_count: count,
        total_pages: Math.ceil(count / parseInt(page_size))
      }
    }
  }

  /**
   * 获取单个配额规则详情
   *
   * API路径参数设计规范 V2.2（2026-01-20）：
   * - 配额规则是事务实体（按需创建），使用数字ID（:id）作为标识符
   * - 对应路由：GET /api/v4/console/lottery-quota/rules/:id
   *
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 规则详情
   * @throws {Error} 404 - 规则不存在
   */
  static async getRuleById(ruleId) {
    const { LotteryDrawQuotaRule } = require('../../models')

    if (!ruleId || isNaN(parseInt(ruleId))) {
      const error = new Error('缺少必填参数：rule_id')
      error.code = 'MISSING_RULE_ID'
      error.status = 400
      throw error
    }

    const rule = await LotteryDrawQuotaRule.findByPk(parseInt(ruleId))

    if (!rule) {
      const error = new Error(`配额规则 ${ruleId} 不存在`)
      error.code = 'RULE_NOT_FOUND'
      error.status = 404
      throw error
    }

    logger.info('获取配额规则详情', { rule_id: ruleId })

    return rule
  }

  /**
   * 创建配额规则
   *
   * @param {Object} params - 规则参数
   * @param {string} params.rule_type - 规则类型（global/campaign/role/user）
   * @param {number} params.campaign_id - 活动ID（campaign类型必填）
   * @param {string} params.role_uuid - 角色UUID（role类型必填）
   * @param {number} params.target_user_id - 目标用户ID（user类型必填）
   * @param {number} params.limit_value - 每日抽奖次数上限
   * @param {string} params.effective_from - 生效开始时间（可选）
   * @param {string} params.effective_to - 生效结束时间（可选）
   * @param {string} params.reason - 创建原因（可选）
   * @param {number} params.created_by - 创建人ID
   * @returns {Promise<Object>} 创建的规则
   */
  static async createRule({
    rule_type,
    campaign_id,
    role_uuid,
    target_user_id,
    limit_value,
    effective_from,
    effective_to,
    reason,
    created_by
  }) {
    const { LotteryDrawQuotaRule } = require('../../models')

    // 优先级映射（user:100 > role:80 > campaign:50 > global:10）
    const priorityMap = {
      user: 100,
      role: 80,
      campaign: 50,
      global: 10
    }

    // 计算 scope_id（当前表结构以 scope_type + scope_id 表达四维度规则）
    let scope_id = 'global'
    if (rule_type === 'campaign') {
      scope_id = String(parseInt(campaign_id))
    } else if (rule_type === 'role') {
      scope_id = role_uuid
    } else if (rule_type === 'user') {
      scope_id = String(parseInt(target_user_id))
    }

    // 创建规则
    const rule = await LotteryDrawQuotaRule.create({
      scope_type: rule_type,
      scope_id,
      limit_value: parseInt(limit_value),
      priority: priorityMap[rule_type],
      effective_from: effective_from ? new Date(effective_from) : null,
      effective_to: effective_to ? new Date(effective_to) : null,
      status: 'active',
      created_by,
      updated_by: created_by,
      reason: reason || null
    })

    logger.info('创建配额规则成功', {
      rule_id: rule.rule_id,
      rule_type,
      limit_value,
      created_by
    })

    return rule
  }

  /**
   * 禁用配额规则
   *
   * @param {Object} params - 参数
   * @param {number} params.rule_id - 规则ID
   * @param {number} params.updated_by - 更新人ID
   * @returns {Promise<Object>} 更新后的规则
   * @throws {Error} 规则不存在或已禁用
   */
  static async disableRule({ rule_id, updated_by }) {
    const { LotteryDrawQuotaRule } = require('../../models')

    const rule = await LotteryDrawQuotaRule.findByPk(rule_id)

    if (!rule) {
      const error = new Error('配额规则不存在')
      error.code = 'RULE_NOT_FOUND'
      error.status = 404
      throw error
    }

    if (rule.status === 'inactive') {
      const error = new Error('规则已禁用')
      error.code = 'RULE_ALREADY_DISABLED'
      error.status = 400
      throw error
    }

    await rule.update({
      status: 'inactive',
      updated_by
    })

    logger.info('禁用配额规则成功', {
      rule_id: rule.rule_id,
      rule_type: rule.scope_type,
      updated_by
    })

    return rule
  }

  /**
   * 获取配额统计数据
   *
   * @description 返回配额规则和用户配额的汇总统计数据
   *
   * @param {Object} params - 参数
   * @param {number} [params.campaign_id] - 活动ID（可选，不传则返回全局统计）
   * @returns {Promise<Object>} 统计数据对象
   *
   * @example
   * const stats = await LotteryQuotaService.getStatistics({ campaign_id: 1 })
   * // 返回：
   * // {
   * //   rules: { total: 5, active: 3, by_type: { global: 1, campaign: 2, role: 1, user: 1 } },
   * //   quotas: { total_users: 100, today_used: 500, today_remaining: 1500, today_total: 2000 }
   * // }
   */
  static async getStatistics({ campaign_id } = {}) {
    const { LotteryDrawQuotaRule, LotteryUserDailyDrawQuota, sequelize } = require('../../models')

    // 获取当日日期（北京时间，格式：YYYY-MM-DD）
    const today = BeijingTimeHelper.todayStart().toISOString().split('T')[0]

    // 1. 规则统计
    const ruleStats = {}

    // 规则总数
    ruleStats.total = await LotteryDrawQuotaRule.count()

    // 激活规则数量
    ruleStats.active = await LotteryDrawQuotaRule.count({
      where: { status: 'active' }
    })

    // 按类型统计（scope_type）
    const rulesByType = await LotteryDrawQuotaRule.findAll({
      attributes: ['scope_type', [sequelize.fn('COUNT', sequelize.col('rule_id')), 'count']],
      where: { status: 'active' },
      group: ['scope_type'],
      raw: true
    })

    ruleStats.by_type = {
      global: 0,
      campaign: 0,
      role: 0,
      user: 0
    }

    rulesByType.forEach(row => {
      if (Object.prototype.hasOwnProperty.call(ruleStats.by_type, row.scope_type)) {
        ruleStats.by_type[row.scope_type] = parseInt(row.count)
      }
    })

    // 2. 用户配额统计（按活动或全局）
    const quotaStats = {}

    const quotaWhere = { quota_date: today }
    if (campaign_id) {
      quotaWhere.campaign_id = parseInt(campaign_id)
    }

    // 今日有配额记录的用户数
    quotaStats.total_users = await LotteryUserDailyDrawQuota.count({
      where: quotaWhere,
      distinct: true,
      col: 'user_id'
    })

    // 今日配额使用汇总
    const quotaSums = await LotteryUserDailyDrawQuota.findOne({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('used_draw_count')), 'total_used'],
        [sequelize.fn('SUM', sequelize.col('bonus_draw_count')), 'total_bonus'],
        [sequelize.fn('SUM', sequelize.col('limit_value')), 'total_limit']
      ],
      where: quotaWhere,
      raw: true
    })

    quotaStats.today_used = parseInt(quotaSums?.total_used) || 0
    quotaStats.today_bonus = parseInt(quotaSums?.total_bonus) || 0
    quotaStats.today_limit = parseInt(quotaSums?.total_limit) || 0
    quotaStats.today_remaining = Math.max(
      0,
      quotaStats.today_limit + quotaStats.today_bonus - quotaStats.today_used
    )

    logger.info('获取配额统计数据成功', {
      campaign_id: campaign_id || 'global',
      rules_total: ruleStats.total,
      quotas_users: quotaStats.total_users,
      today_used: quotaStats.today_used
    })

    return {
      rules: ruleStats,
      quotas: quotaStats,
      query_date: today,
      campaign_id: campaign_id ? parseInt(campaign_id) : null
    }
  }
}

module.exports = LotteryQuotaService
