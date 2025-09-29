/**
 * 用户角色迁移脚本
 * 将现有用户的is_admin权限迁移到UUID角色系统
 */

const { User, Role, UserRole, sequelize } = require('../models')

async function migrateUserRoles () {
  const transaction = await sequelize.transaction()

  try {
    console.log('🚀 开始迁移用户角色数据...')

    // 获取所有角色
    const adminRole = await Role.findOne({ where: { role_name: 'admin' } })
    const userRole = await Role.findOne({ where: { role_name: 'user' } })

    if (!adminRole || !userRole) {
      throw new Error('角色数据不完整')
    }

    console.log(`找到角色: admin(${adminRole.id}), user(${userRole.id})`)

    // 获取所有用户
    const users = await User.findAll()
    console.log(`找到 ${users.length} 个用户`)

    let adminCount = 0
    let regularCount = 0

    for (const user of users) {
      const targetRole = user.is_admin ? adminRole : userRole

      // 检查是否已存在角色关联
      const existingRole = await UserRole.findOne({
        where: { user_id: user.user_id, role_id: targetRole.id }
      })

      if (!existingRole) {
        await UserRole.create({
          user_id: user.user_id,
          role_id: targetRole.id,
          assigned_at: new Date(),
          assigned_by: null,
          is_active: true
        }, { transaction })

        if (user.is_admin) {
          adminCount++
          console.log(`  ✅ 用户${user.user_id}(${user.mobile}) -> 管理员角色`)
        } else {
          regularCount++
          console.log(`  ✅ 用户${user.user_id}(${user.mobile}) -> 普通用户角色`)
        }
      } else {
        console.log(`  ⏭️ 用户${user.user_id}(${user.mobile}) 已有角色，跳过`)
      }
    }

    await transaction.commit()

    console.log('✅ 用户角色迁移完成:')
    console.log(`   管理员用户: ${adminCount} 个`)
    console.log(`   普通用户: ${regularCount} 个`)

    process.exit(0)
  } catch (error) {
    await transaction.rollback()
    console.error('❌ 迁移失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

migrateUserRoles()
