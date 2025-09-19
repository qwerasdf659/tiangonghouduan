/**
 * 奖品分发记录模型
 * 管理用户获得奖品后的分发状态和分发记录
 * 支持积分、商品、优惠券等多种奖品类型的统一分发管理
 * 创建时间：2025年01月21日
 */

const BeijingTimeHelper = require('../utils/timeHelper') // 🕐 北京时间处理

module.exports = (sequelize, DataTypes) => {
  const PrizeDistribution = sequelize.define(
    'PrizeDistribution',
    {
      // 主键：分发记录ID
      distribution_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        defaultValue: () => `dist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        comment: '奖品分发记录唯一标识'
      },

      // 关联字段：抽奖记录ID
      draw_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        references: {
          model: 'lottery_records',
          key: 'draw_id'
        },
        comment: '关联的抽奖记录ID'
      },

      // 关联字段：用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '获得奖品的用户ID'
      },

      // 关联字段：奖品ID
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        },
        comment: '分发的奖品ID'
      },

      // 奖品信息快照（避免奖品信息变更影响历史记录）
      prize_snapshot: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '奖品信息快照（JSON格式）',
        get () {
          const value = this.getDataValue('prize_snapshot')
          return value ? JSON.parse(value) : null
        },
        set (value) {
          this.setDataValue('prize_snapshot', JSON.stringify(value))
        }
      },

      // 分发类型
      distribution_type: {
        type: DataTypes.ENUM('auto', 'manual', 'batch'),
        allowNull: false,
        defaultValue: 'auto',
        comment: '分发类型：auto-自动分发，manual-手动分发，batch-批量分发'
      },

      // 分发状态
      distribution_status: {
        type: DataTypes.ENUM('pending', 'processing', 'distributed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment:
          '分发状态：pending-待分发，processing-分发中，distributed-已分发，failed-失败，cancelled-已取消'
      },

      // 奖品类型（冗余字段，便于查询）
      prize_type: {
        type: DataTypes.ENUM('points', 'product', 'coupon', 'vip_days', 'experience', 'custom'),
        allowNull: false,
        comment:
          '奖品类型：points-积分，product-商品，coupon-优惠券，vip_days-VIP天数，experience-经验值，custom-自定义'
      },

      // 奖品价值（便于统计）
      prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '奖品价值（数值形式）'
      },

      // 分发数量
      distribution_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '分发数量'
      },

      // 分发开始时间
      distribution_started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '分发开始时间',
        get () {
          const value = this.getDataValue('distribution_started_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null // 🕐 北京时间格式化
        }
      },

      // 分发完成时间
      distribution_completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '分发完成时间',
        get () {
          const value = this.getDataValue('distribution_completed_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null // 🕐 北京时间格式化
        }
      },

      // 分发结果详情
      distribution_result: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '分发结果详情（JSON格式）',
        get () {
          const value = this.getDataValue('distribution_result')
          return value ? JSON.parse(value) : null
        },
        set (value) {
          this.setDataValue('distribution_result', JSON.stringify(value))
        }
      },

      // 分发失败原因
      failure_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '分发失败原因'
      },

      // 重试次数
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '重试次数'
      },

      // 最大重试次数
      max_retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: '最大重试次数'
      },

      // 分发渠道
      distribution_channel: {
        type: DataTypes.ENUM('system', 'admin', 'api', 'batch'),
        allowNull: false,
        defaultValue: 'system',
        comment: '分发渠道：system-系统自动，admin-管理员，api-API调用，batch-批量处理'
      },

      // 管理员ID（手动分发时记录）
      admin_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'admin_users',
          key: 'id'
        },
        comment: '执行分发的管理员ID（仅手动分发）'
      },

      // 分发备注
      distribution_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '分发备注信息'
      },

      // 外部订单号（用于商品分发等需要对接外部系统的场景）
      external_order_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '外部订单号（对接外部系统时使用）'
      },

      // 追踪信息（物流追踪等）
      tracking_info: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '追踪信息（JSON格式）',
        get () {
          const value = this.getDataValue('tracking_info')
          return value ? JSON.parse(value) : null
        },
        set (value) {
          this.setDataValue('tracking_info', JSON.stringify(value))
        }
      },

      // 用户确认状态（用于需要用户确认的奖品）
      user_confirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '用户是否已确认收到奖品'
      },

      // 用户确认时间
      user_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '用户确认时间',
        get () {
          const value = this.getDataValue('user_confirmed_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null // 🕐 北京时间格式化
        }
      },

      // 过期时间（对于有时效性的奖品）
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '奖品过期时间',
        get () {
          const value = this.getDataValue('expires_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null // 🕐 北京时间格式化
        }
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
        get () {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at')) // 🕐 北京时间格式化
        }
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间',
        get () {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at')) // 🕐 北京时间格式化
        }
      }
    },
    {
      tableName: 'prize_distributions', // 表名
      timestamps: true, // 自动管理created_at和updated_at
      underscored: true, // 使用snake_case命名，匹配数据库字段
      paranoid: false, // 不启用软删除
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '奖品分发记录表 - 管理奖品分发状态和历史',

      // 添加索引以优化查询性能
      indexes: [
        {
          name: 'idx_prize_dist_user_id',
          fields: ['user_id'],
          comment: '用户ID索引'
        },
        {
          name: 'idx_prize_dist_draw_id',
          fields: ['draw_id'],
          comment: '抽奖记录ID索引'
        },
        {
          name: 'idx_prize_dist_status',
          fields: ['distribution_status'],
          comment: '分发状态索引'
        },
        {
          name: 'idx_prize_dist_type',
          fields: ['prize_type'],
          comment: '奖品类型索引'
        },
        {
          name: 'idx_prize_dist_created',
          fields: ['created_at'],
          comment: '创建时间索引'
        },
        {
          name: 'idx_prize_dist_user_status',
          fields: ['user_id', 'distribution_status'],
          comment: '用户-状态复合索引'
        },
        {
          name: 'idx_prize_dist_expires',
          fields: ['expires_at'],
          comment: '过期时间索引'
        }
      ]
    }
  )

  // 定义关联关系
  PrizeDistribution.associate = function (models) {
    // 分发记录属于一个抽奖记录
    PrizeDistribution.belongsTo(models.LotteryRecord, {
      foreignKey: 'draw_id',
      targetKey: 'draw_id',
      as: 'lotteryRecord',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })

    // 分发记录属于一个用户
    PrizeDistribution.belongsTo(models.User, {
      foreignKey: 'user_id',
      targetKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })

    // 分发记录属于一个奖品
    PrizeDistribution.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      targetKey: 'prize_id',
      as: 'prize',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })

    // 分发记录可能由管理员执行
    PrizeDistribution.belongsTo(models.AdminUser, {
      foreignKey: 'admin_id',
      targetKey: 'id',
      as: 'admin',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    })
  }

  // 实例方法：检查是否过期
  PrizeDistribution.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return new Date() > new Date(this.expires_at)
  }

  // 实例方法：检查是否可以重试
  PrizeDistribution.prototype.canRetry = function () {
    return this.distribution_status === 'failed' && this.retry_count < this.max_retry_count
  }

  // 实例方法：获取分发进度
  PrizeDistribution.prototype.getProgress = function () {
    const statusProgress = {
      pending: 0,
      processing: 50,
      completed: 100,
      failed: 0,
      cancelled: 0
    }
    return statusProgress[this.distribution_status] || 0
  }

  // 静态方法：获取分发统计
  PrizeDistribution.getStatistics = async function (options = {}) {
    const { user_id, start_date, end_date, prize_type } = options

    const whereClause = {}
    if (user_id) whereClause.user_id = user_id
    if (prize_type) whereClause.prize_type = prize_type
    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) whereClause.created_at[sequelize.Op.gte] = start_date
      if (end_date) whereClause.created_at[sequelize.Op.lte] = end_date
    }

    const stats = await PrizeDistribution.findAll({
      where: whereClause,
      attributes: [
        'distribution_status',
        'prize_type',
        [sequelize.fn('COUNT', sequelize.col('distribution_id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('prize_value')), 'total_value']
      ],
      group: ['distribution_status', 'prize_type'],
      raw: true
    })

    return stats
  }

  return PrizeDistribution
}
