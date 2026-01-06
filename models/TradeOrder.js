/**
 * 餐厅积分抽奖系统 V4.2统一账本架构 - 交易订单模型（TradeOrder）
 *
 * 业务场景：管理所有交易订单，提供强幂等性控制和对账支持
 *
 * 核心功能：
 * 1. 强幂等性控制（business_id 全局唯一）
 * 2. 订单状态机管理（created → frozen → completed/cancelled/failed）
 * 3. 对账字段支持（gross_amount = fee_amount + net_amount）
 * 4. 关联挂牌和参与方
 * 5. 资产流水绑定（通过 business_id 关联 asset_transactions）
 *
 * 业务流程：
 * 1. 创建订单
 *    - 生成唯一 business_id（客户端传入或服务端生成）
 *    - 幂等性检查：同 business_id 返回同一结果
 *    - 参数冲突检查：同 business_id 参数不同返回 409
 *    - 初始状态：created
 * 2. 冻结资产
 *    - 锁定挂牌：market_listings.status=on_sale → locked
 *    - 冻结买家 DIAMOND：通过 AssetService 冻结 gross_amount
 *    - 更新订单状态：created → frozen
 * 3. 成交结算
 *    - 多分录写入：买家扣减、卖家入账、平台手续费
 *    - 转移所有权：物品实例转移或资产交付
 *    - 更新订单状态：frozen → completed
 *    - 更新挂牌状态：locked → sold
 * 4. 取消订单
 *    - 解冻买家 DIAMOND
 *    - 更新订单状态：frozen → cancelled
 *    - 回滚挂牌状态：locked → on_sale
 *
 * 状态流转规则：
 * - created（已创建）→ frozen（已冻结）：冻结买家资产
 * - frozen（已冻结）→ completed（已完成）：成交结算完成
 * - frozen（已冻结）→ cancelled（已取消）：订单取消，解冻资产
 * - created/frozen → failed（失败）：不可恢复错误
 * - completed/cancelled/failed 为终态，不可逆转
 *
 * 数据库表名：trade_orders
 * 主键：order_id（BIGINT，自增）
 * 唯一键：business_id（全局唯一，幂等性保证）
 * 外键：
 * - listing_id（market_listings.listing_id，关联挂牌）
 * - buyer_user_id（users.user_id，买家用户）
 * - seller_user_id（users.user_id，卖家用户）
 *
 * 集成服务：
 * - AssetService：资产冻结/解冻/结算
 * - MarketListing：挂牌状态更新
 * - ItemInstance：物品所有权转移
 *
 * 创建时间：2025年12月15日
 * 最后更新：2025年12月15日
 * 使用模型：Claude Sonnet 4.5
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const TradeOrder = sequelize.define(
    'TradeOrder',
    {
      // 主键
      order_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '订单ID（主键）'
      },

      // 幂等键（业界标准形态 - 2026-01-02）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment:
          '幂等键（业界标准命名）：全局唯一，用于幂等性控制；业务规则：客户端生成并传入，同一 idempotency_key 重试返回同一结果，参数不同返回 409 冲突'
      },

      /**
       * 业务唯一键（business_id）- 事务边界治理（2026-01-05）
       *
       * 与 idempotency_key 的区别：
       * - idempotency_key：请求级幂等（防止同一请求重复提交）
       * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
       *
       * 格式：trade_order_{buyer_id}_{listing_id}_{timestamp}
       *
       * @see docs/事务边界治理现状核查报告.md 建议9.1
       */
      business_id: {
        type: DataTypes.STRING(150),
        allowNull: false, // 业务唯一键必填（历史数据已回填完成 - 2026-01-05）
        unique: true,
        comment: '业务唯一键（格式：trade_order_{buyer_id}_{listing_id}_{timestamp}）- 必填'
      },

      // 关联挂牌
      listing_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '挂牌ID（Listing ID）：关联的市场挂牌，外键关联 market_listings.listing_id',
        references: {
          model: 'market_listings',
          key: 'listing_id'
        }
      },

      // 参与方
      buyer_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '买家用户ID（Buyer User ID）：购买方用户，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      seller_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '卖家用户ID（Seller User ID）：出售方用户，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 结算资产
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment:
          '结算资产代码（Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
      },

      // 对账金额字段（强校验：gross_amount = fee_amount + net_amount）
      gross_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '买家支付总额（Gross Amount）：买家本次交易支付的总金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 fee_amount + net_amount'
      },

      fee_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment:
          '平台手续费（Fee Amount）：从成交总额中拆分的平台手续费，单位为 asset_code（DIAMOND）；业务规则：≥0，手续费入系统账户 SYSTEM_PLATFORM_FEE'
      },

      net_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '卖家实收金额（Net Amount）：卖家实际收到的金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 gross_amount - fee_amount'
      },

      // 订单状态
      status: {
        type: DataTypes.ENUM('created', 'frozen', 'completed', 'cancelled', 'failed'),
        allowNull: false,
        defaultValue: 'created',
        comment:
          '订单状态（Status）：created-已创建（订单初始状态）| frozen-已冻结（买家资产已冻结，等待结算）| completed-已完成（成交完成，终态）| cancelled-已取消（订单取消，解冻买家资产，终态）| failed-失败（不可恢复错误，终态）；业务规则：created → frozen → completed/cancelled/failed'
      },

      // 元数据
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '订单元数据（Meta）：保存关键请求参数指纹和扩展信息，用于 409 冲突保护和数据审计；示例：{ product_id, product_name, request_params_hash }'
      },

      // 完成时间
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间（Completed At）：订单完成的北京时间，status=completed 时必填'
      },

      // 取消时间
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '取消时间（Cancelled At）：订单取消的北京时间，status=cancelled 时必填'
      }
    },
    {
      tableName: 'trade_orders',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['idempotency_key'],
          unique: true,
          name: 'uk_trade_orders_idempotency_key'
        },
        {
          fields: ['business_id'],
          unique: true,
          name: 'uk_trade_orders_business_id'
        },
        {
          fields: ['listing_id']
        },
        {
          fields: ['buyer_user_id']
        },
        {
          fields: ['seller_user_id']
        },
        {
          fields: ['status']
        },
        {
          fields: ['created_at']
        },
        {
          fields: ['asset_code', 'status']
        }
      ],
      comment: '交易订单表'
    }
  )

  // 定义关联关系
  TradeOrder.associate = function (models) {
    // 关联挂牌
    TradeOrder.belongsTo(models.MarketListing, {
      foreignKey: 'listing_id',
      as: 'listing',
      comment: '挂牌关联（Listing Association）- 关联订单的市场挂牌'
    })

    // 买家用户
    TradeOrder.belongsTo(models.User, {
      foreignKey: 'buyer_user_id',
      as: 'buyer',
      comment: '买家用户关联（Buyer Association）- 关联购买方用户'
    })

    // 卖家用户
    TradeOrder.belongsTo(models.User, {
      foreignKey: 'seller_user_id',
      as: 'seller',
      comment: '卖家用户关联（Seller Association）- 关联出售方用户'
    })
  }

  /**
   * 检查订单是否可以取消
   *
   * 业务场景：验证订单当前是否可以被取消
   *
   * 业务规则：
   * - status 必须为 created 或 frozen
   * - completed/cancelled/failed 不可取消
   *
   * @returns {boolean} true-可以取消，false-不可取消
   *
   * @example
   * const order = await TradeOrder.findByPk(1);
   * if (order.canCancel()) {
   *   // 允许取消
   * } else {
   *   throw new Error('该订单不可取消');
   * }
   */
  TradeOrder.prototype.canCancel = function () {
    return this.status === 'created' || this.status === 'frozen'
  }

  /**
   * 检查订单是否已完成
   *
   * 业务场景：判断订单是否已经完成（终态）
   *
   * 业务规则：
   * - status 为 completed/cancelled/failed 任一即为已完成
   *
   * @returns {boolean} true-已完成，false-未完成
   *
   * @example
   * const order = await TradeOrder.findByPk(1);
   * if (order.isCompleted()) {
   *   console.log('订单已完成，不可修改');
   * }
   */
  TradeOrder.prototype.isCompleted = function () {
    return ['completed', 'cancelled', 'failed'].includes(this.status)
  }

  /**
   * 验证对账金额公式
   *
   * 业务场景：验证订单金额是否符合对账公式
   *
   * 业务规则：
   * - gross_amount = fee_amount + net_amount
   *
   * @returns {boolean} true-对账通过，false-对账失败
   *
   * @example
   * const order = await TradeOrder.findByPk(1);
   * if (!order.validateAmounts()) {
   *   throw new Error('订单金额对账失败');
   * }
   */
  TradeOrder.prototype.validateAmounts = function () {
    const grossAmount = parseInt(this.gross_amount)
    const feeAmount = parseInt(this.fee_amount)
    const netAmount = parseInt(this.net_amount)

    return grossAmount === feeAmount + netAmount
  }

  return TradeOrder
}
