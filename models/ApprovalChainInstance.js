/**
 * 审核链实例模型（ApprovalChainInstance）
 *
 * 业务场景：每次业务提交审核时，匹配模板并创建一个实例，跟踪整个审核流程的进度
 * 生命周期：in_progress → completed/rejected/cancelled/timeout
 *
 * 幂等控制：idempotency_key = `approval_chain:${auditable_type}:${auditable_id}`
 * 业务快照：business_snapshot 保存提交时的数据，确保审核时参考的是提交时的状态
 *
 * @module models/ApprovalChainInstance
 * @table approval_chain_instances
 */
const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ApprovalChainInstance = sequelize.define(
    'ApprovalChainInstance',
    {
      instance_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '实例ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '使用的模板'
      },
      auditable_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '业务类型'
      },
      auditable_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '业务记录ID'
      },
      content_review_record_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联的审核记录'
      },
      current_step: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '当前进行到的步骤'
      },
      total_steps: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '总步骤数'
      },
      status: {
        type: DataTypes.ENUM('in_progress', 'completed', 'rejected', 'cancelled', 'timeout'),
        allowNull: false,
        comment: '整体状态'
      },
      submitted_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '提交人'
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('submitted_at'))
        },
        comment: '提交时间'
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('completed_at'))
        },
        comment: '完成时间'
      },
      final_result: {
        type: DataTypes.ENUM('approved', 'rejected'),
        allowNull: true,
        comment: '最终结果'
      },
      final_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '最终审批意见'
      },
      business_snapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '提交时的业务数据快照'
      },
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('created_at'))
        }
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('updated_at'))
        }
      }
    },
    {
      tableName: 'approval_chain_instances',
      timestamps: true,
      underscored: true,
      freezeTableName: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  )

  /**
   * @param {Object} models - Sequelize models
   * @returns {void} 设置关联
   */
  ApprovalChainInstance.associate = models => {
    ApprovalChainInstance.belongsTo(models.ApprovalChainTemplate, {
      foreignKey: 'template_id',
      as: 'template'
    })
    ApprovalChainInstance.hasMany(models.ApprovalChainStep, {
      foreignKey: 'instance_id',
      as: 'steps'
    })
    ApprovalChainInstance.belongsTo(models.ContentReviewRecord, {
      foreignKey: 'content_review_record_id',
      as: 'review_record'
    })
    ApprovalChainInstance.belongsTo(models.User, {
      foreignKey: 'submitted_by',
      as: 'submitter'
    })
  }

  return ApprovalChainInstance
}
