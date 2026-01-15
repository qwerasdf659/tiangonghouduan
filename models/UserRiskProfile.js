/**
 * 用户风控配置模型（UserRiskProfile）
 *
 * 职责：
 * - 存储用户等级默认风控配置（config_type = 'level'）
 * - 存储用户个人自定义风控配置（config_type = 'user'）
 * - 管理用户账户冻结状态
 *
 * 业务决策（2026-01-14 多币种扩展）：
 * - 每用户+每币种独立风控阈值（日限次、日限额）
 * - 用户等级（normal/vip/merchant）决定默认阈值
 * - 支持单用户自定义覆盖
 * - fail-closed 策略：Redis 不可用时拒绝所有风控操作
 *
 * JSON thresholds 结构示例：
 * {
 *   "DIAMOND": {
 *     "daily_max_listings": 20,
 *     "daily_max_trades": 10,
 *     "daily_max_amount": 100000
 *   },
 *   "red_shard": {
 *     "daily_max_listings": 20,
 *     "daily_max_trades": 10,
 *     "daily_max_amount": 50000
 *   }
 * }
 *
 * @module models/UserRiskProfile
 * @version 1.0.0
 * @date 2026-01-14
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserRiskProfile = sequelize.define(
    'UserRiskProfile',
    {
      // 主键
      risk_profile_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '风控配置主键ID'
      },

      /*
       * 外键：关联用户（可为 NULL，表示等级默认配置）
       * 注意：users.user_id 是 INT（非 UNSIGNED）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: '用户ID（NULL 表示等级默认配置）'
      },

      // 用户等级
      user_level: {
        type: DataTypes.ENUM('normal', 'vip', 'merchant'),
        allowNull: false,
        defaultValue: 'normal',
        comment: '用户等级（normal/vip/merchant）'
      },

      // 配置类型
      config_type: {
        type: DataTypes.ENUM('user', 'level'),
        allowNull: false,
        defaultValue: 'level',
        comment: '配置类型（user-用户个人配置，level-等级默认配置）'
      },

      // JSON 格式的风控阈值配置
      thresholds: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'JSON格式的风控阈值配置（按币种分组）'
      },

      // 账户冻结状态
      is_frozen: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '账户是否冻结（true-冻结，禁止所有交易）'
      },

      // 冻结原因
      frozen_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '冻结原因（is_frozen=true 时必填）'
      },

      // 冻结时间
      frozen_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '冻结时间'
      },

      /*
       * 冻结操作人
       * 注意：users.user_id 是 INT（非 UNSIGNED）
       */
      frozen_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '冻结操作人ID（管理员）'
      },

      // 备注
      remarks: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置备注'
      }
    },
    {
      tableName: 'user_risk_profiles',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['user_id'],
          name: 'idx_user_risk_profiles_user_id'
        },
        {
          fields: ['user_level', 'config_type'],
          name: 'idx_user_risk_profiles_level_type'
        },
        {
          fields: ['is_frozen'],
          name: 'idx_user_risk_profiles_is_frozen'
        }
      ],
      comment: '用户风控配置表：存储用户等级默认配置和个人自定义配置'
    }
  )

  // 定义关联关系
  UserRiskProfile.associate = function (models) {
    // 关联用户（风控配置所属用户）
    UserRiskProfile.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '风控配置所属用户'
    })

    // 关联冻结操作人（管理员）
    UserRiskProfile.belongsTo(models.User, {
      foreignKey: 'frozen_by',
      as: 'frozenByAdmin',
      comment: '执行冻结操作的管理员'
    })
  }

  // ===== 类方法 =====

  /**
   * 获取用户有效的风控配置
   *
   * 优先级链：用户个人配置 > 用户等级配置 > 默认 normal 等级配置
   *
   * @param {number} userId - 用户ID
   * @param {string} [userLevel='normal'] - 用户等级
   * @returns {Promise<Object>} 风控配置 {thresholds, is_frozen, config_source}
   */
  UserRiskProfile.getEffectiveConfig = async function (userId, userLevel = 'normal') {
    // 1. 优先查找用户个人配置
    const userConfig = await this.findOne({
      where: {
        user_id: userId,
        config_type: 'user'
      }
    })

    if (userConfig) {
      return {
        thresholds: userConfig.thresholds || {},
        is_frozen: userConfig.is_frozen,
        frozen_reason: userConfig.frozen_reason,
        config_source: 'user',
        config_id: userConfig.risk_profile_id
      }
    }

    // 2. 查找用户等级默认配置
    const levelConfig = await this.findOne({
      where: {
        user_level: userLevel,
        config_type: 'level'
      }
    })

    if (levelConfig) {
      return {
        thresholds: levelConfig.thresholds || {},
        is_frozen: false, // 等级配置不涉及冻结状态
        frozen_reason: null,
        config_source: 'level',
        config_id: levelConfig.risk_profile_id
      }
    }

    // 3. 兜底：使用 normal 等级配置
    const defaultConfig = await this.findOne({
      where: {
        user_level: 'normal',
        config_type: 'level'
      }
    })

    if (defaultConfig) {
      return {
        thresholds: defaultConfig.thresholds || {},
        is_frozen: false,
        frozen_reason: null,
        config_source: 'level_default',
        config_id: defaultConfig.risk_profile_id
      }
    }

    // 4. 最终兜底：返回空配置
    return {
      thresholds: {},
      is_frozen: false,
      frozen_reason: null,
      config_source: 'fallback',
      config_id: null
    }
  }

  /**
   * 获取指定币种的风控阈值
   *
   * @param {number} userId - 用户ID
   * @param {string} userLevel - 用户等级
   * @param {string} assetCode - 币种代码
   * @returns {Promise<Object>} 币种阈值 {daily_max_listings, daily_max_trades, daily_max_amount}
   */
  UserRiskProfile.getAssetThresholds = async function (userId, userLevel, assetCode) {
    const config = await this.getEffectiveConfig(userId, userLevel)
    const assetThresholds = config.thresholds[assetCode] || {}

    // 返回默认值（如果配置中没有指定）
    return {
      daily_max_listings: assetThresholds.daily_max_listings || 20,
      daily_max_trades: assetThresholds.daily_max_trades || 10,
      daily_max_amount: assetThresholds.daily_max_amount || 100000,
      source: config.config_source
    }
  }

  /**
   * 检查用户是否被冻结
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 冻结状态对象
   */
  UserRiskProfile.checkFrozenStatus = async function (userId) {
    const userConfig = await this.findOne({
      where: {
        user_id: userId,
        config_type: 'user'
      }
    })

    if (userConfig && userConfig.is_frozen) {
      return {
        is_frozen: true,
        reason: userConfig.frozen_reason
      }
    }

    return {
      is_frozen: false,
      reason: null
    }
  }

  return UserRiskProfile
}
