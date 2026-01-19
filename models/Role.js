/**
 * 角色管理模型 - 基于UUID的安全角色系统
 * 创建时间：2025年01月21日
 * 用途：提供安全的权限验证（role_level >= 100 为管理员）
 *
 * 🛡️ 安全优势：
 * - UUID角色标识，无法通过抓包推测权限
 * - 支持多级权限，可扩展性强
 * - 角色隔离，便于审计和管理
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const Role = sequelize.define(
    'Role',
    {
      // 主键ID
      role_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      // 🛡️ 核心：UUID角色标识（不可推测）
      role_uuid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        defaultValue: () => uuidv4(),
        comment: '角色UUID标识（安全不可推测）'
      },

      // 角色名称（内部管理用）
      role_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '角色名称（仅内部使用）'
      },

      // 角色级别（数值越高权限越大）
      role_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '角色级别（0=普通用户，100=超级管理员）'
      },

      // 角色权限（JSON格式）
      permissions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: '角色权限配置（JSON格式）'
      },

      // 角色描述
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '角色描述'
      },

      // 是否启用
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '角色是否启用'
      }
    },
    {
      tableName: 'roles',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['role_uuid']
        },
        {
          unique: true,
          fields: ['role_name']
        },
        {
          fields: ['role_level']
        },
        {
          fields: ['is_active']
        }
      ],
      comment: '角色管理表'
    }
  )

  // 定义关联关系
  Role.associate = function (models) {
    // 角色与用户的多对多关系
    Role.belongsToMany(models.User, {
      through: 'user_roles',
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users'
    })
  }

  // 🛡️ 安全方法：根据UUID获取权限
  Role.getPermissionsByUUID = async function (roleUuid) {
    if (!roleUuid) return null

    const role = await this.findOne({
      where: {
        role_uuid: roleUuid,
        is_active: true
      }
    })

    return role
      ? {
          level: role.role_level,
          permissions: role.permissions,
          name: role.role_name
        }
      : null
  }

  // 🛡️ 权限检查方法
  Role.checkPermission = async function (roleUuid, resource, action = 'read') {
    const roleData = await this.getPermissionsByUUID(roleUuid)
    if (!roleData) return false

    // 超级管理员拥有所有权限
    if (roleData.level >= 100) return true

    // 检查具体权限
    const permissions = roleData.permissions
    if (!permissions || !permissions[resource]) return false

    return permissions[resource].includes(action) || permissions[resource].includes('*')
  }

  // 🛡️ 初始化默认角色
  Role.initializeDefaultRoles = async function () {
    const defaultRoles = [
      {
        role_name: 'user',
        role_level: 0,
        description: '普通用户',
        permissions: {
          lottery: ['read', 'participate'],
          profile: ['read', 'update'],
          points: ['read']
        }
      },
      {
        role_name: 'admin',
        role_level: 100,
        description: '超级管理员',
        permissions: {
          '*': ['*'] // 所有权限
        }
      },
      {
        role_name: 'moderator',
        role_level: 50,
        description: '运营管理员',
        permissions: {
          lottery: ['*'],
          users: ['read', 'update'],
          analytics: ['read'],
          prizes: ['*']
        }
      }
    ]

    for (const roleData of defaultRoles) {
      // eslint-disable-next-line no-await-in-loop -- 初始化角色需要串行检查
      const existing = await this.findOne({
        where: { role_name: roleData.role_name }
      })

      if (!existing) {
        // eslint-disable-next-line no-await-in-loop -- 初始化角色需要串行创建
        await this.create(roleData)
        console.log(`✅ 创建默认角色: ${roleData.role_name}`)
      }
    }
  }

  return Role
}
