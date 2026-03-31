/**
 * DIY 款式模板模型
 *
 * 业务场景：
 * - 管理端配置款式模板（手链/项链/戒指/吊坠等）
 * - 前端根据模板的 layout / bead_rules / material_group_codes 动态渲染设计器
 * - 支持串珠模式（circle/ellipse/arc/line）和镶嵌模式（slots）
 *
 * 表名：diy_templates；主键：diy_template_id
 *
 * @module models/DiyTemplate
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/** DIY 款式模板模型 */
class DiyTemplate extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 全部模型集合
   * @returns {void}
   */
  static associate(models) {
    /* 所属分类（categories 树形体系） */
    if (models.Category) {
      DiyTemplate.belongsTo(models.Category, {
        foreignKey: 'category_id',
        as: 'category'
      })
    }

    /* 预览图（media_files 直接外键） */
    if (models.MediaFile) {
      DiyTemplate.belongsTo(models.MediaFile, {
        foreignKey: 'preview_media_id',
        as: 'preview_media'
      })
      DiyTemplate.belongsTo(models.MediaFile, {
        foreignKey: 'base_image_media_id',
        as: 'base_image_media'
      })
    }

    /* 一对多：模板 → 用户作品 */
    if (models.DiyWork) {
      DiyTemplate.hasMany(models.DiyWork, {
        foreignKey: 'diy_template_id',
        as: 'works'
      })
    }

    /* 多态关联：gallery 图等走 media_attachments */
    if (models.MediaAttachment) {
      DiyTemplate.hasMany(models.MediaAttachment, {
        foreignKey: 'attachable_id',
        constraints: false,
        scope: { attachable_type: 'diy_template' },
        as: 'media_attachments'
      })
    }
  }

  /** 模板生命周期状态枚举 */
  static STATUS = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived'
  }
}

module.exports = sequelize => {
  DiyTemplate.init(
    {
      /** 自增主键 */
      diy_template_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'DIY款式模板ID（自增主键）'
      },

      /** 模板业务编号（OrderNoGenerator 生成，bizCode=DT） */
      template_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '模板业务编号（DT + YYMMDD + 序列 + 随机）'
      },

      /** 模板展示名称 */
      display_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '模板展示名称'
      },

      /** 所属分类ID（FK → categories.category_id） */
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属分类ID（DIY_BRACELET / DIY_NECKLACE / DIY_RING / DIY_PENDANT）'
      },

      /**
       * 布局配置（核心 JSON 字段）
       *
       * 串珠模式示例：{ shape: 'circle', bead_count: 18, radius_x: 120, radius_y: 120 }
       * 镶嵌模式示例：{ shape: 'slots', background_width: 800, background_height: 1000,
       *   slot_definitions: [{ slot_id, label, x, y, width, height, rotation, allowed_shapes, allowed_group_codes, required }] }
       */
      layout: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '布局配置（串珠模式：形状+珠数；镶嵌模式：底图尺寸+槽位定义）'
      },

      /**
       * 珠子规则（串珠模式必填，镶嵌模式为 null）
       * { margin: 10, default_diameter: 10, allowed_diameters: [8, 10, 12] }
       */
      bead_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '珠子规则（串珠模式）：间距、默认直径、允许直径列表'
      },

      /**
       * 尺寸规则（串珠模式必填，镶嵌模式为 null）
       * { default_size: 'M', size_options: [{ label: 'S', bead_count: 14 }, { label: 'M', bead_count: 18 }] }
       */
      sizing_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '尺寸规则（串珠模式）：默认尺寸、尺寸选项列表'
      },

      /**
       * 容量规则
       * { min_beads: 12, max_beads: 24 }
       */
      capacity_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '容量规则：最小/最大珠子数'
      },

      /**
       * 允许的材料分组码数组
       * 关联 asset_group_defs.group_code，如 ["red","blue","green"]
       * 空数组 [] 表示全部允许
       */
      material_group_codes: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '允许的材料分组码数组（空=全部允许）'
      },

      /** 预览图媒体文件ID（FK → media_files.media_id） */
      preview_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '预览图媒体文件ID'
      },

      /** 底图媒体文件ID（镶嵌模式必需，FK → media_files.media_id） */
      base_image_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '底图媒体文件ID（镶嵌模式必需）'
      },

      /** 模板生命周期状态 */
      status: {
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '模板状态：draft草稿 / published已发布 / archived已归档'
      },

      /** 是否启用（上下架开关） */
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用（上下架开关）'
      },

      /** 排序权重（越小越靠前） */
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重（越小越靠前）'
      },

      /** 扩展元数据（预留字段） */
      meta: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据（预留字段，如 discount_rules 等）'
      }
    },
    {
      sequelize,
      modelName: 'DiyTemplate',
      tableName: 'diy_templates',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'DIY款式模板表（管理端配置，前端根据模板参数渲染设计器）'
    }
  )

  return DiyTemplate
}
