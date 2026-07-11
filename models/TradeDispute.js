/**
 * 交易售后申诉模型（TradeDispute）
 *
 * 业务说明：
 * - 用户可见的"交易售后申诉"实体，独立于内部工单（customer_service_issues）
 * - 承载交易/拍卖等订单的纠纷举证、客服审核、仲裁（对接 approval_chain）、退款处理全流程
 * - 由方案A 从 customer_service_issues 拆出（纠纷做回纠纷，工单退回纯内部跟踪）
 *
 * 数据库表：trade_disputes
 * 主键：trade_dispute_id（BIGINT 自增，遵循"全名_id"命名约定）
 * 外键：user_id → users.user_id（申诉买家），assigned_to → users.user_id（处理客服）
 *
 * 状态机：open（已提交）→ reviewing（客服审核）→ arbitrating（仲裁中）→ resolved（已解决）/ rejected（已驳回）
 *
 * @version 1.0.0
 * @date 2026-06-02
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  /**
   * 关联订单类型枚举（多态订单标识）
   * - trade: 担保交易订单（trade_orders）
   * - redemption: 兑换订单
   * - consumption: 消费核销订单
   * - auction: 拍卖订单（auction_listings，修复 P4：原工单表 ENUM 无此值导致拍卖争议必报错）
   */
  const ORDER_TYPE = {
    TRADE: 'trade',
    REDEMPTION: 'redemption',
    CONSUMPTION: 'consumption',
    AUCTION: 'auction'
  }

  /**
   * 纠纷类型枚举（沿用原 customer_service_issues.dispute_type）
   * - item_not_received: 未收到物品
   * - item_mismatch: 物品不符
   * - quality_issue: 质量问题
   * - fraud: 欺诈
   * - other: 其他
   */
  const DISPUTE_TYPE = {
    ITEM_NOT_RECEIVED: 'item_not_received',
    ITEM_MISMATCH: 'item_mismatch',
    QUALITY_ISSUE: 'quality_issue',
    FRAUD: 'fraud',
    OTHER: 'other'
  }

  /**
   * 申诉状态枚举（用户可见的售后进度）
   * - open: 已提交（待客服受理）
   * - reviewing: 客服审核中
   * - arbitrating: 仲裁中（已升级审批链）
   * - resolved: 已解决（退款/补偿/协商完成）
   * - rejected: 已驳回
   */
  const DISPUTE_STATUS = {
    OPEN: 'open',
    REVIEWING: 'reviewing',
    ARBITRATING: 'arbitrating',
    RESOLVED: 'resolved',
    REJECTED: 'rejected'
  }

  /**
   * 优先级枚举（沿用工单约定）
   */
  const PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  }

  const TradeDispute = sequelize.define(
    'TradeDispute',
    {
      trade_dispute_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '售后申诉主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '申诉人（买家）用户ID → users.user_id'
      },

      order_type: {
        type: DataTypes.ENUM(
          ORDER_TYPE.TRADE,
          ORDER_TYPE.REDEMPTION,
          ORDER_TYPE.CONSUMPTION,
          ORDER_TYPE.AUCTION
        ),
        allowNull: false,
        comment:
          '关联订单类型：trade=交易订单, redemption=兑换订单, consumption=消费核销, auction=拍卖订单'
      },

      order_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '关联订单ID（多态值，统一字符串存储兼容 BIGINT 和 UUID）'
      },

      dispute_type: {
        type: DataTypes.ENUM(
          DISPUTE_TYPE.ITEM_NOT_RECEIVED,
          DISPUTE_TYPE.ITEM_MISMATCH,
          DISPUTE_TYPE.QUALITY_ISSUE,
          DISPUTE_TYPE.FRAUD,
          DISPUTE_TYPE.OTHER
        ),
        allowNull: false,
        comment: '纠纷类型：未收到物品/物品不符/质量问题/欺诈/其他'
      },

      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '申诉标题'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '申诉描述'
      },

      evidence: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '证据（截图URL数组、订单快照等）'
      },

      status: {
        type: DataTypes.ENUM(
          DISPUTE_STATUS.OPEN,
          DISPUTE_STATUS.REVIEWING,
          DISPUTE_STATUS.ARBITRATING,
          DISPUTE_STATUS.RESOLVED,
          DISPUTE_STATUS.REJECTED
        ),
        allowNull: false,
        defaultValue: DISPUTE_STATUS.OPEN,
        comment: '申诉状态机：open→reviewing→arbitrating→resolved/rejected'
      },

      priority: {
        type: DataTypes.ENUM(PRIORITY.LOW, PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.URGENT),
        allowNull: false,
        defaultValue: PRIORITY.HIGH,
        comment: '申诉优先级'
      },

      assigned_to: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理客服用户ID（内部字段，下发小程序时脱敏）→ users.user_id'
      },

      approval_chain_instance_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '仲裁审批链实例ID（内部字段，下发小程序时脱敏）→ approval_chain_instances.instance_id'
      },

      deadline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理截止时间（超时自动升级仲裁）'
      },

      resolution: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '处理结果说明（下发小程序的用户可见摘要）'
      },

      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理完成时间'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '发起人用户ID（自助=买家本人，代发=客服）'
      }
    },
    {
      tableName: 'trade_disputes',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_trade_disputes_user_id' },
        { fields: ['status'], name: 'idx_trade_disputes_status' },
        { fields: ['order_type', 'order_id'], name: 'idx_trade_disputes_order_polymorphic' },
        { fields: ['assigned_to'], name: 'idx_trade_disputes_assigned_to' },
        { fields: ['created_at'], name: 'idx_trade_disputes_created_at' }
      ],
      comment: '交易售后申诉表（用户可见的纠纷/售后流程，由方案A 从客服工单表拆出）'
    }
  )

  TradeDispute.associate = function (models) {
    /* 申诉人（买家） */
    TradeDispute.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    /* 处理客服 */
    TradeDispute.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assignee'
    })

    /* 发起人（自助为买家本人，代发为客服） */
    TradeDispute.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })
  }

  /* 导出枚举常量供服务层/路由使用 */
  TradeDispute.ORDER_TYPE = ORDER_TYPE
  TradeDispute.DISPUTE_TYPE = DISPUTE_TYPE
  TradeDispute.DISPUTE_STATUS = DISPUTE_STATUS
  TradeDispute.PRIORITY = PRIORITY

  return TradeDispute
}
