/**
 * 用户模型 - User
 * 🔴 前端对接要点：
 * - user_id: 全局用户标识（主键）
 * - total_points: 实时积分显示，WebSocket同步
 * - is_merchant: 商家权限控制，控制页面访问
 * - mobile: 脱敏显示 138****8000
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('users', {
  // 🔴 主键 - 前端所有API必须包含user_id
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '用户唯一标识'
  },
  
  // 🔴 手机号 - 前端登录认证必须字段，需要脱敏显示
  mobile: {
    type: DataTypes.STRING(11),
    allowNull: false,
    unique: true,
    validate: {
      isNumeric: true,
      len: [11, 11]
    },
    comment: '手机号（前端脱敏显示）'
  },
  
  // 🔴 积分余额 - 前端实时显示，WebSocket推送更新
  total_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1000, // 新用户奖励1000积分
    validate: {
      min: 0
    },
    comment: '积分余额（前端实时显示，WebSocket推送更新）'
  },
  
  // 🔴 用户昵称 - 前端显示
  nickname: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: function() {
      return `用户${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    },
    comment: '用户昵称（前端显示）'
  },
  
  // 🔴 商家标识 - 前端权限控制
  is_merchant: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '商家标识（前端权限控制）'
  },
  
  // 账号状态
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'banned'),
    allowNull: false,
    defaultValue: 'active',
    comment: '账号状态'
  },
  
  // 头像URL
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '头像URL'
  },
  
  // 最后登录时间
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后登录时间'
  },
  
  // 微信OpenID
  wx_openid: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: '微信OpenID'
  },
  
  // 设备信息（JSON格式）
  device_info: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '设备信息'
  }
}, {
  // 表配置
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // 索引配置
  indexes: [
    {
      name: 'idx_mobile',
      fields: ['mobile'],
      unique: true
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_is_merchant',
      fields: ['is_merchant']
    },
    {
      name: 'idx_last_login',
      fields: ['last_login']
    },
    {
      name: 'idx_openid', 
      fields: ['wx_openid']
    },
    {
      name: 'idx_created_at',
      fields: ['created_at']
    }
  ]
});

// 🔴 实例方法 - 获取脱敏手机号
User.prototype.getMaskedMobile = function() {
  if (!this.mobile) return '';
  return this.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
};

// 🔴 实例方法 - 获取前端安全用户信息
User.prototype.getSafeUserInfo = function() {
  return {
    user_id: this.user_id,
    mobile: this.getMaskedMobile(), // 🔴 脱敏手机号
    nickname: this.nickname,
    total_points: this.total_points, // 🔴 实时积分
    is_merchant: this.is_merchant, // 🔴 权限标识
    status: this.status,
    avatar: this.avatar,
    last_login: this.last_login,
    created_at: this.created_at
  };
};

// 🔴 类方法 - 根据手机号查找或创建用户
User.findOrCreateByMobile = async function(mobile) {
  const [user, created] = await User.findOrCreate({
    where: { mobile },
    defaults: {
      mobile,
      nickname: `用户${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      total_points: 1000, // 新用户奖励
      is_merchant: false,
      status: 'active'
    }
  });
  
  return {
    user,
    isNewUser: created
  };
};

// 🔴 类方法 - 更新用户积分（事务安全）
User.updatePoints = async function(userId, pointsChange, transaction) {
  const user = await User.findByPk(userId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  
  if (!user) {
    throw new Error('用户不存在');
  }
  
  const newBalance = user.total_points + pointsChange;
  if (newBalance < 0) {
    throw new Error('积分余额不足');
  }
  
  await user.update({ total_points: newBalance }, { transaction });
  return newBalance;
};

module.exports = User; 