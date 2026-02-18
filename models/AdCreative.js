/**
 * 广告创意模型（AdCreative）
 *
 * 业务场景：
 * - 管理广告计划下的具体创意内容（图片、标题、链接等）
 * - 支持创意的审核流程（待审核→已审核/已拒绝）
 * - 记录创意的审核信息和审核人
 *
 * 设计决策：
 * - 一个广告计划可以有多个创意（用于A/B测试或轮播展示）
 * - 创意需要单独审核，审核通过后才能使用
 * - 记录图片尺寸信息，便于前端展示
 * - 支持多种链接类型（外部链接、内部页面等）
 *
 * 数据库表名：ad_creatives
 * 主键：ad_creative_id（INT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 链接类型有效值
 * @constant {string[]}
 */
const VALID_LINK_TYPES = ['none', 'external', 'internal', 'app_page']

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

      image_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        validate: {
          notEmpty: { msg: '图片URL不能为空' },
          len: { args: [1, 500], msg: '图片URL长度必须在1-500字符之间' }
        },
        comment: '图片URL（对象存储key）'
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
            msg: '链接类型必须是：none, external, internal, app_page 之一'
          }
        },
        comment:
          '链接类型：none=无链接 / external=外部链接 / internal=内部页面 / app_page=应用内页面'
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
module.exports.VALID_REVIEW_STATUSES = VALID_REVIEW_STATUSES
