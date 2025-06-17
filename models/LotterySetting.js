/**
 * 抽奖配置模型 - LotterySetting
 * 🔴 前端对接要点：
 * - angle: Canvas转盘角度映射（0-315度，45度间隔）
 * - is_activity: 触发特殊动效标记（差点中奖动画）
 * - probability: 中奖概率计算
 * - color: 转盘区域颜色渲染
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotterySetting = sequelize.define('lottery_settings', {
  // 🔴 奖品ID - 前端抽奖结果匹配
  prize_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '奖品ID'
  },
  
  // 🔴 奖品名称 - 前端显示
  prize_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '奖品名称（前端显示）'
  },
  
  // 奖品类型
  prize_type: {
    type: DataTypes.ENUM('points', 'coupon', 'physical', 'empty'),
    allowNull: false,
    comment: '奖品类型'
  },
  
  // 奖品价值
  prize_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: '奖品价值'
  },
  
  // 🔴 转盘角度 - Canvas渲染位置
  angle: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0,
      max: 359
    },
    comment: '转盘角度（Canvas渲染位置）'
  },
  
  // 🔴 转盘颜色 - 前端渲染
  color: {
    type: DataTypes.STRING(7),
    allowNull: false,
    defaultValue: '#FF6B6B',
    comment: '转盘颜色（前端渲染）'
  },
  
  // 🔴 中奖概率 - 抽奖算法核心
  probability: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0.0000,
    validate: {
      min: 0,
      max: 1
    },
    comment: '中奖概率（抽奖算法核心）'
  },
  
  // 🔴 特殊动效标记 - 差点中奖动画
  is_activity: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '特殊动效标记（差点中奖动画）'
  },
  
  // 每次抽奖消耗积分
  cost_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    comment: '每次抽奖消耗积分'
  },
  
  // 奖品状态
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
    comment: '奖品状态'
  }
}, {
  tableName: 'lottery_settings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      name: 'idx_angle',
      fields: ['angle']
    },
    {
      name: 'idx_probability',
      fields: ['probability']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_prize_type',
      fields: ['prize_type']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示信息
LotterySetting.prototype.getFrontendInfo = function() {
  return {
    prize_id: this.prize_id,
    prize_name: this.prize_name,
    prize_type: this.prize_type,
    prize_value: this.prize_value,
    angle: this.angle, // 🔴 Canvas转盘角度
    color: this.color, // 🔴 转盘区域颜色
    probability: this.probability, // 🔴 中奖概率（可选择是否返回给前端）
    is_activity: this.is_activity, // 🔴 特殊动效标记
    cost_points: this.cost_points
  };
};

// 🔴 类方法 - 获取前端转盘配置
LotterySetting.getFrontendConfig = async function() {
  const prizes = await LotterySetting.findAll({
    where: { status: 'active' },
    order: [['angle', 'ASC']]
  });
  
  return {
    prizes: prizes.map(prize => ({
      prize_id: prize.prize_id,
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      angle: prize.angle, // 🔴 Canvas渲染必需
      color: prize.color, // 🔴 Canvas颜色
      is_activity: prize.is_activity // 🔴 动效标记
      // 注意：不返回probability给前端，防止作弊
    })),
    cost_per_draw: 100, // 每次抽奖消耗积分
    total_prizes: prizes.length
  };
};

// 🔴 类方法 - 执行抽奖算法
LotterySetting.performDraw = async function() {
  // 获取所有激活的奖品
  const prizes = await LotterySetting.findAll({
    where: { status: 'active' },
    order: [['probability', 'DESC']]
  });
  
  if (prizes.length === 0) {
    throw new Error('没有可用的奖品配置');
  }
  
  // 🔴 概率抽奖算法
  const random = Math.random();
  let cumulativeProbability = 0;
  
  for (const prize of prizes) {
    cumulativeProbability += parseFloat(prize.probability);
    
    if (random <= cumulativeProbability) {
      // 🔴 判断是否触发差点中奖动画
      const isNearMiss = checkNearMiss(prize, prizes);
      
      return {
        prize_id: prize.prize_id,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        angle: prize.angle, // 🔴 Canvas停止角度
        color: prize.color,
        is_activity: prize.is_activity,
        is_near_miss: isNearMiss, // 🔴 前端动画标记
        probability: prize.probability
      };
    }
  }
  
  // 如果没有中奖，返回最后一个奖品（通常是"谢谢参与"）
  const lastPrize = prizes[prizes.length - 1];
  return {
    prize_id: lastPrize.prize_id,
    prize_name: lastPrize.prize_name,
    prize_type: lastPrize.prize_type,
    prize_value: lastPrize.prize_value,
    angle: lastPrize.angle,
    color: lastPrize.color,
    is_activity: lastPrize.is_activity,
    is_near_miss: false,
    probability: lastPrize.probability
  };
};

// 🔴 类方法 - 批量抽奖
LotterySetting.performBatchDraw = async function(count) {
  const results = [];
  
  for (let i = 0; i < count; i++) {
    const result = await LotterySetting.performDraw();
    results.push({
      ...result,
      sequence: i + 1
    });
  }
  
  return results;
};

// 🔴 内部函数 - 检查是否触发差点中奖动画
function checkNearMiss(currentPrize, allPrizes) {
  // 如果当前奖品本身就是活动奖品，不触发差点中奖
  if (currentPrize.is_activity) {
    return false;
  }
  
  // 20%的概率触发差点中奖动画
  const nearMissChance = 0.2;
  return Math.random() < nearMissChance;
}

// 🔴 类方法 - 获取奖品统计
LotterySetting.getPrizeStatistics = async function() {
  const prizes = await LotterySetting.findAll({
    where: { status: 'active' }
  });
  
  return {
    total_prizes: prizes.length,
    prize_types: {
      points: prizes.filter(p => p.prize_type === 'points').length,
      coupon: prizes.filter(p => p.prize_type === 'coupon').length,
      physical: prizes.filter(p => p.prize_type === 'physical').length,
      empty: prizes.filter(p => p.prize_type === 'empty').length
    },
    total_probability: prizes.reduce((sum, prize) => sum + parseFloat(prize.probability), 0),
    activity_prizes: prizes.filter(p => p.is_activity).length
  };
};

module.exports = LotterySetting; 