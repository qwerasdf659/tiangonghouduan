/**
 * 任务 1.4 完整性检查脚本
 * 检查管理员认证路由重构是否完整
 *
 * P1-9：已改造为通过 ServiceManager 获取服务（snake_case key）
 */

const { User, UserRole, Role } = require('../models')

/*
 * P1-9：UserService 通过 ServiceManager 获取
 * 服务键：'user'（snake_case）
 */
let UserService = null

/**
 * P1-9：初始化 ServiceManager 并获取 UserService
 * @returns {Promise<Object>} UserService 实例
 */
async function initializeUserService() {
  if (UserService) return UserService
  try {
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    UserService = serviceManager.getService('user')
    console.log('  ✅ UserService 加载成功（P1-9 ServiceManager）')
    return UserService
  } catch (error) {
    console.log(`  ❌ UserService 加载失败: ${error.message}`)
    throw error
  }
}

async function checkTask14() {
  console.log('===================================================================')
  console.log('任务 1.4 完整性检查')
  console.log('===================================================================\n')

  let hasIssues = false

  try {
    // 检查 1: User 表结构
    console.log('✓ 检查 1: User 表结构')
    const userDesc = await User.describe()
    const requiredFields = [
      'user_id',
      'mobile',
      'nickname',
      'status',
      'created_at',
      'last_login',
      'login_count'
    ]
    const missingFields = requiredFields.filter(f => !userDesc[f])
    if (missingFields.length > 0) {
      console.log('  ❌ 缺少字段:', missingFields)
      hasIssues = true
    } else {
      console.log('  ✅ User 表结构完整')
    }

    // 检查 2: 测试用户存在性
    console.log('\n✓ 检查 2: 测试用户存在性')
    const testUser = await User.findOne({
      where: { mobile: '13612227930' },
      attributes: ['user_id', 'mobile', 'nickname', 'status', 'last_login', 'login_count']
    })
    if (!testUser) {
      console.log('  ❌ 测试用户不存在 (mobile: 13612227930)')
      hasIssues = true
    } else {
      console.log('  ✅ 测试用户存在')
      console.log('     user_id:', testUser.user_id)
      console.log('     status:', testUser.status)
      console.log('     last_login:', testUser.last_login)
      console.log('     login_count:', testUser.login_count)

      // 检查 3: 用户角色
      console.log('\n✓ 检查 3: 测试用户角色')
      const userRoles = await UserRole.findAll({
        where: { user_id: testUser.user_id },
        include: [{ model: Role, as: 'role', attributes: ['role_name', 'role_level'] }]
      })
      if (userRoles.length === 0) {
        console.log('  ❌ 测试用户没有角色')
        hasIssues = true
      } else {
        const hasAdminRole = userRoles.some(ur => ur.role.role_level >= 100)
        if (!hasAdminRole) {
          console.log('  ❌ 测试用户不是管理员')
          hasIssues = true
        } else {
          console.log('  ✅ 测试用户是管理员')
          userRoles.forEach(ur => {
            console.log(`     - ${ur.role.role_name} (level: ${ur.role.role_level})`)
          })
        }
      }
    }

    // 检查 4: UserService 方法完整性
    console.log('\n✓ 检查 4: UserService 方法完整性')
    // P1-9：通过 ServiceManager 获取 UserService
    await initializeUserService()
    const requiredMethods = [
      'adminLogin',
      'getUserWithValidation',
      'findByMobile',
      'updateLoginStats'
    ]
    const missingMethods = requiredMethods.filter(m => typeof UserService[m] !== 'function')
    if (missingMethods.length > 0) {
      console.log('  ❌ UserService 缺少方法:', missingMethods)
      hasIssues = true
    } else {
      console.log('  ✅ UserService 方法完整')
      requiredMethods.forEach(m => {
        console.log(`     - ${m}()`)
      })
    }

    // 检查 5: ServiceManager 注册
    console.log('\n✓ 检查 5: ServiceManager 注册')
    const serviceManager = require('../services/index')
    // 等待 ServiceManager 初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('     ServiceManager 初始化状态:', serviceManager._initialized)
    console.log('     已注册服务列表:', serviceManager.getServiceList())

    if (!serviceManager.hasService('user')) {
      console.log('  ❌ UserService 未在 ServiceManager 中注册')
      // 尝试手动初始化
      console.log('     尝试手动初始化 ServiceManager...')
      try {
        await serviceManager.initialize()
        if (serviceManager.hasService('user')) {
          console.log('  ✅ 手动初始化成功，UserService 已注册')
        } else {
          console.log('  ❌ 手动初始化后仍未找到 UserService')
          hasIssues = true
        }
      } catch (error) {
        console.log('  ❌ 手动初始化失败:', error.message)
        hasIssues = true
      }
    } else {
      console.log('  ✅ UserService 已在 ServiceManager 中注册')
      const userService = serviceManager.getService('user')
      console.log('     服务名称: user')
      console.log('     服务类型:', typeof userService)
    }

    // 总结
    console.log('\n===================================================================')
    if (hasIssues) {
      console.log('❌ 检查完成：发现问题，需要修复')
      process.exit(1)
    } else {
      console.log('✅ 检查完成：所有检查通过，任务 1.4 执行完整')
      process.exit(0)
    }
  } catch (error) {
    console.error('\n❌ 检查过程中出现错误:')
    console.error('   错误信息:', error.message)
    console.error('   错误栈:', error.stack)
    process.exit(1)
  }
}

// 运行检查
checkTask14()
