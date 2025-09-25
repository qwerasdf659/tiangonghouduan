/**
 * 兑换记录模型
 * 记录用户商品兑换信息
 * 对应表: exchange_records
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeRecords = sequelize.define(
    'ExchangeRecords',
    {
      // 主键ID
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换记录唯一ID'
      },

      // 兑换记录业务ID
      exchange_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '兑换记录业务ID'
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 商品ID
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID',
        references: {
          model: 'products',
          key: 'product_id'
        }
      },

      // 商品信息快照
      product_snapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '商品信息快照JSON'
      },

      // 兑换数量
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '兑换数量'
      },

      // 总消耗积分
      total_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '总消耗积分'
      },

      // 兑换码
      exchange_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '兑换码（用户凭证）'
      },

      // 兑换状态
      status: {
        type: DataTypes.ENUM('pending', 'distributed', 'used', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'distributed', // 兑换记录默认为已分发状态
        comment:
          '兑换状态：pending-待处理，distributed-已分发，used-已使用，expired-已过期，cancelled-已取消'
      },

      /**
       * ✅ 兑换是否成功的业务标准字段（扩展is_winner模式）
       *
       * 🎯 业务含义：
       * - true: 兑换成功，用户可以使用兑换码或已完成兑换
       * - false: 兑换未成功（pending/expired/cancelled状态）
       *
       * 📋 业务逻辑：
       * - 当 status 为 'distributed'（已分发）或 'used'（已使用）时返回 true
       * - 其他状态（pending/expired/cancelled）返回 false
       *
       * 🔍 使用场景：
       * - 统计有效兑换数量：WHERE is_successful = true
       * - 计算兑换成功率：COUNT(is_successful = true) / COUNT(*)
       * - 前端显示兑换状态："成功" vs "失败"
       * - 业务规则：只有成功兑换才计入用户兑换记录
       *
       * 💡 业务理解：
       * - distributed: 兑换码已生成并发放给用户，视为成功
       * - used: 兑换码已被使用，完全成功
       * - pending: 还在处理中，不算成功
       * - expired: 已过期，失败
       * - cancelled: 已取消，失败
       *
       * ⚠️ 重要说明：
       * - 这是计算字段，不能直接设置
       * - 要改变结果，请修改 status 字段
       * - 与交易的 is_successful 标准保持语义一致
       *
       * 📝 使用示例：
       * ```javascript
       * // 查询成功兑换记录
       * const successfulExchanges = await ExchangeRecords.findAll({
       *   where: sequelize.where(
       *     sequelize.col('is_successful'), true
       *   )
       * })
       *
       * // 检查兑换是否成功
       * if (exchangeRecord.is_successful) {
       *   console.log('兑换成功，用户可以使用')
       * }
       * ```
       */
      is_successful: {
        type: DataTypes.VIRTUAL,
        get () {
          return ['distributed', 'used'].includes(this.status)
        },
        set (_value) {
          throw new Error('is_successful是计算字段，请设置status字段')
        }
      },

      // 兑换空间
      space: {
        type: DataTypes.ENUM('lucky', 'premium'),
        allowNull: false,
        comment: '兑换空间'
      },

      // 兑换时间
      exchange_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '兑换时间'
      },

      // 过期时间
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '兑换码过期时间'
      },

      // 使用时间
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
        comment: '使用说明JSON'
      },

      // 备注信息
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注信息'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      modelName: 'ExchangeRecords',
      tableName: 'exchange_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
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
      ]
    }
  )

  /**
   * 关联关系定义
   */
  ExchangeRecords.associate = function (models) {
    // 属于某个用户
    ExchangeRecords.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 属于某个商品
    ExchangeRecords.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product'
    })
  }

  /**
   * 实例方法
   */
  ExchangeRecords.prototype.toJSON = function () {
    const values = { ...this.get() }

    // 格式化时间显示
    if (values.exchange_time) {
      values.exchange_time_formatted = new Date(values.exchange_time).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    if (values.expires_at) {
      values.expires_at_formatted = new Date(values.expires_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    if (values.used_at) {
      values.used_at_formatted = new Date(values.used_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    // 添加状态显示文本
    const statusMap = {
      pending: '待处理',
      completed: '已完成',
      used: '已使用',
      expired: '已过期',
      cancelled: '已取消'
    }
    values.status_text = statusMap[values.status] || values.status

    // 添加空间显示文本
    const spaceMap = {
      lucky: '幸运空间',
      premium: '高级空间'
    }
    values.space_text = spaceMap[values.space] || values.space

    return values
  }

  /**
   * 静态方法
   */

  // 创建兑换记录
  ExchangeRecords.createRecord = async function (recordData, transaction = null) {
    const options = transaction ? { transaction } : {}

    return await ExchangeRecords.create(
      {
        exchange_id: recordData.exchange_id,
        user_id: recordData.user_id,
        product_id: recordData.product_id,
        product_snapshot: recordData.product_snapshot,
        quantity: recordData.quantity || 1,
        total_points: recordData.total_points,
        exchange_code: recordData.exchange_code,
        status: recordData.status || 'distributed', // 默认为已分发状态
        space: recordData.space,
        expires_at: recordData.expires_at,
        client_info: recordData.client_info,
        usage_info: recordData.usage_info,
        notes: recordData.notes
      },
      options
    )
  }

  // 根据兑换码查找记录
  ExchangeRecords.findByExchangeCode = async function (exchangeCode) {
    return await ExchangeRecords.findOne({
      where: { exchange_code: exchangeCode },
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          model: sequelize.models.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'category', 'type']
        }
      ]
    })
  }

  // 获取用户兑换历史
  ExchangeRecords.getUserExchangeHistory = async function (userId, options = {}) {
    const { _status = null, _space = null, _limit = 20, _offset = 0 } = options

    const where = { user_id: userId }
    if (_status) where.status = _status
    if (_space) where.space = _space

    return await ExchangeRecords.findAll({
      where,
      include: [
        {
          model: sequelize.models.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'category', 'type']
        }
      ],
      order: [['exchange_time', 'DESC']],
      limit: _limit,
      offset: _offset
    })
  }

  return ExchangeRecords
}
