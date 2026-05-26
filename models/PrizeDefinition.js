/**
 * 奖品定义模型（集中奖品目录）
 *
 * 业务场景：
 * - 全局唯一的奖品真相源，所有活动通过关联表引用
 * - 同一奖品全局价值统一，不会出现"同奖品不同价"
 * - 新建活动只需选择奖品 + 配置概率/库存，无需重复填写奖品信息
 * - 修改奖品信息一处改全局生效
 *
 * 设计决策：
 * - budget_cost 不存储，运行时通过 material_asset_types.budget_value_points × material_amount 实时计算
 * - prize_code 结构化命名：{material_asset_code}_{amount}（如 star_stone_500）
 * - 物品类奖品使用 item_{template_code} 格式
 * - reward_tier 为默认档位，活动关联表可覆盖
 *
 * 命名规范（snake_case）：
 * - 表名：prize_definitions
 * - 主键：prize_definition_id
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 奖品定义模型类
 * 职责：集中管理奖品目录，作为全局唯一真相源
 * 设计模式：配置实体（低频变更、语义稳定、数量有限）
 */
class PrizeDefinition extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize 所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 材料资产类型（material 类奖品的来源定义）
    if (models.MaterialAssetType) {
      PrizeDefinition.belongsTo(models.MaterialAssetType, {
        foreignKey: 'material_asset_code',
        targetKey: 'asset_code',
        as: 'materialAssetType',
        constraints: false
      })
    }

    // 物品模板（item 类奖品的来源定义）
    if (models.ItemTemplate) {
      PrizeDefinition.belongsTo(models.ItemTemplate, {
        foreignKey: 'item_template_id',
        as: 'itemTemplate'
      })
    }

    // 稀有度定义
    if (models.RarityDef) {
      PrizeDefinition.belongsTo(models.RarityDef, {
        foreignKey: 'rarity_code',
        targetKey: 'rarity_code',
        as: 'rarityDef',
        constraints: false
      })
    }

    // 主图媒体文件
    if (models.MediaFile) {
      PrizeDefinition.belongsTo(models.MediaFile, {
        foreignKey: 'primary_media_id',
        targetKey: 'media_id',
        as: 'primaryMedia'
      })
    }

    // 商户
    if (models.Merchant) {
      PrizeDefinition.belongsTo(models.Merchant, {
        foreignKey: 'merchant_id',
        as: 'merchant'
      })
    }

    // 活动关联（通过中间表）
    if (models.LotteryCampaignPrize) {
      PrizeDefinition.hasMany(models.LotteryCampaignPrize, {
        foreignKey: 'prize_definition_id',
        as: 'campaignPrizes'
      })
    }
  }

  /**
   * 获取奖品类型中文名
   * @returns {string} 类型中文名
   */
  getPrizeTypeName() {
    const typeMap = {
      material: '材料资产',
      item: '物品',
      coupon: '优惠券',
      points: '积分'
    }
    return typeMap[this.prize_type] || '未知'
  }

  /**
   * 判断奖品是否可用（启用 + 未软删除）
   * @returns {boolean} 是否可用
   */
  isAvailable() {
    return this.is_enabled && !this.deleted_at
  }
}

/**
 * 模型初始化
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} 初始化后的模型
 */
module.exports = sequelize => {
  PrizeDefinition.init(
    {
      prize_definition_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '奖品定义ID（主键）'
      },

      prize_code: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true,
        comment: '业务码（如 star_stone_500、item_voucher_50off）'
      },

      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '展示名称（如 星石 ×500）'
      },

      prize_type: {
        type: DataTypes.ENUM('material', 'item', 'coupon', 'points'),
        allowNull: false,
        comment: '奖品类型：material=材料资产, item=物品模板, coupon=优惠券, points=积分'
      },

      material_asset_code: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '材料资产编码（FK→material_asset_types.asset_code，material/points 类型必填）'
      },

      material_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '材料数量（material/points 类型必填）'
      },

      item_template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '物品模板ID（FK→item_templates.item_template_id，item 类型必填）'
      },

      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        comment: '稀有度编码（FK→rarity_defs.rarity_code）'
      },

      primary_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '主图媒体ID（FK→media_files.media_file_id）'
      },

      reward_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: false,
        defaultValue: 'low',
        comment: '默认档位（活动关联表可覆盖）'
      },

      is_enabled: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
        comment: '是否启用：1=启用, 0=禁用'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品描述'
      },

      merchant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '商户ID（FK→merchants.merchant_id，多商家隔离）'
      },

      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展字段（JSON）'
      }
    },
    {
      sequelize,
      modelName: 'PrizeDefinition',
      tableName: 'prize_definitions',
      underscored: true,
      paranoid: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
      comment: '奖品目录表 — 全局唯一真相源'
    }
  )

  return PrizeDefinition
}
