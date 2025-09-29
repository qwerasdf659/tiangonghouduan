/**
 * 用户角色关联模型 - 多对多关系表
 * 创建时间：2025年01月21日
 * 用途：管理用户与角色的关联关系
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserRole = sequelize.define(
    'UserRole',
    {
      // 主键ID
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '用户ID'
      },

      // 角色ID
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id'
        },
        comment: '角色ID'
      },

      // 分配时间
      assigned_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '角色分配时间'
      },

      // 分配者
      assigned_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '角色分配者ID'
      },

      // 是否激活
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '角色是否激活'
      }
    },
    {
      tableName: 'user_roles',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'role_id']
        },
        {
          fields: ['user_id']
        },
        {
          fields: ['role_id']
        },
        {
          fields: ['is_active']
        }
      ],
      comment: '用户角色关联表'
    }
  )

  // 定义关联关系
  UserRole.associate = function (models) {
    // 关联到用户
    UserRole.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    // 关联到角色
    UserRole.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role'
    })

    // 关联到分配者
    UserRole.belongsTo(models.User, {
      foreignKey: 'assigned_by',
      as: 'assignedBy'
    })
  }

  return UserRole
}
