/**
 * 客服座席模型（CustomerServiceAgent）
 *
 * 业务场景：管理哪些用户是客服座席、配置最大并发会话数、分配优先级、在岗状态
 *
 * 与 CustomerServiceSession 的关系：
 * - CustomerServiceSession.admin_id 记录"某次会话由谁处理"
 * - CustomerServiceAgent.user_id 记录"谁是客服座席及其配置"
 * - 自动分配逻辑：新会话 → 查询可用客服座席 → 按优先级和负载分配
 *
 * 表名：customer_service_agents
 * 主键：customer_service_agent_id
 * 外键：user_id → users.user_id
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  /** 座席状态常量 */
  const AGENT_STATUS = {
    ACTIVE: 'active', // 在岗可分配
    INACTIVE: 'inactive', // 离线/停用
    ON_BREAK: 'on_break' // 暂时休息
  }

  /** 可接受分配的状态列表 */
  const ASSIGNABLE_STATUS = [AGENT_STATUS.ACTIVE]

  const CustomerServiceAgent = sequelize.define(
    'CustomerServiceAgent',
    {
      customer_service_agent_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '客服座席主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '关联用户ID（一个用户只能注册为一个客服座席）'
      },

      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '客服显示名称'
      },

      max_concurrent_sessions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '最大并发会话数'
      },

      current_session_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当前活跃会话数（反规范化字段）'
      },

      status: {
        type: DataTypes.ENUM(AGENT_STATUS.ACTIVE, AGENT_STATUS.INACTIVE, AGENT_STATUS.ON_BREAK),
        allowNull: false,
        defaultValue: AGENT_STATUS.ACTIVE,
        comment: '座席状态'
      },

      specialty: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '擅长领域标签（JSON数组字符串）',
        // eslint-disable-next-line require-jsdoc
        get() {
          const raw = this.getDataValue('specialty')
          if (!raw) return []
          try {
            return JSON.parse(raw)
          } catch {
            return []
          }
        },
        // eslint-disable-next-line require-jsdoc
        set(val) {
          this.setDataValue('specialty', Array.isArray(val) ? JSON.stringify(val) : val)
        }
      },

      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '分配优先级（数值越大越优先）'
      },

      total_sessions_handled: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '累计处理会话总数'
      },

      average_satisfaction_score: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '平均满意度评分（1.00-5.00）',
        // eslint-disable-next-line require-jsdoc
        get() {
          const val = this.getDataValue('average_satisfaction_score')
          return val === null ? 0 : parseFloat(val)
        }
      },

      is_auto_assign_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否参与自动分配'
      }
    },
    {
      tableName: 'customer_service_agents',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['status', 'priority'], name: 'idx_cs_agents_status_priority' },
        { fields: ['is_auto_assign_enabled', 'status'], name: 'idx_cs_agents_auto_assign' }
      ],
      comment: '客服座席管理表'
    }
  )

  CustomerServiceAgent.associate = function (models) {
    CustomerServiceAgent.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    CustomerServiceAgent.hasMany(models.CustomerServiceUserAssignment, {
      foreignKey: 'agent_id',
      as: 'assignments'
    })
  }

  /**
   * 查询所有可接受分配的客服座席（按优先级降序、当前负载升序）
   *
   * @param {void} - 无参数
   * @returns {Promise<Array>} 可分配的客服座席列表
   */
  CustomerServiceAgent.findAssignable = function () {
    return this.findAll({
      where: {
        status: ASSIGNABLE_STATUS,
        is_auto_assign_enabled: true
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['current_session_count', 'ASC']
      ]
    })
  }

  /**
   * 判断座席是否可接受新会话
   *
   * @returns {boolean} 是否可接受新会话
   */
  CustomerServiceAgent.prototype.canAcceptSession = function () {
    return (
      this.status === AGENT_STATUS.ACTIVE &&
      this.current_session_count < this.max_concurrent_sessions
    )
  }

  CustomerServiceAgent.AGENT_STATUS = AGENT_STATUS
  CustomerServiceAgent.ASSIGNABLE_STATUS = ASSIGNABLE_STATUS

  return CustomerServiceAgent
}
