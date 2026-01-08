/**
 * 兑换市场商品模型 - ExchangeItem
 * 材料资产支付兑换市场核心表（V4.5.0统一版）
 *
 * 业务场景：
 * - 用户通过抽奖、转换等途径获得材料资产（碎红水晶、完整红水晶等）
 * - 材料资产存入统一账本（Account + AccountAssetBalance）
 * - 用户使用材料资产兑换商品（通过 AssetService.changeBalance() 扣减）
 *
 * 支付方式说明（V4.5.0唯一方式）：
 * - cost_asset_code：兑换商品需要的材料资产类型（如 red_shard）
 * - cost_amount：兑换单件商品需要的材料数量
 * - 所有兑换操作通过 AssetService.changeBalance() 扣减材料资产
 *
 * 业务规则（强制）：
 * - ✅ 兑换只能使用材料资产支付
 * - ✅ cost_asset_code + cost_amount 为新商品必填字段
 * - ❌ 禁止积分支付和虚拟奖品价值支付（已彻底移除）
 *
 * 最后修改：2025年12月18日 - 暴力移除旧方案，统一为材料资产支付
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeItem = sequelize.define(
    'ExchangeItem',
    {
      // 主键
      item_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品唯一标识'
      },

      // 基础信息
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述'
      },
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment:
          '【已废弃】旧商品图片URL字段（2026-01-08图片存储架构已迁移到primary_image_id关联image_resources表，此字段仅保留向后兼容）'
      },
      primary_image_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '主图片ID，关联 image_resources.image_id（2026-01-08 图片存储架构）',
        references: {
          model: 'image_resources',
          key: 'image_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // V4.5.0 材料资产支付字段（唯一支付方式）
      cost_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '成本资产代码（Cost Asset Code - 兑换商品消耗的材料资产类型）：red_shard-碎红水晶、red_crystal-完整红水晶等；业务规则：必填字段；支持多种材料资产扩展；用途：兑换支付资产类型、库存扣减依据、成本核算基础'
      },
      cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '成本数量（Cost Amount - 兑换单件商品需要的材料数量）：单位根据cost_asset_code确定（如10个碎红水晶）；业务规则：必填字段；使用BIGINT避免浮点精度问题；数据范围：1-1000000；用途：兑换扣减材料数量、成本核算、商品定价参考'
      },

      // 成本和库存
      cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际成本（人民币）'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量'
      },
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已售数量'
      },

      // 分类和状态
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '商品分类'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序序号'
      }
    },
    {
      tableName: 'exchange_items',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [{ fields: ['status'] }, { fields: ['category'] }, { fields: ['cost_asset_code'] }],
      comment: '兑换市场商品表（V4.5.0材料资产支付）'
    }
  )

  /**
   * 关联定义
   *
   * @param {Object} models - Sequelize所有模型集合
   * @returns {void} 无返回值，仅定义模型关联关系
   */
  ExchangeItem.associate = function (models) {
    // 一对多：商品有多个兑换记录
    ExchangeItem.hasMany(models.ExchangeRecord, {
      foreignKey: 'item_id',
      as: 'exchangeRecords'
    })

    // 多对一：商品关联主图片（2026-01-08 图片存储架构）
    ExchangeItem.belongsTo(models.ImageResources, {
      foreignKey: 'primary_image_id',
      as: 'primaryImage'
    })
  }

  /**
   * 检查库存是否充足
   *
   * @returns {boolean} 是否有库存（true-有库存，false-无库存）
   */
  ExchangeItem.prototype.hasStock = function () {
    return this.stock > 0
  }

  /**
   * 获取材料资产支付要求（V4.5.0统一版）
   *
   * @returns {Object} 支付要求
   * @returns {string} returns.asset_code - 需要的材料资产代码
   * @returns {number} returns.amount - 需要的材料数量
   */
  ExchangeItem.prototype.getPaymentRequired = function () {
    return {
      asset_code: this.cost_asset_code,
      amount: this.cost_amount || 0
    }
  }

  return ExchangeItem
}
