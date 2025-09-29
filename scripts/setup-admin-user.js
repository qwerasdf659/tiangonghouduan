/**
 * 超级管理员设置脚本 - V4.0 统一架构版本
 * 🛡️ 基于UUID角色系统创建管理员账户
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

require('dotenv').config()
const { User, Role, UserRole } = require('../models')

async function setupSuperAdmin () {
  try {
    console.log('🛡️ 开始设置超级管理员（UUID角色系统）...')

    // 获取目标手机号
    const targetMobile = process.argv[2] || '13612227930'

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
      process.exit(1)
    }

    // 检查用户是否已有admin角色
    const existingRole = await UserRole.findOne({
      where: {
        user_id: user.user_id,
        role_id: adminRole.id
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
        role_id: adminRole.id,
        assigned_at: new Date(),
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

    const maxRoleLevel =
      updatedUser.roles.length > 0 ? Math.max(...updatedUser.roles.map(role => role.role_level)) : 0

    console.log(`   权限级别: ${maxRoleLevel}`)
    console.log(`   角色: ${updatedUser.roles.map(role => role.role_name).join(', ')}`)

    if (maxRoleLevel >= 100) {
      console.log('\n🎉 超级管理员设置成功！')
      console.log('💡 可以使用以下信息登录管理后台:')
      console.log(`   手机号: ${updatedUser.mobile}`)
      console.log('   验证码: 123456 (开发环境)')
    } else {
      console.log('\n❌ 超级管理员设置失败，权限级别不足')
    }
  } catch (error) {
    console.error('❌ 设置超级管理员失败:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupSuperAdmin()
}

module.exports = { setupSuperAdmin }
