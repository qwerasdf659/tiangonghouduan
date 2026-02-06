/**
 * 数据库迁移：创建交易订单表（trade_orders）
 *
 * 业务场景：
 * - 统一管理所有交易订单（市场购买、资产挂牌交易）
 * - 提供强幂等性控制（business_id 唯一约束）
 * - 记录订单状态流转（created → frozen → completed/cancelled/failed）
 * - 支持对账字段（gross_amount = fee_amount + net_amount）
 * - 绑定资产分录和所有权变更在同一事务
 *
 * 核心功能：
 * 1. 幂等性控制：business_id 全局唯一，防止重复扣款
 * 2. 订单状态机：created（创建）→ frozen（冻结）→ completed（完成）/cancelled（取消）/failed（失败）
 * 3. 对账字段：gross_amount（买家支付总额）、fee_amount（平台手续费）、net_amount（卖家实收）
 * 4. 关联挂牌：listing_id 关联 market_listings 表
 * 5. 参与方记录：buyer_user_id（买家）、seller_user_id（卖家）
 * 6. 资产类型：asset_code（固定 DIAMOND）
 *
 * 数据完整性约束：
 * - business_id 必须全局唯一（幂等性保证）
 * - gross_amount = fee_amount + net_amount（对账公式强校验）
 * - asset_code 固定为 DIAMOND（交易市场结算币种）
 * - status 状态流转必须符合状态机规则
 *
 * 关联表：
 * - market_listings：挂牌信息（listing_id）
 * - users：买家和卖家（buyer_user_id、seller_user_id）
 * - asset_transactions：资产流水（通过 business_id 关联）
 *
 * 创建时间：2025年12月15日
 * 迁移版本：v4.2.0
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 trade_orders 表
   */
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('trade_orders', {
      // 主键
      order_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '订单ID（主键）'
      },

      // 幂等键
      business_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment:
          '业务唯一ID（Business ID）：全局唯一的业务单据ID，用于幂等性控制；业务规则：客户端生成并传入，同一 business_id 重试返回同一结果，参数不同返回 409 冲突'
      },

      // 关联挂牌
      listing_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '挂牌ID（Listing ID）：关联的市场挂牌，外键关联 market_listings.listing_id',
        references: {
          model: 'market_listings',
          key: 'listing_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 参与方
      buyer_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '买家用户ID（Buyer User ID）：购买方用户，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '卖家用户ID（Seller User ID）：出售方用户，外键关联 users.user_id',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 结算资产
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment:
          '结算资产代码（Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND'
      },

      // 对账金额字段（强校验：gross_amount = fee_amount + net_amount）
      gross_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment:
          '买家支付总额（Gross Amount）：买家本次交易支付的总金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 fee_amount + net_amount'
      },

      fee_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment:
          '平台手续费（Fee Amount）：从成交总额中拆分的平台手续费，单位为 asset_code（DIAMOND）；业务规则：≥0，手续费入系统账户 SYSTEM_PLATFORM_FEE'
      },

      net_amount: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment:
          '卖家实收金额（Net Amount）：卖家实际收到的金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 gross_amount - fee_amount'
      },

      // 订单状态
      status: {
        type: Sequelize.ENUM('created', 'frozen', 'completed', 'cancelled', 'failed'),
        allowNull: false,
        defaultValue: 'created',
        comment:
          '订单状态（Status）：created-已创建（订单初始状态）| frozen-已冻结（买家资产已冻结，等待结算）| completed-已完成（成交完成，终态）| cancelled-已取消（订单取消，解冻买家资产，终态）| failed-失败（不可恢复错误，终态）；业务规则：created → frozen → completed/cancelled/failed'
      },

      // 元数据
      meta: {
        type: Sequelize.JSON,
        allowNull: true,
        comment:
          '订单元数据（Meta）：保存关键请求参数指纹和扩展信息，用于 409 冲突保护和数据审计；示例：{ product_id, product_name, request_params_hash }'
      },

      // 时间戳
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间（Created At）：订单创建的北京时间'
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间（Updated At）：订单最后更新的北京时间'
      },

      // 完成时间
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '完成时间（Completed At）：订单完成的北京时间，status=completed 时必填'
      },

      // 取消时间
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '取消时间（Cancelled At）：订单取消的北京时间，status=cancelled 时必填'
      }
    })

    // 创建索引
    await queryInterface.addIndex('trade_orders', ['business_id'], {
      name: 'idx_trade_orders_business_id',
      unique: true,
      comment: '业务ID唯一索引（用于幂等性控制和快速查询）'
    })

    await queryInterface.addIndex('trade_orders', ['listing_id'], {
      name: 'idx_trade_orders_listing_id',
      comment: '挂牌ID索引（用于关联查询挂牌订单）'
    })

    await queryInterface.addIndex('trade_orders', ['buyer_user_id'], {
      name: 'idx_trade_orders_buyer_user_id',
      comment: '买家用户索引（用于查询用户的购买订单）'
    })

    await queryInterface.addIndex('trade_orders', ['seller_user_id'], {
      name: 'idx_trade_orders_seller_user_id',
      comment: '卖家用户索引（用于查询用户的销售订单）'
    })

    await queryInterface.addIndex('trade_orders', ['status'], {
      name: 'idx_trade_orders_status',
      comment: '状态索引（用于筛选不同状态的订单）'
    })

    await queryInterface.addIndex('trade_orders', ['created_at'], {
      name: 'idx_trade_orders_created_at',
      comment: '创建时间索引（用于时间排序和查询）'
    })

    await queryInterface.addIndex('trade_orders', ['asset_code', 'status'], {
      name: 'idx_trade_orders_asset_code_status',
      comment: '资产代码和状态组合索引（用于资产统计和状态筛选）'
    })

    console.log('✅ trade_orders 表创建成功')
  },

  /**
   * 回滚迁移：删除 trade_orders 表
   */
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('trade_orders')
    console.log('✅ trade_orders 表已删除')
  }
}
