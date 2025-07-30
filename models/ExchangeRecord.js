/**
 * 餐厅积分抽奖系统 v2.0 - 兑换记录模型
 * 记录用户商品兑换的完整信息
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeRecord = sequelize.define(
    'ExchangeRecord',
    {
      // 基础信息
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换记录唯一ID'
      },
      exchange_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '兑换记录业务ID（如ex_1722249322）'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
      },

      // 商品快照信息
      product_snapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '商品信息快照JSON'
      },

      // 兑换详情
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '兑换数量'
      },
      total_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '总消耗积分'
      },
      exchange_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '兑换码（用户凭证）'
      },

      // 状态和空间信息
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'used', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed',
        comment: '兑换状态'
      },
      space: {
        type: DataTypes.ENUM('lucky', 'premium'),
        allowNull: false,
        comment: '兑换空间'
      },

      // 时间信息
      exchange_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '兑换时间'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '兑换码过期时间'
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '使用时间'
      },

      // 客户端信息
      client_info: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '客户端信息'
      },

      // 使用说明
      usage_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '使用说明JSON（有效期、使用方法、联系方式、门店位置等）'
      },

      // 备注信息
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注信息'
      }
    },
    {
      tableName: 'exchange_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          name: 'idx_exchange_records_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_exchange_records_product_id',
          fields: ['product_id']
        },
        {
          name: 'idx_exchange_records_exchange_code',
          fields: ['exchange_code'],
          unique: true
        },
        {
          name: 'idx_exchange_records_status',
          fields: ['status']
        },
        {
          name: 'idx_exchange_records_space',
          fields: ['space']
        },
        {
          name: 'idx_exchange_records_exchange_time',
          fields: ['exchange_time']
        }
      ],
      comment: '兑换记录表 - 记录用户商品兑换信息'
    }
  )

  // 实例方法
  ExchangeRecord.prototype.isExpired = function () {
    if (!this.expires_at) {
      return false
    }
    return new Date() > this.expires_at
  }

  ExchangeRecord.prototype.canUse = function () {
    return this.status === 'completed' && !this.isExpired()
  }

  ExchangeRecord.prototype.markAsUsed = function () {
    this.status = 'used'
    this.used_at = new Date()
    return this.save()
  }

  // 类方法
  ExchangeRecord.generateExchangeId = function () {
    const timestamp = Math.floor(Date.now() / 1000)
    const random = Math.random().toString(36).substr(2, 6)
    return `ex_${timestamp}_${random}`
  }

  ExchangeRecord.generateExchangeCode = function () {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const random = Math.random().toString().substr(2, 6)
    return `EX${timestamp}${random}`
  }

  ExchangeRecord.getExchangesByUser = async function (userId, options = {}) {
    const { limit = 20, offset = 0, status = null, space = null, includeExpired = false } = options

    const whereClause = {
      user_id: userId
    }

    if (status) {
      whereClause.status = status
    }

    if (space) {
      whereClause.space = space
    }

    if (!includeExpired) {
      whereClause[sequelize.Sequelize.Op.or] = [
        { expires_at: null },
        { expires_at: { [sequelize.Sequelize.Op.gt]: new Date() } }
      ]
    }

    return await ExchangeRecord.findAll({
      where: whereClause,
      order: [['exchange_time', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.Product,
          as: 'product',
          attributes: ['name', 'image', 'category']
        }
      ]
    })
  }

  ExchangeRecord.getExchangeStats = async function (options = {}) {
    const { startDate = null, endDate = null, space = null } = options

    const whereClause = {}

    if (startDate && endDate) {
      whereClause.exchange_time = {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    }

    if (space) {
      whereClause.space = space
    }

    const [totalExchanges, totalPoints, statusStats] = await Promise.all([
      ExchangeRecord.count({ where: whereClause }),
      ExchangeRecord.sum('total_points', { where: whereClause }),
      ExchangeRecord.findAll({
        where: whereClause,
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true
      })
    ])

    return {
      totalExchanges,
      totalPoints: totalPoints || 0,
      statusStats: statusStats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count)
        return acc
      }, {})
    }
  }

  return ExchangeRecord
}
