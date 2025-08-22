/**
 * 登录日志模型 - V3安全版本
 * 记录用户和管理员的登录活动，支持安全审计
 * 创建时间：2025年01月21日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const LoginLog = sequelize.define(
    'LoginLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID'
      },

      user_type: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        comment: '用户类型'
      },

      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '用户ID'
      },

      username: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '用户名（管理员）'
      },

      mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '手机号（普通用户）'
      },

      login_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '登录IP'
      },

      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '用户代理'
      },

      login_result: {
        type: DataTypes.ENUM('success', 'fail'),
        allowNull: false,
        comment: '登录结果'
      },

      fail_reason: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '失败原因'
      },

      // MFA相关
      sms_sent: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '是否发送短信'
      },

      sms_verified: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '短信是否验证通过'
      },

      // 设备信息
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '设备信息'
      }
    },
    {
      tableName: 'login_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 登录日志不需要更新时间
      underscored: true,
      indexes: [
        {
          fields: ['user_type', 'user_id']
        },
        {
          fields: ['login_result', 'created_at']
        },
        {
          fields: ['login_ip']
        },
        {
          fields: ['created_at']
        }
      ],
      comment: '登录日志表'
    }
  )

  // 实例方法
  LoginLog.prototype.isSuccess = function () {
    return this.login_result === 'success'
  }

  LoginLog.prototype.isFail = function () {
    return this.login_result === 'fail'
  }

  LoginLog.prototype.isAdminLogin = function () {
    return this.user_type === 'admin'
  }

  LoginLog.prototype.isUserLogin = function () {
    return this.user_type === 'user'
  }

  // 类方法
  LoginLog.logUserLogin = async function (userData) {
    const {
      user_id,
      mobile,
      login_ip,
      user_agent,
      result,
      fail_reason = null,
      device_info = null
    } = userData

    return this.create({
      user_type: 'user',
      user_id,
      mobile,
      login_ip,
      user_agent,
      login_result: result,
      fail_reason,
      device_info,
      sms_sent: 0, // 普通用户登录暂不使用短信
      sms_verified: 0
    })
  }

  LoginLog.logAdminLogin = async function (adminData) {
    const {
      user_id,
      username,
      login_ip,
      user_agent,
      result,
      fail_reason = null,
      sms_sent = 0,
      sms_verified = 0,
      device_info = null
    } = adminData

    return this.create({
      user_type: 'admin',
      user_id,
      username,
      login_ip,
      user_agent,
      login_result: result,
      fail_reason,
      sms_sent,
      sms_verified,
      device_info
    })
  }

  LoginLog.getRecentLoginAttempts = function (user_type, user_id, minutes = 30) {
    const timeAgo = new Date(Date.now() - minutes * 60 * 1000)

    return this.findAll({
      where: {
        user_type,
        user_id,
        created_at: {
          [sequelize.Sequelize.Op.gte]: timeAgo
        }
      },
      order: [['created_at', 'DESC']]
    })
  }

  LoginLog.getFailedLoginAttempts = function (user_type, user_id, minutes = 30) {
    const timeAgo = new Date(Date.now() - minutes * 60 * 1000)

    return this.findAll({
      where: {
        user_type,
        user_id,
        login_result: 'fail',
        created_at: {
          [sequelize.Sequelize.Op.gte]: timeAgo
        }
      },
      order: [['created_at', 'DESC']]
    })
  }

  LoginLog.getLoginStatistics = async function (user_type, days = 7) {
    const timeAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    return this.findAll({
      where: {
        user_type,
        created_at: {
          [sequelize.Sequelize.Op.gte]: timeAgo
        }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
        [sequelize.fn('COUNT', '*'), 'total_logins'],
        [
          sequelize.fn('SUM',
            sequelize.literal('CASE WHEN login_result = \'success\' THEN 1 ELSE 0 END')
          ), 'successful_logins'
        ],
        [
          sequelize.fn('SUM',
            sequelize.literal('CASE WHEN login_result = \'fail\' THEN 1 ELSE 0 END')
          ), 'failed_logins'
        ]
      ],
      group: [sequelize.fn('DATE', sequelize.col('created_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'DESC']]
    })
  }

  // 关联关系
  LoginLog.associate = function (models) {
    // 普通用户登录日志
    LoginLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false,
      scope: {
        user_type: 'user'
      }
    })

    // 管理员登录日志
    LoginLog.belongsTo(models.AdminUser, {
      foreignKey: 'user_id',
      as: 'admin',
      constraints: false,
      scope: {
        user_type: 'admin'
      }
    })
  }

  return LoginLog
}
