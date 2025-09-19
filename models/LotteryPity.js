/**
 * 抽奖保底机制模型
 * 管理用户的抽奖保底计数和触发机制
 * 对应表: lottery_pity (28条记录)
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const LotteryPity = sequelize.define(
    'LotteryPity',
    {
      // 保底记录ID（主键）
      pity_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '保底记录唯一ID'
      },

      // 用户ID（唯一）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '用户ID，每个用户一条保底记录',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 当前保底计数
      current_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当前连续未中奖次数（保底计数）'
      },

      // 剩余抽奖次数
      remaining_draws: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '距离保底触发的剩余次数'
      },

      // 保底触发限制
      pity_limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '保底触发的次数限制（连续未中奖多少次触发）'
      },

      // 保底奖品ID
      pity_prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '触发保底时获得的奖品ID',
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        }
      },

      // 最后抽奖时间
      last_draw_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '用户最后一次抽奖的时间'
      },

      // 保底触发次数
      pity_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '累计触发保底的次数'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '保底记录创建时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '保底记录更新时间'
      }
    },
    {
      tableName: 'lottery_pity',
      timestamps: false, // 手动管理created_at和updated_at
      indexes: [
        {
          name: 'idx_user_id_unique',
          fields: ['user_id'],
          unique: true
        },
        {
          name: 'idx_current_count',
          fields: ['current_count']
        },
        {
          name: 'idx_last_draw_time',
          fields: ['last_draw_time']
        }
      ]
    }
  )

  /**
   * 关联关系定义
   */
  LotteryPity.associate = function (models) {
    // 属于某个用户
    LotteryPity.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 保底奖品
    LotteryPity.belongsTo(models.LotteryPrize, {
      foreignKey: 'pity_prize_id',
      as: 'pityPrize'
    })
  }

  /**
   * 实例方法
   */
  LotteryPity.prototype.toJSON = function () {
    const values = { ...this.get() }

    // 格式化时间显示
    if (values.created_at) {
      values.created_at_formatted = new Date(values.created_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    if (values.last_draw_time) {
      values.last_draw_time_formatted = new Date(values.last_draw_time).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    // 计算保底进度
    values.pity_progress =
      values.pity_limit > 0 ? Math.round((values.current_count / values.pity_limit) * 100) : 0

    // 是否接近保底
    values.near_pity = values.remaining_draws <= 3

    return values
  }

  /**
   * 静态方法
   */

  // 获取用户保底信息
  LotteryPity.getUserPity = async function (userId) {
    let pity = await LotteryPity.findOne({
      where: { user_id: userId }
    })

    // 如果不存在，创建默认保底记录
    if (!pity) {
      pity = await LotteryPity.create({
        user_id: userId,
        current_count: 0,
        remaining_draws: 10,
        pity_limit: 10,
        pity_prize_id: 2, // 默认保底奖品ID
        pity_triggered_count: 0
      })
    }

    return pity
  }

  // 更新保底计数（抽奖时调用）
  LotteryPity.updatePityCount = async function (userId, is_winner = false, transaction = null) {
    const options = transaction ? { transaction } : {}

    let pity = await LotteryPity.findOne(
      {
        where: { user_id: userId }
      },
      options
    )

    if (!pity) {
      // 创建新的保底记录
      pity = await LotteryPity.create(
        {
          user_id: userId,
          current_count: is_winner ? 0 : 1,
          remaining_draws: is_winner ? 10 : 9,
          pity_limit: 10,
          pity_prize_id: 2,
          pity_triggered_count: 0,
          last_draw_time: new Date(),
          updated_at: new Date()
        },
        options
      )
    } else {
      // 更新现有保底记录
      if (is_winner) {
        // 中奖了，重置计数
        pity.current_count = 0
        pity.remaining_draws = pity.pity_limit
      } else {
        // 未中奖，增加计数
        pity.current_count += 1
        pity.remaining_draws = Math.max(0, pity.pity_limit - pity.current_count)
      }

      pity.last_draw_time = new Date()
      pity.updated_at = new Date()

      await pity.save(options)
    }

    return pity
  }

  // 触发保底（保底抽奖时调用）
  LotteryPity.triggerPity = async function (userId, transaction = null) {
    const options = transaction ? { transaction } : {}

    const pity = await LotteryPity.findOne(
      {
        where: { user_id: userId }
      },
      options
    )

    if (!pity) {
      throw new Error('用户保底记录不存在')
    }

    // 重置保底计数并增加触发次数
    pity.current_count = 0
    pity.remaining_draws = pity.pity_limit
    pity.pity_triggered_count += 1
    pity.last_draw_time = new Date()
    pity.updated_at = new Date()

    await pity.save(options)

    return pity
  }

  // 检查是否应该触发保底
  LotteryPity.shouldTriggerPity = async function (userId) {
    const pity = await LotteryPity.getUserPity(userId)
    return pity.current_count >= pity.pity_limit
  }

  // 批量检查接近保底的用户
  LotteryPity.getNearPityUsers = async function (threshold = 3) {
    return await LotteryPity.findAll({
      where: {
        remaining_draws: {
          [sequelize.Sequelize.Op.lte]: threshold
        }
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'phone', 'nickname']
        }
      ],
      order: [['remaining_draws', 'ASC']]
    })
  }

  // 获取保底统计数据
  LotteryPity.getPityStats = async function () {
    const [stats] = await sequelize.query(
      `
    SELECT 
      COUNT(*) as total_users,
      AVG(current_count) as avg_count,
      SUM(pity_triggered_count) as total_triggered,
      COUNT(CASE WHEN remaining_draws <= 3 THEN 1 END) as near_pity_users,
      COUNT(CASE WHEN current_count >= pity_limit THEN 1 END) as ready_for_pity
    FROM lottery_pity
  `,
      {
        type: sequelize.QueryTypes.SELECT
      }
    )

    return {
      total_users: stats.total_users || 0,
      avg_count: parseFloat(stats.avg_count || 0).toFixed(2),
      total_triggered: stats.total_triggered || 0,
      near_pity_users: stats.near_pity_users || 0,
      ready_for_pity: stats.ready_for_pity || 0
    }
  }

  return LotteryPity
}
