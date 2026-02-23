/**
 * 客服工单模型（CustomerServiceIssue）
 *
 * 业务说明：
 * - 管理客服工作台中的工单（问题跟踪），跨会话、跨班次记录用户问题的完整生命周期
 * - 一个工单可关联多个会话（用户多次咨询同一问题）
 * - 工单状态流转：open → processing → resolved → closed
 * - 补偿记录自动写入 compensation_log（JSON 格式，由 CompensateService 填充）
 *
 * 数据库表：customer_service_issues
 * 主键：issue_id（BIGINT 自增）
 * 外键：user_id → users.user_id, created_by → users.user_id,
 *       assigned_to → users.user_id, session_id → customer_service_sessions.customer_service_session_id
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  /**
   * 工单问题类型枚举（覆盖全部活跃业务模块）
   * - asset: 资产相关（余额异常、冻结未解、充值不到账）
   * - trade: 交易相关（交易纠纷、冻结超时、物品未到）
   * - lottery: 抽奖相关（扣分没出奖、保底未触发、奖品未到背包）
   * - item: 物品相关（物品被锁、物品消失、无法使用）
   * - account: 账号相关（登录问题、封号申诉、等级异常）
   * - consumption: 消费相关（核销失败、积分未到账）
   * - feedback: 反馈升级（用户反馈需要工单跟踪）
   * - other: 其他未分类问题
   */
  const ISSUE_TYPE = {
    ASSET: 'asset',
    TRADE: 'trade',
    LOTTERY: 'lottery',
    ITEM: 'item',
    ACCOUNT: 'account',
    CONSUMPTION: 'consumption',
    FEEDBACK: 'feedback',
    OTHER: 'other'
  }

  /**
   * 工单优先级枚举
   */
  const PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  }

  /**
   * 工单状态枚举
   * - open: 新建待处理
   * - processing: 处理中
   * - resolved: 已解决（等待用户确认或自动关闭）
   * - closed: 已关闭
   */
  const ISSUE_STATUS = {
    OPEN: 'open',
    PROCESSING: 'processing',
    RESOLVED: 'resolved',
    CLOSED: 'closed'
  }

  const CustomerServiceIssue = sequelize.define(
    'CustomerServiceIssue',
    {
      issue_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '工单主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联用户ID（报告问题的用户）'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID（创建工单的客服管理员）'
      },

      assigned_to: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '指派给的客服管理员ID'
      },

      session_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联的首次客服会话ID'
      },

      issue_type: {
        type: DataTypes.ENUM(
          ISSUE_TYPE.ASSET,
          ISSUE_TYPE.TRADE,
          ISSUE_TYPE.LOTTERY,
          ISSUE_TYPE.ITEM,
          ISSUE_TYPE.ACCOUNT,
          ISSUE_TYPE.CONSUMPTION,
          ISSUE_TYPE.FEEDBACK,
          ISSUE_TYPE.OTHER
        ),
        allowNull: false,
        comment: '工单问题类型（对应业务模块）'
      },

      priority: {
        type: DataTypes.ENUM(PRIORITY.LOW, PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.URGENT),
        defaultValue: PRIORITY.MEDIUM,
        comment: '工单优先级'
      },

      status: {
        type: DataTypes.ENUM(
          ISSUE_STATUS.OPEN,
          ISSUE_STATUS.PROCESSING,
          ISSUE_STATUS.RESOLVED,
          ISSUE_STATUS.CLOSED
        ),
        defaultValue: ISSUE_STATUS.OPEN,
        comment: '工单状态'
      },

      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '工单标题（简要描述问题）'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '工单详细描述'
      },

      resolution: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '处理结果说明'
      },

      compensation_log: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '补偿记录（由 CompensateService 自动填充，格式：[{type, asset_code, amount, item_type, ...}]）'
      },

      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '解决时间'
      },

      closed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '关闭时间'
      }
    },
    {
      tableName: 'customer_service_issues',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_issues_user_id' },
        { fields: ['created_by'], name: 'idx_issues_created_by' },
        { fields: ['assigned_to'], name: 'idx_issues_assigned_to' },
        { fields: ['session_id'], name: 'idx_issues_session_id' },
        { fields: ['issue_type'], name: 'idx_issues_type' },
        { fields: ['status'], name: 'idx_issues_status' },
        { fields: ['created_at'], name: 'idx_issues_created_at' }
      ],
      comment: '客服工单表（跨会话跨班次的问题跟踪）'
    }
  )

  CustomerServiceIssue.associate = function (models) {
    /* 工单关联的用户（报告问题的人） */
    CustomerServiceIssue.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    /* 工单创建者（客服管理员） */
    CustomerServiceIssue.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })

    /* 工单当前负责人（指派的客服管理员） */
    CustomerServiceIssue.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assignee'
    })

    /* 工单关联的首次客服会话 */
    CustomerServiceIssue.belongsTo(models.CustomerServiceSession, {
      foreignKey: 'session_id',
      targetKey: 'customer_service_session_id',
      as: 'session'
    })

    /* 工单包含的内部备注 */
    CustomerServiceIssue.hasMany(models.CustomerServiceNote, {
      foreignKey: 'issue_id',
      as: 'notes'
    })
  }

  /* 导出枚举常量供其他模块使用 */
  CustomerServiceIssue.ISSUE_TYPE = ISSUE_TYPE
  CustomerServiceIssue.PRIORITY = PRIORITY
  CustomerServiceIssue.ISSUE_STATUS = ISSUE_STATUS

  return CustomerServiceIssue
}
