/**
 * 兑换记录模型
 * 记录用户商品兑换信息
 * 对应表: exchange_records
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeRecords = sequelize.define(
    'ExchangeRecords',
    {
      // 主键ID
      exchange_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
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

      // 商品ID - 外键引用products表
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
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
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

      /**
       * ========== 审核相关字段 ==========
       * 支持大额交易人工审核机制
       * 复用ImageResources的审核模式
       */

      // 是否需要审核
      requires_audit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否需要审核（大额交易自动标记）'
      },

      // 审核状态
      audit_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
        comment:
          '审核状态：not_required-无需审核，pending-待审核，approved-审核通过，rejected-审核拒绝'
      },

      // 审核员ID
      auditor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核员ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 审核意见
      audit_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '审核意见/拒绝原因'
      },

      // 审核时间
      audited_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      }
    },
    {
      sequelize,
      modelName: 'ExchangeRecords',
      tableName: 'exchange_records',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
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

    // 属于某个商品 - 标准外键关联
    ExchangeRecords.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product'
    })

    // 审核员（可选）
    ExchangeRecords.belongsTo(models.User, {
      foreignKey: 'auditor_id',
      as: 'auditor'
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
   * 实例方法 - 审核相关
   * 复用ImageResources的审核模式
   */

  /**
   * 判断是否需要审核
   * @returns {boolean}
   */
  ExchangeRecords.prototype.needsAudit = function () {
    // 规则1: 积分超过1000需要审核
    if (this.total_points >= 1000) return true

    // 规则2: premium空间的高价值商品需要审核
    if (this.space === 'premium' && this.total_points >= 500) return true

    // 规则3: 商品快照中标记需要审核
    const product = this.product_snapshot
    if (product && product.requires_audit === true) return true

    return false
  }

  /**
   * 提交审核
   * @returns {Promise<ExchangeRecords>}
   */
  ExchangeRecords.prototype.submitForAudit = async function (transaction = null) {
    this.requires_audit = true
    this.audit_status = 'pending'
    this.status = 'pending' // 保持pending状态直到审核通过
    return await this.save({ transaction })
  }

  /**
   * 审核通过
   * @param {number} auditorId - 审核员ID
   * @param {string} reason - 审核意见（可选）
   * @returns {Promise<ExchangeRecords>}
   */
  ExchangeRecords.prototype.approve = async function (auditorId, reason = null) {
    const sequelize = require('../config/database')
    const transaction = await sequelize.transaction()

    try {
      // 1. 更新审核状态
      this.audit_status = 'approved'
      this.auditor_id = auditorId
      this.audit_reason = reason
      this.audited_at = BeijingTimeHelper.createBeijingTime()
      this.status = 'distributed' // 审核通过后变为已分发
      await this.save({ transaction })

      // ✅ 2. 补充库存创建逻辑（解决问题3）
      const UserInventory = require('./UserInventory')
      const product = this.product_snapshot

      for (let i = 0; i < this.quantity; i++) {
        const inventoryItem = await UserInventory.create(
          {
            user_id: this.user_id,
            name: product.name,
            description: product.description,
            type: product.category === '优惠券' ? 'voucher' : 'product',
            value: this.total_points / this.quantity,
            status: 'available',
            source_type: 'exchange',
            source_id: this.exchange_id.toString(),
            acquired_at: BeijingTimeHelper.createBeijingTime(),
            expires_at: product.expires_at || null
          },
          { transaction }
        )

        // 生成核销码
        await inventoryItem.generateVerificationCode()
      }

      await transaction.commit()

      // 3. 发送审核通过通知
      try {
        const NotificationService = require('../services/NotificationService')
        await NotificationService.notifyExchangeApproved(this.user_id, {
          exchange_id: this.exchange_id,
          product_name: product.name,
          quantity: this.quantity
        })
      } catch (notifyError) {
        // 通知失败不影响审核流程
        console.error('[审核通过] 发送通知失败:', notifyError.message)
      }

      return this
    } catch (error) {
      await transaction.rollback()
      throw new Error(`审核通过处理失败: ${error.message}`)
    }
  }

  /**
   * 审核拒绝
   * @param {number} auditorId - 审核员ID
   * @param {string} reason - 拒绝原因
   * @returns {Promise<ExchangeRecords>}
   */
  ExchangeRecords.prototype.reject = async function (auditorId, reason) {
    if (!reason) {
      throw new Error('审核拒绝必须提供原因')
    }

    const sequelize = require('../config/database')
    const transaction = await sequelize.transaction()

    try {
      // 1. 更新兑换记录状态
      this.audit_status = 'rejected'
      this.auditor_id = auditorId
      this.audit_reason = reason
      this.audited_at = BeijingTimeHelper.createBeijingTime()
      this.status = 'cancelled' // 审核拒绝后取消兑换
      await this.save({ transaction })

      // ✅ 2. 退回积分给用户（解决问题6）
      const PointsService = require('../services/PointsService')
      await PointsService.addPoints(this.user_id, this.total_points, {
        transaction,
        business_type: 'refund',
        source_type: 'exchange_rejection',
        business_id: `refund_exchange_${this.exchange_id}`,
        title: '兑换审核拒绝退款',
        description: `兑换订单${this.exchange_id}审核拒绝，退回${this.total_points}积分`,
        operator_id: auditorId
      })

      // ✅ 3. 恢复商品库存
      const Product = require('./Product')
      await Product.increment('stock', {
        by: this.quantity,
        where: { product_id: this.product_id },
        transaction
      })

      await transaction.commit()

      // 4. 发送审核拒绝通知
      try {
        const NotificationService = require('../services/NotificationService')
        await NotificationService.notifyExchangeRejected(this.user_id, {
          exchange_id: this.exchange_id,
          product_name: this.product_snapshot.name,
          total_points: this.total_points,
          reject_reason: reason
        })
      } catch (notifyError) {
        // 通知失败不影响审核流程
        console.error('[审核拒绝] 发送通知失败:', notifyError.message)
      }

      return this
    } catch (error) {
      await transaction.rollback()
      throw new Error(`审核拒绝处理失败: ${error.message}`)
    }
  }

  /**
   * 检查是否待审核
   * @returns {boolean}
   */
  ExchangeRecords.prototype.isPendingAudit = function () {
    return this.requires_audit === true && this.audit_status === 'pending'
  }

  /**
   * 用户取消兑换（仅限pending状态）
   * @param {string} cancelReason - 取消原因（可选）
   * @returns {Promise<ExchangeRecords>}
   */
  ExchangeRecords.prototype.cancel = async function (cancelReason = '用户取消兑换') {
    // 只有pending状态的订单才能取消
    if (this.status !== 'pending' || this.audit_status !== 'pending') {
      throw new Error(`订单状态不允许取消（当前状态：${this.status}，审核状态：${this.audit_status}）`)
    }

    const sequelize = require('../config/database')
    const transaction = await sequelize.transaction()

    try {
      // 1. 更新订单状态
      this.status = 'cancelled'
      this.audit_status = 'rejected'
      this.audit_reason = cancelReason
      this.audited_at = BeijingTimeHelper.createBeijingTime()
      await this.save({ transaction })

      // 2. 退回积分
      const PointsService = require('../services/PointsService')
      await PointsService.addPoints(this.user_id, this.total_points, {
        transaction,
        business_type: 'refund',
        source_type: 'exchange_cancellation',
        business_id: `cancel_exchange_${this.exchange_id}`,
        title: '取消兑换退款',
        description: `用户取消兑换订单${this.exchange_id}，退回${this.total_points}积分`
      })

      // 3. 恢复商品库存
      const Product = require('./Product')
      await Product.increment('stock', {
        by: this.quantity,
        where: { product_id: this.product_id },
        transaction
      })

      await transaction.commit()

      // 4. 发送取消通知（可选）
      try {
        const NotificationService = require('../services/NotificationService')
        await NotificationService.send(this.user_id, {
          type: 'exchange_cancelled',
          title: '兑换已取消',
          content: `您的兑换订单已取消，${this.total_points}积分已退回`,
          data: {
            exchange_id: this.exchange_id,
            product_name: this.product_snapshot.name,
            total_points: this.total_points
          }
        })
      } catch (notifyError) {
        console.error('[取消兑换] 发送通知失败:', notifyError.message)
      }

      return this
    } catch (error) {
      await transaction.rollback()
      throw new Error(`取消兑换失败: ${error.message}`)
    }
  }

  /**
   * 静态方法
   */

  /**
   * 查询待审核记录
   * @param {number} limit - 查询数量限制
   * @returns {Promise<Array>}
   *
   * 注意：不关联Product表，直接使用product_snapshot字段
   * 理由：
   * 1. product_snapshot保存了兑换时的商品快照，是审核的正确依据
   * 2. 避免商品后续修改影响历史记录的审核判断
   * 3. 避免Product表主键配置问题导致的查询错误
   */
  ExchangeRecords.findPendingAudits = async function (limit = 50) {
    return await ExchangeRecords.findAll({
      where: {
        requires_audit: true,
        audit_status: 'pending'
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
        // 不关联Product表，使用product_snapshot字段即可
      ],
      order: [['exchange_time', 'ASC']],
      limit: parseInt(limit)
    })
  }

  // 创建兑换记录
  ExchangeRecords.createRecord = async function (recordData, transaction = null) {
    const options = transaction ? { transaction } : {}

    // exchange_id 现在是AUTO_INCREMENT主键，不再手动赋值
    return await ExchangeRecords.create(
      {
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
  ExchangeRecords.getUserExchangeHistory = async function (user_id, options = {}) {
    const { _status = null, _space = null, _limit = 20, _offset = 0 } = options

    const where = { user_id }
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

  // ========== Sequelize Scope 定义 ==========
  // 基于实际业务需求，避免过度设计

  /**
   * Scope: successful
   * 业务含义：查询成功的兑换记录
   * 等价SQL: WHERE status IN ('distributed', 'used')
   * 说明：distributed(已分发) 和 used(已使用) 都算成功
   *
   * 使用示例：
   * await ExchangeRecords.scope('successful').findAll()
   */
  ExchangeRecords.addScope('successful', {
    where: {
      status: {
        [sequelize.Sequelize.Op.in]: ['distributed', 'used']
      }
    }
  })

  /**
   * Scope: byUser
   * 业务含义：查询指定用户的兑换记录
   *
   * 使用示例：
   * await ExchangeRecords.scope({ method: ['byUser', user_id] }).findAll()
   * await ExchangeRecords.scope('successful', { method: ['byUser', user_id] }).findAll()
   */
  ExchangeRecords.addScope('byUser', user_id => ({
    where: { user_id }
  }))

  /**
   * Scope: bySpace
   * 业务含义：按空间查询兑换记录
   * 支持：lucky(幸运空间), premium(臻选空间)
   *
   * 使用示例：
   * await ExchangeRecords.scope({ method: ['bySpace', 'premium'] }).findAll()
   */
  ExchangeRecords.addScope('bySpace', space => ({
    where: { space }
  }))

  return ExchangeRecords
}
