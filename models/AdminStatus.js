/**
 * 管理员状态模型
 * 管理客服管理员的在线状态和会话负载
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AdminStatus = sequelize.define(
    'AdminStatus',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'ID'
      },

      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '管理员ID'
      },

      status: {
        type: DataTypes.ENUM('online', 'busy', 'offline'),
        defaultValue: 'offline',
        comment: '状态'
      },

      current_sessions: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '当前处理会话数'
      },

      max_sessions: {
        type: DataTypes.INTEGER,
        defaultValue: 9999999,
        comment: '最大处理会话数（9999999表示无限制）'
      },

      last_active_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '最后活跃时间'
      }
    },
    {
      tableName: 'admin_status',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['admin_id']
        },
        {
          fields: ['status']
        },
        {
          fields: ['last_active_at']
        }
      ],
      comment: '管理员状态表'
    }
  )

  // 定义关联关系
  AdminStatus.associate = function (models) {
    // 状态属于管理员
    AdminStatus.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin'
    })
  }

  // 实例方法
  AdminStatus.prototype.isOnline = function () {
    return this.status === 'online'
  }

  AdminStatus.prototype.isBusy = function () {
    return this.status === 'busy'
  }

  AdminStatus.prototype.isAvailable = function () {
    // 🔧 修改：在线的管理员总是可用（无会话数限制）
    return this.status === 'online'
  }

  AdminStatus.prototype.canTakeNewSession = function () {
    return this.isAvailable()
  }

  AdminStatus.prototype.incrementSessions = function () {
    return this.increment('current_sessions', { by: 1 })
  }

  AdminStatus.prototype.decrementSessions = function () {
    if (this.current_sessions > 0) {
      return this.decrement('current_sessions', { by: 1 })
    }
    return Promise.resolve(this)
  }

  AdminStatus.prototype.updateLastActive = function () {
    return this.update({ last_active_at: new Date() })
  }

  // 类方法
  AdminStatus.findAvailableAdmins = function () {
    return this.findAll({
      where: {
        status: 'online'
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'admin',
          where: { is_admin: true },
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [
        ['current_sessions', 'ASC'],
        ['last_active_at', 'ASC']
      ]
    })
  }

  AdminStatus.findLeastBusyAdmin = function () {
    return this.findOne({
      where: {
        status: 'online'
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'admin',
          where: { is_admin: true }
        }
      ],
      order: [
        // 🔧 修改：去除max_sessions限制，只按会话数排序
        ['current_sessions', 'ASC'],
        ['last_active_at', 'ASC']
      ]
    })
  }

  AdminStatus.getOrCreateForAdmin = async function (adminId) {
    const [adminStatus, _created] = await this.findOrCreate({
      where: { admin_id: adminId },
      defaults: {
        admin_id: adminId,
        status: 'offline',
        current_sessions: 0,
        max_sessions: 9999999,
        last_active_at: new Date()
      }
    })
    return adminStatus
  }

  AdminStatus.setAdminOnline = async function (adminId) {
    const adminStatus = await this.getOrCreateForAdmin(adminId)
    return adminStatus.update({
      status: 'online',
      last_active_at: new Date()
    })
  }

  AdminStatus.setAdminOffline = async function (adminId) {
    const adminStatus = await this.getOrCreateForAdmin(adminId)
    return adminStatus.update({
      status: 'offline',
      last_active_at: new Date()
    })
  }

  return AdminStatus
}
