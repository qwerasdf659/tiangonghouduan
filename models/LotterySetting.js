/**
 * 抽奖配置模型 - LotterySetting (对应lottery_prizes表)
 * 🔴 前端对接要点：
 * - angle: Canvas转盘角度映射（0-315度，45度间隔）
 * - is_activity: 触发特殊动效标记（差点中奖动画）
 * - probability: 中奖概率计算
 * - color: 转盘区域颜色渲染
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LotterySetting = sequelize.define('lottery_prizes', {
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
  
  // 🔴 转盘角度 - Canvas渲染位置（前端文档要求：0,45,90,135,180,225,270,315）
  angle: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isIn: [[0, 45, 90, 135, 180, 225, 270, 315]] // 🔴 严格限制为8等分角度
    },
    comment: '转盘角度（Canvas渲染位置，0-315度45度间隔）'
  },
  
  // 🔴 转盘颜色 - 前端渲染
  color: {
    type: DataTypes.STRING(7),
    allowNull: false,
    defaultValue: '#FF6B6B',
    validate: {
      is: /^#[0-9A-F]{6}$/i // 验证十六进制颜色格式
    },
    comment: '转盘颜色（前端渲染，十六进制格式）'
  },
  
  // 🔴 中奖概率 - 抽奖算法核心
  probability: {
    type: DataTypes.DECIMAL(6, 4), // 支持4位小数精度，如0.0500
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
  
  // 🔴 每次抽奖消耗积分 - 前端显示
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
  tableName: 'lottery_prizes', // 🔴 修改表名以符合前端文档要求
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
    },
    {
      name: 'idx_status_probability',
      fields: ['status', 'probability']
    }
  ]
});

// 🔴 实例方法 - 获取前端Canvas转盘所需信息
LotterySetting.prototype.getFrontendInfo = function() {
  return {
    id: this.prize_id,        // 🔴 前端文档字段映射
    name: this.prize_name,    // 🔴 前端文档字段映射
    type: this.prize_type,
    value: this.prize_value,
    angle: this.angle,        // 🔴 Canvas转盘角度
    color: this.color,        // 🔴 转盘区域颜色
    is_activity: this.is_activity, // 🔴 特殊动效标记
    // 不返回probability给前端，防止作弊
  };
};

// 🔴 类方法 - 获取前端转盘配置（符合前端文档格式）
LotterySetting.getFrontendConfig = async function() {
  const prizes = await LotterySetting.findAll({
    where: { status: 'active' },
    order: [['angle', 'ASC']] // 按角度排序，便于前端Canvas绘制
  });
  
  return {
    cost_points: 100,         // 🔴 前端文档要求字段
    daily_limit: 10,          // 🔴 前端文档要求字段
    prizes: prizes.map(prize => ({
      prize_id: prize.prize_id,
      prize_name: prize.prize_name,
      prize_type: prize.prize_type,
      prize_value: prize.prize_value,
      angle: prize.angle,     // 🔴 Canvas转盘角度（0-315，45度间隔）
      color: prize.color,     // 🔴 扇形颜色（#FF6B35格式）
      is_activity: prize.is_activity // 🔴 触发抖动动画
    }))
  };
};

// 🔴 类方法 - 执行抽奖算法（符合前端动画要求）
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
      const isNearMiss = checkNearMiss(random, cumulativeProbability, prize);
      
      return {
        prize_id: prize.prize_id,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        angle: prize.angle,     // 🔴 Canvas停止角度
        color: prize.color,
        is_activity: prize.is_activity,
        is_near_miss: isNearMiss, // 🔴 前端动画标记
        probability: prize.probability
      };
    }
  }
  
  // 如果没有中奖，返回空奖
  const emptyPrize = prizes.find(p => p.prize_type === 'empty');
  if (emptyPrize) {
    return {
      prize_id: emptyPrize.prize_id,
      prize_name: emptyPrize.prize_name,
      prize_type: 'empty',
      prize_value: 0,
      angle: emptyPrize.angle,
      color: emptyPrize.color,
      is_activity: false,
      is_near_miss: false
    };
  }
  
  throw new Error('抽奖配置异常');
};

// 🔴 差点中奖检测 - 增强用户体验
function checkNearMiss(random, cumulativeProbability, prize) {
  if (prize.is_activity) {  // 只有特殊奖品才触发
    const previousBoundary = cumulativeProbability - parseFloat(prize.probability);
    const distanceFromStart = random - previousBoundary;
    const distanceFromEnd = cumulativeProbability - random;
    
    // 🔴 如果随机数接近奖品边界，触发差点中奖
    return distanceFromStart < 0.02 || distanceFromEnd < 0.02;
  }
  return false;
}

// 🔴 类方法 - 初始化标准转盘配置
LotterySetting.initializeStandardConfig = async function() {
  const standardPrizes = [
    { prize_name: '八八折券', prize_type: 'coupon', prize_value: 0.88, angle: 0, color: '#FF6B35', probability: 0.0500, is_activity: true },
    { prize_name: '50积分', prize_type: 'points', prize_value: 50, angle: 45, color: '#4ECDC4', probability: 0.1500, is_activity: false },
    { prize_name: '谢谢参与', prize_type: 'empty', prize_value: 0, angle: 90, color: '#95E1D3', probability: 0.4000, is_activity: false },
    { prize_name: '九折券', prize_type: 'coupon', prize_value: 0.90, angle: 135, color: '#F8B500', probability: 0.1000, is_activity: false },
    { prize_name: '100积分', prize_type: 'points', prize_value: 100, angle: 180, color: '#3D5A80', probability: 0.1000, is_activity: false },
    { prize_name: '谢谢参与', prize_type: 'empty', prize_value: 0, angle: 225, color: '#95E1D3', probability: 0.1500, is_activity: false },
    { prize_name: '20积分', prize_type: 'points', prize_value: 20, angle: 270, color: '#F1C40F', probability: 0.0400, is_activity: false },
    { prize_name: '免费咖啡', prize_type: 'physical', prize_value: 25, angle: 315, color: '#E74C3C', probability: 0.0100, is_activity: true }
  ];
  
  for (const prize of standardPrizes) {
    await LotterySetting.findOrCreate({
      where: { angle: prize.angle },
      defaults: prize
    });
  }
  
  console.log('✅ 标准转盘配置初始化完成');
};

module.exports = LotterySetting; 