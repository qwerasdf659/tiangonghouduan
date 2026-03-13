/**
 * 审核链节点定义模型（ApprovalChainNode）
 *
 * 业务场景：定义审核链模板中每个审核步骤的规则
 * 分配方式：
 *   - role: 按角色分配（角色池模式，该角色的任何用户都可审核）
 *   - user: 指定具体用户审核
 *   - submitter_manager: 利用 store_staff 表自动查找提交人所在门店的 manager
 *
 * @module models/ApprovalChainNode
 * @table approval_chain_nodes
 */
const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ApprovalChainNode = sequelize.define(
    'ApprovalChainNode',
    {
      node_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '节点ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属模板'
      },
      step_number: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '步骤编号（1=提交位，2-9=审核位）'
      },
      node_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '节点名称（如"店长初审"）'
      },
      assignee_type: {
        type: DataTypes.ENUM('role', 'user', 'submitter_manager'),
        allowNull: false,
        comment: '分配方式'
      },
      assignee_role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '按角色分配时的角色ID'
      },
      assignee_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '按指定人分配时的用户ID'
      },
      is_final: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '是否终审节点'
      },
      auto_approve_enabled: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否启用自动审批'
      },
      auto_approve_conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '自动审批条件'
      },
      timeout_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 12,
        comment: '超时小时数（默认12小时）'
      },
      timeout_action: {
        type: DataTypes.ENUM('none', 'auto_approve', 'escalate', 'notify'),
        allowNull: false,
        defaultValue: 'escalate',
        comment: '超时动作（非终审默认escalate，终审默认notify）'
      },
      escalate_to_node: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '超时升级到的节点'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序'
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
      tableName: 'approval_chain_nodes',
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
  ApprovalChainNode.associate = models => {
    ApprovalChainNode.belongsTo(models.ApprovalChainTemplate, {
      foreignKey: 'template_id',
      as: 'template'
    })
    ApprovalChainNode.belongsTo(models.Role, {
      foreignKey: 'assignee_role_id',
      as: 'assignee_role'
    })
    ApprovalChainNode.belongsTo(models.User, {
      foreignKey: 'assignee_user_id',
      as: 'assignee_user'
    })
    /** 超时升级目标节点（自引用关联） */
    ApprovalChainNode.belongsTo(models.ApprovalChainNode, {
      foreignKey: 'escalate_to_node',
      as: 'escalateTarget',
      constraints: false
    })
  }

  return ApprovalChainNode
}
