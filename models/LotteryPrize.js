const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖奖品配置模型 - 分离式架构设计
 * 职责：管理抽奖奖品的配置、库存、概率、状态等
 * 设计模式：状态机模式 + 库存管理模式
 * 业务含义：定义可以抽到的奖品类型、价值、概率和库存
 */
class LotteryPrize extends Model {
  /**
   * 静态关联定义
   * 业务关系：奖品关联抽奖活动、抽奖记录、预设记录、图片资源
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate (models) {
    // 关联到抽奖活动
    LotteryPrize.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign'
    })

    // 关联到抽奖记录
    LotteryPrize.hasMany(models.LotteryDraw, {
      foreignKey: 'prize_id',
      as: 'draws'
    })

    /*
     * 🔥 关联到抽奖记录（已合并到LotteryDraw）
     * LotteryRecord已合并到LotteryDraw，使用draws关联即可
     */

    // 🎯 关联到抽奖预设记录
    if (models.LotteryPreset) {
      LotteryPrize.hasMany(models.LotteryPreset, {
        foreignKey: 'prize_id',
        as: 'presets',
        comment: '抽奖预设记录'
      })
    }

    // 关联到图片资源
    if (models.ImageResources) {
      LotteryPrize.belongsTo(models.ImageResources, {
        foreignKey: 'image_id',
        as: 'image'
      })
    }
  }

  /**
   * 获取奖品类型名称
   * @returns {string} 奖品类型的友好显示名称
   */
  getPrizeTypeName () {
    const types = {
      points: '积分奖励',
      physical: '实物奖品',
      virtual: '虚拟商品',
      coupon: '优惠券',
      service: '服务体验'
    }
    return types[this.prize_type] || '未知类型'
  }

  /**
   * 获取奖品状态名称
   * @returns {string} 奖品状态的友好显示名称
   */
  getStatusName () {
    const statuses = {
      active: '激活中',
      inactive: '已停用',
      out_of_stock: '缺货',
      expired: '已过期'
    }
    return statuses[this.status] || '未知状态'
  }

  /**
   * 检查奖品是否可用
   * 业务规则：必须同时满足状态激活、有库存、未达到每日中奖上限
   * @returns {boolean} 奖品是否可用
   */
  isAvailable () {
    if (this.status !== 'active') return false
    if (this.stock_quantity !== null && this.stock_quantity <= 0) return false
    if (this.max_daily_wins !== null && this.daily_win_count >= this.max_daily_wins) return false
    return true
  }

  /**
   * 检查奖品是否缺货
   * @returns {boolean} 奖品是否缺货
   */
  isOutOfStock () {
    return this.stock_quantity !== null && this.stock_quantity <= 0
  }

  /**
   * 获取中奖概率百分比
   * @returns {string} 中奖概率百分比字符串（保留2位小数）
   */
  getWinProbabilityPercent () {
    return (this.win_probability * 100).toFixed(2)
  }

  /**
   * 更新库存
   * 业务场景：中奖后扣减库存，退款时恢复库存
   * @param {number} change - 库存变化量（正数增加，负数减少）
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateStock (change, transaction = null) {
    if (this.stock_quantity === null) return true // 无限库存

    const newStock = this.stock_quantity + change
    if (newStock < 0) return false // 库存不足

    await this.update(
      {
        stock_quantity: newStock,
        status: newStock <= 0 ? 'out_of_stock' : this.status
      },
      { transaction }
    )

    return true
  }

  /**
   * 增加中奖次数
   * 业务场景：每次中奖后更新总中奖次数和今日中奖次数
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<void>} 无返回值
   */
  async incrementWinCount (transaction = null) {
    await this.increment(['total_win_count', 'daily_win_count'], { transaction })
  }

  /**
   * 重置每日中奖次数（静态方法）
   * 业务场景：每日凌晨定时任务执行，重置所有奖品的今日中奖次数
   * @returns {Promise<void>} 无返回值
   */
  static async resetDailyWinCount () {
    await LotteryPrize.update({ daily_win_count: 0 }, { where: {} })
  }

  /**
   * 获取奖品摘要信息
   * 业务场景：API响应、管理后台展示
   * @returns {Object} 奖品摘要对象
   */
  toSummary () {
    return {
      prize_id: this.prize_id,
      prize_name: this.prize_name,
      prize_type: this.prize_type,
      prize_type_name: this.getPrizeTypeName(),
      prize_value: this.prize_value,
      win_probability: this.getWinProbabilityPercent(),
      is_available: this.isAvailable(),
      stock_quantity: this.stock_quantity,
      total_win_count: this.total_win_count,
      status: this.status,
      status_name: this.getStatusName()
    }
  }

  /**
   * 验证奖品数据（静态方法）
   * 业务场景：创建或更新奖品前进行数据验证
   * @param {Object} data - 奖品数据
   * @param {string} data.prize_name - 奖品名称
   * @param {string} data.prize_type - 奖品类型
   * @param {number} data.prize_value - 奖品价值
   * @param {number} data.win_probability - 中奖概率
   * @returns {Array<string>} 错误信息数组（为空表示验证通过）
   */
  static validatePrize (data) {
    const errors = []

    if (!data.prize_name || data.prize_name.trim().length === 0) {
      errors.push('奖品名称不能为空')
    }

    if (
      !data.prize_type ||
      !['points', 'physical', 'virtual', 'coupon', 'service'].includes(data.prize_type)
    ) {
      errors.push('奖品类型无效')
    }

    if (data.prize_value === null || data.prize_value === undefined || data.prize_value < 0) {
      errors.push('奖品价值必须大于等于0')
    }

    if (
      data.win_probability === null ||
      data.win_probability === undefined ||
      data.win_probability < 0 ||
      data.win_probability > 1
    ) {
      errors.push('中奖概率必须在0-1之间')
    }

    return errors
  }
}

module.exports = sequelize => {
  LotteryPrize.init(
    {
      prize_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '奖品唯一标识'
      },
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联的抽奖活动ID'
      },
      prize_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '奖品名称'
      },
      prize_type: {
        type: DataTypes.ENUM('points', 'physical', 'virtual', 'coupon', 'service'),
        allowNull: false,
        defaultValue: 'points',
        comment: '奖品类型：积分/实物/虚拟/优惠券/服务'
      },
      prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '奖品价值（积分数或金额）'
      },
      angle: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '转盘角度位置'
      },
      color: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#FF6B6B',
        comment: '奖品颜色代码'
      },
      probability: {
        type: DataTypes.DECIMAL(6, 4),
        allowNull: false,
        defaultValue: 0.0,
        comment: '中奖概率'
      },
      is_activity: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为活动奖品'
      },
      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '抽奖消耗积分'
      },
      prize_description: {
        type: DataTypes.TEXT,
        comment: '奖品描述信息'
      },
      image_id: {
        type: DataTypes.INTEGER,
        comment: '关联的奖品图片ID'
      },
      win_probability: {
        type: DataTypes.DECIMAL(8, 6),
        allowNull: false,
        defaultValue: 0.1,
        comment: '中奖概率（0-1之间）'
      },
      stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量（0表示无限）'
      },
      max_daily_wins: {
        type: DataTypes.INTEGER,
        comment: '每日最大中奖次数'
      },
      total_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总中奖次数'
      },
      daily_win_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '今日中奖次数'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '显示排序'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'out_of_stock', 'expired'),
        allowNull: false,
        defaultValue: 'active',
        comment: '奖品状态'
      },
      /**
       * 奖品价值积分（双账户模型核心字段）
       * 用于预算控制，决定抽中该奖品需要消耗多少预算积分
       */
      prize_value_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '奖品价值积分（统一价值单位）'
      },
      /**
       * 虚拟奖品数量（水晶、贵金属等）
       * 仅当type='virtual'且category为crystal/metal时有效
       */
      virtual_amount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '虚拟奖品数量（水晶等）'
      },
      /**
       * 奖品分类（扩展字段）
       * 用于区分虚拟奖品类型：crystal（水晶）/metal（贵金属）/physical（实物）/empty（空奖）
       */
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '分类:crystal/metal/physical/empty/virtual'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime()
      }
    },
    {
      sequelize,
      modelName: 'LotteryPrize',
      tableName: 'lottery_prizes',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '抽奖奖品配置表',
      indexes: [
        {
          fields: ['campaign_id', 'status'],
          name: 'idx_lp_campaign_status',
          comment: '活动状态复合索引'
        },
        {
          fields: ['prize_type', 'status'],
          name: 'idx_lp_type_status',
          comment: '奖品类型状态复合索引'
        },
        {
          fields: ['win_probability'],
          name: 'idx_lp_probability',
          comment: '中奖概率索引'
        },
        {
          fields: ['sort_order'],
          name: 'idx_lp_sort',
          comment: '排序索引'
        },
        {
          fields: ['campaign_id', 'sort_order'],
          name: 'idx_unique_campaign_sort_order',
          unique: true,
          comment: '活动内排序唯一约束 - 防止转盘位置冲突'
        }
      ]
    }
  )

  /**
   * 🔒 数据验证钩子：防止sort_order重复
   * 业务场景：确保同一活动内的奖品排序不重复，避免前端转盘位置冲突
   * 触发时机：创建新奖品前自动执行
   */
  LotteryPrize.addHook('beforeCreate', async (prize, options) => {
    // 检查同一活动内是否已存在相同的sort_order
    const existing = await LotteryPrize.findOne({
      where: {
        campaign_id: prize.campaign_id,
        sort_order: prize.sort_order
      },
      transaction: options.transaction
    })

    if (existing) {
      throw new Error(
        `奖品排序${prize.sort_order}已存在于活动${prize.campaign_id}中，请使用不同的排序值`
      )
    }
  })

  /**
   * 🔒 数据验证钩子：防止更新时sort_order重复
   * 业务场景：确保更新奖品时不会产生排序冲突
   * 触发时机：更新奖品前自动执行
   */
  LotteryPrize.addHook('beforeUpdate', async (prize, options) => {
    // 只有在sort_order或campaign_id发生变化时才检查
    if (prize.changed('sort_order') || prize.changed('campaign_id')) {
      const existing = await LotteryPrize.findOne({
        where: {
          campaign_id: prize.campaign_id,
          sort_order: prize.sort_order,
          prize_id: { [require('sequelize').Op.ne]: prize.prize_id }
        },
        transaction: options.transaction
      })

      if (existing) {
        throw new Error(
          `奖品排序${prize.sort_order}已存在于活动${prize.campaign_id}中，请使用不同的排序值`
        )
      }
    }
  })

  return LotteryPrize
}
