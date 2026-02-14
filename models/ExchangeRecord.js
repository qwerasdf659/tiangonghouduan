/**
 * B2C兑换记录模型 - ExchangeRecord
 * 材料资产支付兑换订单表（V4.5.0统一版）
 *
 * ⚠️ 重要提示：此表未废弃，请勿删除！
 * - 表名：exchange_records
 * - 用途：B2C 官方兑换订单表，用户使用材料资产兑换商品
 * - 状态：正常使用中
 *
 * 业务场景：
 * - 用户选择商品并使用材料资产支付（B2C官方兑换）
 * - 通过 BalanceService.changeBalance() 扣除材料资产
 * - 创建兑换订单（记录 pay_asset_code + pay_amount）
 * - 发货和订单状态管理
 *
 * 业务规则（强制）：
 * - ✅ 只支持材料资产支付（pay_asset_code + pay_amount）
 * - ✅ 材料扣减通过 BalanceService 统一账本执行
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
      exchange_record_id: {
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
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '兑换商品ID',
        references: {
          model: 'exchange_items',
          key: 'exchange_item_id'
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
        comment: '实际成本',
        /**
         * 获取实际成本，将DECIMAL转换为浮点数
         * @returns {number|null} 实际成本（元）或null
         */
        get() {
          const value = this.getDataValue('actual_cost')
          return value ? parseFloat(value) : null
        }
      },

      // 订单信息
      order_no: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '订单号'
      },
      // 幂等键（业界标准形态 - 2026-01-02）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment:
          '幂等键（业界标准命名 - 必填），用于防止重复提交，客户端通过 Header Idempotency-Key 传入'
      },
      /**
       * 业务唯一键（business_id）- 事务边界治理（2026-01-05）
       *
       * 与 idempotency_key 的区别：
       * - idempotency_key：请求级幂等（防止同一请求重复提交）
       * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
       *
       * 格式：exchange_{user_id}_{exchange_item_id}_{timestamp}
       *
       * @see docs/事务边界治理现状核查报告.md 建议9.1
       */
      business_id: {
        type: DataTypes.STRING(150),
        allowNull: false, // 业务唯一键必填（历史数据已回填完成 - 2026-01-05）
        unique: true,
        comment: '业务唯一键（格式：exchange_{user_id}_{exchange_item_id}_{timestamp}）- 必填'
      },
      /**
       * 关联扣减流水ID（逻辑外键，用于对账）
       *
       * 事务边界治理（2026-01-05）：
       * - 兑换扣减资产时，记录对应的 asset_transactions.transaction_id
       * - 用于定时对账脚本检查数据一致性
       * - 不使用物理外键约束，支持未来分库分表
       */
      debit_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: true, // 历史数据可能为 NULL
        comment: '关联扣减流水ID（逻辑外键，用于对账）'
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
        comment: '总成本（管理员可见，= cost_price * quantity）',
        /**
         * 获取总成本，将DECIMAL转换为浮点数
         * @returns {number|null} 总成本（元）或null
         */
        get() {
          const value = this.getDataValue('total_cost')
          return value ? parseFloat(value) : null
        }
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
      },

      /**
       * 来源标识（决策10：区分普通兑换和竞价中标）
       * - exchange: 普通兑换（默认值）
       * - bid: 竞价中标
       */
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'exchange',
        comment: '来源：exchange=普通兑换, bid=竞价中标'
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
        { fields: ['idempotency_key'], unique: true, name: 'uk_exchange_records_idempotency_key' },
        { fields: ['business_id'], unique: true, name: 'uk_exchange_records_business_id' },
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] }
      ],
      comment: 'B2C兑换记录表'
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
      foreignKey: 'exchange_item_id',
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
