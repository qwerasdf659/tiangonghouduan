/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 内容审核记录模型（ContentReviewRecord）
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 ContentReviewRecord（内容审核记录），不是 AdminOperationLog（管理员操作日志）
 *
 * 📋 ContentReviewRecord vs AdminOperationLog 核心区别：
 *
 * ✅ ContentReviewRecord（本模型）：内容审核记录 - 管理业务审核流程
 *    - 概念：记录"需要人工审核的业务内容"的审核状态
 *    - 特点：有状态流转，可修改状态（pending→approved/rejected）
 *    - 数据状态：可修改审核状态和审核意见
 *    - 业务流程：pending（待审核）→ approved/rejected（已审核）
 *    - 典型字段：auditor_id（审核员）、audit_status（审核状态）、audit_reason（审核意见）
 *    - 表名：content_review_records，主键：audit_id
 *
 * ❌ AdminOperationLog（另一个模型）：管理员操作日志 - 追溯管理员操作历史
 *    - 概念：记录"谁在什么时候做了什么操作"的日志
 *    - 特点：只增不改，永久保存，用于安全审计和责任追溯
 *    - 数据状态：不可修改、不可删除（immutable）
 *    - 业务流程：无状态变化，写入后就是最终状态
 *    - 典型字段：operator_id（操作员）、operation_type（操作类型）、before_data/after_data（前后数据对比）
 *    - 表名：admin_operation_logs，主键：log_id
 *
 * 📌 记忆口诀：
 * - ContentReviewRecord = 内容审核记录 = 流程管理 = 状态流转 = 待审核→已审核
 * - AdminOperationLog = 管理员操作日志 = 追溯历史 = 只增不改 = 谁做了什么
 *
 * 💡 实际业务示例：
 * - 用户提交兑换申请 → 创建ContentReviewRecord（状态：pending）
 * - 管理员审核通过申请 → 更新ContentReviewRecord（状态：approved），同时创建AdminOperationLog记录这个审核操作
 * - 即：ContentReviewRecord记录"申请的审核状态"，AdminOperationLog记录"管理员的审核操作"
 *
 * 功能说明：
 * - 提供统一的审核记录管理功能
 * - 支持多态关联（auditable_type + auditable_id）
 * - 支持多种审核类型：exchange（兑换）、image（图片）、feedback（反馈）等
 * - 记录审核状态、审核员、审核意见等信息
 *
 * 设计模式：
 * - 多态关联：一个审核记录表服务多种业务实体
 * - 回调机制：审核完成后触发业务回调处理
 *
 * 最后更新：2025-10-12（添加与AuditLog的详细区分说明）
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ContentReviewRecord = sequelize.define(
    'ContentReviewRecord',
    {
      // 主键
      content_review_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '审核记录ID'
      },

      // 多态关联字段
      auditable_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '审核对象类型（exchange/image/feedback等）'
      },
      auditable_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '审核对象ID'
      },

      // 审核状态
      audit_status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '审核状态：pending-待审核，approved-已通过，rejected-已拒绝，cancelled-已取消'
      },

      // 审核员信息
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

      // 审核数据（JSON格式，存储业务特定信息）
      audit_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '审核相关数据（JSON格式，存储业务特定信息）'
      },

      // 优先级
      priority: {
        type: DataTypes.ENUM('high', 'medium', 'low'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '审核优先级'
      },

      // 时间字段
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '提交审核时间',
        /**
         * 获取北京时间格式的提交审核时间
         * @returns {string|null} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          const value = this.getDataValue('submitted_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null
        }
      },
      audited_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核完成时间',
        /**
         * 获取北京时间格式的审核完成时间
         * @returns {string|null} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          const value = this.getDataValue('audited_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null
        }
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '创建时间',
        /**
         * 获取北京时间格式的创建时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        }
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '更新时间',
        /**
         * 获取北京时间格式的更新时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        }
      }
    },
    {
      sequelize,
      modelName: 'ContentReviewRecord',
      tableName: 'content_review_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '统一审核记录表',

      indexes: [
        {
          name: 'idx_audit_records_auditable',
          fields: ['auditable_type', 'auditable_id'],
          comment: '多态关联索引'
        },
        {
          name: 'idx_audit_records_status',
          fields: ['audit_status'],
          comment: '审核状态索引'
        },
        {
          name: 'idx_audit_records_auditor',
          fields: ['auditor_id'],
          comment: '审核员索引'
        },
        {
          name: 'idx_audit_records_priority_time',
          fields: ['priority', 'submitted_at'],
          comment: '优先级和时间复合索引'
        },
        {
          name: 'idx_audit_records_created',
          fields: ['created_at'],
          comment: '创建时间索引'
        }
      ],

      hooks: {
        beforeCreate: record => {
          if (!record.submitted_at) {
            record.submitted_at = BeijingTimeHelper.createDatabaseTime()
          }
          record.created_at = BeijingTimeHelper.createDatabaseTime()
          record.updated_at = BeijingTimeHelper.createDatabaseTime()
        },
        beforeUpdate: record => {
          record.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /**
   * 实例方法
   */

  /**
   * 检查是否待审核
   * @returns {boolean} true-待审核状态，false-其他状态
   */
  ContentReviewRecord.prototype.isPending = function () {
    return this.audit_status === 'pending'
  }

  /**
   * 检查是否已审核
   * @returns {boolean} true-已审核（approved/rejected/cancelled），false-待审核
   */
  ContentReviewRecord.prototype.isAudited = function () {
    return ['approved', 'rejected', 'cancelled'].includes(this.audit_status)
  }

  /**
   * 获取状态描述
   * @returns {string} 审核状态的中文描述（待审核/已通过/已拒绝/已取消/未知状态）
   */
  ContentReviewRecord.prototype.getStatusDescription = function () {
    const statusMap = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝',
      cancelled: '已取消'
    }
    return statusMap[this.audit_status] || '未知状态'
  }

  /**
   * 获取优先级描述
   * @returns {string} 优先级的中文描述（高/中/低/未知）
   */
  ContentReviewRecord.prototype.getPriorityDescription = function () {
    const priorityMap = {
      high: '高',
      medium: '中',
      low: '低'
    }
    return priorityMap[this.priority] || '未知'
  }

  /**
   * 关联关系定义
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  ContentReviewRecord.associate = function (models) {
    // 关联审核员（用户）
    ContentReviewRecord.belongsTo(models.User, {
      foreignKey: 'auditor_id',
      as: 'auditor',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return ContentReviewRecord
}
