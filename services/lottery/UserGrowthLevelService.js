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
    const result = []
    for (const level of levels) {
      const multiplier = await this.getLevelMultiplier(lottery_campaign_id, level.level_key)
      result.push({
        level_key: level.level_key,
        level_name: level.level_name,
        min_history_points: level.min_history_points,
        multiplier
      })
    }
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
      sort_order: level.sort_order,
      status: level.status,
      description: level.description
    }
  }
}

module.exports = UserGrowthLevelService
