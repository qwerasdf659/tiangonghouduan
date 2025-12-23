/**
 * B2C兑换记录模型 - ExchangeRecord
 * 材料资产支付兑换订单表（V4.5.0统一版）
 *
 * 📌 重构记录（2025-12-22）：
 * - 模型重命名：ExchangeMarketRecord → ExchangeRecord
 * - 表名重命名：exchange_market_records → exchange_records
 * - 路由迁移：/api/v4/market → /api/v4/shop/exchange
 *
 * 业务场景：
 * - 用户选择商品并使用材料资产支付（B2C官方兑换）
 * - 通过 AssetService.changeBalance() 扣除材料资产
 * - 创建兑换订单（记录 pay_asset_code + pay_amount）
 * - 发货和订单状态管理
 *
 * 业务规则（强制）：
 * - ✅ 只支持材料资产支付（pay_asset_code + pay_amount）
 * - ✅ 材料扣减通过 AssetService 统一账本执行
 * - ✅ 支持幂等性控制（business_id 唯一约束）
 * - ❌ 禁止积分支付和虚拟奖品价值支付（已彻底移除）
 *
 * 最后修改：2025年12月22日 - 模型和表名重命名
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeRecord = sequelize.define(
    'ExchangeRecord',
    {
      // 主键
      record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换记录唯一标识'
      },

      // 关联字段
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },
      item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '兑换商品ID',
        references: {
          model: 'exchange_items',
          key: 'item_id'
        }
      },

      // V4.5.0 材料资产支付字段（唯一支付方式）
      pay_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '支付资产代码（Pay Asset Code - 兑换订单实际扣减的材料资产类型）：red_shard-碎红水晶、red_crystal-完整红水晶等；业务规则：必填字段；与exchange_items.cost_asset_code对应；用途：订单支付对账、材料消耗统计、成本核算依据'
      },
      pay_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '支付数量（Pay Amount - 兑换订单实际扣减的材料总数量）：计算公式：cost_amount * quantity；单位根据pay_asset_code确定；业务规则：必填字段；使用BIGINT避免浮点精度问题；用途：订单支付对账、材料消耗统计、成本核算'
      },

      // 成本信息（后端记录，不对外暴露）
      actual_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '实际成本'
      },

      // 订单信息
      order_no: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '订单号'
      },
      business_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        comment: '业务唯一标识（用于幂等性控制，防止重复提交）'
      },
      item_snapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品快照（记录兑换时的商品信息：名称、价格、描述等）'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '兑换数量'
      },
      total_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '总成本（管理员可见，= cost_price * quantity）'
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'shipped', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '订单状态'
      },
      admin_remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '管理员备注（管理员操作订单时的备注信息）'
      },
      exchange_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '兑换时间（记录实际兑换时刻，北京时间）'
      },
      shipped_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发货时间'
      }
    },
    {
      tableName: 'exchange_records',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['order_no'], unique: true },
        { fields: ['business_id'], unique: true, name: 'idx_business_id_unique' },
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] }
      ],
      comment: 'B2C兑换记录表（原exchange_market_records，2025-12-22重命名）'
    }
  )

  /**
   * 关联定义
   * @param {Object} models - Sequelize模型集合
   * @returns {void} 无返回值
   */
  ExchangeRecord.associate = function (models) {
    // 属于用户
    ExchangeRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 属于商品
    ExchangeRecord.belongsTo(models.ExchangeItem, {
      foreignKey: 'item_id',
      as: 'item'
    })
  }

  /**
   * 生成订单号
   * @returns {string} 订单号
   */
  ExchangeRecord.generateOrderNo = function () {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')
    return `EXC${timestamp}${random}`
  }

  return ExchangeRecord
}
