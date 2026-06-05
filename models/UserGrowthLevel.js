'use strict'

/**
 * UserGrowthLevel 模型 - 用户成长等级定义表
 *
 * 业务定位（2026-06-04 合规改造 P1=乙）：
 * - 独立的成长等级体系，区别于 users.user_level enum('normal','vip','merchant')（身份类型）
 * - 成长等级由用户累计积分（users.history_total_points）实时派生（单一数据源，无 per-user 同步债）
 * - 配置实体：低频变更、语义稳定、数量有限 → 业务码 level_key 作为稳定标识
 * - 抽奖等多功能只读复用：抽奖通过 level_key 在 lottery_strategy_config.level_probability 取倍数
 *
 * 数据库表：user_growth_levels（主键 user_growth_level_id，业务码 level_key 唯一）
 *
 * @module models/UserGrowthLevel
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 用户成长等级定义模型类
   * @class UserGrowthLevel
   * @extends Model
   */
  class UserGrowthLevel extends Model {
    /**
     * 获取全部启用的成长等级（按阈值升序）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<UserGrowthLevel[]>} 启用等级列表（min_history_points 升序）
     */
    static async getActiveLevels(options = {}) {
      return this.findAll({
        where: { status: 'active' },
        order: [['min_history_points', 'ASC']],
        ...options
      })
    }

    /**
     * 根据累计积分派生成长等级码
     *
     * 派生规则：取 min_history_points <= history_points 中阈值最大的启用等级
     * （阈值为 0 的最低档保证任何用户都有归属）
     *
     * @param {number} history_points - 用户累计积分（users.history_total_points）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<string|null>} 命中的 level_key（无启用等级时返回 null）
     */
    static async resolveLevelKey(history_points, options = {}) {
      const points = Number(history_points) || 0
      const levels = await this.getActiveLevels(options)
      let matched = null
      for (const level of levels) {
        if (points >= level.min_history_points) {
          matched = level
        }
      }
      return matched ? matched.level_key : null
    }
  }

  UserGrowthLevel.init(
    {
      user_growth_level_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '成长等级定义主键'
      },
      level_key: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '成长等级业务码（如 bronze/silver/gold/diamond），全局稳定标识'
      },
      level_name: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '成长等级中文名（如 青铜/白银/黄金/钻石），用于展示'
      },
      min_history_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '达到该等级所需的累计积分下限（比对 users.history_total_points，含本值）'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '等级排序（由低到高，0 最低）'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '等级状态：active-启用，inactive-停用'
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '等级说明（含会员权益公示口径）'
      }
    },
    {
      sequelize,
      modelName: 'UserGrowthLevel',
      tableName: 'user_growth_levels',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户成长等级定义表（独立体系，累计积分→等级；抽奖等多功能只读复用）'
    }
  )

  return UserGrowthLevel
}
