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
      item_type: {
        type: DataTypes.ENUM('beads', 'accessories', 'pendants'),
        allowNull: false,
        defaultValue: 'beads',
        comment: '素材大类：beads珠子 / accessories配饰(隔片佛头流苏) / pendants吊坠'
      },
      material_type: {
        type: DataTypes.ENUM('crystal', 'stone', 'metal', 'matte'),
        allowNull: false,
        defaultValue: 'crystal',
        comment:
          '材质光影档位（前端立体渲染高光参数）：crystal通透水晶/stone玉石奶体/metal金属镜面/matte哑光'
      },
      five_elements: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '五行属性，逗号分隔多值：metal金/wood木/water水/fire火/earth土（五行雷达图玩法数据源）'
      },
      weight: {
        type: DataTypes.DECIMAL(6, 1),
        allowNull: true,
        comment: '单颗珠子净重(g)，保留1位小数，仅详情展示',
        /** @returns {number|null} 克重数值 */
        get() {
          const val = this.getDataValue('weight')
          return val !== null ? Number(val) : null
        }
      },
      meaning: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '寓意文案（详情弹窗展示，措辞须符合广告法：用"寓意/象征"，禁功效性表述）'
      },
      energy: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '能量属性文案（如"财富·活力"，软性运营文案）'
      },
      pairing: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '搭配建议文案（如"搭配白水晶提亮"）'
      },
      size_length_mm: {
        type: DataTypes.DECIMAL(5, 1),
        allowNull: true,
        comment: '异形珠实物长边(mm)，如跑环14.5；圆珠为空',
        /** @returns {number|null} 长边数值 */
        get() {
          const val = this.getDataValue('size_length_mm')
          return val !== null ? Number(val) : null
        }
      },
      size_width_mm: {
        type: DataTypes.DECIMAL(5, 1),
        allowNull: true,
        comment: '异形珠实物短边(mm)，如跑环4.5；圆珠为空',
        /** @returns {number|null} 短边数值 */
        get() {
          const val = this.getDataValue('size_width_mm')
          return val !== null ? Number(val) : null
        }
      },
      bore_orientation: {
        type: DataTypes.ENUM('along_length', 'along_width', 'none'),
        allowNull: false,
        defaultValue: 'none',
        comment: '穿绳方向：along_length绳穿长轴(管珠) / along_width绳穿短边(药片) / none圆珠'
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '单价（资产单位，强制整数定价）',
        /** @returns {number} 单价数值 */
        get() {
          const val = this.getDataValue('price')
          return val !== null ? parseFloat(parseFloat(val).toFixed(2)) : 0
        },
        validate: {
          /**
           * 强制整数定价校验（文档决策 A）
           * @param {*} value - 待校验的价格值
           * @returns {void}
           */
          isIntegerPrice(value) {
            if (value !== null && value !== undefined && Number(value) % 1 !== 0) {
              throw new Error('价格必须为整数（强制整数定价策略）')
            }
          }
        }
      },
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '定价币种（新增时必须显式指定，无默认值）'
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
