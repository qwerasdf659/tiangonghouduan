/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 消费记录模型（ConsumptionRecord）
 *
 * 业务场景：商家扫码录入方案A - 消费奖励业务流程
 *
 * 核心功能：
 * - 记录用户通过商家扫码提交的消费记录
 * - 支持待审核→已通过/已拒绝/已过期的状态流转
 * - 与content_review_records表配合实现审核功能
 * - 审核通过后自动奖励积分（通过 BalanceService）
 *
 * 业务流程：
 * 1. 用户出示V2动态身份码（QRV2_{base64_payload}_{signature}，5分钟有效）
 * 2. 商家扫码录入消费金额和备注
 * 3. 系统创建消费记录（状态：pending）
 * 4. 管理员审核（通过content_review_records表）
 * 5. 审核通过 → 奖励积分（1元=1分）
 * 6. 审核拒绝 → 记录拒绝原因
 *
 * 数据库表名：consumption_records
 * 主键：record_id（BIGINT，自增）
 *
 * 创建时间：2025年10月30日
 * 最后更新：2025年12月30日
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 消费记录模型
 * 职责：管理商家扫码录入的消费记录及其审核状态
 * 设计模式：状态机模式 + 审计日志模式
 */
class ConsumptionRecord extends Model {
  /**
   * 静态关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：多个消费记录属于一个用户
    ConsumptionRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '关联用户信息（消费者）'
    })

    // 多对一：多个消费记录属于一个商家
    ConsumptionRecord.belongsTo(models.User, {
      foreignKey: 'merchant_id',
      as: 'merchant',
      comment: '关联商家信息（录入人）'
    })

    // 多对一：审核员信息
    ConsumptionRecord.belongsTo(models.User, {
      foreignKey: 'reviewed_by',
      as: 'reviewer',
      comment: '关联审核员信息'
    })

    // 多对一：门店信息（商家员工域权限体系升级 - 2026-01-12）
    ConsumptionRecord.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store',
      comment: '关联门店信息（消费发生门店）'
    })

    /*
     * 一对多：一个消费记录可以关联多个审核记录
     * 注意：审核记录存储在content_review_records表中
     */
    ConsumptionRecord.hasMany(models.ContentReviewRecord, {
      foreignKey: 'auditable_id',
      constraints: false,
      scope: {
        auditable_type: 'consumption'
      },
      as: 'review_records',
      comment: '关联的审核记录'
    })

    /**
     * AssetTransaction 关联说明：
     * 引用信息存储在 AssetTransaction.meta JSON 字段中
     * meta: { reference_type: 'consumption', reference_id: record_id, ... }
     */
  }

  /**
   * 获取状态的友好显示名称
   * @returns {string} 状态显示名称
   */
  getStatusName() {
    const statusNames = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝',
      expired: '已过期'
    }
    return statusNames[this.status] || '未知状态'
  }

  /**
   * 获取状态颜色（用于前端显示）
   * @returns {string} 状态颜色
   */
  getStatusColor() {
    const statusColors = {
      pending: 'warning',
      approved: 'success',
      rejected: 'error',
      expired: 'info'
    }
    return statusColors[this.status] || 'default'
  }

  /**
   * 检查是否为待审核状态
   * @returns {boolean} 是否为待审核
   */
  isPending() {
    return this.status === 'pending'
  }

  /**
   * 检查是否已审核通过
   * @returns {boolean} 是否已通过
   */
  isApproved() {
    return this.status === 'approved'
  }

  /**
   * 检查是否已拒绝
   * @returns {boolean} 是否已拒绝
   */
  isRejected() {
    return this.status === 'rejected'
  }

  /**
   * 检查是否已过期
   * @returns {boolean} 是否已过期
   */
  isExpired() {
    return this.status === 'expired'
  }

  /**
   * 计算预计奖励积分（1元=1分，四舍五入）
   * @returns {number} 预计奖励积分
   */
  calculateRewardPoints() {
    return Math.round(parseFloat(this.consumption_amount || 0))
  }

  /*
   * ========================================
   * 异常检测实例方法（P1 阶段 - 2026-01-31）
   * ========================================
   */

  /**
   * 检查是否为异常记录
   * @returns {boolean} 是否存在异常标记
   */
  isAnomaly() {
    const flags = this.anomaly_flags || []
    return Array.isArray(flags) && flags.length > 0
  }

  /**
   * 获取异常风险等级
   * @returns {string} 风险等级名称：normal/low/medium/high
   */
  getAnomalyLevel() {
    const score = this.anomaly_score || 0
    if (score === 0) return 'normal'
    if (score <= 30) return 'low'
    if (score <= 60) return 'medium'
    return 'high'
  }

  /**
   * 获取异常风险等级颜色（用于前端展示）
   * @returns {string} 颜色代码
   */
  getAnomalyColor() {
    const level = this.getAnomalyLevel()
    const colors = {
      normal: '#52c41a', // 绿色-正常
      low: '#faad14', // 黄色-低风险
      medium: '#fa8c16', // 橙色-中风险
      high: '#f5222d' // 红色-高风险
    }
    return colors[level] || colors.normal
  }

  /**
   * 获取异常标记的中文描述
   * @returns {string[]} 异常标记的中文描述数组
   */
  getAnomalyDescriptions() {
    const flags = this.anomaly_flags || []
    const descriptions = {
      large_amount: '大额消费（>¥500）',
      high_frequency: '高频消费（24h>5次）',
      new_user_large: '新用户大额（注册<7天且>¥100）',
      cross_store: '跨店消费'
    }
    return flags.map(flag => descriptions[flag] || flag)
  }

  /**
   * 验证消费记录的有效性
   * @returns {Object} 验证结果
   */
  validateRecord() {
    const errors = []
    const warnings = []

    // 检查消费金额
    if (!this.consumption_amount || this.consumption_amount <= 0) {
      errors.push('消费金额必须大于0')
    }

    // 检查二维码格式（V2 动态码）
    if (!this.qr_code || !this.qr_code.startsWith('QRV2_')) {
      errors.push('二维码格式不正确，必须以 QRV2_ 开头')
    }

    // 检查用户ID
    if (!this.user_id) {
      errors.push('用户ID不能为空')
    }

    // 检查商家ID
    if (!this.merchant_id) {
      warnings.push('商家ID为空，可能影响数据追溯')
    }

    // 检查积分计算
    const expectedPoints = this.calculateRewardPoints()
    if (this.points_to_award !== expectedPoints) {
      warnings.push(`积分计算可能不正确：记录${this.points_to_award}分，计算${expectedPoints}分`)
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * 检查是否可以审核
   * @returns {Object} 可审核性检查结果
   */
  canBeReviewed() {
    const reasons = []

    if (!this.isPending()) {
      reasons.push(`当前状态为${this.getStatusName()}，只有待审核状态才能进行审核`)
    }

    if (this.reviewed_by) {
      reasons.push('该记录已被审核过')
    }

    return {
      can_review: reasons.length === 0,
      reasons
    }
  }

  /**
   * 获取记录的年龄（创建多久了）
   * @returns {string} 友好的时间显示
   */
  getAge() {
    if (!this.created_at) return '未知'
    return BeijingTimeHelper.formatRelativeTime(this.created_at)
  }

  /**
   * 获取审核耗时（从创建到审核完成）
   * @returns {string|null} 审核耗时（友好显示）
   */
  getReviewDuration() {
    if (!this.reviewed_at) return null
    const durationMs = BeijingTimeHelper.timeDiff(this.created_at, this.reviewed_at)
    return BeijingTimeHelper.formatDuration(durationMs)
  }

  /**
   * 转换为API响应格式（数据脱敏）
   * @returns {Object} API响应对象
   */
  toAPIResponse() {
    // 基础响应数据
    const response = {
      id: parseInt(this.record_id), // 通用id字段（数据脱敏）
      record_id: parseInt(this.record_id), // 保留业务字段（确保返回数字类型）
      user_id: this.user_id,
      merchant_id: this.merchant_id,
      store_id: this.store_id, // 门店ID（商家员工域权限体系升级 - 2026-01-12）
      consumption_amount: parseFloat(this.consumption_amount),
      points_to_award: this.points_to_award,
      status: this.status,
      status_name: this.getStatusName(),
      status_color: this.getStatusColor(),
      final_status: this.final_status, // V4.7 业务最终状态（中文化显示名称系统 - 2026-01-22）
      qr_code: this.qr_code,
      merchant_notes: this.merchant_notes,
      admin_notes: this.admin_notes,
      reviewed_by: this.reviewed_by,
      reviewed_at: this.reviewed_at ? BeijingTimeHelper.formatForAPI(this.reviewed_at) : null,
      created_at: BeijingTimeHelper.formatForAPI(this.created_at),
      updated_at: BeijingTimeHelper.formatForAPI(this.updated_at),
      age: this.getAge(),
      review_duration: this.getReviewDuration(),
      // 异常检测字段（P1 阶段 - 2026-01-31）
      anomaly_flags: this.anomaly_flags || [],
      anomaly_score: this.anomaly_score || 0,
      is_anomaly: this.isAnomaly()
    }

    // 关联的用户信息（消费用户）- 通过include查询时可用
    if (this.user) {
      response.user_mobile = this.user.mobile || null
      response.user_nickname = this.user.nickname || null
    }

    // 关联的商家信息
    if (this.merchant) {
      response.merchant_mobile = this.merchant.mobile || null
      response.merchant_nickname = this.merchant.nickname || null
    }

    // 关联的审核员信息
    if (this.reviewer) {
      response.reviewer_nickname = this.reviewer.nickname || null
    }

    // 关联的门店信息（商家员工域权限体系升级 - 2026-01-12）
    if (this.store) {
      response.store_name = this.store.store_name || null
      response.store_code = this.store.store_code || null
    }

    return response
  }

  /**
   * 转换为简化的API响应格式（列表页使用）
   * @returns {Object} 简化的API响应对象
   */
  toSimpleAPIResponse() {
    return {
      id: this.record_id,
      consumption_amount: parseFloat(this.consumption_amount),
      points_to_award: this.points_to_award,
      status: this.status,
      status_name: this.getStatusName(),
      created_at: BeijingTimeHelper.formatForAPI(this.created_at).iso,
      age: this.getAge()
    }
  }
}

/**
 * 模型初始化配置
 * @param {Object} sequelize - Sequelize实例
 * @returns {Model} 初始化后的ConsumptionRecord模型
 */
module.exports = sequelize => {
  ConsumptionRecord.init(
    {
      /*
       * ========================================
       * 主键
       * ========================================
       */
      record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '消费记录ID（主键）'
      },

      /*
       * ========================================
       * 用户和商家信息
       * ========================================
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（消费者，外键关联users表）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },

      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '商家ID（录入人，外键关联users表，可为空）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },

      /**
       * 门店ID（商家员工域权限体系升级 - 2026-01-12）
       * 用于多门店管理和门店级权限验证
       */
      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // 初始允许 NULL（兼容历史数据）
        comment: '门店ID（外键关联 stores 表，用于多门店管理和权限验证）',
        references: {
          model: 'stores',
          key: 'store_id'
        },
        onDelete: 'RESTRICT', // 禁止删除有消费记录的门店
        onUpdate: 'CASCADE'
      },

      /*
       * ========================================
       * 消费和积分信息
       * ========================================
       */
      consumption_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '消费金额（单位：元），用于计算奖励积分',
        validate: {
          min: 0.01,
          max: 99999.99
        },
        /**
         * 获取消费金额，将DECIMAL转换为浮点数
         * @returns {number} 消费金额（元）
         */
        get() {
          const value = this.getDataValue('consumption_amount')
          return value ? parseFloat(value) : 0
        }
      },

      points_to_award: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment:
          '预计奖励积分数（单位：分），计算规则：Math.round(consumption_amount)，即1元=1分，四舍五入',
        validate: {
          min: 1
        }
      },

      /*
       * ========================================
       * 状态管理
       * ========================================
       */
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态：pending-待审核，approved-已通过，rejected-已拒绝，expired-已过期',
        validate: {
          isIn: [['pending', 'approved', 'rejected', 'expired']]
        }
      },

      /*
       * ========================================
       * 二维码信息
       * ========================================
       */
      qr_code: {
        type: DataTypes.STRING(300),
        allowNull: false,
        comment: '用户动态二维码（v2格式: QRV2_{base64_payload}_{signature}，约200-250字符）',
        validate: {
          notEmpty: true,
          len: [1, 300]
        }
      },

      /*
       * ========================================
       * 幂等键（业界标准形态 - 2026-01-02）
       * ========================================
       */
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（业界标准命名），用于防止重复提交，客户端通过 Header Idempotency-Key 传入',
        validate: {
          notEmpty: {
            msg: '幂等键不能为空'
          },
          len: {
            args: [1, 100],
            msg: '幂等键长度必须在1-100字符之间'
          }
        }
      },

      /**
       * 业务唯一键（business_id）- 事务边界治理（2026-01-05）
       *
       * 与 idempotency_key 的区别：
       * - idempotency_key：请求级幂等（防止同一请求重复提交）
       * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
       *
       * 格式：consumption_{merchant_id}_{timestamp}_{random}
       *
       * @see docs/事务边界治理现状核查报告.md 建议9.1
       */
      business_id: {
        type: DataTypes.STRING(150),
        allowNull: false, // 业务唯一键必填（历史数据已回填完成 - 2026-01-05）
        unique: true,
        comment: '业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）- 必填'
      },

      /**
       * 关联奖励积分流水ID（逻辑外键，用于对账）
       *
       * 事务边界治理（2026-01-05）：
       * - 审核通过后发放奖励积分时，记录对应的 asset_transactions.transaction_id
       * - 用于定时对账脚本检查数据一致性
       * - 审核拒绝或待审核时为 NULL
       * - 不使用物理外键约束，支持未来分库分表
       */
      reward_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: true, // 审核拒绝或待审核时为 NULL
        comment: '关联奖励积分流水ID（逻辑外键，用于对账，审核通过后填充）'
      },

      /*
       * ========================================
       * 备注信息
       * ========================================
       */
      merchant_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商家备注（录入时填写）'
      },

      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '平台审核备注（审核员填写）'
      },

      /*
       * ========================================
       * 审核信息
       * ========================================
       */
      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核员ID（谁审核的？外键关联users表）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },

      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间（什么时候审核的？），时区：北京时间（GMT+8）'
      },

      /*
       * ========================================
       * 业务结果态字段（2026-01-09 功能重复检查报告决策）
       * ========================================
       */
      final_status: {
        type: DataTypes.ENUM('pending_review', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending_review',
        comment: '业务最终状态（审批通过/拒绝后落地）'
      },

      settled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结算时间（审批完成时落地，北京时间）'
      },

      /*
       * ========================================
       * 时间戳（自动管理）
       * ========================================
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（记录提交时间），时区：北京时间（GMT+8）'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（最后修改时间），时区：北京时间（GMT+8）'
      },

      /*
       * ========================================
       * 软删除字段（API#7统一软删除机制）
       * ========================================
       */
      is_deleted: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）'
      },

      deleted_at: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        comment: '删除时间（软删除时记录，管理员恢复时清空），时区：北京时间（GMT+8）'
      },

      /*
       * ========================================
       * 异常检测字段（P1 阶段 - 2026-01-31）
       * 用于消费审核的异常标记和风险评分
       * ========================================
       */

      /**
       * 异常标记 JSON 数组
       * 存储检测到的异常类型列表
       * 可能的值：
       * - large_amount: 大额消费（>¥500）
       * - high_frequency: 高频消费（24h内>5次）
       * - new_user_large: 新用户大额（注册<7天且>¥100）
       * - cross_store: 跨店消费（同日多店消费）
       */
      anomaly_flags: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '异常标记JSON数组，如["large_amount","high_frequency"]'
      },

      /**
       * 异常评分（0-100）
       * 分数越高越可疑，用于排序和筛选
       * 评分规则：
       * - 0: 正常
       * - 1-30: 低风险
       * - 31-60: 中风险
       * - 61-100: 高风险
       */
      anomaly_score: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '异常评分 0-100，0=正常，分数越高越可疑'
      }
    },
    {
      sequelize,
      modelName: 'ConsumptionRecord',
      tableName: 'consumption_records',
      timestamps: true, // 自动管理created_at和updated_at
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true, // 使用蛇形命名（snake_case）
      paranoid: false, // 不使用软删除
      comment: '消费记录表（商家扫码录入方案A）',

      // 索引定义（与数据库迁移保持一致）
      indexes: [
        {
          name: 'uk_consumption_records_idempotency_key',
          fields: ['idempotency_key'],
          unique: true,
          comment: '幂等键唯一索引，用于防止重复提交（业界标准形态）'
        },
        {
          name: 'uk_consumption_records_business_id',
          fields: ['business_id'],
          unique: true,
          comment: '业务唯一键索引（用于业务级幂等保护）'
        },
        {
          name: 'idx_user_status',
          fields: ['user_id', 'status', 'created_at'],
          comment: '用户查询自己的消费记录（最常用查询）'
        },
        {
          name: 'idx_merchant_time',
          fields: ['merchant_id', 'created_at'],
          comment: '商家查询自己录入的记录'
        },
        {
          name: 'idx_status_created',
          fields: ['status', 'created_at'],
          comment: '平台审核查询待审核记录（核心审核功能）'
        },
        {
          name: 'idx_qr_code',
          fields: ['qr_code'],
          comment: '二维码追溯查询（防重复、安全审计）'
        },
        {
          name: 'idx_reviewed',
          fields: ['reviewed_by', 'reviewed_at'],
          comment: '审核员工作量统计'
        },
        // 门店级索引（商家员工域权限体系升级 - 2026-01-12）
        {
          name: 'idx_consumption_store_status',
          fields: ['store_id', 'status', 'created_at'],
          comment: '门店级消费记录查询（store_id + 状态 + 时间）'
        },
        {
          name: 'idx_consumption_store_merchant',
          fields: ['store_id', 'merchant_id', 'created_at'],
          comment: '门店+商家维度消费记录查询'
        },
        // 异常检测索引（P1 阶段 - 2026-01-31）
        {
          name: 'idx_anomaly_score',
          fields: ['anomaly_score'],
          comment: '异常评分索引，用于高风险记录筛选排序'
        },
        {
          name: 'idx_status_anomaly',
          fields: ['status', 'anomaly_score'],
          comment: '状态+异常评分复合索引，用于待审核高风险记录查询'
        }
      ],

      /*
       * ========================================
       * Sequelize Scopes（查询作用域）
       * ========================================
       * 用途：自动过滤已删除记录，防止开发人员遗漏WHERE is_deleted=0
       * 参考文档：删除兑换记录API实施方案.md - 统一软删除机制
       */
      // 默认查询作用域：自动过滤已删除记录
      defaultScope: {
        where: {
          is_deleted: 0 // 所有查询默认只返回未删除的记录
        }
      },

      // Sequelize Scope定义（快捷查询）
      scopes: {
        // 包含已删除记录的查询（管理员专用）
        includeDeleted: {
          where: {} // 查询所有记录，包括已删除的
        },

        // 只查询已删除的记录（管理员恢复功能专用）
        onlyDeleted: {
          where: {
            is_deleted: 1 // 只返回已删除的记录
          }
        },

        // 已删除的记录（管理员可查看和恢复）
        deleted: {
          where: { is_deleted: 1 }
        },

        // 待审核的记录（未删除）
        pending: {
          where: {
            status: 'pending',
            is_deleted: 0
          }
        },

        // 已通过的记录（未删除）
        approved: {
          where: {
            status: 'approved',
            is_deleted: 0
          }
        },

        // 已拒绝的记录（未删除）
        rejected: {
          where: {
            status: 'rejected',
            is_deleted: 0
          }
        },

        // 已过期的记录（未删除）
        expired: {
          where: {
            status: 'expired',
            is_deleted: 0
          }
        },

        // 包含用户信息
        withUser: {
          include: [
            {
              association: 'user',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            }
          ]
        },

        // 包含商家信息
        withMerchant: {
          include: [
            {
              association: 'merchant',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            }
          ]
        },

        // 包含审核员信息
        withReviewer: {
          include: [
            {
              association: 'reviewer',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            }
          ]
        },

        // 包含门店信息（商家员工域权限体系升级 - 2026-01-12）
        withStore: {
          include: [
            {
              association: 'store',
              attributes: ['store_id', 'store_name', 'store_code', 'status']
            }
          ]
        },

        /**
         * AssetTransaction 查询说明：
         * 通过 AssetTransaction.meta 字段查询关联记录
         */

        // 完整信息（包含所有关联）
        full: {
          include: [
            {
              association: 'user',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            },
            {
              association: 'merchant',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            },
            {
              association: 'reviewer',
              attributes: ['user_id', 'mobile', 'nickname', 'role']
            }
            /*
             * ⚠️ points_transaction 已移除（2026-01-02）
             * 新架构中通过 meta 字段查询 AssetTransaction
             */
          ]
        },

        /*
         * ========================================
         * 异常检测查询 Scopes（P1 阶段 - 2026-01-31）
         * ========================================
         */

        /**
         * 存在异常标记的记录
         * 用于筛选所有被标记为异常的消费记录
         */
        withAnomalies: {
          where: {
            anomaly_score: { [require('sequelize').Op.gt]: 0 },
            is_deleted: 0
          }
        },

        /**
         * 高风险记录（评分 > 60）
         * 用于优先审核处理
         */
        highRisk: {
          where: {
            anomaly_score: { [require('sequelize').Op.gt]: 60 },
            is_deleted: 0
          }
        },

        /**
         * 中风险记录（评分 31-60）
         */
        mediumRisk: {
          where: {
            anomaly_score: { [require('sequelize').Op.between]: [31, 60] },
            is_deleted: 0
          }
        },

        /**
         * 低风险记录（评分 1-30）
         */
        lowRisk: {
          where: {
            anomaly_score: { [require('sequelize').Op.between]: [1, 30] },
            is_deleted: 0
          }
        },

        /**
         * 待审核 + 高风险（优先处理）
         */
        pendingHighRisk: {
          where: {
            status: 'pending',
            anomaly_score: { [require('sequelize').Op.gt]: 60 },
            is_deleted: 0
          }
        }
      },

      // 模型级验证
      validate: {
        /**
         * 验证积分计算是否正确
         * 业务规则：消费金额（元）四舍五入 = 奖励积分（分）
         * @returns {void}
         * @throws {Error} 当积分计算不正确时抛出错误
         */
        validatePointsCalculation() {
          const expected = Math.round(parseFloat(this.consumption_amount || 0))
          if (this.points_to_award !== expected) {
            throw new Error(
              `积分计算不正确：消费${this.consumption_amount}元，应奖励${expected}分，但记录为${this.points_to_award}分`
            )
          }
        },

        /**
         * 验证审核信息完整性
         * 业务规则：已审核的记录必须有审核员和审核时间
         * @returns {void}
         * @throws {Error} 当审核信息不完整时抛出错误
         */
        validateReviewInfo() {
          if (this.status === 'approved' || this.status === 'rejected') {
            if (!this.reviewed_by) {
              throw new Error('已审核的记录必须有审核员信息')
            }
            if (!this.reviewed_at) {
              throw new Error('已审核的记录必须有审核时间')
            }
          }
        }
      },

      // 钩子函数
      hooks: {
        /**
         * 创建前钩子：自动计算积分
         * 业务逻辑：如果未指定points_to_award，则根据消费金额自动计算
         * @param {ConsumptionRecord} record - 消费记录实例
         * @param {Object} _options - Sequelize操作选项
         * @returns {Promise<void>} 无返回值
         */
        beforeCreate: async (record, _options) => {
          if (!record.points_to_award) {
            record.points_to_award = record.calculateRewardPoints()
          }
        },

        /**
         * 保存前钩子：设置北京时间
         * 业务逻辑：确保时间戳使用北京时间（GMT+8）
         * @param {ConsumptionRecord} record - 消费记录实例
         * @param {Object} _options - Sequelize操作选项
         * @returns {void}
         */
        beforeSave: (record, _options) => {
          if (!record.created_at) {
            record.created_at = BeijingTimeHelper.createDatabaseTime()
          }
          record.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  return ConsumptionRecord
}
