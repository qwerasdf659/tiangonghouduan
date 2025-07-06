/**
 * 抽奖记录模型 - LotteryRecord (对应lottery_records表)
 * 🔴 前端对接要点：
 * - draw_id: 抽奖记录唯一标识
 * - prize_name: 中奖奖品名称（前端显示）
 * - is_pity: 是否保底中奖（前端特殊标识）
 * - draw_sequence: 批量抽奖中的序号（前端动画顺序）
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotteryRecord = sequelize.define('lottery_records', {
  // 🔴 抽奖记录ID - 前端唯一标识
  draw_id: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    comment: '抽奖记录唯一标识'
  },
  
  // 🔴 用户ID - 关联用户
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 🔴 奖品ID - 关联抽奖配置
  prize_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '中奖奖品ID'
  },
  
  // 🔴 奖品名称 - 前端显示
  prize_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '中奖奖品名称（前端显示）'
  },
  
  // 🔴 奖品类型 - 前端图标显示
  prize_type: {
    type: DataTypes.ENUM('points', 'coupon', 'physical', 'empty'),
    allowNull: false,
    comment: '奖品类型（前端图标显示）'
  },
  
  // 🔴 奖品价值
  prize_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: '奖品价值'
  },
  
  // 🔴 抽奖类型 - 单抽/批量抽奖
  draw_type: {
    type: DataTypes.ENUM('single', 'triple', 'quintuple', 'five', 'decade', 'ten'),
    allowNull: false,
    defaultValue: 'single',
    comment: '抽奖类型'
  },
  
  // 🔴 抽奖序号 - 批量抽奖中的序号
  draw_sequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: '抽奖序号（批量抽奖中的顺序）'
  },
  
  // 🔴 是否保底中奖 - 前端特殊标识
  is_pity: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否保底中奖（前端特殊标识）'
  },
  
  // 🔴 消耗积分
  cost_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    comment: '消耗积分'
  },
  
  // 🔴 转盘停止角度 - 前端动画
  stop_angle: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '转盘停止角度（前端动画用）'
  },
  
  // 🔴 批量抽奖组ID - 同一次批量抽奖的记录
  batch_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '批量抽奖组ID'
  }
}, {
  tableName: 'lottery_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      name: 'idx_user_id',
      fields: ['user_id']
    },
    {
      name: 'idx_prize_id',
      fields: ['prize_id']
    },
    {
      name: 'idx_draw_type',
      fields: ['draw_type']
    },
    {
      name: 'idx_is_pity',
      fields: ['is_pity']
    },
    {
      name: 'idx_batch_id',
      fields: ['batch_id']
    },
    {
      name: 'idx_created_at',
      fields: ['created_at']
    },
    // 🔴 复合索引 - 前端查询优化
    {
      name: 'idx_user_created',
      fields: ['user_id', 'created_at']
    },
    {
      name: 'idx_user_type_time',
      fields: ['user_id', 'draw_type', 'created_at']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示信息
LotteryRecord.prototype.getFrontendInfo = function() {
  return {
    draw_id: this.draw_id,
    prize_name: this.prize_name,
    prize_type: this.prize_type,
    prize_value: this.prize_value,
    draw_type: this.draw_type,
    draw_sequence: this.draw_sequence,
    is_pity: this.is_pity,
    cost_points: this.cost_points,
    created_at: this.created_at
  };
};

// 🔴 类方法 - 创建抽奖记录
LotteryRecord.createRecord = async function(data, transaction) {
  const {
    draw_id,
    user_id,
    prize_id,
    prize_name,
    prize_type,
    prize_value,
    draw_type = 'single',
    draw_sequence = 1,
    is_pity = false,
    cost_points = 100,
    stop_angle,
    batch_id
  } = data;
  
  return await LotteryRecord.create({
    draw_id,
    user_id,
    prize_id,
    prize_name,
    prize_type,
    prize_value,
    draw_type,
    draw_sequence,
    is_pity,
    cost_points,
    stop_angle,
    batch_id
  }, { transaction });
};

// 🔴 类方法 - 获取用户抽奖记录
LotteryRecord.getUserRecords = async function(userId, options = {}) {
  const {
    draw_type,
    page = 1,
    limit = 20
  } = options;
  
  const whereClause = { user_id: userId };
  
  if (draw_type) {
    whereClause.draw_type = draw_type;
  }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await LotteryRecord.findAndCountAll({
    where: whereClause,
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset: offset
  });
  
  return {
    records: rows.map(record => record.getFrontendInfo()),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit))
    }
  };
};

module.exports = LotteryRecord; 