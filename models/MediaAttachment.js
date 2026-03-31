/**
 * 媒体关联模型 — 多态关联层
 *
 * 业务场景：
 * - 将 media_files 中的图片/文件关联到任意业务实体
 * - attachable_type + attachable_id 实现多态关联（新增业务类型零 schema 改动）
 * - role 区分同一业务实体的不同图片用途（主图/图标/banner/背景/画廊）
 * - 一张图可被多个业务实体引用（去重复用）
 *
 * 设计原则：
 * - attachable_type 是 VARCHAR，不是 ENUM（新增业务类型无需改 schema）
 * - media_id 有真正的外键约束（CASCADE 删除）
 * - sort_order 支持同一业务实体多图排序
 * - meta 存放关联级元数据（alt_text/crop_rect 等）
 *
 * 命名规范（snake_case）：
 * - 表名：media_attachments
 * - 主键：attachment_id（BIGINT UNSIGNED 自增）
 *
 * @version 1.0.0
 * @date 2026-03-16
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 支持的 attachable_type 值（文档用，非枚举约束）
 *
 * lottery_prize      — 抽奖奖品主图
 * exchange_item      — 兑换商品主图/画廊
 * item_template      — 物品模板图标
 * ad_creative        — 广告素材图片
 * category            — 品类图标（attachable_id → categories.category_id）
 * material_asset_type — 材料资产类型图标
 * merchant           — 商家 logo
 * lottery_campaign   — 活动 banner/背景
 * diy_template       — DIY 款式模板预览图/底图（2026-03-31 DIY V2.0）
 * diy_work           — DIY 用户作品预览图（2026-03-31 DIY V2.0）
 */

/** @description 媒体关联模型类 */
class MediaAttachment extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  static associate(models) {
    MediaAttachment.belongsTo(models.MediaFile, {
      foreignKey: 'media_id',
      as: 'media'
    })
  }
}

/**
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {MediaAttachment} 初始化后的模型
 */
module.exports = sequelize => {
  MediaAttachment.init(
    {
      attachment_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '关联记录ID（主键）'
      },
      media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: '关联的媒体文件ID',
        references: {
          model: 'media_files',
          key: 'media_id'
        }
      },
      attachable_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '业务实体类型(lottery_prize/exchange_item/ad_creative/category/...)'
      },
      attachable_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: '业务实体 ID'
      },
      role: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'primary',
        comment: '用途(primary/icon/banner/background/gallery)'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序（同一业务实体内排序，数字越小越靠前）'
      },
      meta: {
        type: DataTypes.JSON,
        defaultValue: null,
        comment: '关联元数据(alt_text/crop_rect等)'
      }
    },
    {
      sequelize,
      modelName: 'MediaAttachment',
      tableName: 'media_attachments',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      createdAt: 'created_at',
      comment: '媒体关联表（多态关联 - 独立媒体服务方案 D+ 增强版）'
    }
  )

  return MediaAttachment
}
