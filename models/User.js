/**
 * 用户模型 - 系统核心模型
 * 🔴 前端对接要点：
 * - 用户基础信息管理
 * - 权限控制（is_admin, is_merchant）
 * - 积分系统集成
 * - 安全信息脱敏
 * - 商家信息扩展
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
  
  // 🔴 权限管理
  is_admin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否管理员'
  },
  
  is_merchant: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否商家'
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
  },
  
  // 🔴 商家信息扩展字段
  merchant_status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: true,
    comment: '商家申请状态'
  },
  
  business_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '商家名称'
  },
  
  business_license: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '营业执照号'
  },
  
  contact_person: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '联系人'
  },
  
  contact_phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '联系电话'
  },
  
  business_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '营业地址'
  },
  
  business_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '商家类型'
  },
  
  apply_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '申请时间'
  },
  
  review_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审核时间'
  },
  
  reviewer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '审核人ID',
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  
  reject_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '拒绝原因'
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
      fields: ['is_merchant', 'status']
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
    is_merchant: this.is_merchant,
    status: this.status,
    last_login: this.last_login,
    created_at: this.created_at,
    business_info: this.is_merchant ? {
      name: this.business_name,
      type: this.business_type,
      status: this.merchant_status
    } : null
  };
};

// 🔴 实例方法：获取脱敏手机号
User.prototype.getMaskedMobile = function() {
  if (!this.mobile || this.mobile.length !== 11) {
    return '***';
  }
  return this.mobile.substring(0, 3) + '****' + this.mobile.substring(7);
};

// 🔴 实例方法：检查是否具有超级管理员权限
User.prototype.isSuperAdmin = function() {
  return this.is_admin === true && this.is_merchant === true;
};

// 🔴 实例方法：检查权限
User.prototype.hasPermission = function(permission) {
  switch (permission) {
    case 'admin':
      return this.is_admin;
    case 'merchant':
      return this.is_merchant;
    case 'super_admin':
      return this.isSuperAdmin();
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
  
  // 记录积分变更
  const { PointsRecord } = require('./index');
  await PointsRecord.create({
    user_id: userId,
    type: pointsChange > 0 ? 'earn' : 'spend',
    points: Math.abs(pointsChange),
    description,
    balance_after: newPoints
  });
  
  return user;
};

// 🔴 类方法：批量更新用户权限
User.batchUpdatePermissions = async function(userIds, permissions) {
  const updateData = {};
  
  if (permissions.is_admin !== undefined) {
    updateData.is_admin = permissions.is_admin;
  }
  
  if (permissions.is_merchant !== undefined) {
    updateData.is_merchant = permissions.is_merchant;
  }
  
  const [affectedCount] = await this.update(updateData, {
    where: {
      user_id: userIds
    }
  });
  
  return affectedCount;
};

// 🔴 类方法：获取商家统计信息
User.getMerchantStats = async function() {
  const { Op } = require('sequelize');
  
  const stats = await this.findAll({
    attributes: [
      'merchant_status',
      [sequelize.fn('COUNT', sequelize.col('user_id')), 'count']
    ],
    where: {
      merchant_status: { [Op.ne]: null }
    },
    group: ['merchant_status'],
    raw: true
  });
  
  return stats.reduce((acc, item) => {
    acc[item.merchant_status] = parseInt(item.count);
    return acc;
  }, {});
};

// 🔴 钩子：创建用户前的验证
User.beforeCreate(async (user, options) => {
  // 验证手机号格式
  if (!/^1[3-9]\d{9}$/.test(user.mobile)) {
    throw new Error('手机号格式不正确');
  }
  
  // 设置默认昵称
  if (!user.nickname) {
    user.nickname = `用户${user.mobile.substring(7)}`;
  }
});

// 🔴 钩子：更新用户前的验证
User.beforeUpdate(async (user, options) => {
  // 如果修改了手机号，验证格式
  if (user.changed('mobile') && !/^1[3-9]\d{9}$/.test(user.mobile)) {
    throw new Error('手机号格式不正确');
  }
  
  // 积分不能为负数
  if (user.changed('total_points') && user.total_points < 0) {
    throw new Error('积分不能为负数');
  }
});

module.exports = User; 