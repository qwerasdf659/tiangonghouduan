/**
 * 抽奖保底系统模型 - LotteryPity
 * 🔴 功能说明：
 * - 追踪用户抽奖次数，实现10次保底九八折券
 * - 每次抽奖增加计数，获得九八折券时重置
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotteryPity = sequelize.define('lottery_pity', {
  // 记录ID
  pity_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '保底记录ID'
  },
  
  // 用户ID
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 当前抽奖计数
  current_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '当前抽奖次数计数'
  },
  
  // 距离保底剩余次数
  remaining_draws: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    comment: '距离保底剩余次数'
  },
  
  // 保底次数限制
  pity_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    comment: '保底次数限制'
  },
  
  // 保底奖品ID (九八折券的prize_id)
  pity_prize_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    comment: '保底奖品ID (九八折券)'
  },
  
  // 最后抽奖时间
  last_draw_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后抽奖时间'
  },
  
  // 保底触发次数
  pity_triggered_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '保底触发次数'
  }
}, {
  tableName: 'lottery_pity',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      unique: true,
      fields: ['user_id'],
      name: 'idx_user_unique'
    },
    {
      fields: ['current_count'],
      name: 'idx_current_count'
    },
    {
      fields: ['last_draw_time'],
      name: 'idx_last_draw_time'
    }
  ]
});

// 🔴 实例方法 - 增加抽奖计数
LotteryPity.prototype.incrementDraw = async function() {
  this.current_count += 1;
  this.remaining_draws = Math.max(0, this.pity_limit - this.current_count);
  this.last_draw_time = new Date();
  await this.save();
  return this;
};

// 🔴 实例方法 - 重置保底计数
LotteryPity.prototype.resetPity = async function() {
  this.current_count = 0;
  this.remaining_draws = this.pity_limit;
  this.pity_triggered_count += 1;
  this.last_draw_time = new Date();
  await this.save();
  return this;
};

// 🔴 实例方法 - 检查是否触发保底
LotteryPity.prototype.shouldTriggerPity = function() {
  return this.current_count >= this.pity_limit;
};

// 🔴 实例方法 - 检查下一次抽奖是否触发保底
LotteryPity.prototype.willTriggerPityOnNext = function() {
  return this.current_count >= (this.pity_limit - 1);
};

// 🔴 类方法 - 获取或创建用户保底记录
LotteryPity.getOrCreateUserPity = async function(userId) {
  const [pityRecord, created] = await LotteryPity.findOrCreate({
    where: { user_id: userId },
    defaults: {
      user_id: userId,
      current_count: 0,
      remaining_draws: 10,
      pity_limit: 10,
      pity_prize_id: 2, // 九八折券的ID
      pity_triggered_count: 0
    }
  });
  
  return pityRecord;
};

// 🔴 类方法 - 获取用户保底信息
LotteryPity.getUserPityInfo = async function(userId) {
  const pityRecord = await this.getOrCreateUserPity(userId);
  
  return {
    current_count: pityRecord.current_count,
    remaining_draws: pityRecord.remaining_draws,
    pity_limit: pityRecord.pity_limit,
    is_pity_ready: pityRecord.shouldTriggerPity(),
    pity_triggered_count: pityRecord.pity_triggered_count,
    last_draw_time: pityRecord.last_draw_time
  };
};

module.exports = LotteryPity; 