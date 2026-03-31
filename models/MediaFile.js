/**
 * 媒体文件模型 — 纯存储层
 *
 * 业务场景：
 * - 统一管理所有上传到 Sealos 对象存储的图片/文件
 * - 不关心业务语义（由 media_attachments 关联层负责）
 * - 支持 content_hash 建议去重、tags 标签检索、回收站机制
 *
 * 架构定位：
 * - 独立媒体服务方案 D+ 增强版
 * - 与 SealosStorageService + ImageUrlHelper 无缝对接
 *
 * 命名规范（snake_case）：
 * - 表名：media_files
 * - 主键：media_id（BIGINT UNSIGNED 自增）
 *
 * @version 1.0.0
 * @date 2026-03-16
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/** @description 媒体文件模型类 */
class MediaFile extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  static associate(models) {
    MediaFile.hasMany(models.MediaAttachment, {
      foreignKey: 'media_id',
      as: 'attachments'
    })
  }

  /**
   * 生成公网访问 URL（通过 ImageUrlHelper）
   *
   * @returns {string} 完整的公网图片 URL
   */
  getPublicUrl() {
    const { getImageUrl } = require('../utils/ImageUrlHelper')
    return getImageUrl(this.object_key)
  }

  /**
   * 生成缩略图 URL 集合
   *
   * @returns {Object|null} { small, medium, large } 缩略图 URL
   */
  getThumbnailUrls() {
    if (!this.thumbnail_keys) return null
    const { getImageUrl } = require('../utils/ImageUrlHelper')
    return {
      small: this.thumbnail_keys.small ? getImageUrl(this.thumbnail_keys.small) : null,
      medium: this.thumbnail_keys.medium ? getImageUrl(this.thumbnail_keys.medium) : null,
      large: this.thumbnail_keys.large ? getImageUrl(this.thumbnail_keys.large) : null
    }
  }

  /**
   * 安全输出（前端使用，包含公网 URL，隐藏 object_key）
   *
   * @returns {Object} 前端安全的媒体文件数据
   */
  toSafeJSON() {
    const plain = this.get({ plain: true })
    return {
      media_id: plain.media_id,
      original_name: plain.original_name,
      file_size: plain.file_size,
      mime_type: plain.mime_type,
      width: plain.width,
      height: plain.height,
      folder: plain.folder,
      tags: plain.tags,
      status: plain.status,
      public_url: this.getPublicUrl(),
      thumbnails: this.getThumbnailUrls(),
      created_at: plain.created_at,
      updated_at: plain.updated_at
    }
  }

  /**
   * 管理后台输出（包含完整信息，含 object_key）
   *
   * @returns {Object} 管理后台完整的媒体文件数据
   */
  toAdminJSON() {
    const plain = this.get({ plain: true })
    return {
      ...plain,
      public_url: this.getPublicUrl(),
      thumbnails: this.getThumbnailUrls()
    }
  }
}

/**
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {MediaFile} 初始化后的模型
 */
module.exports = sequelize => {
  MediaFile.init(
    {
      media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: '媒体文件ID（主键）'
      },
      object_key: {
        type: DataTypes.STRING(500),
        allowNull: false,
        unique: true,
        comment: '原图 Sealos object key'
      },
      /**
       * 公网访问 URL（虚拟字段，不存数据库，序列化时自动输出）
       */
      public_url: {
        type: DataTypes.VIRTUAL,
        /**
         * @returns {string|null} 公网访问 URL
         */
        get() {
          const key = this.getDataValue('object_key')
          if (!key) return null
          const { getImageUrl } = require('../utils/ImageUrlHelper')
          return getImageUrl(key)
        }
      },
      thumbnail_keys: {
        type: DataTypes.JSON,
        defaultValue: null,
        comment: '缩略图 keys: {small, medium, large}'
      },
      original_name: {
        type: DataTypes.STRING(255),
        defaultValue: null,
        comment: '原始文件名'
      },
      file_size: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '文件大小(bytes)',
        /**
         * @description 返回数字类型的文件大小
         * @returns {number} 文件大小（字节）
         */
        get() {
          const val = this.getDataValue('file_size')
          return val !== null ? Number(val) : 0
        }
      },
      mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'MIME 类型'
      },
      width: {
        type: DataTypes.INTEGER.UNSIGNED,
        defaultValue: null,
        comment: '图片宽度(px)',
        /**
         * @description 返回数字类型的图片宽度
         * @returns {number|null} 图片宽度（像素）或 null
         */
        get() {
          const val = this.getDataValue('width')
          return val !== null ? Number(val) : null
        }
      },
      height: {
        type: DataTypes.INTEGER.UNSIGNED,
        defaultValue: null,
        comment: '图片高度(px)',
        /**
         * @description 返回数字类型的图片高度
         * @returns {number|null} 图片高度（像素）或 null
         */
        get() {
          const val = this.getDataValue('height')
          return val !== null ? Number(val) : null
        }
      },
      content_hash: {
        type: DataTypes.CHAR(64),
        defaultValue: null,
        comment: 'SHA-256 内容哈希（建议去重，非强制唯一）'
      },
      folder: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '存储文件夹(products/materials/categories/...)'
      },
      tags: {
        type: DataTypes.JSON,
        defaultValue: null,
        comment: '标签: ["奖品","活动A","2026春季"]'
      },
      uploaded_by: {
        type: DataTypes.INTEGER.UNSIGNED,
        defaultValue: null,
        comment: '上传用户 ID'
      },
      status: {
        type: DataTypes.ENUM('active', 'archived', 'trashed'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态: active=正常, archived=归档, trashed=回收站(7天后物理删除)'
      },
      trashed_at: {
        type: DataTypes.DATE,
        defaultValue: null,
        comment: '移入回收站时间（trashed 状态超过 7 天后定时任务物理删除）'
      }
    },
    {
      sequelize,
      modelName: 'MediaFile',
      tableName: 'media_files',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '媒体文件表（纯存储层 - 独立媒体服务方案 D+ 增强版）'
    }
  )

  return MediaFile
}
