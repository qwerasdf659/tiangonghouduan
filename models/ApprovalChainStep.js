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
      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '该步所属门店（来源 consumption_records.store_id），门店隔离校验与统计免回查'
      },
      approve_mode: {
        type: DataTypes.ENUM('single', 'countersign'),
        allowNull: false,
        defaultValue: 'single',
        comment: '审批模式（实例化时从节点固化）：single=单签，countersign=会签'
      },
      required_approvals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '会签需通过人数（实例化时从节点固化，single 恒为 1）'
      },
      approved_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '会签已通过人数（凑够 required_approvals 才推进）'
      },
      is_escalated: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否越级/超时升级代审（1=该步由上级越级或超时转交代审）'
      },
      original_assignee_role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '越级时原应审角色ID（留痕，记录本应由谁审）'
      },
      escalated_from_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '由谁超时/越级转交而来（留痕，记录原审核人）'
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
    /** 会签子记录（一步多人审批） */
    ApprovalChainStep.hasMany(models.ApprovalChainStepAction, {
      foreignKey: 'step_id',
      as: 'actions'
    })
  }

  return ApprovalChainStep
}
