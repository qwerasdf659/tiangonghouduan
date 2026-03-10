/**
 * 审核链模板模型（ApprovalChainTemplate）
 *
 * 业务场景：定义审核流程的模板，一个业务类型可对应多个模板（按优先级和条件匹配）
 * 设计模式：配置实体，低频变更，运营在管理后台维护
 *
 * 匹配逻辑：业务提交时按 auditable_type + match_conditions + priority DESC 选择模板
 * 例如：消费 ¥300 → 匹配到 consumption_large（min_amount:200, priority:10）
 *       消费 ¥50  → 匹配到 consumption_default（无条件, priority:0 兜底）
 *
 * @module models/ApprovalChainTemplate
 * @table approval_chain_templates
 */
const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const ApprovalChainTemplate = sequelize.define(
    'ApprovalChainTemplate',
    {
      template_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '模板ID'
      },
      template_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '模板编码（如 consumption_default）'
      },
      template_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板名称（如"消费审核-标准链"）'
      },
      auditable_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '关联业务类型（consumption/merchant_points/exchange）'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '描述'
      },
      total_nodes: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '审核节点数（1-8，不含提交节点）'
      },
      is_active: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '是否启用'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级（数值越大优先级越高）'
      },
      match_conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '匹配条件（JSON，如 {"min_amount":200, "store_ids":[7,8]}）'
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人（user_id）'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        /** @returns {string} 格式化时间 */
        get() {
          return BeijingTimeHelper.formatForAPI(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'approval_chain_templates',
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
  ApprovalChainTemplate.associate = models => {
    ApprovalChainTemplate.hasMany(models.ApprovalChainNode, {
      foreignKey: 'template_id',
      as: 'nodes'
    })
    ApprovalChainTemplate.hasMany(models.ApprovalChainInstance, {
      foreignKey: 'template_id',
      as: 'instances'
    })
    ApprovalChainTemplate.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })
  }

  return ApprovalChainTemplate
}
