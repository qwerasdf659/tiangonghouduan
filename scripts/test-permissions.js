/**
 * 权限系统测试脚本 - V4.0 统一架构版本
 * 🛡️ 测试UUID角色系统的权限管理功能
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const { User, Role } = require('../models')
const { getUserRoles } = require('../middleware/auth')
const permissionModule = require('../modules/UserPermissionModule')

async function testPermissions () {
  try {
    console.log('🔍 测试权限系统...\n')

    // 1. 测试用户31的角色信息
    const user = await User.findOne({
      where: { user_id: 31 },
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true }
          },
          attributes: ['id', 'role_uuid', 'role_name', 'role_level', 'permissions']
        }
      ]
    })

    console.log('👤 用户信息:')
    if (user) {
      console.log(`   用户ID: ${user.user_id}`)
      console.log(`   手机号: ${user.mobile}`)
      console.log(`   昵称: ${user.nickname}`)
      console.log(`   状态: ${user.status}`)
      console.log(`   角色数量: ${user.roles ? user.roles.length : 0}`)

      if (user.roles && user.roles.length > 0) {
        console.log('   角色详情:')
        user.roles.forEach(role => {
          console.log(`     - ${role.role_name} (级别: ${role.role_level})`)
        })
      }
    } else {
      console.log('   ❌ 用户不存在')
      return
    }

    // 2. 测试getUserRoles函数
    console.log('\n🛡️ 测试getUserRoles函数:')
    const userRoles = await getUserRoles(31)
    console.log('   结果:', JSON.stringify(userRoles, null, 2))

    // 3. 测试UserPermissionModule
    console.log('\n🔧 测试UserPermissionModule:')
    const permissions = await permissionModule.getUserPermissions(31)
    console.log('   结果:', JSON.stringify(permissions, null, 2))

    console.log('\n✅ 权限系统测试完成')
  } catch (error) {
    console.error('❌ 权限系统测试失败:', error)
    console.error('错误详情:', error.message)
    console.error('错误堆栈:', error.stack)
  }
}

if (require.main === module) {
  testPermissions()
}

module.exports = { testPermissions }
