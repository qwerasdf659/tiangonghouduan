/**
 * 审核链步骤执行记录模型（ApprovalChainStep）
 *
 * 业务场景：记录审核链实例中每个步骤的执行状态和审核意见
 * 状态流转：waiting → pending → approved/rejected/skipped/timeout
 *
 * 角色池模式：assignee_role_id 不为空时，该角色下任何用户都可审核（先到先得）
 * 指定人模式：assignee_user_id 不为空时，只有指定用户可审核
 *
 * @module models/ApprovalChainStep
 * @table approval_chain_steps
 */
const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ApprovalChainStep = sequelize.define(
    'ApprovalChainStep',
    {
      step_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '步骤ID'
      },
      instance_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属实例'
      },
      node_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '对应的节点定义'
      },
      step_number: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '步骤编号'
      },
      assignee_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '实际被分配的审核人'
      },
      assignee_role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分配的角色（角色池模式）'
      },
      status: {
        type: DataTypes.ENUM('waiting', 'pending', 'approved', 'rejected', 'skipped', 'timeout'),
        allowNull: false,
        comment: '步骤状态'
      },
      action_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '审批意见'
      },
      actioned_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '实际操作人'
      },
      actioned_at: {
        type: DataTypes.DATE,
        allowNull: true,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('actioned_at'))
        },
        comment: '操作时间'
      },
      is_final: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '是否终审步骤'
      },
      timeout_at: {
        type: DataTypes.DATE,
        allowNull: true,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('timeout_at'))
        },
        comment: '超时截止时间'
      },
      auto_approved: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否自动审批通过'
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
      tableName: 'approval_chain_steps',
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
  ApprovalChainStep.associate = models => {
    ApprovalChainStep.belongsTo(models.ApprovalChainInstance, {
      foreignKey: 'instance_id',
      as: 'instance'
    })
    ApprovalChainStep.belongsTo(models.ApprovalChainNode, {
      foreignKey: 'node_id',
      as: 'node'
    })
    ApprovalChainStep.belongsTo(models.User, {
      foreignKey: 'assignee_user_id',
      as: 'assignee'
    })
    ApprovalChainStep.belongsTo(models.Role, {
      foreignKey: 'assignee_role_id',
      as: 'assigned_role'
    })
    ApprovalChainStep.belongsTo(models.User, {
      foreignKey: 'actioned_by',
      as: 'actor'
    })
  }

  return ApprovalChainStep
}
