/**
 * 抽奖记录模型 - 完全兼容现有表结构
 * 🔴 严格按照现有表字段定义，避免索引错误
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotteryRecord = sequelize.define('LotteryRecord', {
  // 🔴 主键字段（使用现有表结构）
  draw_id: {
    type: DataTypes.STRING(50), // 按照实际表结构
    primaryKey: true,
    comment: '抽奖记录ID'
  },
  
  // 🔴 用户信息
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 🔴 奖品信息
  prize_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '奖品ID'
  },
  
  prize_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '奖品名称'
  },
  
  prize_type: {
    type: DataTypes.ENUM('points', 'product', 'coupon', 'special'),
    allowNull: true,
    comment: '奖品类型'
  },
  
  prize_value: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '奖品价值'
  },
  
  // 🔴 抽奖信息
  draw_type: {
    type: DataTypes.ENUM('single', 'triple', 'quintuple', 'five', 'decade', 'ten'),
    allowNull: true,
    comment: '抽奖类型'
  },
  
  draw_sequence: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '抽奖序号'
  },
  
  // 🔴 保底相关
  is_pity: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否保底'
  },
  
  // 🔴 消费信息
  cost_points: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '消耗积分'
  },
  
  // 🔴 其他字段
  stop_angle: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: '停止角度'
  },
  
  batch_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '批次ID'
  },
  
  draw_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '抽奖次数'
  },
  
  prize_description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '奖品描述'
  },
  
  prize_image: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '奖品图片'
  }

}, {
  tableName: 'lottery_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // 🔴 只定义确实需要的索引，避免引用不存在的字段
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['draw_type']
    },
    {
      fields: ['is_pity']
    },
    {
      fields: ['created_at']
    }
  ]
});

// 🔴 基础方法
LotteryRecord.prototype.getPrizeInfo = function() {
  return {
    type: this.prize_type,
    name: this.prize_name,
    value: this.prize_value,
    description: this.prize_description,
    image: this.prize_image,
    is_pity: this.is_pity
  };
};

module.exports = LotteryRecord; 