/**
 * 管理员用户模型 - V4统一架构版本
 * 支持BCrypt密码加密、账号锁定、MFA等安全功能
 * 创建时间：2025年01月21日
 *
 * 🔧 架构说明：
 * - User.is_admin：简单权限控制，用于API访问权限判断
 * - AdminUser：复杂管理员功能，包含密码管理、安全策略等
 * - 当前V4架构主要使用User.is_admin进行权限控制
 * - AdminUser模型保留用于未来高级管理员功能扩展
 */

const { DataTypes } = require('sequelize')
const bcrypt = require('bcrypt')

module.exports = sequelize => {
  const AdminUser = sequelize.define(
    'AdminUser',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '管理员ID'
      },

      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '管理员用户名',
        validate: {
          len: [3, 50],
          notEmpty: true,
          isAlphanumeric: true
        }
      },

      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'BCrypt密码哈希'
      },

      phone: {
        type: DataTypes.STRING(11),
        allowNull: true,
        comment: '绑定手机号',
        validate: {
          isNumeric: true,
          len: [11, 11]
        }
      },

      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '邮箱',
        validate: {
          isEmail: true
        }
      },

      role: {
        type: DataTypes.ENUM('admin', 'super_admin'),
        defaultValue: 'admin',
        comment: '管理员角色'
      },

      status: {
        type: DataTypes.ENUM('active', 'inactive', 'banned'),
        allowNull: false,
        defaultValue: 'active',
        comment: '管理员状态：active-正常，inactive-锁定，banned-禁用'
      },

      // 多因素认证相关
      mfa_enabled: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '二次验证启用状态'
      },

      mfa_secret: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: 'MFA密钥'
      },

      last_sms_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后发送短信时间'
      },

      // 安全相关
      login_fail_count: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '登录失败次数'
      },

      locked_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '锁定到期时间'
      },

      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后登录时间'
      },

      last_login_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '最后登录IP'
      },

      password_changed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '密码最后修改时间'
      }
    },
    {
      tableName: 'admin_users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['username']
        },
        {
          fields: ['status', 'role']
        },
        {
          fields: ['locked_until']
        }
      ],
      comment: '管理员用户表',
      hooks: {
        // 🔧 密码加密hook
        beforeCreate: async (admin, _options) => {
          if (admin.password_hash && !admin.password_hash.startsWith('$2b$')) {
            const hashedPassword = await bcrypt.hash(admin.password_hash, 12)
            const passwordChangedAt = new Date()
            admin.set('password_hash', hashedPassword)
            admin.set('password_changed_at', passwordChangedAt)
          }
        },
        beforeUpdate: async (admin, _options) => {
          if (admin.changed('password_hash') && !admin.password_hash.startsWith('$2b$')) {
            const hashedPassword = await bcrypt.hash(admin.password_hash, 12)
            const passwordChangedAt = new Date()
            admin.set('password_hash', hashedPassword)
            admin.set('password_changed_at', passwordChangedAt)
          }
        }
      }
    }
  )

  // 实例方法
  AdminUser.prototype.verifyPassword = async function (password) {
    try {
      return await bcrypt.compare(password, this.password_hash)
    } catch (error) {
      console.error('密码验证失败:', error)
      return false
    }
  }

  AdminUser.prototype.isLocked = function () {
    return this.locked_until && new Date() < this.locked_until
  }

  AdminUser.prototype.isActive = function () {
    return this.status === 'active' && !this.isLocked()
  }

  AdminUser.prototype.isSuperAdmin = function () {
    return this.role === 'super_admin'
  }

  AdminUser.prototype.canLogin = function () {
    return this.isActive() && !this.isLocked()
  }

  AdminUser.prototype.incrementFailCount = async function () {
    const newFailCount = this.login_fail_count + 1
    const updateData = { login_fail_count: newFailCount }

    // 🔧 账号锁定机制：失败3次锁定30分钟
    if (newFailCount >= 3) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000) // 30分钟后
      updateData.locked_until = lockUntil
      console.log(`⚠️ 管理员账号已锁定30分钟: ${this.username}`)
    }

    return this.update(updateData)
  }

  AdminUser.prototype.resetFailCount = async function () {
    return this.update({
      login_fail_count: 0,
      locked_until: null,
      last_login_at: new Date(),
      last_login_ip: null // 将在登录时设置
    })
  }

  AdminUser.prototype.updatePassword = async function (newPassword) {
    // 密码复杂度验证
    if (!this.constructor.validatePasswordStrength(newPassword)) {
      throw new Error('密码强度不足：必须包含大小写字母、数字和特殊字符，长度至少8位')
    }

    return this.update({
      password_hash: newPassword, // hook会自动加密
      password_changed_at: new Date()
    })
  }

  // 类方法
  AdminUser.validatePasswordStrength = function (password) {
    // 🔧 强密码策略：至少8位，包含大小写字母、数字、特殊字符
    const minLength = 8
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecial
  }

  AdminUser.findByUsername = function (username) {
    return this.findOne({
      where: { username },
      attributes: {
        exclude: [] // 包含所有字段用于登录验证
      }
    })
  }

  AdminUser.findActiveByUsername = function (username) {
    return this.findOne({
      where: {
        username,
        status: 'active'
      }
    })
  }

  AdminUser.createSecureAdmin = async function (adminData) {
    const { username, password, phone, email, role = 'admin' } = adminData

    // 验证密码强度
    if (!this.validatePasswordStrength(password)) {
      throw new Error('密码强度不足：必须包含大小写字母、数字和特殊字符，长度至少8位')
    }

    // 检查用户名是否已存在
    const existingAdmin = await this.findByUsername(username)
    if (existingAdmin) {
      throw new Error('管理员用户名已存在')
    }

    return this.create({
      username,
      password_hash: password, // hook会自动加密
      phone,
      email,
      role,
      status: 'active'
    })
  }

  // 关联关系
  AdminUser.associate = function (models) {
    // 管理员状态
    AdminUser.hasOne(models.AdminStatus, {
      foreignKey: 'admin_id',
      as: 'adminStatus'
    })

    // 登录日志
    AdminUser.hasMany(models.LoginLog, {
      foreignKey: 'user_id',
      as: 'loginLogs',
      scope: {
        user_type: 'admin'
      }
    })

    // 会话管理
    AdminUser.hasMany(models.UserSession, {
      foreignKey: 'user_id',
      as: 'sessions',
      scope: {
        user_type: 'admin'
      }
    })
  }

  return AdminUser
}
