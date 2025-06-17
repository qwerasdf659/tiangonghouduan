/**
 * 积分记录模型 - PointsRecord
 * 🔴 前端对接要点：
 * - type: 收入/支出标识（前端图标显示）
 * - source: 来源标识（前端分类显示）
 * - balance_after: 操作后余额（前端验证用）
 * - description: 操作描述（前端显示）
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PointsRecord = sequelize.define('points_records', {
  // 记录ID
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '记录ID'
  },
  
  // 🔴 用户ID - 关联用户
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  
  // 🔴 积分类型 - 前端收入/支出标识
  type: {
    type: DataTypes.ENUM('earn', 'spend'),
    allowNull: false,
    comment: '积分类型（前端：收入/支出标识）'
  },
  
  // 🔴 积分数量 - 正数为获得，负数为消费
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '积分数量（正数为获得，负数为消费）'
  },
  
  // 🔴 操作描述 - 前端显示
  description: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '操作描述（前端显示）'
  },
  
  // 🔴 来源标识 - 前端图标显示
  source: {
    type: DataTypes.ENUM('photo_upload', 'lottery', 'exchange', 'check_in', 'admin', 'register'),
    allowNull: false,
    comment: '来源（前端图标显示）'
  },
  
  // 🔴 操作后余额 - 前端验证用
  balance_after: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '操作后余额（前端验证用）'
  },
  
  // 关联业务ID
  related_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '关联业务ID（订单号、抽奖ID等）'
  }
}, {
  tableName: 'points_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // 积分记录不允许修改
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      name: 'idx_user_id',
      fields: ['user_id']
    },
    {
      name: 'idx_type',
      fields: ['type']
    },
    {
      name: 'idx_source',
      fields: ['source']
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
      fields: ['user_id', 'type', 'created_at']
    }
  ]
});

// 🔴 实例方法 - 获取前端显示信息
PointsRecord.prototype.getFrontendInfo = function() {
  return {
    id: this.id,
    type: this.type,
    points: this.points,
    description: this.description,
    source: this.source,
    balance_after: this.balance_after,
    related_id: this.related_id,
    created_at: this.created_at
  };
};

// 🔴 类方法 - 获取用户积分明细（支持分页筛选）
PointsRecord.getUserRecords = async function(userId, options = {}) {
  const {
    type, // 'earn' | 'spend' | 'all'
    source, // 具体来源
    page = 1,
    limit = 20
  } = options;
  
  const whereClause = { user_id: userId };
  
  if (type && type !== 'all') {
    whereClause.type = type;
  }
  
  if (source) {
    whereClause.source = source;
  }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await PointsRecord.findAndCountAll({
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

// 🔴 类方法 - 创建积分记录（事务安全）
PointsRecord.createRecord = async function(data, transaction) {
  const {
    user_id,
    points,
    description,
    source,
    balance_after,
    related_id
  } = data;
  
  // 确定积分类型
  const type = points > 0 ? 'earn' : 'spend';
  
  return await PointsRecord.create({
    user_id,
    type,
    points,
    description,
    source,
    balance_after,
    related_id
  }, { transaction });
};

module.exports = PointsRecord; 