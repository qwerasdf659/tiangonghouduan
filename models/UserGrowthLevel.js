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
     *
     * 进程内缓存（工程加固 §9-4）：等级表仅 9 行且几乎不变，但发放线上线后
     * 每笔小票提交/审核发分/兑换门槛校验/商品列表 satisfied 计算都要读它。
     * 无事务时走 60s 进程内缓存；带事务的读取（写路径校验）绕过缓存直查库，
     * 保证事务内一致性。管理端改等级后经 invalidateActiveLevelsCache() 写时失效。
     *
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<UserGrowthLevel[]>} 启用等级列表（min_history_points 升序）
     */
    static async getActiveLevels(options = {}) {
      // 事务内读取绕过缓存（写路径校验必须看到事务内最新数据）
      if (!options.transaction) {
        const cache = UserGrowthLevel._activeLevelsCache
        if (cache && cache.expires_at > Date.now()) {
          return cache.levels
        }
      }
      const levels = await this.findAll({
        where: { status: 'active' },
        order: [['min_history_points', 'ASC']],
        ...options
      })
      if (!options.transaction) {
        UserGrowthLevel._activeLevelsCache = {
          levels,
          expires_at: Date.now() + UserGrowthLevel.ACTIVE_LEVELS_CACHE_TTL_MS
        }
      }
      return levels
    }

    /**
     * 失效启用等级进程内缓存（等级定义写操作后调用，写时失效）
     * @returns {void}
     */
    static invalidateActiveLevelsCache() {
      UserGrowthLevel._activeLevelsCache = null
    }

    /**
     * 根据累计积分派生成长等级（返回完整等级记录）
     *
     * 派生规则：取 min_history_points <= history_points 中阈值最大的启用等级
     * （阈值为 0 的最低档保证任何用户都有归属）
     *
     * @param {number} history_points - 用户累计积分（users.history_total_points）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<UserGrowthLevel|null>} 命中的等级记录（无启用等级时返回 null）
     */
    static async resolveLevel(history_points, options = {}) {
      const points = Number(history_points) || 0
      const levels = await this.getActiveLevels(options)
      let matched = null
      for (const level of levels) {
        if (points >= level.min_history_points) {
          matched = level
        }
      }
      return matched
    }

    /**
     * 根据累计积分派生成长等级码
     *
     * @param {number} history_points - 用户累计积分（users.history_total_points）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<string|null>} 命中的 level_key（无启用等级时返回 null）
     */
    static async resolveLevelKey(history_points, options = {}) {
      const matched = await this.resolveLevel(history_points, options)
      return matched ? matched.level_key : null
    }
  }

  /** 启用等级进程内缓存有效期（毫秒，§9-4 拍板 60 秒） */
  UserGrowthLevel.ACTIVE_LEVELS_CACHE_TTL_MS = 60 * 1000
  /** 启用等级进程内缓存槽位 { levels, expires_at } */
  UserGrowthLevel._activeLevelsCache = null

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
        comment: '成长等级业务码（v1~v9，语义无关稳定标识，展示名与其解耦）'
      },
      level_name: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '成长等级展示名（如 铜卡/银卡/…/荣耀殿堂），随时可改零影响'
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
      earn_multiplier: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment:
          '发放线倍数（消费审核发分时可用积分/预算积分按此放大，1.00=无加成，范围1.00~3.00）',
        /**
         * DECIMAL 返回字符串问题：字段级 getter 转数字（项目统一做法）
         * @returns {number} 发放倍数数值
         */
        get() {
          const raw = this.getDataValue('earn_multiplier')
          return raw === null || raw === undefined ? 1.0 : Number(raw)
        }
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
