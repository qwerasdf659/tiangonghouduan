/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 兑换记录模型（ExchangeRecords）
 *
 * 业务场景：用户积分兑换商品的完整流程管理
 *
 * 核心功能：
 * 1. 记录用户积分兑换商品的订单信息（兑换码、数量、消耗积分）
 * 2. 支持大额兑换的人工审核机制（≥1000积分自动进入审核流程）
 * 3. 管理兑换状态流转（pending→distributed→used/expired/cancelled）
 * 4. 审核通过自动创建用户库存（批量创建quantity个UserInventory记录）
 * 5. 审核拒绝自动退回积分（通过PointsService退回到用户账户）
 * 6. 保存商品信息快照（防止商品后续修改影响历史兑换记录）
 *
 * 业务流程：
 * 1. 用户选择商品并提交兑换（扣除积分，创建兑换记录）
 * 2. 系统判断是否需要审核（needsAudit方法）
 *    - 需要审核：status=pending，等待管理员审核
 *    - 无需审核：status=distributed，直接创建库存
 * 3. 管理员审核（仅针对需要审核的订单）
 *    - 审核通过：创建库存，发送通知
 *    - 审核拒绝：退回积分，恢复库存
 * 4. 用户使用兑换码：商家核销，status=used
 *
 * 审核规则（needsAudit方法）：
 * - 规则1：total_points ≥ 1000积分自动进入审核
 * - 规则2：premium空间且total_points ≥ 500积分需要审核
 * - 规则3：商品本身标记requires_audit=true需要审核
 *
 * 数据库表名：exchange_records
 * 主键：exchange_id（INTEGER，自增）
 * 外键：user_id（users.user_id）, product_id（products.product_id）, auditor_id（users.user_id）
 *
 * 集成服务：
 * - PointsService：积分扣除和退回
 * - UserInventory：审核通过后创建库存
 * - NotificationService：审核结果通知
 * - Product：库存管理和快照保存
 *
 * 创建时间：2025年01月28日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeRecords = sequelize.define(
    'ExchangeRecords',
    {
      // 主键ID（兑换记录的唯一标识符，用于追踪订单状态、审核流程、积分关联）
      exchange_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment:
          '兑换记录唯一标识（自增主键，用于订单追踪、审核管理、积分关联、库存创建，业务用途：订单查询、审核流程控制、积分退回凭证）'
      },

      // 用户ID（发起兑换的用户，外键关联users表，用于查询用户兑换历史和统计）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment:
          '兑换用户ID（外键关联users表，CASCADE删除，业务用途：查询用户兑换历史、统计用户消耗积分、发送审核通知、权限验证）',
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

      // 商品信息快照（兑换时的商品完整信息，防止商品后续修改影响历史记录）
      product_snapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        comment:
          '商品信息快照JSON（包含：name商品名称, description描述, category分类, exchange_points兑换积分, requires_audit是否需审核, image图片URL等，业务用途：审核依据、历史追溯、退款凭证，重要性：避免商品变更影响已兑换订单，确保审核和退款的准确性）'
      },

      // 兑换数量（用户一次兑换的商品数量，默认为1，影响total_points计算和库存扣减）
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment:
          '兑换商品数量（默认1，业务规则：total_points = product.exchange_points × quantity，同时影响库存扣减数量，用于UserInventory批量创建，范围：1-99）'
      },

      // 总消耗积分（本次兑换实际消耗的积分总数，已从用户账户扣除）
      total_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment:
          '总消耗积分（计算规则：product.exchange_points × quantity，状态：已从UserPointsAccount扣除，审核拒绝时退回，用于积分统计和财务对账，审核阈值：≥1000积分需人工审核）'
      },

      // 兑换码
      exchange_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '兑换码（用户凭证）'
      },

      // 兑换状态（管理兑换订单的完整生命周期，控制业务流转）
      status: {
        type: DataTypes.ENUM('pending', 'distributed', 'used', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'distributed', // 兑换记录默认为已分发状态（无需审核时）
        comment:
          '兑换状态（pending-待审核【需要人工审核的订单初始状态】→ distributed-已分发【审核通过或无需审核，库存已创建】→ used-已使用【用户已核销兑换码】或 expired-已过期【超过有效期未使用】或 cancelled-已取消【用户取消或审核拒绝】，业务规则：pending状态可取消，distributed状态可使用，used/expired/cancelled为终态不可变更）'
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
       * 业务场景：大额交易人工审核机制，防止恶意兑换和异常订单
       * 审核规则：≥1000积分 或 premium空间≥500积分 或 商品标记需审核
       * 审核流程：提交审核 → 管理员审核 → 通过（创建库存）/拒绝（退回积分）
       */

      // 是否需要审核（大额交易自动标记，控制审核流程的触发）
      requires_audit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          '是否需要审核（业务规则：total_points≥1000自动为true，或premium空间≥500积分，或商品requires_audit=true，用于控制审核流程触发，影响status初始值：true时为pending，false时为distributed）'
      },

      // 审核状态（跟踪审核流程的详细状态，与status字段配合使用）
      audit_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
        comment:
          '审核状态（not_required-无需审核【默认值，小额兑换】→ pending-待审核【提交审核后】→ approved-审核通过【管理员通过，触发库存创建】或 rejected-审核拒绝【管理员拒绝，触发积分退回】，业务规则：与status字段配合，approved时status变为distributed，rejected时status变为cancelled）'
      },

      // 审核员ID（执行审核操作的管理员，用于审核追踪和责任追溯）
      auditor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '审核员ID（外键关联users表，记录审核操作人员，业务用途：审核日志追踪、责任追溯、审核统计分析，仅在需要审核的订单中有值）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 审核意见（审核通过的备注或拒绝的具体原因，必要时提供给用户）
      audit_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment:
          '审核意见/拒绝原因（审核通过时：可选的备注说明；审核拒绝时：必填的拒绝原因，将通过通知发送给用户，用于改进后续兑换申请）'
      },

      // 审核时间（审核操作的时间戳，用于审核效率统计）
      audited_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '审核时间（管理员执行approve或reject操作的北京时间，用于审核效率统计、SLA监控、审核历史追溯）'
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
      },

      /*
       * ========================================
       * 软删除字段（API#7统一软删除机制）
       * ========================================
       */
      // 软删除标记（0=未删除，1=已删除）
      is_deleted: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）'
      },

      // 删除时间（软删除时记录，管理员恢复时清空）
      deleted_at: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        comment: '删除时间（软删除时记录，管理员恢复时清空），时区：北京时间（GMT+8）'
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
   * 定义模型关联关系（Sequelize标准关联方法）
   *
   * 业务场景：建立ExchangeRecords与User、Product模型的关联关系
   *
   * 关联说明：
   * - user：兑换记录属于某个用户（belongsTo关联）
   * - product：兑换记录属于某个商品（belongsTo关联）
   *
   * @param {Object} models - Sequelize models对象（包含所有已定义的模型）
   * @returns {void} 无返回值（定义关联关系）
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
   * ========== 实例方法 ==========
   */

  /**
   * 序列化为JSON（前端友好格式，自动格式化时间和状态）
   *
   * 业务场景：API返回兑换记录时，自动添加格式化的时间字段和中文状态
   *
   * 处理逻辑：
   * 1. 格式化北京时间字段（exchange_time、expires_at、used_at）
   * 2. 添加状态中文描述（status_text）
   * 3. 添加空间中文描述（space_text）
   * 4. 保留原始字段值（不修改原始数据）
   *
   * @returns {Object} 格式化后的JSON对象
   * @returns {string} return.exchange_time_formatted - 兑换时间（中文格式：2025年10月30日 23:15:00）
   * @returns {string} return.expires_at_formatted - 过期时间（中文格式）
   * @returns {string} return.used_at_formatted - 使用时间（中文格式）
   * @returns {string} return.status_text - 状态中文描述（待处理/已分发/已使用/已过期/已取消）
   * @returns {string} return.space_text - 空间中文描述（幸运空间/高级空间）
   *
   * @example
   * const record = await ExchangeRecords.findByPk(exchangeId)
   * const json = record.toJSON()
   * console.log('兑换时间：', json.exchange_time_formatted) // 2025年10月30日 23:15:00
   * console.log('状态：', json.status_text) // 已分发
   */
  ExchangeRecords.prototype.toJSON = function () {
    const values = { ...this.get() }

    // 格式化时间显示（北京时间，中文格式）
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

    // 添加状态显示文本（中文描述，前端友好）
    const statusMap = {
      pending: '待处理',
      completed: '已完成',
      used: '已使用',
      expired: '已过期',
      cancelled: '已取消'
    }
    values.status_text = statusMap[values.status] || values.status

    // 添加空间显示文本（中文描述，前端友好）
    const spaceMap = {
      lucky: '幸运空间',
      premium: '高级空间'
    }
    values.space_text = spaceMap[values.space] || values.space

    return values
  }

  /**
   * ========== 实例方法 - 审核相关 ==========
   * 业务场景：大额兑换审核机制，防止恶意兑换和异常订单
   * 设计模式：策略模式 + 责任链模式（多条审核规则组合判断）
   */

  /**
   * 判断是否需要人工审核（根据积分金额、空间类型、商品属性综合判定）
   *
   * 业务规则：
   * - 规则1（高优先级）：total_points ≥ 1000积分，无论哪个空间都需要审核（防止大额恶意兑换）
   * - 规则2（中优先级）：premium臻选空间且total_points ≥ 500积分需要审核（高价值商品保护）
   * - 规则3（商品级别）：商品本身标记requires_audit=true需要审核（特殊商品人工审核）
   *
   * @returns {boolean} true-需要审核, false-无需审核（自动通过）
   *
   * @example
   * // 场景1：高额兑换（1000积分），需要审核
   * const record = await ExchangeRecords.findByPk(1)
   * if (record.needsAudit()) {
   *   await record.submitForAudit()  // 提交审核
   * }
   *
   * // 场景2：小额兑换（50积分），无需审核
   * const record2 = await ExchangeRecords.findByPk(2)
   * if (!record2.needsAudit()) {
   *   // 直接创建库存，status保持distributed
   * }
   */
  ExchangeRecords.prototype.needsAudit = function () {
    // 规则1: 积分超过1000需要审核（高优先级，防止大额恶意兑换）
    if (this.total_points >= 1000) return true

    // 规则2: premium空间的高价值商品需要审核（中优先级，保护高价值商品）
    if (this.space === 'premium' && this.total_points >= 500) return true

    // 规则3: 商品快照中标记需要审核（商品级别配置，特殊商品人工审核）
    const product = this.product_snapshot
    if (product && product.requires_audit === true) return true

    // 默认无需审核，自动通过
    return false
  }

  /**
   * 提交审核（将兑换记录提交给管理员审核）
   *
   * 业务场景：需要人工审核的商品（如高价值商品）在兑换时，先提交审核
   *
   * 业务规则：
   * - 设置requires_audit=true（标记为需要审核）
   * - 设置audit_status='pending'（审核状态：待审核）
   * - 保持status='pending'（兑换状态：待审核，直到审核通过）
   *
   * @param {Transaction} transaction - Sequelize事务对象（可选，用于事务控制）
   * @returns {Promise<ExchangeRecords>} 更新后的兑换记录对象
   */
  ExchangeRecords.prototype.submitForAudit = async function (transaction = null) {
    this.requires_audit = true
    this.audit_status = 'pending'
    this.status = 'pending' // 保持pending状态直到审核通过
    return await this.save({ transaction })
  }

  /**
   * 审核通过（管理员批准兑换申请，创建用户库存并发送通知）
   *
   * 业务流程：
   * 1. 更新兑换记录审核状态（audit_status=approved, status=distributed）
   * 2. 批量创建用户库存（根据quantity创建多个UserInventory记录）
   * 3. 为每个库存生成唯一核销码（用户凭核销码使用商品）
   * 4. 发送审核通过通知给用户（异步，失败不影响审核流程）
   *
   * 业务规则：
   * - 只有audit_status=pending的记录才能执行审核通过
   * - 审核通过后status变为distributed（已分发，可以使用）
   * - 批量创建quantity个库存记录（每个库存独立核销）
   * - 所有操作在事务中执行，确保数据一致性（审核+库存创建）
   *
   * @param {number} auditorId - 审核员ID（必填，用于审核追踪和责任追溯）
   * @param {string} reason - 审核意见（可选，备注说明）
   * @returns {Promise<ExchangeRecords>} 更新后的兑换记录对象
   *
   * @throws {Error} 如果记录状态不是pending
   * @throws {Error} 如果库存创建失败
   * @throws {Error} 如果事务执行失败
   *
   * @example
   * // 管理员审核通过兑换申请
   * const record = await ExchangeRecords.findByPk(exchangeId)
   * await record.approve(adminUserId, '商品信息核实无误，同意兑换')
   * console.log('审核通过，已创建用户库存')
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
   * 审核拒绝（管理员拒绝兑换申请，退回积分并恢复库存）
   *
   * 业务流程：
   * 1. 更新兑换记录状态（audit_status=rejected, status=cancelled）
   * 2. 退回积分给用户（调用PointsService.addPoints，type='refund'）
   * 3. 恢复商品库存（Product.stock += quantity）
   * 4. 发送审核拒绝通知给用户（说明拒绝原因，异步执行）
   *
   * 业务规则：
   * - 只有audit_status=pending的记录才能执行审核拒绝
   * - 必须提供拒绝原因（reason参数必填，将发送给用户）
   * - 积分退回使用幂等性控制（business_id: refund_exchange_{exchange_id}）
   * - 库存恢复使用原子操作（Product.increment）
   * - 所有操作在事务中执行，确保数据一致性
   *
   * @param {number} auditorId - 审核员ID（必填，用于审核追踪和责任追溯）
   * @param {string} reason - 拒绝原因（必填，将通过通知发送给用户，帮助用户改进）
   * @returns {Promise<ExchangeRecords>} 更新后的兑换记录对象
   *
   * @throws {Error} '审核拒绝必须提供原因' - 如果reason参数为空
   * @throws {Error} 如果记录状态不是pending
   * @throws {Error} 如果积分退回失败
   * @throws {Error} 如果库存恢复失败
   * @throws {Error} 如果事务执行失败
   *
   * @example
   * // 管理员审核拒绝兑换申请
   * const record = await ExchangeRecords.findByPk(exchangeId)
   * await record.reject(adminUserId, '商品库存不足，暂时无法兑换')
   * console.log('审核拒绝，已退回积分')
   */
  ExchangeRecords.prototype.reject = async function (auditorId, reason) {
    // 业务规则验证：拒绝原因必填（用户需要知道为什么被拒绝）
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
   * 检查兑换记录是否处于待审核状态（用于审核流程判断）
   *
   * 业务场景：管理员筛选待审核订单时，判断订单是否需要处理
   *
   * 业务规则：
   * - requires_audit必须为true（订单需要审核）
   * - audit_status必须为'pending'（等待审核）
   * - 两个条件同时满足才算待审核
   *
   * @returns {boolean} true-待审核（需要管理员处理）, false-不在待审核状态
   *
   * @example
   * const record = await ExchangeRecords.findByPk(exchangeId)
   * if (record.isPendingAudit()) {
   *   console.log('该订单需要审核，请管理员处理')
   * } else {
   *   console.log('该订单无需审核或已审核')
   * }
   */
  ExchangeRecords.prototype.isPendingAudit = function () {
    return this.requires_audit === true && this.audit_status === 'pending'
  }

  /**
   * 用户取消兑换（用户主动取消待审核的兑换申请，退回积分并恢复库存）
   *
   * 业务场景：用户在审核期间改变主意，主动取消兑换申请
   *
   * 业务流程：
   * 1. 验证订单状态（只有pending状态才能取消）
   * 2. 更新订单状态（status=cancelled, audit_status=rejected）
   * 3. 退回积分给用户（调用PointsService.addPoints，type='refund'）
   * 4. 恢复商品库存（Product.stock += quantity）
   * 5. 发送取消通知给用户（确认取消成功，异步执行）
   *
   * 业务规则：
   * - 只有status=pending且audit_status=pending的订单才能取消
   * - 已审核通过（distributed）的订单不可取消（库存已创建）
   * - 已使用（used）或已过期（expired）的订单不可取消
   * - 已取消（cancelled）的订单不可重复取消
   * - 积分退回使用幂等性控制（business_id: cancel_exchange_{exchange_id}）
   * - 所有操作在事务中执行，确保数据一致性
   *
   * @param {string} cancelReason - 取消原因（可选，默认："用户取消兑换"）
   * @returns {Promise<ExchangeRecords>} 更新后的兑换记录对象
   *
   * @throws {Error} '订单状态不允许取消' - 如果订单不是pending状态
   * @throws {Error} 如果积分退回失败
   * @throws {Error} 如果库存恢复失败
   * @throws {Error} 如果事务执行失败
   *
   * @example
   * // 用户取消待审核的兑换申请
   * const record = await ExchangeRecords.findByPk(exchangeId)
   * if (record.status === 'pending') {
   *   await record.cancel('暂时不需要了')
   *   console.log('兑换已取消，积分已退回')
   * }
   *
   * // 尝试取消已分发的订单（会抛出异常）
   * const distributedRecord = await ExchangeRecords.findByPk(exchangeId2)
   * await distributedRecord.cancel() // 抛出Error: 订单状态不允许取消
   */
  ExchangeRecords.prototype.cancel = async function (cancelReason = '用户取消兑换') {
    // 业务规则验证：只有pending状态的订单才能取消（已分发的订单不可取消）
    if (this.status !== 'pending' || this.audit_status !== 'pending') {
      throw new Error(
        `订单状态不允许取消（当前状态：${this.status}，审核状态：${this.audit_status}）`
      )
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
   * ========== 静态方法（类方法）==========
   */

  /**
   * 查询所有待审核的兑换记录（管理员审核工作台）
   *
   * 业务场景：管理员查看待审核订单列表，按提交时间排序（先提交先审核）
   *
   * 查询逻辑：
   * - 筛选条件：requires_audit=true AND audit_status='pending'
   * - 排序规则：按exchange_time升序（早提交的订单优先审核）
   * - 关联用户信息（显示用户手机号和昵称）
   * - 不关联Product表（使用product_snapshot字段即可，避免商品后续修改影响审核判断）
   *
   * 设计说明：
   * 1. product_snapshot保存了兑换时的商品快照，是审核的正确依据
   * 2. 避免商品后续修改影响历史记录的审核判断（如价格变动、下架等）
   * 3. 避免Product表主键配置问题导致的查询错误
   *
   * @param {number} limit - 查询数量限制（可选，默认50条，防止一次加载过多数据）
   * @returns {Promise<Array<ExchangeRecords>>} 待审核兑换记录数组，包含用户信息
   *
   * @example
   * // 管理员查看待审核订单列表
   * const pendingAudits = await ExchangeRecords.findPendingAudits(100)
   * console.log('待审核订单数量：', pendingAudits.length)
   * pendingAudits.forEach(record => {
   *   console.log(`订单${record.exchange_id}：用户${record.user.nickname}，商品${record.product_snapshot.name}，积分${record.total_points}`)
   * })
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

  /**
   * 创建兑换记录（统一的兑换记录创建入口）
   *
   * 业务场景：用户在前端提交兑换申请时，创建兑换记录
   *
   * 业务流程：
   * 1. 自动生成exchange_id（AUTO_INCREMENT主键，无需手动赋值）
   * 2. 保存商品信息快照（product_snapshot字段）
   * 3. 根据是否需要审核，设置初始status（需审核=pending，无需审核=distributed）
   * 4. 设置北京时间为兑换时间
   * 5. 支持事务操作（与积分扣除、库存扣减一起提交）
   *
   * 业务规则：
   * - exchange_id自动生成（数据库AUTO_INCREMENT）
   * - status默认为'distributed'（无需审核时直接分发）
   * - quantity默认为1（用户一次兑换1个商品）
   * - 所有操作支持事务（通过transaction参数控制）
   *
   * @param {Object} recordData - 兑换记录数据
   * @param {number} recordData.user_id - 用户ID（必填）
   * @param {number} recordData.product_id - 商品ID（必填）
   * @param {Object} recordData.product_snapshot - 商品信息快照（必填）
   * @param {number} recordData.quantity - 兑换数量（可选，默认1）
   * @param {number} recordData.total_points - 总消耗积分（必填）
   * @param {string} recordData.exchange_code - 兑换码（必填）
   * @param {string} recordData.status - 状态（可选，默认'distributed'）
   * @param {string} recordData.space - 兑换空间（必填，lucky/premium）
   * @param {Date} recordData.expires_at - 过期时间（可选）
   * @param {string} recordData.client_info - 客户端信息（可选）
   * @param {Object} recordData.usage_info - 使用说明（可选）
   * @param {string} recordData.notes - 备注（可选）
   * @param {Transaction} transaction - Sequelize事务对象（可选，用于事务控制）
   * @returns {Promise<ExchangeRecords>} 创建的兑换记录对象
   *
   * @throws {Error} 如果user_id为空
   * @throws {Error} 如果product_id为空
   * @throws {Error} 如果total_points为空或小于0
   * @throws {Error} 如果exchange_code为空或已存在
   *
   * @example
   * // 用户兑换商品
   * const transaction = await sequelize.transaction()
   * try {
   *   const record = await ExchangeRecords.createRecord({
   *     user_id: 10001,
   *     product_id: 1,
   *     product_snapshot: { name: '优惠券', exchange_points: 100 },
   *     quantity: 1,
   *     total_points: 100,
   *     exchange_code: 'EX20251030001',
   *     space: 'lucky'
   *   }, transaction)
   *   await transaction.commit()
   *   console.log('兑换成功：', record.exchange_id)
   * } catch (error) {
   *   await transaction.rollback()
   * }
   */
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

  /**
   * 根据兑换码查找兑换记录（用户使用兑换码时查询）
   *
   * 业务场景：商家核销兑换码时，根据兑换码查询订单详情
   *
   * 查询逻辑：
   * - 按exchange_code精确匹配（兑换码唯一索引）
   * - 关联用户信息（显示用户手机号和昵称）
   * - 关联商品信息（显示商品名称和类型）
   * - 仅返回一条记录（兑换码唯一）
   *
   * @param {string} exchangeCode - 兑换码（必填，格式：EX20251030001）
   * @returns {Promise<ExchangeRecords|null>} 兑换记录对象（包含用户和商品信息），未找到返回null
   *
   * @example
   * // 商家扫描兑换码核销
   * const record = await ExchangeRecords.findByExchangeCode('EX20251030001')
   * if (record) {
   *   if (record.status === 'distributed') {
   *     console.log('兑换码有效，可以使用')
   *     console.log('用户：', record.user.nickname)
   *     console.log('商品：', record.product.name)
   *   } else {
   *     console.log('兑换码状态：', record.status)
   *   }
   * } else {
   *   console.log('兑换码无效')
   * }
   */
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

  /**
   * 获取用户的兑换历史记录（用户端查询自己的兑换记录）
   *
   * 业务场景：用户在前端查看自己的兑换历史和兑换码
   *
   * 查询逻辑：
   * - 按user_id过滤（只查询当前用户的兑换记录）
   * - 支持按status过滤（查看特定状态的兑换记录）
   * - 支持按space过滤（查看特定空间的兑换记录）
   * - 按exchange_time倒序排列（最新的兑换在前）
   * - 关联商品信息（显示商品名称和类型）
   * - 支持分页查询（_limit和_offset参数）
   *
   * @param {number} user_id - 用户ID（必填，查询指定用户的兑换历史）
   * @param {Object} options - 查询选项
   * @param {string} options._status - 状态过滤（可选，pending/distributed/used/expired/cancelled）
   * @param {string} options._space - 空间过滤（可选，lucky/premium）
   * @param {number} options._limit - 每页数量（可选，默认20条）
   * @param {number} options._offset - 跳过数量（可选，默认0，用于分页）
   * @returns {Promise<Array<ExchangeRecords>>} 兑换记录数组，包含商品信息
   *
   * @example
   * // 查询用户所有兑换历史（分页）
   * const history = await ExchangeRecords.getUserExchangeHistory(10001, {
   *   _limit: 10,
   *   _offset: 0
   * })
   * console.log('用户共兑换', history.length, '次')
   *
   * // 查询用户幸运空间的兑换历史
   * const luckyHistory = await ExchangeRecords.getUserExchangeHistory(10001, {
   *   _space: 'lucky',
   *   _limit: 20
   * })
   *
   * // 查询用户已使用的兑换码
   * const usedRecords = await ExchangeRecords.getUserExchangeHistory(10001, {
   *   _status: 'used'
   * })
   */
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

  /**
   * ========== Sequelize Scope 定义（预定义的查询快捷方式）==========
   *
   * 基于实际业务需求，避免过度设计
   *
   * 使用方式：
   * - ExchangeRecords.scope('successful').findAll() // 单个Scope
   * - ExchangeRecords.scope(['successful', { method: ['byUser', user_id] }]).findAll() // 多个Scope组合
   *
   * 设计原则：
   * 1. 只定义高频使用的查询场景
   * 2. 避免创建过于复杂的Scope（影响性能和可读性）
   * 3. Scope可以组合使用（支持多个Scope叠加）
   *
   * 业务场景说明：
   * - successful：筛选成功的兑换记录（已分发或已使用）
   * - byUser：查询指定用户的兑换记录
   * - bySpace：按兑换空间筛选（幸运空间或臻选空间）
   */

  /**
   * Scope: successful - 查询成功的兑换记录
   *
   * 业务场景：统计用户成功兑换的商品数量，排除待审核、已取消、已过期的记录
   *
   * 查询条件：status IN ('distributed', 'used')
   * - distributed（已分发）：兑换码已生成，等待用户使用
   * - used（已使用）：用户已使用兑换码核销
   *
   * 业务规则：
   * - 成功兑换 = 积分已扣除 + 兑换码已生成
   * - 不包括待审核（pending）状态的记录
   * - 不包括已取消（cancelled）和已过期（expired）的记录
   *
   * @example
   * // 查询用户成功兑换的所有商品
   * const successfulRecords = await ExchangeRecords.scope('successful').findAll({
   *   where: { user_id: 10001 }
   * })
   * console.log('用户成功兑换商品数量：', successfulRecords.length)
   *
   * // 统计幸运空间的成功兑换记录
   * const luckySuccessful = await ExchangeRecords.scope(['successful', { method: ['bySpace', 'lucky'] }]).findAll()
   */
  ExchangeRecords.addScope('successful', {
    where: {
      status: {
        [sequelize.Sequelize.Op.in]: ['distributed', 'used']
      }
    }
  })

  /**
   * Scope: byUser - 查询指定用户的兑换记录（参数化Scope）
   *
   * 业务场景：用户在前端查看自己的兑换历史和兑换码
   *
   * 查询条件：user_id = 指定用户ID
   *
   * 使用说明：
   * - 这是一个参数化Scope，需要传入user_id参数
   * - 可以与其他Scope组合使用（如：successful、bySpace）
   *
   * @param {number} user_id - 用户ID
   * @returns {Object} Sequelize Scope配置对象
   *
   * @example
   * // 查询指定用户的所有兑换记录
   * const userRecords = await ExchangeRecords.scope({ method: ['byUser', 10001] }).findAll()
   * console.log('用户兑换记录数量：', userRecords.length)
   *
   * // 查询指定用户的成功兑换记录（组合使用Scope）
   * const userSuccessful = await ExchangeRecords.scope(['successful', { method: ['byUser', 10001] }]).findAll()
   *
   * // 查询指定用户在臻选空间的成功兑换记录（多个Scope组合）
   * const userPremiumSuccessful = await ExchangeRecords.scope([
   *   'successful',
   *   { method: ['byUser', 10001] },
   *   { method: ['bySpace', 'premium'] }
   * ]).findAll()
   */
  ExchangeRecords.addScope('byUser', user_id => ({
    where: { user_id }
  }))

  /**
   * Scope: bySpace - 按兑换空间筛选记录（参数化Scope）
   *
   * 业务场景：统计不同兑换空间的商品兑换情况
   *
   * 查询条件：space = 指定兑换空间
   *
   * 支持的兑换空间：
   * - lucky：幸运空间（免费抽奖获得的兑换记录）
   * - premium：臻选空间（付费购买获得的兑换记录）
   *
   * 使用说明：
   * - 这是一个参数化Scope，需要传入space参数
   * - 可以与其他Scope组合使用（如：successful、byUser）
   *
   * @param {string} space - 兑换空间（lucky/premium）
   * @returns {Object} Sequelize Scope配置对象
   *
   * @example
   * // 查询臻选空间的所有兑换记录
   * const premiumRecords = await ExchangeRecords.scope({ method: ['bySpace', 'premium'] }).findAll()
   * console.log('臻选空间兑换记录数量：', premiumRecords.length)
   *
   * // 查询幸运空间的成功兑换记录（组合使用Scope）
   * const luckySuccessful = await ExchangeRecords.scope([
   *   'successful',
   *   { method: ['bySpace', 'lucky'] }
   * ]).findAll()
   *
   * // 统计用户在不同空间的兑换情况（多次查询）
   * const userLucky = await ExchangeRecords.scope([
   *   { method: ['byUser', 10001] },
   *   { method: ['bySpace', 'lucky'] }
   * ]).count()
   * const userPremium = await ExchangeRecords.scope([
   *   { method: ['byUser', 10001] },
   *   { method: ['bySpace', 'premium'] }
   * ]).count()
   * console.log(`幸运空间兑换${userLucky}次，臻选空间兑换${userPremium}次`)
   */
  ExchangeRecords.addScope('bySpace', space => ({
    where: { space }
  }))

  return ExchangeRecords
}
