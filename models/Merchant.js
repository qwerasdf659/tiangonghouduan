/**
 * 商家信息模型 - 多商家接入架构
 *
 * @description 记录接入平台的商家信息（餐厅/商铺/小游戏/服务商）
 *
 * 业务场景：
 * - 多商家接入平台，每个商家独立管理奖品、门店、核销
 * - 商家类型通过 system_dictionaries 字典表校验（dict_type='merchant_type'）
 * - merchant_id 作为物品(items)、奖品(lottery_prizes)、门店(stores)的归属标识
 * - 结算账户(settlement_account_id)预留，MVP阶段不使用
 *
 * 数据隔离：
 * - 商家角色（merchant_staff/merchant_manager）通过 RBAC 已就绪
 * - 查询层统一加 WHERE merchant_id = ? 条件实现数据隔离
 *
 * @since 2026-02-23
 * @see docs/三项核心需求-实施方案.md 第四节
 */

'use strict'

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 商家信息模型定义
 *
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {Model} Merchant 模型
 */
module.exports = sequelize => {
  const Merchant = sequelize.define(
    'Merchant',
    {
      /** 商家ID（主键，自增） */
      merchant_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '商家ID（主键）'
      },

      /** 商家名称（如：某某餐厅、XX珠宝、YY小游戏） */
      merchant_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '商家名称（如：某某餐厅、XX珠宝、YY小游戏）'
      },

      /**
       * 商家类型（字典校验）
       * 取值范围由 system_dictionaries 表 dict_type='merchant_type' 定义：
       * - restaurant: 餐厅（提供餐饮类奖品，到店核销）
       * - shop: 商铺（提供实物商品，到店核销或邮寄）
       * - game: 小游戏（产出虚拟道具和游戏货币）
       * - service: 服务商（提供服务类奖品）
       */
      merchant_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '商家类型（字典表校验：restaurant-餐厅/shop-商铺/game-小游戏/service-服务商）'
      },

      /** 联系人姓名 */
      contact_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '联系人姓名'
      },

      /** 联系电话 */
      contact_mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '联系电话'
      },

      /** LOGO图片URL */
      logo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'LOGO图片URL（Sealos对象存储）'
      },

      /** 商家状态 */
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商家状态：active-正常/inactive-停用/suspended-暂停'
      },

      /** 结算账户ID（预留，MVP阶段为NULL） */
      settlement_account_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'accounts',
          key: 'account_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '结算账户ID（预留，关联 accounts 表，MVP阶段为NULL）'
      },

      /** 平台抽佣比例 */
      commission_rate: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 0.0,
        /**
         * DECIMAL 类型 getter：字符串转数字
         * @returns {number} 抽佣比例数值
         */
        get() {
          const raw = this.getDataValue('commission_rate')
          return raw === null ? 0 : parseFloat(raw)
        },
        comment: '平台抽佣比例（0.00~99.99%，0表示不抽佣）'
      },

      /** 备注 */
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注信息'
      }
    },
    {
      tableName: 'merchants',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,

      indexes: [
        { fields: ['merchant_type'], name: 'idx_merchants_type' },
        { fields: ['status'], name: 'idx_merchants_status' }
      ],

      comment: '商家信息表（多商家接入：餐厅/商铺/小游戏/服务商）',

      scopes: {
        active: { where: { status: 'active' } },
        byType: type => ({ where: { merchant_type: type } })
      },

      hooks: {
        beforeSave: (merchant, _options) => {
          if (!merchant.created_at) {
            merchant.created_at = BeijingTimeHelper.createDatabaseTime()
          }
          merchant.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /**
   * 定义关联关系
   *
   * @param {Object} models - 所有模型
   * @returns {void} 无返回值
   */
  Merchant.associate = function (models) {
    // 一对多：一个商家有多个门店
    if (models.Store) {
      Merchant.hasMany(models.Store, {
        foreignKey: 'merchant_id',
        as: 'stores',
        comment: '商家的门店列表'
      })
    }

    // 一对多：一个商家有多个物品
    if (models.Item) {
      Merchant.hasMany(models.Item, {
        foreignKey: 'merchant_id',
        as: 'items',
        comment: '商家来源的物品'
      })
    }

    // 一对多：一个商家赞助多个奖品
    if (models.LotteryPrize) {
      Merchant.hasMany(models.LotteryPrize, {
        foreignKey: 'merchant_id',
        as: 'lottery_prizes',
        comment: '商家赞助的奖品'
      })
    }

    // 一对多：一个商家拥有多个材料资产类型（游戏商家场景）
    if (models.MaterialAssetType) {
      Merchant.hasMany(models.MaterialAssetType, {
        foreignKey: 'merchant_id',
        as: 'asset_types',
        comment: '商家的材料资产类型（游戏商家场景）'
      })
    }

    // 多对一：商家的结算账户
    if (models.Account) {
      Merchant.belongsTo(models.Account, {
        foreignKey: 'settlement_account_id',
        as: 'settlement_account',
        comment: '结算账户（预留）'
      })
    }
  }

  return Merchant
}
