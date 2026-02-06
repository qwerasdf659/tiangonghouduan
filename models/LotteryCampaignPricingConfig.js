/**
 * 📊 活动级定价配置模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 定义各活动的连抽定价规则（支持 1-20 次抽奖）
 * - 支持版本化管理（可回滚/可定时生效/多版本）
 * - 作为 PricingStage 的唯一定价真值来源
 *
 * 设计原则：
 * - 定价唯一真值：此表作为运行时定价的唯一来源
 * - 版本化管理：同一活动可有多个版本，通过 status 控制生效
 * - 定时生效：通过 effective_at/expired_at 控制生效时间范围
 * - 运营可动态调整：运营可随时修改任意档位的 discount
 *
 * 关联关系：
 * - 多对一：LotteryCampaignPricingConfig.lottery_campaign_id -> LotteryCampaign.lottery_campaign_id
 * - 多对一：LotteryCampaignPricingConfig.created_by -> User.user_id
 * - 多对一：LotteryCampaignPricingConfig.updated_by -> User.user_id
 *
 * @module models/LotteryCampaignPricingConfig
 * @author 统一抽奖架构重构 - Phase 3
 * @since 2026-01-18
 */

'use strict'

const { Model, DataTypes, Op } = require('sequelize')

/**
 * 活动级定价配置模型
 * 业务场景：PricingStage 读取此表获取活动的连抽定价配置
 */
class LotteryCampaignPricingConfig extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：定价配置属于某个活动
    LotteryCampaignPricingConfig.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '所属抽奖活动'
    })

    // 多对一：配置创建者
    LotteryCampaignPricingConfig.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'RESTRICT',
      comment: '配置创建者'
    })

    // 多对一：配置更新者
    LotteryCampaignPricingConfig.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater',
      onDelete: 'SET NULL',
      comment: '配置更新者'
    })
  }

  /**
   * 获取状态显示名称
   * @returns {string} 状态中文名称
   */
  getStatusDisplayName() {
    const statusNames = {
      draft: '草稿',
      active: '生效中',
      scheduled: '待生效',
      archived: '已归档'
    }
    return statusNames[this.status] || '未知状态'
  }

  /**
   * 检查配置是否在生效时间范围内
   * @param {Date} checkTime - 要检查的时间点，默认为当前时间
   * @returns {boolean} 是否在生效时间范围内
   */
  isEffective(checkTime = new Date()) {
    // 检查生效时间
    if (this.effective_at && new Date(this.effective_at) > checkTime) {
      return false
    }

    // 检查过期时间
    if (this.expired_at && new Date(this.expired_at) < checkTime) {
      return false
    }

    return this.status === 'active'
  }

  /**
   * 获取指定抽奖次数的定价配置
   * @param {number} drawCount - 抽奖次数
   * @returns {Object|null} 定价配置对象或 null
   */
  getDrawButtonConfig(drawCount) {
    if (!this.pricing_config || !this.pricing_config.draw_buttons) {
      return null
    }

    return this.pricing_config.draw_buttons.find(
      button => button.count === drawCount && button.enabled !== false
    )
  }

  /**
   * 获取所有启用的抽奖按钮
   * @returns {Array} 启用的抽奖按钮数组
   */
  getEnabledDrawButtons() {
    if (!this.pricing_config || !this.pricing_config.draw_buttons) {
      return []
    }

    return this.pricing_config.draw_buttons
      .filter(button => button.enabled !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  /**
   * 获取启用的抽奖次数列表
   * @returns {Array<number>} 启用的抽奖次数数组
   */
  getEnabledDrawCounts() {
    return this.getEnabledDrawButtons().map(button => button.count)
  }

  /**
   * 计算指定抽奖次数的总价格
   * @param {number} drawCount - 抽奖次数
   * @param {number} baseCost - 单抽基础成本（从 system_settings 获取）
   * @returns {Object} 定价信息 { total_cost, original_cost, discount, saved_points, label }
   */
  calculatePrice(drawCount, baseCost) {
    const buttonConfig = this.getDrawButtonConfig(drawCount)

    if (!buttonConfig) {
      return null
    }

    const originalCost = baseCost * drawCount
    const discount = buttonConfig.discount || 1.0
    const totalCost = Math.floor(originalCost * discount)
    const savedPoints = originalCost - totalCost

    return {
      total_cost: totalCost,
      original_cost: originalCost,
      unit_cost: baseCost,
      discount,
      saved_points: savedPoints,
      label: buttonConfig.label || `${drawCount}连抽`,
      draw_count: drawCount
    }
  }

  /**
   * 获取活动的当前生效定价配置（静态方法）
   *
   * 查询规则：
   * 1. status = 'active'
   * 2. effective_at <= NOW() 或 effective_at IS NULL
   * 3. expired_at >= NOW() 或 expired_at IS NULL
   * 4. 按 version DESC 取最新版本
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项（可包含 transaction）
   * @returns {Promise<LotteryCampaignPricingConfig|null>} 配置实例或 null
   */
  static async getActivePricingConfig(campaignId, options = {}) {
    const { transaction } = options
    const now = new Date()

    const config = await this.findOne({
      where: {
        lottery_campaign_id: campaignId,
        status: 'active',
        [Op.and]: [
          {
            [Op.or]: [{ effective_at: { [Op.lte]: now } }, { effective_at: null }]
          },
          {
            [Op.or]: [{ expired_at: { [Op.gte]: now } }, { expired_at: null }]
          }
        ]
      },
      order: [['version', 'DESC']],
      transaction
    })

    return config
  }

  /**
   * 获取活动的所有定价配置版本（静态方法）
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array<LotteryCampaignPricingConfig>>} 配置数组
   */
  static async getAllVersions(campaignId, options = {}) {
    const { transaction, limit = 20 } = options

    return await this.findAll({
      where: { lottery_campaign_id: campaignId },
      order: [['version', 'DESC']],
      limit,
      transaction
    })
  }

  /**
   * 创建新版本配置（静态方法）
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} pricingConfig - 定价配置 JSON
   * @param {number} createdBy - 创建者用户ID
   * @param {Object} options - 创建选项
   * @returns {Promise<LotteryCampaignPricingConfig>} 新创建的配置实例
   */
  static async createNewVersion(campaignId, pricingConfig, createdBy, options = {}) {
    const { transaction, status = 'draft', effectiveAt = null, expiredAt = null } = options

    // 获取当前最大版本号
    const maxVersionResult = await this.findOne({
      where: { lottery_campaign_id: campaignId },
      order: [['version', 'DESC']],
      attributes: ['version'],
      transaction
    })

    const newVersion = (maxVersionResult?.version || 0) + 1

    // 生成配置ID
    const timestamp = Date.now()
    const randomCode = Math.random().toString(36).substring(2, 8)
    const configId = `pricing_${timestamp}_${randomCode}`

    return await this.create(
      {
        lottery_campaign_pricing_config_id: configId,
        lottery_campaign_id: campaignId,
        version: newVersion,
        pricing_config: pricingConfig,
        status,
        effective_at: effectiveAt,
        expired_at: expiredAt,
        created_by: createdBy
      },
      { transaction }
    )
  }

  /**
   * 激活指定版本（归档当前版本，激活目标版本）
   *
   * @param {number} campaignId - 活动ID
   * @param {number} targetVersion - 目标版本号
   * @param {number} updatedBy - 操作者用户ID
   * @param {Object} options - 操作选项
   * @returns {Promise<Object>} 操作结果
   */
  static async activateVersion(campaignId, targetVersion, updatedBy, options = {}) {
    const { transaction } = options

    // 1. 归档当前激活的版本
    await this.update(
      { status: 'archived', updated_by: updatedBy },
      {
        where: { lottery_campaign_id: campaignId, status: 'active' },
        transaction
      }
    )

    // 2. 激活目标版本
    const [affectedRows] = await this.update(
      { status: 'active', updated_by: updatedBy },
      {
        where: { lottery_campaign_id: campaignId, version: targetVersion },
        transaction
      }
    )

    return {
      success: affectedRows > 0,
      lottery_campaign_id: campaignId,
      activated_version: targetVersion,
      affected_rows: affectedRows
    }
  }

  /**
   * 验证定价配置结构
   * @param {Object} pricingConfig - 定价配置对象
   * @returns {Object} 验证结果 { valid: boolean, errors: Array }
   */
  static validatePricingConfig(pricingConfig) {
    const errors = []

    if (!pricingConfig || typeof pricingConfig !== 'object') {
      errors.push('定价配置必须是对象')
      return { valid: false, errors }
    }

    if (!Array.isArray(pricingConfig.draw_buttons)) {
      errors.push('定价配置必须包含 draw_buttons 数组')
      return { valid: false, errors }
    }

    const seenCounts = new Set()

    for (const button of pricingConfig.draw_buttons) {
      // 检查必需字段
      if (typeof button.count !== 'number' || button.count < 1 || button.count > 20) {
        errors.push(`按钮 count 必须是 1-20 的整数，当前: ${button.count}`)
      }

      if (typeof button.discount !== 'number' || button.discount <= 0 || button.discount > 1) {
        errors.push(`按钮 discount 必须是 0-1 的小数，当前: ${button.discount}`)
      }

      // 检查重复
      if (seenCounts.has(button.count)) {
        errors.push(`按钮 count 重复: ${button.count}`)
      }
      seenCounts.add(button.count)
    }

    return { valid: errors.length === 0, errors }
  }
}

/**
 * 模型初始化函数
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} 初始化后的模型
 */
LotteryCampaignPricingConfig.initModel = function (sequelize) {
  LotteryCampaignPricingConfig.init(
    {
      /**
       * 配置ID - 主键
       * 格式：pricing_时间戳_随机码
       */
      lottery_campaign_pricing_config_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        comment: '配置唯一ID（格式：pricing_时间戳_随机码）'
      },

      /**
       * 活动ID - 外键关联 lottery_campaigns
       */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID（外键关联lottery_campaigns.lottery_campaign_id）'
      },

      /**
       * 版本号 - 同一活动的版本递增
       */
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '版本号（同一活动递增，支持版本回滚）'
      },

      /**
       * 定价配置 - JSON 格式
       */
      pricing_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '定价配置JSON（draw_buttons数组：count/discount/label/enabled/sort_order）'
      },

      /**
       * 配置状态
       */
      status: {
        type: DataTypes.ENUM('draft', 'active', 'scheduled', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '状态：draft-草稿, active-生效中, scheduled-待生效, archived-已归档'
      },

      /**
       * 生效时间
       */
      effective_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效时间（NULL表示立即生效）'
      },

      /**
       * 过期时间
       */
      expired_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间（NULL表示永不过期）'
      },

      /**
       * 创建人ID
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID（外键关联users.user_id）'
      },

      /**
       * 最后修改人ID
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后修改人ID（外键关联users.user_id）'
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      /**
       * 更新时间
       */
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryCampaignPricingConfig',
      tableName: 'lottery_campaign_pricing_config',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '活动级定价配置表（可版本化/可回滚/可定时生效）',

      // 索引定义
      indexes: [
        {
          name: 'idx_campaign_status',
          fields: ['lottery_campaign_id', 'status']
        },
        {
          name: 'idx_campaign_version',
          fields: ['lottery_campaign_id', 'version']
        },
        {
          name: 'idx_effective_at',
          fields: ['effective_at']
        },
        {
          name: 'idx_status',
          fields: ['status']
        },
        {
          unique: true,
          name: 'uk_campaign_version',
          fields: ['lottery_campaign_id', 'version']
        }
      ],

      // Sequelize Scopes - 查询快捷方式
      scopes: {
        // 只查询生效中的配置
        active: {
          where: {
            status: 'active',
            [Op.and]: [
              {
                [Op.or]: [{ effective_at: { [Op.lte]: new Date() } }, { effective_at: null }]
              },
              {
                [Op.or]: [{ expired_at: { [Op.gte]: new Date() } }, { expired_at: null }]
              }
            ]
          }
        },

        // 只查询草稿
        draft: {
          where: { status: 'draft' }
        },

        // 只查询待生效
        scheduled: {
          where: { status: 'scheduled' }
        },

        // 按活动过滤
        /**
         * 按活动ID过滤
         * @param {number} campaignId - 活动ID
         * @returns {Object} 查询条件
         */
        byCampaign(campaignId) {
          return {
            where: { lottery_campaign_id: campaignId }
          }
        }
      }
    }
  )

  return LotteryCampaignPricingConfig
}

module.exports = LotteryCampaignPricingConfig
