const { DataTypes, Model } = require('sequelize')

// 🔥 抽奖记录模型 - 分离式架构设计
class LotteryDraw extends Model {
  static associate (models) {
    // 关联到用户
    LotteryDraw.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 关联到抽奖活动
    LotteryDraw.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign'
    })

    // 关联到奖品
    LotteryDraw.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize'
    })
  }

  // 获取抽奖结果名称
  getDrawResultName () {
    const results = {
      win: '中奖',
      lose: '未中奖',
      pending: '待开奖'
    }
    return results[this.draw_result] || '未知结果'
  }

  // 获取奖品发放状态名称
  getPrizeStatusName () {
    const statuses = {
      pending: '待发放',
      delivered: '已发放',
      received: '已领取',
      expired: '已过期',
      cancelled: '已取消'
    }
    return statuses[this.prize_status] || '未知状态'
  }

  // 检查是否中奖
  isWin () {
    return this.draw_result === 'win'
  }

  // 检查奖品是否已发放
  isPrizeDelivered () {
    return ['delivered', 'received'].includes(this.prize_status)
  }

  // 检查奖品是否可领取
  isPrizeClaimable () {
    return this.isWin() && this.prize_status === 'delivered'
  }

  // 更新奖品发放状态
  async updatePrizeStatus (status, notes = null, transaction = null) {
    const updateData = {
      prize_status: status,
      updated_at: new Date()
    }

    if (notes) {
      updateData.delivery_notes = notes
    }

    if (status === 'delivered') {
      updateData.delivery_time = new Date()
    } else if (status === 'received') {
      updateData.received_time = new Date()
    }

    await this.update(updateData, { transaction })
  }

  // 获取抽奖摘要信息
  toSummary () {
    return {
      draw_id: this.draw_id,
      user_id: this.user_id,
      campaign_id: this.campaign_id,
      prize_id: this.prize_id,
      draw_result: this.draw_result,
      draw_result_name: this.getDrawResultName(),
      prize_status: this.prize_status,
      prize_status_name: this.getPrizeStatusName(),
      draw_time: this.draw_time,
      is_win: this.isWin(),
      is_prize_delivered: this.isPrizeDelivered(),
      is_prize_claimable: this.isPrizeClaimable()
    }
  }

  // 验证抽奖记录数据
  static validateDraw (data) {
    const errors = []

    if (!data.user_id || data.user_id <= 0) {
      errors.push('用户ID无效')
    }

    if (!data.campaign_id || data.campaign_id <= 0) {
      errors.push('活动ID无效')
    }

    if (!data.draw_result || !['win', 'lose', 'pending'].includes(data.draw_result)) {
      errors.push('抽奖结果无效')
    }

    if (data.draw_result === 'win' && (!data.prize_id || data.prize_id <= 0)) {
      errors.push('中奖记录必须指定奖品ID')
    }

    return errors
  }

  // 批量统计抽奖数据
  static async batchAnalyze (conditions = {}) {
    const baseWhere = { ...conditions }

    const [totalDraws, winDraws, prizeStats] = await Promise.all([
      // 总抽奖次数
      LotteryDraw.count({ where: baseWhere }),

      // 中奖次数
      LotteryDraw.count({
        where: { ...baseWhere, draw_result: 'win' }
      }),

      // 奖品发放统计
      LotteryDraw.findAll({
        attributes: [
          'prize_status',
          [LotteryDraw.sequelize.fn('COUNT', LotteryDraw.sequelize.col('*')), 'count']
        ],
        where: { ...baseWhere, draw_result: 'win' },
        group: ['prize_status'],
        raw: true
      })
    ])

    const winRate = totalDraws > 0 ? ((winDraws / totalDraws) * 100).toFixed(2) : '0.00'

    return {
      total_draws: totalDraws,
      win_draws: winDraws,
      win_rate: winRate,
      prize_delivery_stats: prizeStats.reduce((acc, stat) => {
        acc[stat.prize_status] = parseInt(stat.count)
        return acc
      }, {})
    }
  }
}

module.exports = sequelize => {
  LotteryDraw.init(
    {
      draw_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '抽奖记录唯一标识'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖用户ID'
      },
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID'
      },
      prize_id: {
        type: DataTypes.INTEGER,
        comment: '中奖奖品ID（未中奖为NULL）'
      },
      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        comment: '是否中奖'
      },
      points_consumed: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '消耗的积分数量'
      },
      draw_result: {
        type: DataTypes.JSON,
        comment: '抽奖结果详情（JSON格式）'
      },
      draw_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '抽奖时间'
      },
      algorithm_type: {
        type: DataTypes.ENUM('simple', 'guaranteed', 'dynamic', 'multi_stage', 'group'),
        allowNull: false,
        defaultValue: 'simple',
        comment: '抽奖算法类型'
      },
      algorithm_version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'v1.0',
        comment: '算法版本'
      },
      algorithm_data: {
        type: DataTypes.JSON,
        comment: '算法相关数据'
      },
      user_context: {
        type: DataTypes.JSON,
        comment: '用户上下文信息'
      },
      draw_metadata: {
        type: DataTypes.JSON,
        comment: '抽奖元数据'
      },
      is_hot_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否为热数据'
      },
      prize_status: {
        type: DataTypes.ENUM('pending', 'delivered', 'received', 'expired', 'cancelled'),
        defaultValue: 'pending',
        comment: '奖品发放状态'
      },
      delivery_time: {
        type: DataTypes.DATE,
        comment: '奖品发放时间'
      },
      received_time: {
        type: DataTypes.DATE,
        comment: '奖品领取时间'
      },
      delivery_notes: {
        type: DataTypes.TEXT,
        comment: '发放备注'
      },
      draw_ip: {
        type: DataTypes.STRING(45),
        comment: '抽奖IP地址'
      },
      draw_device: {
        type: DataTypes.STRING(255),
        comment: '抽奖设备信息'
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
      modelName: 'LotteryDraw',
      tableName: 'lottery_draws',
      timestamps: true,
      underscored: true,
      comment: '抽奖记录表',
      indexes: [
        {
          fields: ['user_id', 'draw_time'],
          name: 'idx_ld_user_time'
        },
        {
          fields: ['campaign_id', 'draw_result'],
          name: 'idx_ld_campaign_result'
        },
        {
          fields: ['prize_id', 'prize_status'],
          name: 'idx_ld_prize_status'
        },
        {
          fields: ['draw_result', 'draw_time'],
          name: 'idx_ld_result_time'
        },
        {
          fields: ['draw_ip'],
          name: 'idx_ld_ip'
        }
      ]
    }
  )

  return LotteryDraw
}
