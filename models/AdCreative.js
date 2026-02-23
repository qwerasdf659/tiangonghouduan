/**
 * 广告创意模型（AdCreative）
 *
 * 业务场景：
 * - 管理广告计划下的具体创意内容（图片、文字、标题、链接等）
 * - 支持图片创意（commercial/operational）和纯文字创意（system 公告）
 * - 支持创意的审核流程（commercial 类型需审核，operational/system 直接 approved）
 * - 记录创意的审核信息和审核人
 *
 * 设计决策：
 * - content_type 区分图片/文字创意（合并 SystemAnnouncement 的文字内容）
 * - display_mode 记录显示模式（从 PopupBanner 合并而来）
 * - link_type 统一为微信系命名（D3 定论：page/miniprogram/webview）
 * - image_url 允许为空（text 类型无图片）
 *
 * 数据库表名：ad_creatives
 * 主键：ad_creative_id（INT，自增）
 *
 * @see docs/内容投放系统-重复功能合并方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 链接类型有效值（D3 定论：统一为微信系命名）
 * - none：无跳转
 * - page：小程序内部页面（对应 wx.navigateTo）
 * - miniprogram：跳转其他小程序（对应 wx.navigateToMiniProgram）
 * - webview：H5 页面（对应 web-view 组件）
 * @constant {string[]}
 */
const VALID_LINK_TYPES = ['none', 'page', 'miniprogram', 'webview']

/**
 * 创意内容类型有效值
 * @constant {string[]}
 */
const VALID_CONTENT_TYPES = ['image', 'text']

/**
 * 显示模式有效值（从 PopupBanner 合并而来）
 * @constant {string[]}
 */
const VALID_DISPLAY_MODES = ['wide', 'horizontal', 'square', 'tall', 'slim', 'full_image']

/**
 * 审核状态有效值
 * @constant {string[]}
 */
const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected']

/**
 * 定义 AdCreative 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdCreative 模型
 */
module.exports = sequelize => {
  const AdCreative = sequelize.define(
    'AdCreative',
    {
      ad_creative_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '广告创意主键ID'
      },

      ad_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属广告计划ID'
      },

      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '创意标题不能为空' },
          len: { args: [1, 100], msg: '创意标题长度必须在1-100字符之间' }
        },
        comment: '创意标题'
      },

      content_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'image',
        validate: {
          notEmpty: { msg: '内容类型不能为空' },
          isIn: {
            args: [VALID_CONTENT_TYPES],
            msg: '内容类型必须是：image, text 之一'
          }
        },
        comment: '创意内容类型：image=图片 / text=纯文字（系统公告）'
      },

      image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          /**
           * @param {string|null} value - 图片URL，content_type='image' 时必填
           * @returns {void}
           */
          conditionalNotEmpty(value) {
            if (this.content_type === 'image' && (!value || value.trim() === '')) {
              throw new Error('图片类型创意必须提供图片URL')
            }
          },
          len: { args: [0, 500], msg: '图片URL长度不能超过500字符' }
        },
        comment: '图片URL（content_type=image 时必填，text 类型为 NULL）'
      },

      image_width: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        validate: {
          min: { args: [1], msg: '图片宽度不能小于1' }
        },
        comment: '图片宽度（像素）'
      },

      image_height: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        validate: {
          min: { args: [1], msg: '图片高度不能小于1' }
        },
        comment: '图片高度（像素）'
      },

      link_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: '链接URL长度不能超过500字符' }
        },
        comment: '跳转链接URL'
      },

      link_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'none',
        validate: {
          notEmpty: { msg: '链接类型不能为空' },
          isIn: {
            args: [VALID_LINK_TYPES],
            msg: '链接类型必须是：none, page, miniprogram, webview 之一'
          }
        },
        comment:
          '链接类型（D3 定论微信系命名）：none=无跳转 / page=小程序页面 / miniprogram=其他小程序 / webview=H5页面'
      },

      text_content: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '文字内容（content_type=text 时使用，如系统公告的文字正文）'
      },

      display_mode: {
        type: DataTypes.STRING(30),
        allowNull: true,
        validate: {
          /**
           * @param {string|null} value - 显示模式值，校验是否在允许的枚举范围内
           * @returns {void}
           */
          isValidMode(value) {
            if (value !== null && !VALID_DISPLAY_MODES.includes(value)) {
              throw new Error('显示模式必须是：' + VALID_DISPLAY_MODES.join(', ') + ' 之一')
            }
          }
        },
        comment:
          '显示模式（原 PopupBanner 属性）：wide / horizontal / square / tall / slim / full_image'
      },

      review_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          notEmpty: { msg: '审核状态不能为空' },
          isIn: {
            args: [VALID_REVIEW_STATUSES],
            msg: '审核状态必须是：pending, approved, rejected 之一'
          }
        },
        comment: '审核状态：pending=待审核 / approved=已通过 / rejected=已拒绝'
      },

      review_note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '审核备注'
      },

      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核人用户ID'
      },

      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
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
      tableName: 'ad_creatives',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '广告创意表 - 管理广告计划下的具体创意内容',

      hooks: {
        beforeCreate: creative => {
          creative.created_at = BeijingTimeHelper.createBeijingTime()
          creative.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: creative => {
          creative.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_campaign', fields: ['ad_campaign_id'] },
        { name: 'idx_review_status', fields: ['review_status'] },
        { name: 'idx_reviewed_by', fields: ['reviewed_by'] }
      ],

      scopes: {
        pending: { where: { review_status: 'pending' } },
        approved: { where: { review_status: 'approved' } },
        rejected: { where: { review_status: 'rejected' } }
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdCreative.associate = models => {
    // 所属广告计划
    AdCreative.belongsTo(models.AdCampaign, {
      foreignKey: 'ad_campaign_id',
      as: 'campaign',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    // 审核人
    AdCreative.belongsTo(models.User, {
      foreignKey: 'reviewed_by',
      as: 'reviewer',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return AdCreative
}

module.exports.VALID_LINK_TYPES = VALID_LINK_TYPES
module.exports.VALID_CONTENT_TYPES = VALID_CONTENT_TYPES
module.exports.VALID_DISPLAY_MODES = VALID_DISPLAY_MODES
module.exports.VALID_REVIEW_STATUSES = VALID_REVIEW_STATUSES
