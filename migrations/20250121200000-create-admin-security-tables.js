'use strict'

/**
 * 🔧 创建管理员安全系统相关表
 * 修复认证授权系统安全漏洞
 * 创建时间：2025年01月21日
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始创建管理员安全系统表...')

      // 1. 创建管理员用户表
      await queryInterface.createTable('admin_users', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '管理员ID'
        },
        username: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '管理员用户名'
        },
        password_hash: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'BCrypt密码哈希'
        },
        phone: {
          type: Sequelize.STRING(11),
          allowNull: true,
          comment: '绑定手机号'
        },
        email: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '邮箱'
        },
        role: {
          type: Sequelize.ENUM('admin', 'super_admin'),
          defaultValue: 'admin',
          comment: '管理员角色'
        },
        status: {
          type: Sequelize.TINYINT,
          defaultValue: 1,
          comment: '状态：1正常 0锁定 -1禁用'
        },
        // 多因素认证相关
        mfa_enabled: {
          type: Sequelize.TINYINT,
          defaultValue: 0,
          comment: '二次验证启用状态'
        },
        mfa_secret: {
          type: Sequelize.STRING(32),
          allowNull: true,
          comment: 'MFA密钥'
        },
        last_sms_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后发送短信时间'
        },
        // 安全相关
        login_fail_count: {
          type: Sequelize.TINYINT,
          defaultValue: 0,
          comment: '登录失败次数'
        },
        locked_until: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '锁定到期时间'
        },
        last_login_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后登录时间'
        },
        last_login_ip: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: '最后登录IP'
        },
        password_changed_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '密码最后修改时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      }, {
        transaction,
        comment: '管理员用户表'
      })

      // 2. 创建登录日志表
      await queryInterface.createTable('login_logs', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '日志ID'
        },
        user_type: {
          type: Sequelize.ENUM('user', 'admin'),
          allowNull: false,
          comment: '用户类型'
        },
        user_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '用户ID'
        },
        username: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '用户名（管理员）'
        },
        mobile: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: '手机号（普通用户）'
        },
        login_ip: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: '登录IP'
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '用户代理'
        },
        login_result: {
          type: Sequelize.ENUM('success', 'fail'),
          allowNull: false,
          comment: '登录结果'
        },
        fail_reason: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '失败原因'
        },
        // MFA相关
        sms_sent: {
          type: Sequelize.TINYINT,
          defaultValue: 0,
          comment: '是否发送短信'
        },
        sms_verified: {
          type: Sequelize.TINYINT,
          defaultValue: 0,
          comment: '短信是否验证通过'
        },
        // 设备信息
        device_info: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '设备信息'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        }
      }, {
        transaction,
        comment: '登录日志表'
      })

      // 3. 创建会话管理表
      await queryInterface.createTable('user_sessions', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '会话ID'
        },
        session_token: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
          comment: '会话令牌（JWT Token的jti）'
        },
        user_type: {
          type: Sequelize.ENUM('user', 'admin'),
          allowNull: false,
          comment: '用户类型'
        },
        user_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '用户ID'
        },
        login_ip: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: '登录IP'
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '用户代理'
        },
        device_fingerprint: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '设备指纹'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          comment: '是否活跃'
        },
        last_activity: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '最后活动时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '过期时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      }, {
        transaction,
        comment: '用户会话管理表'
      })

      // 4. 添加用户表密码字段（为了支持管理员密码登录）
      await queryInterface.addColumn('users', 'password_hash', {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: '密码哈希（管理员可选用）'
      }, { transaction })

      await queryInterface.addColumn('users', 'login_fail_count', {
        type: Sequelize.TINYINT,
        defaultValue: 0,
        comment: '登录失败次数'
      }, { transaction })

      await queryInterface.addColumn('users', 'locked_until', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '锁定到期时间'
      }, { transaction })

      // 5. 创建索引
      await queryInterface.addIndex('admin_users', ['username'], {
        name: 'idx_admin_users_username',
        transaction
      })

      await queryInterface.addIndex('admin_users', ['status', 'role'], {
        name: 'idx_admin_users_status_role',
        transaction
      })

      await queryInterface.addIndex('login_logs', ['user_type', 'user_id'], {
        name: 'idx_login_logs_user',
        transaction
      })

      await queryInterface.addIndex('login_logs', ['login_result', 'created_at'], {
        name: 'idx_login_logs_result_time',
        transaction
      })

      await queryInterface.addIndex('user_sessions', ['session_token'], {
        name: 'idx_user_sessions_token',
        transaction
      })

      await queryInterface.addIndex('user_sessions', ['user_type', 'user_id', 'is_active'], {
        name: 'idx_user_sessions_user_active',
        transaction
      })

      await queryInterface.addIndex('user_sessions', ['expires_at', 'is_active'], {
        name: 'idx_user_sessions_expires',
        transaction
      })

      await transaction.commit()
      console.log('✅ 管理员安全系统表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建管理员安全系统表失败:', error)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🗑️ 开始删除管理员安全系统表...')

      // 删除用户表新增字段
      await queryInterface.removeColumn('users', 'password_hash', { transaction })
      await queryInterface.removeColumn('users', 'login_fail_count', { transaction })
      await queryInterface.removeColumn('users', 'locked_until', { transaction })

      // 删除表
      await queryInterface.dropTable('user_sessions', { transaction })
      await queryInterface.dropTable('login_logs', { transaction })
      await queryInterface.dropTable('admin_users', { transaction })

      await transaction.commit()
      console.log('✅ 管理员安全系统表删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除管理员安全系统表失败:', error)
      throw error
    }
  }
}
