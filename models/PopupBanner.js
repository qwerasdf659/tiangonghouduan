/**
 * 弹窗Banner配置模型（PopupBanner）
 *
 * 业务场景：
 * - 用户打开微信小程序首页时显示弹窗图片
 * - 管理员通过Web后台管理弹窗配置
 * - 支持多弹窗位、时间范围控制、点击跳转
 *
 * 核心功能：
 * - 支持多弹窗位置（首页/个人中心等）
 * - 支持时间范围控制（开始/结束时间）
 * - 支持点击跳转（小程序页面/H5页面/其他小程序）
 * - 支持显示顺序控制
 * - 支持启用/禁用管理
 *
 * 数据库表名：popup_banners
 * 主键：banner_id（INTEGER，自增）
 *
 * 创建时间：2025-12-22
 */

const { DataTypes, Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 PopupBanner 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} PopupBanner 模型
 */
module.exports = sequelize => {
  const PopupBanner = sequelize.define(
    'PopupBanner',
    {
      // 主键ID
      banner_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '弹窗Banner主键ID'
      },

      // 弹窗标题（便于后台管理识别）
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '弹窗标题不能为空'
          },
          len: {
            args: [1, 100],
            msg: '弹窗标题长度必须在1-100字符之间'
          }
        },
        comment: '弹窗标题（便于后台管理识别）'
      },

      /*
       * 图片存储路径（Sealos对象存储 key）
       * 🎯 架构决策（2026-01-08 拍板 + 2026-01-14 图片缩略图架构兼容残留核查报告强化）：
       * - 只允许存储对象 key（如 popup-banners/xxx.jpg）
       * - 不再兼容完整 URL 或本地路径
       * - 前端显示时统一通过 ImageUrlHelper.getImageUrl() 生成完整 CDN URL
       */
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '弹窗图片路径不能为空'
          },
          /**
           * 强制校验 object key 格式（2026-01-14 图片缩略图架构兼容残留核查报告决策）
           * @param {string} value - 图片路径值
           * @returns {void}
           * @throws {Error} 当值为完整 URL 或本地路径时抛出错误
           */
          isValidObjectKey(value) {
            const { isValidObjectKey } = require('../utils/ImageUrlHelper')
            if (!isValidObjectKey(value)) {
              throw new Error(
                '图片路径必须是对象存储 key 格式（如 popup-banners/xxx.jpg），' +
                  '不允许完整 URL 或本地路径: ' +
                  value
              )
            }
          }
        },
        comment: '图片存储路径（仅对象 key，如 popup-banners/xxx.jpg）'
      },

      // 点击跳转链接（可选）
      link_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          /**
           * 自定义验证：当 link_type 不为 none 时，link_url 必填
           * @param {string|null} value - 跳转链接值
           * @returns {void}
           * @throws {Error} 当跳转类型不为 none 且链接为空时抛出错误
           */
          linkUrlRequired(value) {
            if (this.link_type !== 'none' && (!value || value.trim() === '')) {
              throw new Error('当跳转类型不为 none 时，跳转链接不能为空')
            }
          }
        },
        comment: '点击跳转链接（可选）'
      },

      // 跳转类型
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
        comment: '跳转类型：none-不跳转, page-小程序页面, miniprogram-其他小程序, webview-H5页面'
      },

      // 显示位置
      position: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'home',
        validate: {
          notEmpty: {
            msg: '显示位置不能为空'
          }
        },
        comment: '显示位置：home-首页, profile-个人中心等'
      },

      // 是否启用
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否启用'
      },

      // 显示顺序（数字小的优先）
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: {
            args: [0],
            msg: '显示顺序不能为负数'
          }
        },
        comment: '显示顺序（数字小的优先）'
      },

      // 开始展示时间
      start_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始展示时间（NULL表示立即生效）'
      },

      // 结束展示时间
      end_time: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          /**
           * 验证结束时间必须晚于开始时间
           * @param {Date|null} value - 结束时间值
           * @returns {void}
           * @throws {Error} 当结束时间早于或等于开始时间时抛出错误
           */
          isAfterStartTime(value) {
            if (value && this.start_time && new Date(value) <= new Date(this.start_time)) {
              throw new Error('结束时间必须晚于开始时间')
            }
          }
        },
        comment: '结束展示时间（NULL表示永不过期）'
      },

      // 创建人ID
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '创建人ID'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /**
         * 获取北京时间格式的创建时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /**
         * 获取北京时间格式的更新时间
         * @returns {string} 北京时间格式的日期字符串（YYYY年MM月DD日 HH:mm:ss）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment: '更新时间'
      }
    },
    {
      tableName: 'popup_banners',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '弹窗Banner配置表 - 支持首页弹窗功能',

      // 钩子函数
      hooks: {
        beforeCreate: banner => {
          banner.created_at = BeijingTimeHelper.createBeijingTime()
          banner.updated_at = BeijingTimeHelper.createBeijingTime()
        },
        beforeUpdate: banner => {
          banner.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      // 索引
      indexes: [
        {
          name: 'idx_popup_banners_position_active',
          fields: ['position', 'is_active']
        },
        {
          name: 'idx_popup_banners_display_order',
          fields: ['display_order']
        },
        {
          name: 'idx_popup_banners_time_range',
          fields: ['start_time', 'end_time']
        }
      ],

      // 作用域（Scope）：预定义查询条件
      scopes: {
        // 只查询启用的弹窗
        active: {
          where: {
            is_active: true
          }
        },

        // 只查询首页弹窗
        home: {
          where: {
            position: 'home'
          }
        },

        // 只查询当前有效的弹窗（在时间范围内）
        valid: {
          where: {
            is_active: true,
            [Op.or]: [{ start_time: null }, { start_time: { [Op.lte]: new Date() } }],
            [Op.and]: [
              {
                [Op.or]: [{ end_time: null }, { end_time: { [Op.gt]: new Date() } }]
              }
            ]
          }
        }
      }
    }
  )

  /*
   * ========================
   * 实例方法
   * ========================
   */

  /**
   * 检查弹窗是否已过期
   * @returns {boolean} true-已过期，false-未过期或无过期时间
   */
  PopupBanner.prototype.isExpired = function () {
    if (!this.end_time) return false
    return new Date(this.end_time) <= BeijingTimeHelper.createBeijingTime()
  }

  /**
   * 检查弹窗是否还未开始
   * @returns {boolean} true-未开始，false-已开始或无开始时间
   */
  PopupBanner.prototype.isNotStarted = function () {
    if (!this.start_time) return false
    return new Date(this.start_time) > BeijingTimeHelper.createBeijingTime()
  }

  /**
   * 检查弹窗当前是否有效（在展示时间范围内且已启用）
   * @returns {boolean} true-有效，false-无效
   */
  PopupBanner.prototype.isCurrentlyValid = function () {
    return this.is_active && !this.isExpired() && !this.isNotStarted()
  }

  /**
   * 获取弹窗状态描述
   * @returns {string} 状态描述
   */
  PopupBanner.prototype.getStatusDescription = function () {
    if (!this.is_active) return '已禁用'
    if (this.isNotStarted()) return '未开始'
    if (this.isExpired()) return '已过期'
    return '展示中'
  }

  /*
   * ========================
   * 类方法
   * ========================
   */

  /**
   * 获取当前有效的弹窗列表（供小程序端调用）
   *
   * @param {Object} options - 查询选项
   * @param {string} options.position - 显示位置（默认 home）
   * @param {number} options.limit - 返回数量限制（默认 10）
   * @returns {Promise<Array<PopupBanner>>} 有效弹窗列表
   */
  PopupBanner.getActiveBanners = async function (options = {}) {
    const { position = 'home', limit = 10 } = options
    const now = BeijingTimeHelper.createBeijingTime()

    return this.findAll({
      where: {
        is_active: true,
        position,
        // 开始时间：NULL 或 <= 当前时间
        [Op.or]: [{ start_time: null }, { start_time: { [Op.lte]: now } }],
        // 结束时间：NULL 或 > 当前时间
        [Op.and]: [
          {
            [Op.or]: [{ end_time: null }, { end_time: { [Op.gt]: now } }]
          }
        ]
      },
      order: [
        ['display_order', 'ASC'],
        ['created_at', 'DESC']
      ],
      limit,
      attributes: ['banner_id', 'title', 'image_url', 'link_url', 'link_type']
    })
  }

  /**
   * 获取管理后台弹窗列表（包含全部信息）
   *
   * @param {Object} options - 查询选项
   * @param {string|null} options.position - 显示位置筛选
   * @param {boolean|null} options.is_active - 启用状态筛选
   * @param {number} options.limit - 每页数量
   * @param {number} options.offset - 偏移量
   * @returns {Promise<{rows: Array<PopupBanner>, count: number}>} 弹窗列表和总数
   */
  PopupBanner.getAdminBannerList = async function (options = {}) {
    const { position = null, is_active = null, limit = 20, offset = 0 } = options

    const whereClause = {}
    if (position) whereClause.position = position
    if (is_active !== null) whereClause.is_active = is_active

    return this.findAndCountAll({
      where: whereClause,
      order: [
        ['display_order', 'ASC'],
        ['created_at', 'DESC']
      ],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })
  }

  /**
   * 创建弹窗
   *
   * @param {Object} data - 弹窗数据
   * @param {number} adminId - 创建人ID
   * @returns {Promise<PopupBanner>} 新创建的弹窗实例
   */
  PopupBanner.createBanner = async function (data, adminId) {
    return this.create({
      ...data,
      created_by: adminId,
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })
  }

  /**
   * 切换弹窗启用状态
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<PopupBanner|null>} 更新后的弹窗实例，不存在返回null
   */
  PopupBanner.toggleActive = async function (bannerId) {
    const banner = await this.findByPk(bannerId)
    if (!banner) return null

    banner.is_active = !banner.is_active
    banner.updated_at = BeijingTimeHelper.createBeijingTime()
    await banner.save()
    return banner
  }

  /*
   * ========================
   * 模型关联
   * ========================
   */

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  PopupBanner.associate = models => {
    // 关联创建者
    PopupBanner.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return PopupBanner
}
