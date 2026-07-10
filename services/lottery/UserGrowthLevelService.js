'use strict'

/**
 * @file 用户成长等级服务（UserGrowthLevelService）
 * @description 独立成长等级体系的领域服务（2026-06-04 合规改造 P1=乙 + B 线）
 *
 * 业务定位：
 * - 成长等级是独立一等公民体系，区别于 users.user_level（身份类型 normal/vip/merchant）
 * - 用户当前等级由 users.history_total_points 实时派生（单一数据源，无 per-user 同步债）
 * - B 线公示分级概率：各等级在 lottery_strategy_config.level_probability 按活动配置中奖率倍数
 *
 * 服务职责：
 * 1. resolveUserLevel - 派生指定用户的成长等级码
 * 2. getLevelMultiplier - 取某活动下某等级的中奖率倍数（公示分级概率，默认 1.0）
 * 3. getUserLevelMultiplier - 组合：用户 → 等级 → 倍数（抽奖内核 TierPickStage 调用）
 * 4. listLevels - 列出成长等级阶梯（管理后台/小程序公示）
 * 5. getLevelProbabilityConfig / upsertLevelProbabilityConfig - B 线倍数读写（管理 API）
 *
 * 架构约束：
 * - 读操作收口本服务；写操作通过 options.transaction 由路由层 TransactionManager 管理
 * - 抽奖内核只读不造（不在抽奖链路里写成长等级）
 *
 * @version 1.0.0
 * @date 2026-06-04
 */

const logger = require('../../utils/logger').logger

/** level_probability 配置组：倍数键前缀（如 multiplier_silver） */
const LEVEL_MULTIPLIER_PREFIX = 'multiplier_'
/** 默认倍数（无配置时零行为变化，安全） */
const DEFAULT_MULTIPLIER = 1.0

/**
 * 用户成长等级服务类
 * @class UserGrowthLevelService
 */
class UserGrowthLevelService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.UserGrowthLevel = models.UserGrowthLevel
    this.User = models.User
    this.LotteryStrategyConfig = models.LotteryStrategyConfig
    this.sequelize = models.sequelize
  }

  /**
   * 等级分布看板数据（管理端 P0-3，拍板⑫）
   *
   * 统计口径：
   * - 各档人数/累计积分贡献：全量用户按 history_total_points 实时分档
   *   （用户量当前很小，JS 分桶即可；上量后再改 SQL CASE 聚合——工程加固 §9-8 结论）；
   * - 累计积分 ≈ 累计消费贡献（1 元 = 1 积分的 A 口径代理）；
   * - 本月升级人数：本月获得的"计入等级"积分（排除加成笔）使其跨过当前档阈值的用户数。
   *
   * @returns {Promise<Object>} { levels: [{level_key, level_name, min_history_points, earn_multiplier, user_count, history_points_sum, upgraded_this_month}], total_users }
   */
  async getLevelDistribution() {
    const levels = await this.UserGrowthLevel.getActiveLevels()
    const sortedLevels = [...levels].sort(
      (a, b) => Number(a.min_history_points) - Number(b.min_history_points)
    )

    // 全量用户累计积分（仅取单列；14 行级别，上量后改 SQL 聚合）
    const users = await this.User.findAll({
      attributes: ['user_id', 'history_total_points'],
      raw: true
    })

    /*
     * 本月"计入等级"积分增量（北京时间月初起，DB 会话时区 +08:00 故 NOW() 即北京时刻）：
     * 排除 level_bonus_reward / activity_bonus_reward（加成笔不计等级，与
     * BalanceService.HISTORY_POINTS_EXCLUDED_BUSINESS_TYPES 同口径）。
     */
    const [monthGainedRows] = await this.sequelize.query(
      `SELECT a.user_id, SUM(t.delta_amount) AS gained
       FROM asset_transactions t
       JOIN accounts a ON a.account_id = t.account_id
       WHERE a.account_type = 'user'
         AND t.asset_code = 'points'
         AND t.delta_amount > 0
         AND t.business_type NOT IN ('level_bonus_reward', 'activity_bonus_reward')
         AND t.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY a.user_id`
    )
    const gainedByUserId = new Map(monthGainedRows.map(r => [Number(r.user_id), Number(r.gained)]))

    /**
     * 按累计积分匹配所属档位下标（阈值升序，取满足下限的最高档）
     * @param {number} points - 累计积分
     * @returns {number} 档位下标（-1=无匹配档）
     */
    const resolveIndex = points => {
      let idx = -1
      for (let i = 0; i < sortedLevels.length; i++) {
        if (points >= Number(sortedLevels[i].min_history_points)) idx = i
      }
      return idx
    }

    const buckets = sortedLevels.map(l => ({
      level_key: l.level_key,
      level_name: l.level_name,
      min_history_points: Number(l.min_history_points),
      earn_multiplier: Number(l.earn_multiplier) || 1.0,
      user_count: 0,
      history_points_sum: 0,
      upgraded_this_month: 0
    }))

    for (const user of users) {
      const points = Number(user.history_total_points) || 0
      const idx = resolveIndex(points)
      if (idx < 0) continue
      buckets[idx].user_count += 1
      buckets[idx].history_points_sum += points

      // 本月升级判定：月初积分（当前 - 本月增量）低于当前档下限 = 本月跨档
      const gained = gainedByUserId.get(Number(user.user_id)) || 0
      const threshold = Number(sortedLevels[idx].min_history_points)
      if (threshold > 0 && points - gained < threshold) {
        buckets[idx].upgraded_this_month += 1
      }
    }

    return {
      levels: buckets,
      total_users: users.length
    }
  }

  /**
   * 等级成本看板数据（管理端 P1-4，拍板⑫）
   *
   * 统计口径（发放线"真金白银"的仪表盘）：
   * - 加成发放量：business_type='level_bonus_reward' 按日/按档聚合（按档取流水 meta.level_key_locked）；
   * - 预算注入量：business_type='consumption_budget_allocation' 按日聚合；
   * - 加成成本占营收比：加成积分总量 / 审核通过消费总额（1 积分 ≈ 1 元）；
   * - 积分负债余额：全体用户 points 可用余额合计（拍板⑰永不过期口径下负债只增不销，
   *   此监控为唯一财务闸口）。
   *
   * @param {Object} [options={}] - 选项
   * @param {number} [options.days=30] - 统计天数（按日趋势窗口）
   * @returns {Promise<Object>} { daily, by_level, summary }
   */
  async getLevelCostReport(options = {}) {
    const days = Math.min(Math.max(parseInt(options.days, 10) || 30, 1), 365)

    // 按日：加成发放量 + 预算注入量（DB 会话时区 +08:00，DATE() 即北京日期）
    const [dailyRows] = await this.sequelize.query(
      `SELECT DATE(t.created_at) AS stat_date,
              SUM(CASE WHEN t.business_type = 'level_bonus_reward' THEN t.delta_amount ELSE 0 END) AS level_bonus_points,
              SUM(CASE WHEN t.business_type = 'consumption_budget_allocation' THEN t.delta_amount ELSE 0 END) AS budget_points_injected
       FROM asset_transactions t
       JOIN accounts a ON a.account_id = t.account_id
       WHERE a.account_type = 'user'
         AND t.delta_amount > 0
         AND t.business_type IN ('level_bonus_reward', 'consumption_budget_allocation')
         AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       GROUP BY DATE(t.created_at)
       ORDER BY stat_date ASC`,
      { replacements: { days } }
    )

    // 按档：加成发放量（流水 meta.level_key_locked 为发放时点锁定档位）
    const [byLevelRows] = await this.sequelize.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(t.meta, '$.level_key_locked')) AS level_key,
              SUM(t.delta_amount) AS level_bonus_points,
              COUNT(*) AS bonus_count
       FROM asset_transactions t
       JOIN accounts a ON a.account_id = t.account_id
       WHERE a.account_type = 'user'
         AND t.delta_amount > 0
         AND t.business_type = 'level_bonus_reward'
         AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       GROUP BY level_key
       ORDER BY level_key ASC`,
      { replacements: { days } }
    )

    // 营收口径：窗口内审核通过的消费总额（reviewed_at 与发放时点对齐）
    const [[revenueRow]] = await this.sequelize.query(
      `SELECT COALESCE(SUM(consumption_amount), 0) AS approved_amount
       FROM consumption_records
       WHERE status = 'approved' AND is_deleted = 0
         AND reviewed_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)`,
      { replacements: { days } }
    )

    // 积分负债余额（全体用户 points 可用余额合计，实时快照）
    const [[liabilityRow]] = await this.sequelize.query(
      `SELECT COALESCE(SUM(b.available_amount), 0) AS points_liability
       FROM account_asset_balances b
       JOIN accounts a ON a.account_id = b.account_id
       WHERE a.account_type = 'user' AND b.asset_code = 'points'`
    )

    const totalLevelBonus = dailyRows.reduce((sum, r) => sum + Number(r.level_bonus_points), 0)
    const totalBudgetInjected = dailyRows.reduce(
      (sum, r) => sum + Number(r.budget_points_injected),
      0
    )
    const approvedAmount = Number(revenueRow.approved_amount) || 0

    return {
      period_days: days,
      daily: dailyRows.map(r => ({
        stat_date: r.stat_date,
        level_bonus_points: Number(r.level_bonus_points),
        budget_points_injected: Number(r.budget_points_injected)
      })),
      by_level: byLevelRows.map(r => ({
        level_key: r.level_key || null,
        level_bonus_points: Number(r.level_bonus_points),
        bonus_count: Number(r.bonus_count)
      })),
      summary: {
        total_level_bonus_points: totalLevelBonus,
        total_budget_points_injected: totalBudgetInjected,
        approved_consumption_amount: approvedAmount,
        // 加成成本占营收比（1 积分 ≈ 1 元；营收为 0 时为 null 避免除零假象）
        bonus_cost_ratio:
          approvedAmount > 0 ? Number((totalLevelBonus / approvedAmount).toFixed(4)) : null,
        points_liability: Number(liabilityRow.points_liability)
      }
    }
  }

  /**
   * 派生指定用户的成长等级码
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<string|null>} 命中的 level_key（用户不存在或无启用等级时返回 null）
   */
  async resolveUserLevel(user_id, options = {}) {
    const user = await this.User.findByPk(user_id, {
      attributes: ['user_id', 'history_total_points'],
      transaction: options.transaction
    })
    if (!user) {
      return null
    }
    return this.UserGrowthLevel.resolveLevelKey(user.history_total_points, options)
  }

  /**
   * 派生指定用户的成长等级 + 发放线倍数（提交时锁定用，拍板⑬-(a)/§2.4-5）
   *
   * 业务场景：小票提交时点派生用户等级并锁定 earn_multiplier，随消费记录落表
   * （level_key_locked / earn_multiplier_locked），审核快慢不影响到账金额。
   *
   * @param {number} user_id - 用户ID
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<Object>} { level_key, level_name, earn_multiplier }（无等级时倍数为 1.0）
   */
  async resolveUserLevelWithMultiplier(user_id, options = {}) {
    const user = await this.User.findByPk(user_id, {
      attributes: ['user_id', 'history_total_points'],
      transaction: options.transaction
    })
    if (!user) {
      return { level_key: null, level_name: null, earn_multiplier: 1.0 }
    }
    const level = await this.UserGrowthLevel.resolveLevel(user.history_total_points, options)
    return {
      level_key: level ? level.level_key : null,
      level_name: level ? level.level_name : null,
      earn_multiplier: level ? Number(level.earn_multiplier) || 1.0 : 1.0
    }
  }

  /**
   * 构造 C 端"我的成长等级"只读视图（BE-4，拍板点④/⑨）
   *
   * 业务场景：
   * - 小程序"会员尊享/解锁条件"展示用户当前成长等级与等级阶梯。
   * - 服务 V-4（"当前 X / 需达 Y 解锁"）与 L-3（成长等级 C 端可见性）。
   *
   * 严格脱敏口径（拍板点④）：
   * - 仅下发 level_key / level_name / 用户累计积分 / 等级阶梯（level_name）。
   * - 倍数 / 权重 / 风控字段绝不下发（商业机密）。
   *
   * 占位阈值保护（拍板点⑨）：
   * - 成长等级 4 档阈值当前为"占位值，需运营确认"（user_growth_levels.description 标注）。
   * - 在运营把占位阈值改成真实阈值前，min_history_points（门槛数字）一律下发 null，
   *   C 端只显示等级名、不显示"需达 Y 积分"，避免用占位数字误导用户。
   * - 由数据驱动：description 含"占位"标记 → 判定为未定稿 → 数字置 null。
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} { current_level_key, current_level_name, history_total_points, thresholds_confirmed, levels: [{level_key, level_name, min_history_points|null}] }
   */
  async getUserGrowthLevelView(user_id) {
    // 用户累计积分（单一数据源 users.history_total_points）
    const user = await this.User.findByPk(user_id, {
      attributes: ['user_id', 'history_total_points']
    })
    const historyTotalPoints = user ? Number(user.history_total_points) || 0 : 0

    // 全部启用等级（升序）
    const levels = await this.UserGrowthLevel.getActiveLevels()

    /*
     * 阈值定稿判定（数据驱动）：任一等级 description 含"占位"字样即视为未定稿。
     * 未定稿时门槛数字一律不下发（null），仅展示等级名。
     */
    const thresholdsConfirmed = !levels.some(
      l => l.description && String(l.description).includes('占位')
    )

    // 当前等级派生（取 min_history_points <= 累计积分 中阈值最大者）
    const currentLevelKey = await this.UserGrowthLevel.resolveLevelKey(historyTotalPoints)
    const currentLevel = levels.find(l => l.level_key === currentLevelKey) || null

    /*
     * "距下一级"体验字段（工程加固 §9-9，2026-07-10 确认必做）：
     * - 阈值定稿后门槛数字本就公开下发，差值不泄密（倍数/权重仍守脱敏红线）。
     * - 小程序会员页据此渲染"再消费 X 元升{下一级名}"（1 积分≈1 元消费）。
     * - 顶档（无更高启用等级）或阈值未定稿时返回 null。
     */
    let nextLevel = null
    if (thresholdsConfirmed && currentLevel) {
      const currentIndex = levels.findIndex(l => l.level_key === currentLevel.level_key)
      const higher = currentIndex >= 0 ? levels[currentIndex + 1] : null
      if (higher) {
        nextLevel = {
          level_key: higher.level_key,
          level_name: higher.level_name,
          points_needed: Math.max(0, Number(higher.min_history_points) - historyTotalPoints)
        }
      }
    }

    return {
      current_level_key: currentLevelKey,
      current_level_name: currentLevel ? currentLevel.level_name : null,
      history_total_points: historyTotalPoints,
      thresholds_confirmed: thresholdsConfirmed,
      // 下一级差值（顶档/未定稿为 null；小程序渲染"再消费 X 元升级"）
      next_level: nextLevel,
      levels: levels.map(l => ({
        level_key: l.level_key,
        level_name: l.level_name,
        // 占位阶段不下发门槛数字（拍板点⑨）
        min_history_points: thresholdsConfirmed ? l.min_history_points : null
      }))
    }
  }

  /**
   * 列出成长等级阶梯（默认仅启用）
   *
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.include_inactive=false] - 是否包含停用等级
   * @returns {Promise<Array<Object>>} 等级阶梯（升序）
   */
  async listLevels(options = {}) {
    const where = options.include_inactive ? {} : { status: 'active' }
    const levels = await this.UserGrowthLevel.findAll({
      where,
      order: [['sort_order', 'ASC']]
    })
    return levels.map(l => ({
      user_growth_level_id: l.user_growth_level_id,
      level_key: l.level_key,
      level_name: l.level_name,
      min_history_points: l.min_history_points,
      // 发放线倍数（拍板②：管理端等级管理页编辑，仅管理端可见，C 端视图绝不下发）
      earn_multiplier: Number(l.earn_multiplier) || 1.0,
      sort_order: l.sort_order,
      status: l.status,
      description: l.description
    }))
  }

  /**
   * 取某活动下某成长等级的中奖率倍数（B 线公示分级概率）
   *
   * 读取 lottery_strategy_config 中 config_group='level_probability'、
   * config_key='multiplier_{level_key}' 的活动级配置；无配置时返回默认倍数 1.0。
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} level_key - 成长等级码
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<number>} 中奖率倍数（>0，默认 1.0）
   */
  async getLevelMultiplier(lottery_campaign_id, level_key, options = {}) {
    if (!level_key) {
      return DEFAULT_MULTIPLIER
    }
    const config_key = `${LEVEL_MULTIPLIER_PREFIX}${level_key}`
    const row = await this.LotteryStrategyConfig.findOne({
      where: {
        config_group: 'level_probability',
        config_key,
        lottery_campaign_id,
        is_active: true
      },
      order: [['priority', 'DESC']],
      transaction: options.transaction
    })
    if (!row) {
      return DEFAULT_MULTIPLIER
    }
    const value = Number(row.getParsedValue())
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MULTIPLIER
  }

  /**
   * 组合查询：用户 → 成长等级 → 该活动下倍数（抽奖内核 TierPickStage 调用）
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} [options={}] - 查询选项（可含 transaction）
   * @returns {Promise<Object>} { level_key: string|null, multiplier: number } 等级码与倍数
   */
  async getUserLevelMultiplier(user_id, lottery_campaign_id, options = {}) {
    const level_key = await this.resolveUserLevel(user_id, options)
    const multiplier = await this.getLevelMultiplier(lottery_campaign_id, level_key, options)
    return { level_key, multiplier }
  }

  /**
   * 获取某活动的全部成长等级倍数配置（管理后台 B 线读）
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array<Object>>} [{level_key, level_name, multiplier}]（覆盖全部启用等级，无配置返回默认 1.0）
   */
  async getLevelProbabilityConfig(lottery_campaign_id) {
    const levels = await this.UserGrowthLevel.getActiveLevels()
    // 各等级倍数互相独立，并行查询（无顺序依赖）
    const result = await Promise.all(
      levels.map(async level => ({
        level_key: level.level_key,
        level_name: level.level_name,
        min_history_points: level.min_history_points,
        multiplier: await this.getLevelMultiplier(lottery_campaign_id, level.level_key)
      }))
    )
    return result
  }

  /**
   * 批量写入某活动的成长等级倍数配置（管理 API B 线写）
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Array<Object>} items - [{level_key, multiplier}]
   * @param {number} operated_by - 操作管理员ID
   * @param {Object} options - 选项（必须含 transaction，写操作事务由路由层管理）
   * @returns {Promise<Array<Object>>} 写入后的配置项
   */
  async upsertLevelProbabilityConfig(lottery_campaign_id, items, operated_by, options = {}) {
    if (!options.transaction) {
      throw new Error('upsertLevelProbabilityConfig 必须在事务内执行（options.transaction 缺失）')
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items 必须为非空数组')
    }

    // 校验 level_key 合法（必须是已启用的成长等级）
    const levels = await this.UserGrowthLevel.getActiveLevels({
      transaction: options.transaction
    })
    const validKeys = new Set(levels.map(l => l.level_key))

    const written = []
    for (const item of items) {
      const { level_key, multiplier } = item
      if (!validKeys.has(level_key)) {
        throw new Error(`非法成长等级码：${level_key}（不在启用等级列表中）`)
      }
      const numericMultiplier = Number(multiplier)
      if (!Number.isFinite(numericMultiplier) || numericMultiplier <= 0) {
        throw new Error(`等级 ${level_key} 的倍数必须为正数，收到：${multiplier}`)
      }

      const config_key = `${LEVEL_MULTIPLIER_PREFIX}${level_key}`
      // 同一事务内的顺序 upsert：写操作必须串行，禁止 Promise.all（避免事务内并发写冲突）
      // eslint-disable-next-line no-await-in-loop
      await this.LotteryStrategyConfig.upsertConfig(
        'level_probability',
        config_key,
        numericMultiplier,
        {
          description: `成长等级 ${level_key} 发放率倍数（B 线公示分级概率）`,
          updated_by: operated_by,
          lottery_campaign_id,
          transaction: options.transaction
        }
      )

      written.push({ level_key, multiplier: numericMultiplier })
    }

    logger.info('[UserGrowthLevelService] 成长等级倍数配置已更新', {
      lottery_campaign_id,
      operated_by,
      count: written.length
    })

    return written
  }

  /**
   * 更新成长等级定义（管理 API：运营自助调阈值/名称/状态）
   *
   * 校验：
   * - 等级必须存在
   * - min_history_points 不得为负
   * - 阈值不得与相邻等级倒挂（低 sort_order 的阈值必须 ≤ 高 sort_order 的阈值）
   *
   * @param {number} user_growth_level_id - 成长等级主键
   * @param {Object} updates - 可更新字段 {level_name, min_history_points, sort_order, status, description}
   * @param {number} operated_by - 操作管理员ID
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 更新后的等级
   */
  async updateGrowthLevel(user_growth_level_id, updates, operated_by, options = {}) {
    if (!options.transaction) {
      throw new Error('updateGrowthLevel 必须在事务内执行（options.transaction 缺失）')
    }

    const level = await this.UserGrowthLevel.findByPk(user_growth_level_id, {
      transaction: options.transaction
    })
    if (!level) {
      const err = new Error('成长等级不存在')
      err.statusCode = 404
      err.code = 'GROWTH_LEVEL_NOT_FOUND'
      throw err
    }

    const allowed = {}
    if (updates.level_name !== undefined) allowed.level_name = String(updates.level_name).trim()
    if (updates.sort_order !== undefined) allowed.sort_order = parseInt(updates.sort_order, 10)
    if (updates.earn_multiplier !== undefined) {
      /*
       * 发放倍数防呆上限（工程加固 §9-6）：写入口校验 1.00 ≤ earn_multiplier ≤ 3.00
       * （上限与拍板⑮-(d) 可用积分总倍数硬封顶 3.0 同值）——运营手滑填 15 在写入口就拦住，
       * 而不是靠发放侧封顶兜底。
       */
      const multiplier = Number(updates.earn_multiplier)
      if (!Number.isFinite(multiplier) || multiplier < 1.0 || multiplier > 3.0) {
        const err = new Error(
          `earn_multiplier 必须在 1.00~3.00 之间（收到：${updates.earn_multiplier}）`
        )
        err.statusCode = 400
        err.code = 'INVALID_EARN_MULTIPLIER'
        throw err
      }
      allowed.earn_multiplier = Math.round(multiplier * 100) / 100
    }
    if (updates.status !== undefined) {
      if (!['active', 'inactive'].includes(updates.status)) {
        const err = new Error('status 只能是 active 或 inactive')
        err.statusCode = 400
        err.code = 'INVALID_STATUS'
        throw err
      }
      allowed.status = updates.status
    }
    if (updates.description !== undefined) allowed.description = updates.description
    if (updates.min_history_points !== undefined) {
      const points = parseInt(updates.min_history_points, 10)
      if (!Number.isInteger(points) || points < 0) {
        const err = new Error('min_history_points 必须为非负整数')
        err.statusCode = 400
        err.code = 'INVALID_MIN_HISTORY_POINTS'
        throw err
      }
      allowed.min_history_points = points
    }

    // 阈值倒挂校验：以更新后的全量等级排序，确保 sort_order 升序时 min_history_points 不下降
    if (allowed.min_history_points !== undefined || allowed.sort_order !== undefined) {
      const all = await this.UserGrowthLevel.findAll({ transaction: options.transaction })
      const merged = all.map(l => {
        if (l.user_growth_level_id === level.user_growth_level_id) {
          return {
            sort_order: allowed.sort_order ?? l.sort_order,
            min_history_points: allowed.min_history_points ?? l.min_history_points,
            level_key: l.level_key
          }
        }
        return {
          sort_order: l.sort_order,
          min_history_points: l.min_history_points,
          level_key: l.level_key
        }
      })
      merged.sort((a, b) => a.sort_order - b.sort_order)
      for (let i = 1; i < merged.length; i++) {
        if (merged[i].min_history_points < merged[i - 1].min_history_points) {
          const err = new Error(
            `阈值倒挂：等级 ${merged[i].level_key}(排序${merged[i].sort_order}) 的阈值 ` +
              `${merged[i].min_history_points} 低于前一档 ${merged[i - 1].level_key} 的 ${merged[i - 1].min_history_points}`
          )
          err.statusCode = 400
          err.code = 'GROWTH_LEVEL_THRESHOLD_INVERSION'
          throw err
        }
      }
    }

    await level.update(allowed, { transaction: options.transaction })

    // 写时失效进程内缓存（§9-4）：管理端调档后新配置最迟 60s 内全进程生效
    this.UserGrowthLevel.invalidateActiveLevelsCache()

    logger.info('[UserGrowthLevelService] 成长等级定义已更新', {
      user_growth_level_id,
      operated_by,
      updated_fields: Object.keys(allowed)
    })

    return {
      user_growth_level_id: level.user_growth_level_id,
      level_key: level.level_key,
      level_name: level.level_name,
      min_history_points: level.min_history_points,
      earn_multiplier: Number(level.earn_multiplier) || 1.0,
      sort_order: level.sort_order,
      status: level.status,
      description: level.description
    }
  }
}

module.exports = UserGrowthLevelService
