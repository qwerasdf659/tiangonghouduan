/**
 * 广告位模型（AdSlot）
 *
 * 业务场景：
 * - 定义系统中可用的广告位（弹窗、轮播图等）
 * - 管理广告位的配置信息（价格、竞价规则、展示限制等）
 * - 支持广告位的启用/禁用、价格调整等操作
 *
 * 设计决策：
 * - 广告位与广告活动分离，便于统一管理
 * - 支持固定价格和竞价两种计费模式
 * - 记录广告位的基本信息和业务规则
 *
 * 数据库表名：ad_slots
 * 主键：ad_slot_id（INT，自增）
 *
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告位类型有效值（单一真相源 SSOT）
 * - popup：弹窗
 * - carousel：轮播图
 * - announcement：系统公告展示位
 * - feed：信息流广告位
 * - top_banner：页面头部沉浸式 Banner（运营可配，2026-06-21 新增）
 * @constant {string[]}
 */
const VALID_SLOT_TYPES = ['popup', 'carousel', 'announcement', 'feed', 'top_banner']

/**
 * 定义 AdSlot 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} AdSlot 模型
 */
module.exports = sequelize => {
  const AdSlot = sequelize.define(
    'AdSlot',
    {
      ad_slot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '广告位主键ID'
      },

      slot_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: '广告位标识不能为空' },
          len: { args: [1, 50], msg: '广告位标识长度必须在1-50字符之间' }
        },
        comment: '广告位唯一标识（如：home_popup, home_carousel）'
      },

      slot_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '广告位名称不能为空' },
          len: { args: [1, 100], msg: '广告位名称长度必须在1-100字符之间' }
        },
        comment: '广告位名称（如：首页弹窗、首页轮播图）'
      },

      slot_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '广告位类型不能为空' },
          isIn: {
            args: [VALID_SLOT_TYPES],
            msg: '广告位类型必须是：popup, carousel, announcement, feed, top_banner 之一'
          }
        },
        comment:
          '广告位类型：popup=弹窗 / carousel=轮播图 / announcement=系统公告 / feed=信息流 / top_banner=页面头部Banner'
      },

      position: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: { notEmpty: { msg: '显示位置不能为空' } },
        comment: '显示位置（如：home=首页）'
      },

      max_display_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        validate: {
          min: { args: [1], msg: '最大展示次数不能小于1' }
        },
        comment: '最大展示次数（同一用户每天最多看到几次）'
      },

      daily_price_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: { args: [0], msg: '每日价格不能为负数' }
        },
        comment: '每日固定价格（星石），用于固定价格模式'
      },

      min_bid_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: { args: [1], msg: '最低竞价不能小于1' }
        },
        comment: '最低竞价（星石），用于竞价模式'
      },

      min_budget_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 500,
        validate: {
          min: { args: [1], msg: '最低预算不能小于1' }
        },
        comment: '最低预算（星石），用于竞价模式'
      },

      /** DAU 系数计算结果不得低于此值，0 表示不限制 */
      min_daily_price_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '最低日价下限（DAU 系数计算结果不得低于此值），0 表示不限制'
      },

      /** 运营手动覆盖的竞价底价（优先于动态计算值） */
      floor_price_override: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '运营手动覆盖的竞价底价，NULL 表示使用自动计算'
      },

      /** 绑定地域ID（NULL=全站级别广告位） */
      zone_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'ad_target_zones', key: 'zone_id' },
        onDelete: 'SET NULL',
        comment: '绑定地域ID（NULL=全站级别广告位）'
      },

      /** 广告位大类：display=展示广告（按天/竞价）, feed=信息流广告（CPM） */
      slot_category: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'display',
        comment: '广告位大类：display=展示广告, feed=信息流广告'
      },

      /** 每千次曝光价格（星石），仅 slot_category=feed 时使用 */
      cpm_price_star_stone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '每千次曝光价格（星石），仅信息流广告使用'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /** 是否轮播：0=单张（取 priority 最高 1 条），1=多张轮播。轮播节奏归槽位级，符合大厂"节奏属于位"做法 */
      is_carousel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否轮播：0=单张(取priority最高1条)，1=多张轮播'
      },

      /** 轮播间隔毫秒（仅 is_carousel=1 生效）。运营推荐区间 2000-8000，硬边界 500-15000 */
      slide_interval_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3000,
        validate: {
          min: { args: [500], msg: '轮播间隔不能小于500毫秒' },
          max: { args: [15000], msg: '轮播间隔不能大于15000毫秒' }
        },
        comment: '轮播间隔毫秒（仅 is_carousel=1 生效，运营可配 2000-8000，硬边界 500-15000）'
      },

      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '广告位描述'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '更新时间'
      }
    },
    {
      tableName: 'ad_slots',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '广告位配置表 - 定义系统中可用的广告位',

      hooks: {
        beforeCreate: slot => {
          slot.created_at = BeijingTimeHelper.createBeijingTime()
          slot.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: slot => {
          slot.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_slot_key', fields: ['slot_key'], unique: true },
        { name: 'idx_slot_type', fields: ['slot_type'] },
        { name: 'idx_slot_position', fields: ['position'] },
        { name: 'idx_slot_active', fields: ['is_active'] }
      ],

      scopes: {
        active: { where: { is_active: true } },
        byType: slot_type => ({ where: { slot_type } }),
        byPosition: position => ({ where: { position } })
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  AdSlot.associate = models => {
    AdSlot.hasMany(models.AdCampaign, {
      foreignKey: 'ad_slot_id',
      as: 'campaigns',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })
  }

  return AdSlot
}

module.exports.VALID_SLOT_TYPES = VALID_SLOT_TYPES
