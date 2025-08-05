/**
 * 餐厅积分抽奖系统 v2.0 - 抽奖保底机制模型
 * 管理用户的抽奖保底次数和触发机制
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const LotteryPity = sequelize.define(
    'LotteryPity',
    {
      // 基础信息
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '保底记录唯一ID'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },
      space: {
        type: DataTypes.ENUM('lucky', 'premium'),
        allowNull: false,
        comment: '抽奖空间：lucky-幸运空间，premium-臻选空间'
      },

      // 保底机制数据
      current_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当前抽奖次数'
      },
      pity_threshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '保底触发阈值'
      },
      last_pity_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '上次保底触发时间'
      },
      total_pity_triggered: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '累计保底触发次数'
      },

      // 保底奖品配置
      pity_prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '保底奖品ID'
      },
      pity_prize_type: {
        type: DataTypes.ENUM('points', 'product', 'special'),
        allowNull: false,
        defaultValue: 'points',
        comment: '保底奖品类型'
      }
    },
    {
      tableName: 'lottery_pity',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          name: 'idx_lottery_pity_user_space',
          fields: ['user_id', 'space'],
          unique: true
        },
        {
          name: 'idx_lottery_pity_current_count',
          fields: ['current_count']
        }
      ],
      comment: '抽奖保底机制表'
    }
  )

  // 实例方法
  LotteryPity.prototype.shouldTriggerPity = function () {
    return this.current_count >= this.pity_threshold
  }

  LotteryPity.prototype.triggerPity = function () {
    this.current_count = 0
    this.last_pity_time = new Date()
    this.total_pity_triggered += 1
    return this.save()
  }

  LotteryPity.prototype.incrementCount = function () {
    this.current_count += 1
    return this.save()
  }

  // 类方法
  LotteryPity.getUserPity = async function (userId, space) {
    let pity = await LotteryPity.findOne({
      where: { user_id: userId, space }
    })

    if (!pity) {
      pity = await LotteryPity.create({
        user_id: userId,
        space,
        current_count: 0,
        pity_threshold: space === 'premium' ? 5 : 10 // 臻选空间保底更低
      })
    }

    return pity
  }

  return LotteryPity
}
