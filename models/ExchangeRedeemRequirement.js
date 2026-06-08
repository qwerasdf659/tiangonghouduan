'use strict'

/**
 * ExchangeRedeemRequirement 模型 - 兑换复合门槛配置表
 *
 * 业务定位（路线B 合规改造 模块C / 第七节 / 7.5 用例）：
 * - 高价值实物用"VIP等级 + 多资产 + 消耗指定道具"复合门槛发放，打散单一碎片价格锚点。
 * - 门槛叠加在 exchange_channel_prices 单资产计价之上（追加条件，不替换主计价）。
 * - 配置实体：由运营在 admin 配置，兑换校验时（CoreService.exchangeItem）读取执行。
 *
 * 🔴 合规红线（校验时执行，本表只存配置）：
 * - 目标为实物/券(valuable)：extra_cost_assets 禁含 star_stone（仅水晶系），由 AssetProductGuard 拦截
 * - 目标为 prop(零价值)：水晶系 + star_stone 均可
 *
 * 数据库表：exchange_redeem_requirement（主键 exchange_redeem_requirement_id）
 *
 * @module models/ExchangeRedeemRequirement
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 兑换复合门槛配置模型类
   * @class ExchangeRedeemRequirement
   * @extends Model
   */
  class ExchangeRedeemRequirement extends Model {
    /**
     * 静态关联定义
     * @param {Object} models - Sequelize 所有模型集合
     * @returns {void}
     */
    static associate(models) {
      if (models.ExchangeItem) {
        ExchangeRedeemRequirement.belongsTo(models.ExchangeItem, {
          foreignKey: 'exchange_item_id',
          as: 'exchangeItem'
        })
      }
    }

    /**
     * 获取某兑换商品（可选SKU）当前生效的门槛配置
     *
     * 生效条件：is_enabled=true 且在 publish_at/unpublish_at 窗口内；
     * 优先返回精确匹配 sku_id 的配置，无则回退到 sku_id=NULL 的商品级配置。
     *
     * @param {number} exchange_item_id - 兑换商品ID
     * @param {number|null} sku_id - SKU ID（可空）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<ExchangeRedeemRequirement|null>} 生效的门槛配置或 null
     */
    static async getEffectiveRequirement(exchange_item_id, sku_id, options = {}) {
      const { Op } = require('sequelize')
      const now = new Date()
      const rows = await this.findAll({
        where: {
          exchange_item_id,
          is_enabled: true,
          [Op.and]: [
            { [Op.or]: [{ publish_at: null }, { publish_at: { [Op.lte]: now } }] },
            { [Op.or]: [{ unpublish_at: null }, { unpublish_at: { [Op.gt]: now } }] }
          ]
        },
        transaction: options.transaction
      })
      if (!rows || rows.length === 0) return null
      // 优先精确 SKU 匹配，回退商品级（sku_id=NULL）
      const skuMatch = rows.find(r => sku_id != null && Number(r.sku_id) === Number(sku_id))
      if (skuMatch) return skuMatch
      return rows.find(r => r.sku_id == null) || null
    }
  }

  ExchangeRedeemRequirement.init(
    {
      exchange_redeem_requirement_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换复合门槛配置主键'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联兑换商品ID，FK→exchange_items.exchange_item_id'
      },
      sku_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联SKU（NULL=作用于整个商品所有SKU）'
      },
      min_growth_level_key: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '最低成长等级门槛（关联 user_growth_levels.level_key，NULL=不限等级）'
      },
      extra_cost_assets: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '主计价外额外资产组合 [{asset_code, amount}]（实物侧禁含 star_stone）'
      },
      required_consume_items: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '需消耗的指定道具 [{item_template_id, quantity}]'
      },
      required_badges: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '需持有的奖章（预留，本期可空）'
      },
      required_tasks: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '需完成的任务（预留，本期可空）'
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用该门槛配置'
      },
      publish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '门槛生效起始时间（北京时间，NULL=立即生效）'
      },
      unpublish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '门槛失效时间（北京时间，NULL=长期有效）'
      }
    },
    {
      sequelize,
      modelName: 'ExchangeRedeemRequirement',
      tableName: 'exchange_redeem_requirement',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '兑换复合门槛配置表（高价值实物 VIP+多资产+消耗道具门槛，叠加在单资产计价之上）'
    }
  )

  return ExchangeRedeemRequirement
}
