/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 消费记录模型（ConsumptionRecord）
 *
 * 业务场景：商家扫码录入方案A - 消费奖励业务流程
 *
 * 核心功能：
 * - 记录用户通过商家扫码提交的消费记录
 * - 支持待审核→已通过/已拒绝/已过期的状态流转
 * - 与content_review_records表配合实现审核功能
 * - 审核通过后自动奖励积分（通过PointsService）
 *
 * 业务流程：
 * 1. 用户出示固定身份码（QR_{user_id}_{signature}）
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
 * 最后更新：2025年10月30日
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
  static associate (models) {
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

    /*
     * 一对一：一个消费记录对应一个积分交易记录（审核通过后）
     * 注意：通过reference_type='consumption' + reference_id=record_id关联
     */
    ConsumptionRecord.hasOne(models.PointsTransaction, {
      foreignKey: 'reference_id',
      constraints: false,
      scope: {
        reference_type: 'consumption'
      },
      as: 'points_transaction',
      comment: '关联的积分交易记录'
    })
  }

  /**
   * 获取状态的友好显示名称
   * @returns {string} 状态显示名称
   */
  getStatusName () {
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
  getStatusColor () {
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
  isPending () {
    return this.status === 'pending'
  }

  /**
   * 检查是否已审核通过
   * @returns {boolean} 是否已通过
   */
  isApproved () {
    return this.status === 'approved'
  }

  /**
   * 检查是否已拒绝
   * @returns {boolean} 是否已拒绝
   */
  isRejected () {
    return this.status === 'rejected'
  }

  /**
   * 检查是否已过期
   * @returns {boolean} 是否已过期
   */
  isExpired () {
    return this.status === 'expired'
  }

  /**
   * 计算预计奖励积分（1元=1分，四舍五入）
   * @returns {number} 预计奖励积分
   */
  calculateRewardPoints () {
    return Math.round(parseFloat(this.consumption_amount || 0))
  }

  /**
   * 验证消费记录的有效性
   * @returns {Object} 验证结果
   */
  validateRecord () {
    const errors = []
    const warnings = []

    // 检查消费金额
    if (!this.consumption_amount || this.consumption_amount <= 0) {
      errors.push('消费金额必须大于0')
    }

    // 检查二维码格式
    if (!this.qr_code || !this.qr_code.startsWith('QR_')) {
      errors.push('二维码格式不正确')
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
  canBeReviewed () {
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
  getAge () {
    if (!this.created_at) return '未知'
    return BeijingTimeHelper.formatRelativeTime(this.created_at)
  }

  /**
   * 获取审核耗时（从创建到审核完成）
   * @returns {string|null} 审核耗时（友好显示）
   */
  getReviewDuration () {
    if (!this.reviewed_at) return null
    const durationMs = BeijingTimeHelper.timeDiff(this.created_at, this.reviewed_at)
    return BeijingTimeHelper.formatDuration(durationMs)
  }

  /**
   * 转换为API响应格式（数据脱敏）
   * @returns {Object} API响应对象
   */
  toAPIResponse () {
    return {
      id: parseInt(this.record_id), // 通用id字段（数据脱敏）
      record_id: parseInt(this.record_id), // 保留业务字段（确保返回数字类型）
      user_id: this.user_id,
      merchant_id: this.merchant_id,
      consumption_amount: parseFloat(this.consumption_amount),
      points_to_award: this.points_to_award,
      status: this.status,
      status_name: this.getStatusName(),
      status_color: this.getStatusColor(),
      qr_code: this.qr_code,
      merchant_notes: this.merchant_notes,
      admin_notes: this.admin_notes,
      reviewed_by: this.reviewed_by,
      reviewed_at: this.reviewed_at ? BeijingTimeHelper.formatForAPI(this.reviewed_at) : null,
      created_at: BeijingTimeHelper.formatForAPI(this.created_at),
      updated_at: BeijingTimeHelper.formatForAPI(this.updated_at),
      age: this.getAge(),
      review_duration: this.getReviewDuration()
    }
  }

  /**
   * 转换为简化的API响应格式（列表页使用）
   * @returns {Object} 简化的API响应对象
   */
  toSimpleAPIResponse () {
    return {
      id: this.record_id,
      consumption_amount: parseFloat(this.consumption_amount),
      points_to_award: this.points_to_award,
      status: this.status,
      status_name: this.getStatusName(),
      created_at: BeijingTimeHelper.toBeijingTime(this.created_at),
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
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '用户固定身份码（格式：QR_{user_id}_{signature}）',
        validate: {
          notEmpty: true,
          len: [1, 100]
        }
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
        }
      ],

      // Sequelize Scope定义（快捷查询）
      scopes: {
        // 未删除的记录（前端只负责数据展示，默认过滤已删除记录）
        notDeleted: {
          where: { is_deleted: 0 }
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

        // 包含积分交易记录
        withPointsTransaction: {
          include: [
            {
              association: 'points_transaction',
              required: false
            }
          ]
        },

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
            },
            {
              association: 'points_transaction',
              required: false
            }
          ]
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
        validatePointsCalculation () {
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
        validateReviewInfo () {
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
