/**
 * 用户模型 - 系统核心模型
 * 🔴 前端对接要点：
 * - 用户基础信息管理
 * - 权限控制（只分用户和管理员）
 * - 积分系统集成
 * - 安全信息脱敏
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  // 🔴 主键字段
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: '用户ID'
  },
  
  // 🔴 基础信息
  mobile: {
    type: DataTypes.STRING(11),
    allowNull: false,
    unique: true,
    comment: '手机号码',
    validate: {
      is: /^1[3-9]\d{9}$/,
      len: [11, 11]
    }
  },
  
  nickname: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '用户昵称',
    defaultValue: '新用户'
  },
  
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '头像URL'
  },
  
  // 🔴 积分系统
  total_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '总积分',
    validate: {
      min: 0
    }
  },
  
  // 🔴 权限管理 - 简化为只有管理员权限
  is_admin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否管理员'
  },
  
  // 🔴 状态管理
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'banned'),
    allowNull: false,
    defaultValue: 'active',
    comment: '用户状态'
  },
  
  // 🔴 登录信息
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后登录时间'
  },
  
  login_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '登录次数'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['mobile']
    },
    {
      fields: ['is_admin', 'status']
    }
  ]
});

// 🔴 实例方法：获取脱敏的用户信息
User.prototype.getSafeUserInfo = function() {
  return {
    user_id: this.user_id,
    mobile: this.getMaskedMobile(),
    nickname: this.nickname,
    avatar_url: this.avatar_url,
    total_points: this.total_points,
    is_admin: this.is_admin,
    status: this.status,
    last_login: this.last_login,
    created_at: this.created_at
  };
};

// 🔴 实例方法：获取脱敏手机号
User.prototype.getMaskedMobile = function() {
  if (!this.mobile || this.mobile.length !== 11) {
    return '***';
  }
  return this.mobile.substring(0, 3) + '****' + this.mobile.substring(7);
};

// 🔴 实例方法：检查权限 - 简化为只检查管理员权限
User.prototype.hasPermission = function(permission) {
  switch (permission) {
    case 'admin':
      return this.is_admin;
    default:
      return false;
  }
};

// 🔴 类方法：根据手机号查找或创建用户
User.findOrCreateByMobile = async function(mobile) {
  const [user, created] = await this.findOrCreate({
    where: { mobile },
    defaults: {
      mobile,
      nickname: `用户${mobile.substring(7)}`,
      total_points: 1000, // 新用户赠送1000积分
      status: 'active'
    }
  });
  
  return { user, isNewUser: created };
};

// 🔴 类方法：更新用户积分
User.updatePoints = async function(userId, pointsChange, description = '') {
  const user = await this.findByPk(userId);
  if (!user) {
    throw new Error('用户不存在');
  }
  
  const newPoints = user.total_points + pointsChange;
  if (newPoints < 0) {
    throw new Error('积分不足');
  }
  
  await user.update({ total_points: newPoints });
  return newPoints;
};

// 🔴 类方法：批量更新用户权限 - 简化为只管理管理员权限
User.batchUpdatePermissions = async function(userIds, permissions) {
  const updateData = {};
  
  if (permissions.is_admin !== undefined) {
    updateData.is_admin = permissions.is_admin;
  }
  
  if (Object.keys(updateData).length === 0) {
    throw new Error('没有有效的权限更新数据');
  }
  
  const [affectedCount] = await this.update(updateData, {
    where: { user_id: userIds }
  });
  
  return affectedCount;
};

// 🔴 类方法：获取权限统计
User.getPermissionStats = async function() {
  const [total, admins] = await Promise.all([
    this.count({ where: { status: 'active' } }),
    this.count({ where: { is_admin: true, status: 'active' } })
  ]);
  
  return {
    total_users: total,
    normal_users: total - admins,
    admins: admins
  };
};

module.exports = User; 