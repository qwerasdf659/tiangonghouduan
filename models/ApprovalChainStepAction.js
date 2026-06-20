/**
 * 审核链会签子记录模型（ApprovalChainStepAction）
 *
 * 业务场景：会签节点（approve_mode='countersign'）需"一个步骤多人审批"，
 * 每个审核人的 approve/reject 动作各记一条；凑够 step.required_approvals 个 approve 才推进，
 * 任一 reject 整体拒绝。子表累加而非塞 JSON，便于审计 + 并发安全（DB 唯一约束兜底）。
 *
 * 单签节点（approve_mode='single'）也会写一条，保持审批留痕统一。
 *
 * @module models/ApprovalChainStepAction
 * @table approval_chain_step_actions
 */
const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ApprovalChainStepAction = sequelize.define(
    'ApprovalChainStepAction',
    {
      step_action_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '会签子记录主键ID'
      },
      step_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属审核步骤ID（外键 → approval_chain_steps.step_id）'
      },
      actioned_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '审核操作人 user_id'
      },
      action: {
        type: DataTypes.ENUM('approve', 'reject'),
        allowNull: false,
        comment: '审核动作：approve=通过，reject=拒绝'
      },
      action_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '审批意见'
      },
      is_escalated: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '该条审批是否为越级/超时代审'
      },
      actioned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string} 格式化时间（北京时间） */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('actioned_at'))
        },
        comment: '审核时间（北京时间）'
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
      tableName: 'approval_chain_step_actions',
      timestamps: true,
      underscored: true,
      freezeTableName: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        { unique: true, fields: ['step_id', 'actioned_by'], name: 'uk_step_actor' },
        { fields: ['step_id'], name: 'idx_acsa_step' }
      ]
    }
  )

  /**
   * @param {Object} models - Sequelize models
   * @returns {void} 设置关联
   */
  ApprovalChainStepAction.associate = models => {
    ApprovalChainStepAction.belongsTo(models.ApprovalChainStep, {
      foreignKey: 'step_id',
      as: 'step'
    })
    ApprovalChainStepAction.belongsTo(models.User, {
      foreignKey: 'actioned_by',
      as: 'actor'
    })
  }

  return ApprovalChainStepAction
}
