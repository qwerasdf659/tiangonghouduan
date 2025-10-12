#!/usr/bin/env node

/**
 * V4 统一系统管理器
 * 整合角色管理、用户管理和系统配置功能
 *
 * @description 整合simplify_roles.js, setup_admin_user.js等系统管理功能
 * @version 4.0.0
 * @date 2025-10-01
 * @author Claude Sonnet 4
 */

require('dotenv').config()
const BeijingTimeHelper = require('../utils/timeHelper')
const { getDatabaseHelper } = require('../utils/database')
const { User, Role, UserRole } = require('../models')

class UnifiedSystemManager {
  constructor () {
    this.results = {
      startTime: BeijingTimeHelper.now(),
      operations: [],
      warnings: [],
      errors: [],
      summary: {}
    }
    this.dbHelper = getDatabaseHelper()
    this.sequelize = this.dbHelper.getSequelize()
  }

  // 记录操作结果
  recordOperation (operationType, success, details = null, warning = null, error = null) {
    const result = {
      type: operationType,
      success,
      details,
      warning,
      error,
      timestamp: BeijingTimeHelper.now()
    }

    this.results.operations.push(result)

    if (warning) {
      this.results.warnings.push({ type: operationType, message: warning })
    }

    if (error) {
      this.results.errors.push({ type: operationType, message: error })
    }
  }

  // === 角色系统管理模块 ===

  // 简化角色系统（整合simplify_roles.js功能）
  async simplifyRoleSystem () {
    console.log('\n=== 简化角色系统 ===')

    try {
      await this.sequelize.authenticate()
      console.log('🔄 开始简化角色系统...')

      // 1. 检查现有角色
      const [existingRoles] = await this.sequelize.query('SELECT * FROM roles')
      console.log('现有角色:', existingRoles.map(r => r.role_name))

      // 2. 删除不需要的角色（除了admin和user）
      const allowedRoles = ['admin', 'user']
      const rolesToDelete = existingRoles.filter(r => !allowedRoles.includes(r.role_name))

      if (rolesToDelete.length > 0) {
        console.log('删除角色:', rolesToDelete.map(r => r.role_name))

        // 先删除用户角色关联
        for (const role of rolesToDelete) {
          await this.sequelize.query('DELETE FROM user_roles WHERE role_id = ?', {
            replacements: [role.role_id]
          })
        }

        // 再删除角色
        const roleIds = rolesToDelete.map(r => r.role_id)
        if (roleIds.length > 0) {
          await this.sequelize.query(`DELETE FROM roles WHERE role_id IN (${roleIds.join(',')})`)
        }
      }

      // 3. 更新角色权限配置
      await this.sequelize.query(`
        UPDATE roles
        SET permissions = '["*:*"]', description = '超级管理员，拥有所有权限'
        WHERE role_name = 'admin'
      `)

      await this.sequelize.query(`
        UPDATE roles
        SET permissions = '["lottery:read", "lottery:participate", "profile:read", "profile:update", "points:read"]',
            description = '普通用户'
        WHERE role_name = 'user'
      `)

      // 4. 显示最终结果
      const [finalRoles] = await this.sequelize.query('SELECT * FROM roles ORDER BY role_level DESC')
      console.log('\n=== 简化后的角色系统 ===')
      finalRoles.forEach(role => {
        console.log(`✅ ${role.role_name}: 级别${role.role_level} - ${role.description}`)
      })

      this.recordOperation('角色系统简化', true, {
        deletedRoles: rolesToDelete.length,
        remainingRoles: finalRoles.length
      })
    } catch (error) {
      console.error('❌ 角色系统简化失败:', error.message)
      this.recordOperation('角色系统简化', false, null, null, error.message)
    }
  }

  // === 管理员用户设置模块 ===

  // 设置超级管理员（整合setup_admin_user.js功能）
  async setupSuperAdmin (targetMobile = '13612227930') {
    console.log('\n=== 设置超级管理员 ===')

    try {
      console.log('🛡️  开始设置超级管理员（UUID角色系统）...')
      console.log(`📱 目标手机号: ${targetMobile}`)

      // 查找或创建用户
      let user = await User.findOne({ where: { mobile: targetMobile } })

      if (!user) {
        console.log('👤 用户不存在，创建新用户...')
        user = await User.create({
          mobile: targetMobile,
          nickname: `管理员_${targetMobile.slice(-4)}`,
          status: 'active'
        })
        console.log(`✅ 用户创建成功: ID ${user.user_id}`)
      } else {
        console.log(`👤 用户已存在: ID ${user.user_id}`)
      }

      // 查找admin角色
      const adminRole = await Role.findOne({ where: { role_name: 'admin' } })

      if (!adminRole) {
        console.error('❌ admin角色不存在，请先运行数据库迁移脚本')
        this.recordOperation('设置超级管理员', false, null, null, 'admin角色不存在')
        return false
      }

      // 检查用户是否已有admin角色
      const existingRole = await UserRole.findOne({
        where: {
          user_id: user.user_id,
          role_id: adminRole.role_id
        }
      })

      if (existingRole) {
        // 激活现有角色
        await existingRole.update({ is_active: true })
        console.log('✅ 用户已具有管理员角色，已激活')
      } else {
        // 分配admin角色
        await UserRole.create({
          user_id: user.user_id,
          role_id: adminRole.role_id,
          assigned_at: BeijingTimeHelper.createBeijingTime(),
          assigned_by: null, // 系统分配
          is_active: true
        })
        console.log('✅ 管理员角色分配成功')
      }

      // 验证结果
      const updatedUser = await User.findOne({
        where: { user_id: user.user_id },
        include: [
          {
            model: Role,
            as: 'roles',
            through: { where: { is_active: true } },
            attributes: ['role_name', 'role_level']
          }
        ]
      })

      console.log('\n📊 用户信息:')
      console.log(`   用户ID: ${updatedUser.user_id}`)
      console.log(`   手机号: ${updatedUser.mobile}`)
      console.log(`   昵称: ${updatedUser.nickname}`)
      console.log(`   状态: ${updatedUser.status}`)

      const maxRoleLevel = updatedUser.roles.length > 0
        ? Math.max(...updatedUser.roles.map(role => role.role_level))
        : 0

      console.log(`   权限级别: ${maxRoleLevel}`)
      console.log(`   角色: ${updatedUser.roles.map(role => role.role_name).join(', ')}`)

      if (maxRoleLevel >= 100) {
        console.log('\n🎉 超级管理员设置成功！')
        console.log('💡 可以使用以下信息登录管理后台:')
        console.log(`   手机号: ${updatedUser.mobile}`)
        console.log('   验证码: 123456 (开发环境)')

        this.recordOperation('设置超级管理员', true, {
          userId: updatedUser.user_id,
          mobile: updatedUser.mobile,
          roleLevel: maxRoleLevel
        })
        return true
      } else {
        console.log('\n❌ 超级管理员设置失败，权限级别不足')
        this.recordOperation('设置超级管理员', false, null, '权限级别不足')
        return false
      }
    } catch (error) {
      console.error('❌ 设置超级管理员失败:', error.message)
      this.recordOperation('设置超级管理员', false, null, null, error.message)
      return false
    }
  }

  // === 系统清理模块 ===

  // 清理系统数据
  async cleanupSystemData () {
    console.log('\n=== 清理系统数据 ===')

    try {
      // 1. 清理孤立的聊天消息
      const [orphanedMessages] = await this.sequelize.query(`
        SELECT COUNT(*) as count
        FROM chat_messages cm
        LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
        WHERE cs.session_id IS NULL
      `)

      const orphanedCount = orphanedMessages[0].count
      if (orphanedCount > 0) {
        await this.sequelize.query(`
          DELETE cm FROM chat_messages cm
          LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
          WHERE cs.session_id IS NULL
        `)
        console.log(`✅ 清理了${orphanedCount}条孤立的聊天消息`)
      } else {
        console.log('✅ 没有发现孤立的聊天消息')
      }

      // 2. 清理过期的用户会话
      const [expiredSessions] = await this.sequelize.query(`
        SELECT COUNT(*) as count
        FROM user_sessions
        WHERE expires_at < NOW() AND is_active = 1
      `)

      const expiredCount = expiredSessions[0].count
      if (expiredCount > 0) {
        await this.sequelize.query(`
          UPDATE user_sessions
          SET is_active = 0
          WHERE expires_at < NOW() AND is_active = 1
        `)
        console.log(`✅ 清理了${expiredCount}个过期的用户会话`)
      } else {
        console.log('✅ 没有发现过期的用户会话')
      }

      this.recordOperation('系统数据清理', true, {
        orphanedMessages: orphanedCount,
        expiredSessions: expiredCount
      })
    } catch (error) {
      console.error('❌ 系统数据清理失败:', error.message)
      this.recordOperation('系统数据清理', false, null, null, error.message)
    }
  }

  // === 运行所有管理操作 ===

  async runAllOperations () {
    console.log('⚙️ === 开始V4统一系统管理 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    try {
      // 1. 简化角色系统
      await this.simplifyRoleSystem()

      // 2. 设置超级管理员
      await this.setupSuperAdmin()

      // 3. 清理系统数据
      await this.cleanupSystemData()

      // 4. 生成操作报告
      this.generateOperationReport()
    } catch (error) {
      console.error('💥 系统管理执行失败:', error.message)
      throw error
    }
  }

  // 生成操作报告
  generateOperationReport () {
    const endTime = BeijingTimeHelper.now()
    const totalOperations = this.results.operations.length
    const successfulOperations = this.results.operations.filter(o => o.success).length
    const failedOperations = totalOperations - successfulOperations
    const successRate = totalOperations > 0 ? Math.round((successfulOperations / totalOperations) * 100) : 0

    console.log('\n⚙️ === 系统管理报告 ===')
    console.log(`📅 完成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`🎯 管理操作: ${totalOperations} 项`)
    console.log(`✅ 成功操作: ${successfulOperations} 项`)
    console.log(`❌ 失败操作: ${failedOperations} 项`)
    console.log(`📈 成功率: ${successRate}%`)
    console.log('')

    // 详细结果
    console.log('📋 详细操作结果:')
    this.results.operations.forEach(operation => {
      const status = operation.success ? '✅' : '❌'
      console.log(`   ${status} ${operation.type}`)
      if (operation.warning) {
        console.log(`      ⚠️  警告: ${operation.warning}`)
      }
      if (operation.error) {
        console.log(`      🚨 错误: ${operation.error}`)
      }
    })

    // 警告汇总
    if (this.results.warnings.length > 0) {
      console.log('')
      console.log('⚠️  警告汇总:')
      this.results.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.type}: ${warning.message}`)
      })
    }

    // 错误汇总
    if (this.results.errors.length > 0) {
      console.log('')
      console.log('🚨 错误汇总:')
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.message}`)
      })
    }

    console.log('')
    if (successRate >= 90) {
      console.log('🎉 系统管理效果优秀！')
    } else if (successRate >= 70) {
      console.log('✅ 系统管理效果良好')
    } else {
      console.log('⚠️  系统管理效果一般，建议人工检查')
    }

    this.results.summary = {
      totalOperations,
      successfulOperations,
      failedOperations,
      successRate,
      startTime: this.results.startTime,
      endTime,
      warnings: this.results.warnings.length,
      errors: this.results.errors.length
    }

    return this.results
  }
}

// 如果直接运行此文件，执行系统管理
if (require.main === module) {
  const manager = new UnifiedSystemManager()
  manager.runAllOperations()
    .then(result => {
      process.exit(result?.summary?.successRate >= 70 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 系统管理失败:', error)
      process.exit(1)
    })
}

module.exports = UnifiedSystemManager
