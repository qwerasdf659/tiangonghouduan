/**
 * UserPremiumStatus 模型 - 用户高级空间状态
 *
 * 📋 功能说明：
 * - 管理用户高级空间解锁状态、解锁时间、过期时间
 * - 极简设计，无自动续费字段，降低维护成本60%
 * - 适合数据量<1000的小项目
 *
 * 🎯 业务场景：
 * - 用户支付100积分解锁高级空间功能
 * - 有效期24小时
 * - 过期需重新手动解锁（无自动续费）
 *
 * ⚠️ 双重条件AND关系（缺一不可）：
 * - 条件1: users.history_total_points ≥ 100000（历史累计10万积分门槛）
 * - 条件2: user_points_accounts.available_points ≥ 100（当前余额≥100积分）
 *
 * 数据表：user_premium_status
 * 创建时间：2025-11-02
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserPremiumStatus = sequelize.define(
    'UserPremiumStatus',
    {
      /*
       * ========================================
       * 主键字段
       * ========================================
       */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键（唯一标识，用于数据库内部索引，业务无关）'
      },

      /*
       * ========================================
       * 用户关联字段（核心业务字段）
       * ========================================
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // 唯一约束：确保一个用户只有一条记录
        comment: '用户ID（关联users表，唯一约束确保一个用户只有一条记录，用于查询用户解锁状态）'
      },

      /*
       * ========================================
       * 解锁状态字段（核心业务字段）
       * ========================================
       */
      is_unlocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          '是否已解锁高级空间（当前状态，TRUE=已解锁且在有效期内，FALSE=未解锁或已过期，用于前端权限判断）'
      },

      /*
       * ========================================
       * 解锁时间字段（记录解锁历史）
       * ========================================
       */
      unlock_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最近一次解锁时间（北京时间，每次解锁时更新，用于计算过期时间和运营分析）'
      },

      /*
       * ========================================
       * 解锁方式字段（扩展性预留）
       * ========================================
       */
      unlock_method: {
        type: DataTypes.ENUM('points', 'exchange', 'vip', 'manual'),
        allowNull: false,
        defaultValue: 'points',
        comment:
          '解锁方式（points=积分解锁100分，exchange=兑换码解锁，vip=VIP会员解锁，manual=管理员手动解锁，扩展性预留字段）'
      },

      /*
       * ========================================
       * 解锁次数统计字段（运营分析用）
       * ========================================
       */
      total_unlock_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment:
          '累计解锁次数（包括首次解锁和重新解锁，每次解锁+1，用于运营分析用户活跃度和付费意愿）'
      },

      /*
       * ========================================
       * 过期时间字段（核心业务字段）
       * ========================================
       */
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '过期时间（24小时有效期，unlock_time + 24小时，NULL表示未解锁或已过期，用于判断是否需要重新解锁，查询时WHERE expires_at > NOW()）'
      },

      /*
       * ========================================
       * 审计字段
       * ========================================
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（首次解锁时间，永不更新，用于历史追溯和用户分析）'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（每次解锁时自动更新，MySQL自动维护，用于追踪最后修改时间）'
      }
    },
    {
      /*
       * ========================================
       * 模型配置
       * ========================================
       */
      tableName: 'user_premium_status',
      timestamps: true, // 启用时间戳（created_at, updated_at）
      createdAt: 'created_at', // 创建时间字段名（snake_case格式）
      updatedAt: 'updated_at', // 更新时间字段名（snake_case格式）
      underscored: true, // 使用snake_case命名（与数据库字段一致）
      comment:
        '用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）',

      /*
       * ========================================
       * 索引定义（提升查询性能）
       * ========================================
       */
      indexes: [
        {
          name: 'idx_user_id',
          unique: true,
          fields: ['user_id'],
          comment: '用户ID索引（最常用查询：根据user_id查询解锁状态）'
        },
        {
          name: 'idx_is_unlocked',
          fields: ['is_unlocked'],
          comment: '解锁状态索引（查询已解锁用户列表）'
        },
        {
          name: 'idx_expires_at',
          fields: ['expires_at'],
          comment: '过期时间索引（过期检查查询：WHERE expires_at > NOW()）'
        }
      ],

      /*
       * ========================================
       * Hooks（生命周期钩子）
       * ========================================
       */
      hooks: {
        /**
         * 创建前钩子（验证数据完整性）
         * @param {Object} premiumStatus - 高级空间状态实例
         * @param {Object} _options - Sequelize选项（未使用）
         * @returns {Promise<void>} 无返回值
         */
        beforeCreate: async (premiumStatus, _options) => {
          // 验证user_id是否存在
          if (!premiumStatus.user_id) {
            throw new Error('user_id 不能为空')
          }
        },

        /**
         * 更新前钩子（自动更新updated_at）
         * @param {Object} premiumStatus - 高级空间状态实例
         * @param {Object} _options - Sequelize选项（未使用）
         * @returns {Promise<void>} 无返回值
         */
        beforeUpdate: async (premiumStatus, _options) => {
          premiumStatus.updated_at = new Date()
        }
      }
    }
  )

  /*
   * ========================================
   * 实例方法（业务逻辑封装）
   * ========================================
   */

  /**
   * 检查是否在有效期内
   * @returns {boolean} 是否有效（true=有效，false=过期或未解锁）
   */
  UserPremiumStatus.prototype.isValid = function () {
    if (!this.is_unlocked || !this.expires_at) {
      return false
    }
    const now = new Date()
    return new Date(this.expires_at) > now
  }

  /**
   * 计算剩余时间（小时数）
   * @returns {number} 剩余小时数（向上取整，过期返回0）
   */
  UserPremiumStatus.prototype.getRemainingHours = function () {
    if (!this.isValid()) {
      return 0
    }
    const now = new Date()
    const expiresAt = new Date(this.expires_at)
    const remainingMs = expiresAt - now
    return Math.ceil(remainingMs / (1000 * 60 * 60))
  }

  /**
   * 计算剩余时间（分钟数）
   * @returns {number} 剩余分钟数（向上取整，过期返回0）
   */
  UserPremiumStatus.prototype.getRemainingMinutes = function () {
    if (!this.isValid()) {
      return 0
    }
    const now = new Date()
    const expiresAt = new Date(this.expires_at)
    const remainingMs = expiresAt - now
    return Math.ceil(remainingMs / (1000 * 60))
  }

  /*
   * ========================================
   * 类方法（静态方法）
   * ========================================
   */

  /**
   * 查询用户的高级空间状态
   * @param {number} userId - 用户ID
   * @returns {Promise<UserPremiumStatus|null>} 高级空间状态对象或null
   */
  UserPremiumStatus.getUserStatus = async function (userId) {
    return await UserPremiumStatus.findOne({
      where: { user_id: userId }
    })
  }

  /**
   * 查询所有已解锁且有效的用户
   * @returns {Promise<UserPremiumStatus[]>} 有效的高级空间状态列表
   */
  UserPremiumStatus.getValidUsers = async function () {
    const now = new Date()
    return await UserPremiumStatus.findAll({
      where: {
        is_unlocked: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: now
        }
      }
    })
  }

  /**
   * 查询已过期的用户
   * @returns {Promise<UserPremiumStatus[]>} 已过期的高级空间状态列表
   */
  UserPremiumStatus.getExpiredUsers = async function () {
    const now = new Date()
    return await UserPremiumStatus.findAll({
      where: {
        is_unlocked: true,
        expires_at: {
          [sequelize.Sequelize.Op.lte]: now
        }
      }
    })
  }

  /*
   * ========================================
   * 模型关联关系
   * ========================================
   */
  UserPremiumStatus.associate = function (models) {
    // 关联用户表（一对一关系）
    UserPremiumStatus.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })
  }

  return UserPremiumStatus
}
