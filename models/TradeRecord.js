/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 交易记录模型
 * 记录用户间的积分交易和相关交易活动
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const TradeRecord = sequelize.define(
    'TradeRecord',
    {
      // 基础信息
      trade_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },
      trade_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '交易记录业务ID（如tr_1722249322）'
      },
      trade_type: {
        type: DataTypes.ENUM(
          'point_transfer',
          'exchange_refund',
          'prize_claim',
          'admin_adjustment',
          'system_reward'
        ),
        allowNull: false,
        comment: '交易类型'
      },

      // 交易参与方
      from_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '发送方用户ID（系统操作时为null）'
      },
      to_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '接收方用户ID'
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作员ID（管理员操作时使用）'
      },

      // 交易金额和积分
      points_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '交易积分数量'
      },
      fee_points_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '交易手续积分数量'
      },
      net_points_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '实际到账积分数量（扣除手续积分后）'
      },

      // 交易状态
      status: {
        type: DataTypes.ENUM(
          'pending',
          'processing',
          'completed',
          'failed',
          'cancelled',
          'refunded'
        ),
        allowNull: false,
        defaultValue: 'pending',
        comment: '交易状态'
      },

      // 关联信息
      related_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '关联记录ID（如兑换记录ID、抽奖记录ID）'
      },
      related_type: {
        type: DataTypes.ENUM('exchange', 'lottery', 'review', 'refund', 'system'),
        allowNull: true,
        comment: '关联记录类型'
      },

      // 交易详情
      trade_reason: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '交易原因或描述'
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '交易备注'
      },

      // 安全信息
      trade_password_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: '交易密码哈希（用户设置时）'
      },
      security_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '安全验证码'
      },
      // 🗑️ risk_level 字段已删除 - 2025年01月21日

      // 交易环境信息
      client_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '客户端IP地址'
      },
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '设备信息JSON'
      },

      // 时间信息
      trade_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '交易发起时间'
      },
      processed_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '交易处理完成时间'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '交易过期时间'
      },

      // 版本控制
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '记录版本（乐观锁）'
      }
    },
    {
      tableName: 'trade_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['trade_id'],
          unique: true
        },
        {
          fields: ['from_user_id', 'created_at']
        },
        {
          fields: ['to_user_id', 'created_at']
        },
        {
          fields: ['trade_type', 'status']
        },
        {
          fields: ['related_id', 'related_type']
        },
        {
          fields: ['trade_time']
        }
      ]
    }
  )

  // 实例方法
  TradeRecord.prototype.isCompleted = function () {
    return this.status === 'completed'
  }

  TradeRecord.prototype.isPending = function () {
    return this.status === 'pending'
  }

  TradeRecord.prototype.canCancel = function () {
    return ['pending', 'processing'].includes(this.status)
  }

  // 类方法
  TradeRecord.generateTradeId = function () {
    const timestamp = Math.floor(BeijingTimeHelper.timestamp() / 1000)
    const random = Math.random().toString(36).substring(2, 8)
    return `tr_${timestamp}_${random}`
  }

  TradeRecord.calculateFee = function (amount, tradeType) {
    // 不同交易类型的手续费率
    const feeRates = {
      point_transfer: 0.02, // 积分转账2%手续费
      exchange_refund: 0, // 兑换退款无手续费
      prize_claim: 0, // 奖品认领无手续费
      admin_adjustment: 0, // 管理员调整无手续费
      system_reward: 0 // 系统奖励无手续费
    }

    const rate = feeRates[tradeType] || 0
    return Math.floor(amount * rate)
  }

  TradeRecord.getTradesByUser = async function (user_id, options = {}) {
    const {
      type = 'all',
      status = 'all',
      _page = 1,
      _pageSize = 20,
      _startDate = null,
      _endDate = null
    } = options

    const whereClause = {
      [sequelize.Sequelize.Op.or]: [{ from_user_id: user_id }, { to_user_id: user_id }]
    }

    if (type !== 'all') {
      whereClause.trade_type = type
    }

    if (status !== 'all') {
      whereClause.status = status
    }

    if (_startDate && _endDate) {
      whereClause.trade_time = {
        [sequelize.Sequelize.Op.between]: [_startDate, _endDate]
      }
    }

    const offset = (_page - 1) * _pageSize

    return await TradeRecord.findAndCountAll({
      where: whereClause,
      limit: _pageSize,
      offset,
      order: [['trade_time', 'DESC']],
      include: [
        {
          model: sequelize.models.User,
          as: 'fromUser',
          attributes: ['id', 'nickname', 'phone']
        },
        {
          model: sequelize.models.User,
          as: 'toUser',
          attributes: ['id', 'nickname', 'phone']
        }
      ]
    })
  }

  /*
   * ========== Sequelize Scope 定义 ==========
   * 基于实际业务需求，避免过度设计
   */

  /**
   * Scope: successful
   * 业务含义：查询成功的交易记录
   * 等价SQL: WHERE status = 'completed'
   * 性能：使用status索引，高性能查询
   *
   * 使用示例：
   * await TradeRecord.scope('successful').findAll()
   */
  TradeRecord.addScope('successful', {
    where: { status: 'completed' }
  })

  /**
   * Scope: byUser
   * 业务含义：查询指定用户的交易记录（发送方或接收方）
   *
   * 使用示例：
   * await TradeRecord.scope({ method: ['byUser', user_id] }).findAll()
   * await TradeRecord.scope('successful', { method: ['byUser', user_id] }).findAll()
   */
  TradeRecord.addScope('byUser', user_id => ({
    where: {
      [sequelize.Sequelize.Op.or]: [{ from_user_id: user_id }, { to_user_id: user_id }]
    }
  }))

  /**
   * Scope: byType
   * 业务含义：按交易类型查询
   *
   * 使用示例：
   * await TradeRecord.scope({ method: ['byType', 'point_transfer'] }).findAll()
   */
  TradeRecord.addScope('byType', tradeType => ({
    where: { trade_type: tradeType }
  }))

  /**
   * 定义模型关联关系
   * 业务含义：建立TradeRecord与User模型的关联，支持查询交易参与方信息
   * @param {Object} models - Sequelize模型集合对象
   * @returns {void}
   */
  TradeRecord.associate = function (models) {
    // 发送方用户（可为空，系统操作时无发送方）
    TradeRecord.belongsTo(models.User, {
      foreignKey: 'from_user_id',
      as: 'fromUser',
      constraints: false // 允许NULL值
    })

    // 接收方用户
    TradeRecord.belongsTo(models.User, {
      foreignKey: 'to_user_id',
      as: 'toUser'
    })

    // 操作员（管理员操作时）
    TradeRecord.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      constraints: false // 允许NULL值
    })
  }

  return TradeRecord
}
