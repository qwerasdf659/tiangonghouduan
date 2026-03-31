/**
 * DIY 用户作品模型
 *
 * 业务场景：
 * - 用户在小程序设计器中保存的 DIY 饰品设计方案
 * - 记录设计数据（JSON）、使用的款式模板、材料消耗明细等
 * - 状态流转：draft → frozen（冻结材料）→ completed（铸造物品）/ cancelled（取消解冻）
 *
 * 表名：diy_works；主键：diy_work_id
 *
 * @module models/DiyWork
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/** DIY 用户作品模型 */
class DiyWork extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 全部模型集合
   * @returns {void}
   */
  static associate(models) {
    /* 所属账户（accounts 体系） */
    if (models.Account) {
      DiyWork.belongsTo(models.Account, {
        foreignKey: 'account_id',
        as: 'account'
      })
    }

    /* 使用的款式模板 */
    if (models.DiyTemplate) {
      DiyWork.belongsTo(models.DiyTemplate, {
        foreignKey: 'diy_template_id',
        as: 'template'
      })
    }

    /* 预览图（media_files 直接外键） */
    if (models.MediaFile) {
      DiyWork.belongsTo(models.MediaFile, {
        foreignKey: 'preview_media_id',
        as: 'preview_media'
      })
    }

    /* 铸造后的物品实例 */
    if (models.Item) {
      DiyWork.belongsTo(models.Item, {
        foreignKey: 'item_id',
        as: 'item'
      })
    }
  }

  /** 作品状态枚举 */
  static STATUS = {
    DRAFT: 'draft', // 草稿（设计中）
    FROZEN: 'frozen', // 已冻结材料（待确认下单）
    COMPLETED: 'completed', // 已完成（材料扣减 + 物品铸造）
    CANCELLED: 'cancelled' // 已取消（材料解冻）
  }
}

module.exports = sequelize => {
  DiyWork.init(
    {
      /** 自增主键 */
      diy_work_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'DIY用户作品ID（自增主键）'
      },

      /** 作品业务编号（OrderNoGenerator 生成，bizCode=DW） */
      work_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        comment: '作品业务编号（DW + YYMMDD + 序列 + 随机）'
      },

      /** 所属账户ID（FK → accounts.account_id） */
      account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属账户ID（复用现有账户体系）'
      },

      /** 使用的款式模板ID（FK → diy_templates.diy_template_id） */
      diy_template_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '使用的款式模板ID'
      },

      /** 用户自定义作品名称 */
      work_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: '我的设计',
        comment: '用户自定义作品名称'
      },

      /**
       * 核心设计数据（JSON）
       *
       * 串珠模式示例：{ mode: 'beading', beads: [{ position: 0, asset_code: 'red_shard', diameter: 10 }, ...] }
       * 镶嵌模式示例：{ mode: 'slots', fillings: { slot_center: { asset_code: 'blue_crystal' }, ... } }
       */
      design_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '核心设计数据（珠子排列/槽位填充方案）'
      },

      /**
       * 总消耗明细（JSON 数组）
       * [{ asset_code: 'red_shard', amount: 5 }, { asset_code: 'blue_crystal', amount: 2 }]
       */
      total_cost: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '总消耗明细 [{ asset_code, amount }]'
      },

      /** 预览图媒体文件ID（FK → media_files.media_id） */
      preview_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '预览图媒体文件ID'
      },

      /** 确认后铸造的物品实例ID（FK → items.item_id） */
      item_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '确认后铸造的物品实例ID（completed 状态才有值）'
      },

      /** 作品状态 */
      status: {
        type: DataTypes.ENUM('draft', 'frozen', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '作品状态：draft草稿/frozen已冻结材料/completed已完成/cancelled已取消'
      },

      /** 幂等键（防重复提交） */
      idempotency_key: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        comment: '幂等键（防重复提交）'
      },

      /** 材料冻结时间 */
      frozen_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '材料冻结时间'
      },

      /** 完成时间（铸造成功） */
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间（铸造成功）'
      }
    },
    {
      sequelize,
      modelName: 'DiyWork',
      tableName: 'diy_works',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'DIY用户作品表（用户保存的设计方案）'
    }
  )

  return DiyWork
}
