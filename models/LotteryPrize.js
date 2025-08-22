const { DataTypes, Model } = require('sequelize')

// 🔥 抽奖奖品配置模型 - 分离式架构设计
class LotteryPrize extends Model {
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

    // 关联到图片资源
    if (models.ImageResources) {
      LotteryPrize.belongsTo(models.ImageResources, {
        foreignKey: 'image_id',
        as: 'image'
      })
    }
  }

  // 获取奖品类型名称
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

  // 获取奖品状态名称
  getStatusName () {
    const statuses = {
      active: '激活中',
      inactive: '已停用',
      out_of_stock: '缺货',
      expired: '已过期'
    }
    return statuses[this.status] || '未知状态'
  }

  // 检查奖品是否可用
  isAvailable () {
    if (this.status !== 'active') return false
    if (this.stock_quantity !== null && this.stock_quantity <= 0) return false
    if (this.max_daily_wins !== null && this.daily_win_count >= this.max_daily_wins) return false
    return true
  }

  // 检查奖品是否缺货
  isOutOfStock () {
    return this.stock_quantity !== null && this.stock_quantity <= 0
  }

  // 获取中奖概率百分比
  getWinProbabilityPercent () {
    return (this.win_probability * 100).toFixed(2)
  }

  // 更新库存
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

  // 增加中奖次数
  async incrementWinCount (transaction = null) {
    await this.increment(['total_win_count', 'daily_win_count'], { transaction })
  }

  // 重置每日中奖次数
  static async resetDailyWinCount () {
    await LotteryPrize.update({ daily_win_count: 0 }, { where: {} })
  }

  // 获取奖品摘要信息
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

  // 验证奖品数据
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
        comment: '中奖概率（旧字段，保持兼容）'
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
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      modelName: 'LotteryPrize',
      tableName: 'lottery_prizes',
      timestamps: true,
      underscored: true,
      comment: '抽奖奖品配置表',
      indexes: [
        {
          fields: ['campaign_id', 'status'],
          name: 'idx_lp_campaign_status'
        },
        {
          fields: ['prize_type', 'status'],
          name: 'idx_lp_type_status'
        },
        {
          fields: ['win_probability'],
          name: 'idx_lp_probability'
        },
        {
          fields: ['sort_order'],
          name: 'idx_lp_sort'
        }
      ]
    }
  )

  return LotteryPrize
}
