'use strict'

/**
 * DecorationSku 模型 - 装饰 SKU（纯展示，零数值）
 *
 * 业务定位（路线B 合规改造 模块D / 第十节 / 决策 17.3）：
 * - 星石明码标价购买的纯展示装饰（头像框/气泡/主题/称号/视觉徽章）。
 * - 🔴 红线：无任何数值属性字段；严禁抽取/开箱获得（只能明码标价直购）；
 *   纯 UI 展示，不进任何业务计算（尤其不碰抽奖/回馈逻辑）。
 *
 * 数据库表：decoration_sku（主键 decoration_sku_id，业务码 decoration_code）
 *
 * @module models/DecorationSku
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 装饰 SKU 模型类
   * @class DecorationSku
   * @extends Model
   */
  class DecorationSku extends Model {
    /**
     * 静态关联定义
     * @param {Object} models - 全部模型集合
     * @returns {void}
     */
    static associate(models) {
      if (models.DecorationSeason) {
        DecorationSku.belongsTo(models.DecorationSeason, {
          foreignKey: 'decoration_season_id',
          as: 'season'
        })
      }
      if (models.UserOwnedDecoration) {
        DecorationSku.hasMany(models.UserOwnedDecoration, {
          foreignKey: 'decoration_sku_id',
          as: 'owned'
        })
      }
    }

    /**
     * 获取在售装饰列表（按排序）
     * @param {Object} [options={}] - 查询选项（可含 transaction）
     * @returns {Promise<DecorationSku[]>} 在售装饰列表
     */
    static async getOnSale(options = {}) {
      return this.findAll({
        where: { status: 'on_sale' },
        order: [['sort_order', 'ASC']],
        ...options
      })
    }
  }

  DecorationSku.init(
    {
      decoration_sku_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '装饰SKU主键'
      },
      decoration_code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '装饰业务码（唯一稳定标识）'
      },
      decoration_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '装饰名称（展示用）'
      },
      decoration_type: {
        type: DataTypes.ENUM('avatar_frame', 'bubble', 'theme', 'title', 'badge_visual'),
        allowNull: false,
        comment: '装饰类型：头像框/气泡/主题/称号/视觉徽章（纯 UI 展示）'
      },
      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '品质分级（仅视觉差异，零数值）'
      },
      decoration_season_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '所属赛季（NULL=常驻）'
      },
      set_code: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '套装归属码（同套装集齐可额外展示效果，NULL=不属套装）'
      },
      is_limited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否限定款（限时供应，绝版机制）'
      },
      price_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '明码标价（星石数量）；严禁抽取/开箱获得'
      },
      validity_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '有效期天数（NULL=永久；>0=限时装饰，购买后 N 天到期）'
      },
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '装饰预览图 URL'
      },
      status: {
        type: DataTypes.ENUM('draft', 'on_sale', 'off_sale'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '上架状态：draft-草稿 on_sale-在售 off_sale-下架'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '展示排序'
      }
    },
    {
      sequelize,
      modelName: 'DecorationSku',
      tableName: 'decoration_sku',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '装饰SKU表（纯展示零数值，星石明码标价，禁止抽取/开箱）'
    }
  )

  return DecorationSku
}
