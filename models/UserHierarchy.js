/**
 * 用户层级关系模型（简化版） - 餐厅积分抽奖系统 V4.0 统一引擎架构
 * 业务场景：管理用户的上下级关系和权限层级
 * 创建时间：2025年11月07日
 * 设计理念：简单实用，避免过度设计
 *
 * 核心功能：
 * 1. 记录用户之间的上下级关系（区域负责人→业务经理→业务员）
 * 2. 支持权限激活/停用管理
 * 3. 记录完整的操作审计信息
 *
 * 简化内容：
 * - 移除 hierarchy_path 字段（小数据量下递归查询足够快）
 * - 移除 hierarchy_level 字段（可动态计算，避免数据冗余）
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const UserHierarchy = sequelize.define(
    'UserHierarchy',
    {
      // 层级关系ID（主键）
      user_hierarchy_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '层级关系ID（主键）'
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '用户ID（当前用户）'
      },

      // 上级用户ID
      superior_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '上级用户ID（NULL表示顶级区域负责人）'
      },

      // 角色ID
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'role_id'
        },
        comment: '当前角色ID（关联roles表）'
      },

      // 所属门店ID（仅业务员有值）
      store_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'stores',
          key: 'store_id'
        },
        comment: '所属门店ID（仅业务员有值，业务经理和区域负责人为NULL）'
      },

      // 是否激活
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '层级关系是否有效（1=激活，0=已停用）'
      },

      // 激活时间
      activated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '激活时间（首次激活或重新激活时记录），时区：北京时间（GMT+8）'
      },

      // 停用时间
      deactivated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '停用时间（停用时记录），时区：北京时间（GMT+8）'
      },

      // 停用操作人
      deactivated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '停用操作人ID（谁停用的？外键关联users.user_id）'
      },

      // 停用原因
      deactivation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '停用原因（如：离职、调动、违规等）'
      }
    },
    {
      tableName: 'user_hierarchy',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'role_id'],
          comment: '一个用户在同一角色下只能有一条层级记录'
        },
        { fields: ['superior_user_id'], comment: '查询某个上级的所有直接下属' },
        { fields: ['is_active'], comment: '筛选激活/停用状态' }
      ],
      comment: '用户层级关系表（简化版：仅保留核心字段）',

      // 钩子函数：确保使用北京时间
      hooks: {
        beforeSave: (record, _options) => {
          if (!record.created_at) {
            record.created_at = BeijingTimeHelper.createDatabaseTime()
          }
          record.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  // 定义关联关系
  UserHierarchy.associate = function (models) {
    // 多对一：当前用户
    UserHierarchy.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '当前用户信息'
    })

    // 多对一：上级用户
    UserHierarchy.belongsTo(models.User, {
      foreignKey: 'superior_user_id',
      as: 'superior',
      comment: '上级用户信息'
    })

    // 多对一：角色信息
    UserHierarchy.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role',
      comment: '角色信息'
    })

    // 多对一：门店信息
    if (models.Store) {
      UserHierarchy.belongsTo(models.Store, {
        foreignKey: 'store_id',
        as: 'store',
        comment: '所属门店信息（仅业务员）'
      })
    }

    // 多对一：停用操作人
    UserHierarchy.belongsTo(models.User, {
      foreignKey: 'deactivated_by',
      as: 'deactivator',
      comment: '停用操作人信息'
    })
  }

  return UserHierarchy
}
