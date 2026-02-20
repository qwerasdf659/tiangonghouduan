/**
 * 客服用户分配模型（CustomerServiceUserAssignment）
 *
 * 业务场景：记录用户被分配给哪个客服座席，实现持久化的用户-客服绑定关系
 *
 * 核心能力：
 * - 用户下次咨询自动路由到已分配的客服
 * - 支持分配转移（从一个客服转到另一个客服）
 * - 支持分配过期（定期清理不活跃的分配关系）
 * - 保留分配历史（transferred/expired 状态的记录）
 *
 * 表名：customer_service_user_assignments
 * 主键：customer_service_user_assignment_id
 * 外键：user_id → users.user_id, agent_id → customer_service_agents.customer_service_agent_id
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  /** 分配状态常量 */
  const ASSIGNMENT_STATUS = {
    ACTIVE: 'active', // 生效中
    EXPIRED: 'expired', // 已过期
    TRANSFERRED: 'transferred' // 已转移
  }

  const CustomerServiceUserAssignment = sequelize.define(
    'CustomerServiceUserAssignment',
    {
      customer_service_user_assignment_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '分配记录主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被分配的用户ID（客户）'
      },

      agent_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '分配到的客服座席ID'
      },

      assigned_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行分配操作的管理员ID'
      },

      status: {
        type: DataTypes.ENUM(
          ASSIGNMENT_STATUS.ACTIVE,
          ASSIGNMENT_STATUS.EXPIRED,
          ASSIGNMENT_STATUS.TRANSFERRED
        ),
        allowNull: false,
        defaultValue: ASSIGNMENT_STATUS.ACTIVE,
        comment: '分配状态'
      },

      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '分配备注说明'
      },

      expired_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（null 表示永不过期）'
      }
    },
    {
      tableName: 'customer_service_user_assignments',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['agent_id', 'status'], name: 'idx_cs_user_assign_agent' },
        { fields: ['status'], name: 'idx_cs_user_assign_status' }
      ],
      comment: '客服用户分配表'
    }
  )

  CustomerServiceUserAssignment.associate = function (models) {
    CustomerServiceUserAssignment.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    CustomerServiceUserAssignment.belongsTo(models.CustomerServiceAgent, {
      foreignKey: 'agent_id',
      as: 'agent'
    })

    CustomerServiceUserAssignment.belongsTo(models.User, {
      foreignKey: 'assigned_by',
      as: 'assigner'
    })
  }

  /**
   * 查询用户当前生效的分配
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object|null>} 生效的分配记录
   */
  CustomerServiceUserAssignment.findActiveByUserId = function (userId) {
    return this.findOne({
      where: { user_id: userId, status: ASSIGNMENT_STATUS.ACTIVE },
      include: [
        {
          model: sequelize.models.CustomerServiceAgent,
          as: 'agent',
          include: [
            {
              model: sequelize.models.User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        }
      ]
    })
  }

  /**
   * 查询某客服座席下所有生效的分配
   *
   * @param {number} agentId - 客服座席ID
   * @returns {Promise<Array>} 生效的分配记录列表
   */
  CustomerServiceUserAssignment.findActiveByAgentId = function (agentId) {
    return this.findAll({
      where: { agent_id: agentId, status: ASSIGNMENT_STATUS.ACTIVE },
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['created_at', 'DESC']]
    })
  }

  CustomerServiceUserAssignment.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS

  return CustomerServiceUserAssignment
}
