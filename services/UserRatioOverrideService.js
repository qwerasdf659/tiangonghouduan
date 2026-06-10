'use strict'

/**
 * 用户比例覆盖服务（UserRatioOverrideService）
 *
 * @description 管理员为特定用户设置个性化消费比例的领域服务（CRUD）
 * @module services/UserRatioOverrideService
 * @date 2026-06-10（路由层合规重构：读写收口到 Service）
 *
 * 业务定位：
 * - 管理 user_ratio_overrides 表：为单个用户覆盖全局默认消费比例
 * - 三个可覆盖比例键：points_award_ratio / budget_allocation_ratio / star_stone_quota_ratio
 * - 运行时由 consumption/CoreService 读取生效覆盖值；本服务负责后台 CRUD
 *
 * 架构约束：
 * - 读操作收口本服务；写操作通过 options.transaction 由路由层 TransactionManager 管理
 * - 孤儿数据删除采用硬删除（与原路由一致）
 */

const BusinessError = require('../utils/BusinessError')

/** 合法的比例键 */
const VALID_RATIO_KEYS = ['points_award_ratio', 'budget_allocation_ratio', 'star_stone_quota_ratio']

/** 比例值合法区间 */
const RATIO_MIN = 0.1
const RATIO_MAX = 5.0

/**
 * 用户比例覆盖服务类
 * @class UserRatioOverrideService
 */
class UserRatioOverrideService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.UserRatioOverride = models.UserRatioOverride
    this.User = models.User
  }

  /** 合法比例键常量（供路由做参数校验复用） */
  static get VALID_RATIO_KEYS() {
    return VALID_RATIO_KEYS
  }

  /**
   * 列表查询（支持 user_id / ratio_key 过滤，分页）
   *
   * @param {Object} [filters={}] - 过滤条件 { user_id, ratio_key, page, page_size }
   * @returns {Promise<Object>} { items, total, page, page_size }
   */
  async list(filters = {}) {
    const { user_id, ratio_key, page = 1, page_size = 20 } = filters
    const where = {}
    if (user_id) where.user_id = user_id
    if (ratio_key && VALID_RATIO_KEYS.includes(ratio_key)) where.ratio_key = ratio_key

    const limit = Math.min(100, Math.max(1, parseInt(page_size, 10) || 20))
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit

    const { count, rows } = await this.UserRatioOverride.findAndCountAll({
      where,
      include: [
        { model: this.User, as: 'target_user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: this.User, as: 'creator', attributes: ['user_id', 'nickname'] }
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    return {
      items: rows,
      total: count,
      page: Math.max(1, parseInt(page, 10) || 1),
      page_size: limit
    }
  }

  /**
   * 查询某用户的所有覆盖
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>} 覆盖记录列表
   */
  async listByUser(user_id) {
    return this.UserRatioOverride.findAll({
      where: { user_id },
      order: [['ratio_key', 'ASC']]
    })
  }

  /**
   * 查询单条覆盖记录
   *
   * @param {number} id - 覆盖记录主键
   * @returns {Promise<Object|null>} 覆盖记录或 null
   */
  async getById(id) {
    return this.UserRatioOverride.findByPk(id, {
      include: [
        { model: this.User, as: 'target_user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: this.User, as: 'creator', attributes: ['user_id', 'nickname'] }
      ]
    })
  }

  /**
   * 校验比例值合法性（0.1 ~ 5.0）
   * @param {*} ratio_value - 比例值
   * @returns {number} 解析后的数值
   * @private
   */
  _assertRatioValue(ratio_value) {
    const parsed = parseFloat(ratio_value)
    if (isNaN(parsed) || parsed < RATIO_MIN || parsed > RATIO_MAX) {
      throw new BusinessError(
        `ratio_value 必须在 ${RATIO_MIN} ~ ${RATIO_MAX} 之间`,
        'INVALID_RATIO_VALUE',
        400
      )
    }
    return parsed
  }

  /**
   * 新增覆盖
   *
   * @param {Object} data - 覆盖数据 { user_id, ratio_key, ratio_value, reason, effective_start, effective_end }
   * @param {number} operator_id - 操作管理员ID
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 创建的覆盖记录
   */
  async create(data, operator_id, options = {}) {
    const { transaction } = options
    const { user_id, ratio_key, ratio_value, reason, effective_start, effective_end } = data

    if (!VALID_RATIO_KEYS.includes(ratio_key)) {
      throw new BusinessError(
        `无效的 ratio_key，允许值：${VALID_RATIO_KEYS.join(', ')}`,
        'INVALID_RATIO_KEY',
        400
      )
    }
    const parsedValue = this._assertRatioValue(ratio_value)

    const user = await this.User.findByPk(user_id, { transaction })
    if (!user) {
      throw new BusinessError(`用户不存在：user_id=${user_id}`, 'USER_NOT_FOUND', 404)
    }

    return this.UserRatioOverride.create(
      {
        user_id,
        ratio_key,
        ratio_value: parsedValue,
        reason: reason || null,
        effective_start: effective_start || null,
        effective_end: effective_end || null,
        created_by: operator_id
      },
      { transaction }
    )
  }

  /**
   * 修改覆盖
   *
   * @param {number} id - 覆盖记录主键
   * @param {Object} updates - 可更新字段 { ratio_value, reason, effective_start, effective_end }
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 更新后的覆盖记录
   */
  async update(id, updates, options = {}) {
    const { transaction } = options
    const override = await this.UserRatioOverride.findByPk(id, { transaction })
    if (!override) {
      throw new BusinessError('覆盖记录不存在', 'NOT_FOUND', 404)
    }

    const updateData = {}
    if (updates.ratio_value !== undefined && updates.ratio_value !== null) {
      updateData.ratio_value = this._assertRatioValue(updates.ratio_value)
    }
    if (updates.reason !== undefined) updateData.reason = updates.reason
    if (updates.effective_start !== undefined) {
      updateData.effective_start = updates.effective_start || null
    }
    if (updates.effective_end !== undefined) {
      updateData.effective_end = updates.effective_end || null
    }

    await override.update(updateData, { transaction })
    return override
  }

  /**
   * 删除覆盖（硬删除，恢复为全局默认值）
   *
   * @param {number} id - 覆盖记录主键
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} 被删除记录的关键信息
   */
  async delete(id, options = {}) {
    const { transaction } = options
    const override = await this.UserRatioOverride.findByPk(id, { transaction })
    if (!override) {
      throw new BusinessError('覆盖记录不存在', 'NOT_FOUND', 404)
    }

    const info = {
      user_ratio_override_id: override.user_ratio_override_id,
      user_id: override.user_id,
      ratio_key: override.ratio_key,
      ratio_value: override.ratio_value
    }

    await override.destroy({ transaction })
    return info
  }
}

module.exports = UserRatioOverrideService
