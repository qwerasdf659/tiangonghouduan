/**
 * DiyMaterial 模型 — DIY 珠子/宝石素材
 *
 * 对应 diy_materials 表
 * 存储实物珠子/宝石商品数据，供小程序 DIY 设计器选择
 *
 * @module models/DiyMaterial
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/** DIY 珠子/宝石素材模型 */
class DiyMaterial extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 全部模型集合
   * @returns {void}
   */
  static associate(models) {
    // 素材图片
    if (models.MediaFile) {
      DiyMaterial.belongsTo(models.MediaFile, {
        foreignKey: 'image_media_id',
        as: 'image_media'
      })
    }
    // 所属分类
    if (models.Category) {
      DiyMaterial.belongsTo(models.Category, {
        foreignKey: 'category_id',
        as: 'category'
      })
    }
  }
}

module.exports = sequelize => {
  DiyMaterial.init(
    {
      diy_material_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '素材ID（主键）'
      },
      material_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '素材编码'
      },
      display_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '素材显示名称'
      },
      material_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '材质名称'
      },
      group_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '材料分组编码'
      },
      diameter: {
        type: DataTypes.DECIMAL(5, 1),
        allowNull: false,
        comment: '直径(mm)',
        /** @returns {number|null} 直径数值 */
        get() {
          const val = this.getDataValue('diameter')
          return val !== null ? Number(val) : null
        }
      },
      shape: {
        type: DataTypes.ENUM('circle', 'ellipse', 'oval', 'square', 'heart', 'teardrop'),
        allowNull: false,
        defaultValue: 'circle',
        comment: '切割形状'
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '单价（资产单位）',
        /** @returns {number} 单价数值（保留两位小数精度） */
        get() {
          const val = this.getDataValue('price')
          return val !== null ? parseFloat(parseFloat(val).toFixed(2)) : 0
        }
      },
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'star_stone',
        comment: '定价币种（星石）'
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: -1,
        comment: '库存（-1=无限，0=售罄）'
      },
      is_stackable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '可叠加标识'
      },
      image_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '素材图片 → media_files.media_id'
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '所属分类 → categories.category_id'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重'
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据'
      }
    },
    {
      sequelize,
      modelName: 'DiyMaterial',
      tableName: 'diy_materials',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'DIY 珠子/宝石素材表'
    }
  )

  return DiyMaterial
}
