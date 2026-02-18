/**
 * 轮播图配置模型（CarouselItem）
 *
 * 业务场景：
 * - 微信小程序首页 swiper 组件内嵌的轮播图展示
 * - 管理员通过 Web 后台配置轮播图内容、排序、时间范围
 * - 与弹窗（popup_banners）完全独立，交互形态不同
 *
 * 设计决策：
 * - 拍板决策1：轮播图独立为 carousel_items 表，不与弹窗混用 banner_type
 * - 轮播图不需要频率控制（页面内嵌组件，不打断用户操作）
 * - 排序方式：display_order ASC（管理排序），created_at DESC（同序时新的在前）
 *
 * 数据库表名：carousel_items
 * 主键：carousel_item_id（INTEGER，自增）
 *
 * @see docs/广告系统升级方案.md 第十四节 14.1
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 轮播图显示模式有效值（轮播图常用宽屏比例，不需要 tall/slim/full_image）
 * @constant {string[]}
 */
const VALID_CAROUSEL_DISPLAY_MODES = ['wide', 'horizontal', 'square']

/**
 * 定义 CarouselItem 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} CarouselItem 模型
 */
module.exports = sequelize => {
  const CarouselItem = sequelize.define(
    'CarouselItem',
    {
      carousel_item_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '轮播图主键ID'
      },

      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '轮播图标题不能为空' },
          len: { args: [1, 100], msg: '轮播图标题长度必须在1-100字符之间' }
        },
        comment: '轮播图标题（后台管理识别用）'
      },

      /**
       * 图片对象 key（Sealos 对象存储）
       * 存储格式：carousel/xxx.jpg，前端通过 ImageUrlHelper.getImageUrl() 转完整 CDN URL
       */
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        validate: {
          notEmpty: { msg: '轮播图图片路径不能为空' },
          /**
           * @param {string} value - 图片路径
           * @returns {void}
           */
          isValidObjectKey(value) {
            const { isValidObjectKey } = require('../utils/ImageUrlHelper')
            if (!isValidObjectKey(value)) {
              throw new Error(
                '图片路径必须是对象存储 key 格式（如 carousel/xxx.jpg），不允许完整 URL: ' + value
              )
            }
          }
        },
        comment: '图片对象 key（如 carousel/xxx.jpg）'
      },

      display_mode: {
        type: DataTypes.ENUM('wide', 'horizontal', 'square'),
        allowNull: false,
        defaultValue: 'wide',
        validate: {
          isIn: {
            args: [VALID_CAROUSEL_DISPLAY_MODES],
            msg: '显示模式必须是：wide, horizontal, square 之一'
          }
        },
        comment: '显示模式：wide=宽屏16:9 / horizontal=横版3:2 / square=方图1:1'
      },

      image_width: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        comment: '原图宽度(px)，上传时自动检测'
      },

      image_height: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        comment: '原图高度(px)，上传时自动检测'
      },

      link_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          /**
           * @param {string|null} value - 跳转链接
           * @returns {void}
           */
          linkUrlRequired(value) {
            if (this.link_type !== 'none' && (!value || value.trim() === '')) {
              throw new Error('当跳转类型不为 none 时，跳转链接不能为空')
            }
          }
        },
        comment: '跳转链接'
      },

      link_type: {
        type: DataTypes.ENUM('none', 'page', 'miniprogram', 'webview'),
        allowNull: false,
        defaultValue: 'none',
        validate: {
          isIn: {
            args: [['none', 'page', 'miniprogram', 'webview']],
            msg: '跳转类型必须是：none, page, miniprogram, webview 之一'
          }
        },
        comment: '跳转类型：none=不跳转 / page=小程序页面 / miniprogram=其他小程序 / webview=H5页面'
      },

      position: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'home',
        validate: { notEmpty: { msg: '显示位置不能为空' } },
        comment: '显示位置：home=首页'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否启用'
      },

      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: '显示顺序不能为负数' } },
        comment: '显示顺序（数字小的排前面）'
      },

      /** 轮播间隔毫秒，小程序 swiper 的 interval 属性 */
      slide_interval_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3000,
        validate: { min: { args: [1000], msg: '轮播间隔不能小于1000毫秒' } },
        comment: '轮播间隔毫秒（默认3秒）'
      },

      start_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始展示时间（NULL表示立即生效）'
      },

      end_time: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          /**
           * @param {Date|null} value - 结束时间
           * @returns {void}
           */
          isAfterStartTime(value) {
            if (value && this.start_time && new Date(value) <= new Date(this.start_time)) {
              throw new Error('结束时间必须晚于开始时间')
            }
          }
        },
        comment: '结束展示时间（NULL表示永不过期）'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        comment: '创建人ID'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'carousel_items',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '轮播图配置表 - 页面内嵌 swiper 组件，与弹窗独立管理',

      hooks: {
        beforeCreate: item => {
          item.created_at = BeijingTimeHelper.createBeijingTime()
          item.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: item => {
          item.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_carousel_position_active', fields: ['position', 'is_active'] },
        { name: 'idx_carousel_display_order', fields: ['display_order'] },
        { name: 'idx_carousel_time_range', fields: ['start_time', 'end_time'] }
      ],

      scopes: {
        active: { where: { is_active: true } },
        home: { where: { position: 'home' } }
      }
    }
  )

  /**
   * @returns {boolean} 是否已过期
   */
  CarouselItem.prototype.isExpired = function () {
    if (!this.end_time) return false
    return new Date(this.end_time) <= BeijingTimeHelper.createBeijingTime()
  }

  /**
   * @returns {boolean} 是否未开始
   */
  CarouselItem.prototype.isNotStarted = function () {
    if (!this.start_time) return false
    return new Date(this.start_time) > BeijingTimeHelper.createBeijingTime()
  }

  /**
   * @returns {boolean} 当前是否有效（启用 + 时间范围内）
   */
  CarouselItem.prototype.isCurrentlyValid = function () {
    return this.is_active && !this.isExpired() && !this.isNotStarted()
  }

  /**
   * @returns {string} 状态描述文本
   */
  CarouselItem.prototype.getStatusDescription = function () {
    if (!this.is_active) return '已禁用'
    if (this.isNotStarted()) return '未开始'
    if (this.isExpired()) return '已过期'
    return '展示中'
  }

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  CarouselItem.associate = models => {
    CarouselItem.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return CarouselItem
}

module.exports.VALID_CAROUSEL_DISPLAY_MODES = VALID_CAROUSEL_DISPLAY_MODES
