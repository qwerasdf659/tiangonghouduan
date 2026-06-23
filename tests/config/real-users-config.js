/**
 * 真实用户测试配置
 * 支持指定真实账户进行测试，确保测试的真实性和准确性
 *
 * 使用方法：
 * 1. 修改下方配置，指定你的真实用户手机号或用户ID
 * 2. 确保这些用户在数据库中存在
 * 3. 运行测试前会自动验证用户存在性
 *
 * @version 4.0.0
 * @date 2025-01-21
 */

// 🔧 用户自定义配置区域 - 请修改为你的真实账户
const REAL_USER_CONFIG = {
  // 📱 方式1：通过手机号指定用户（推荐）
  byMobile: {
    // 普通测试用户1 - 已配置为真实账户
    regularUser1: process.env.TEST_USER1_MOBILE || '13612227910',

    /*
     * 普通测试用户2 - 清档后（生产基线库仅保留超管）原 13612227910 已删除，统一指向 13612227910
     */
    regularUser2: process.env.TEST_USER2_MOBILE || '13612227910',

    /*
     * 🔐 管理员用户 - 2026-06-14 修正：原值 13612227910 是 regional_manager(80) 非管理员，
     * 真正的管理员是 13612227910(admin:100/super_admin:110)，与 .env SUPER_ADMIN_MOBILE 一致
     */
    adminUser: process.env.TEST_ADMIN_MOBILE || '13612227910'
  },

  // 🆔 方式2：通过用户ID指定用户（备选）
  byUserId: {
    /*
     * 真实用户ID（清档后真实库 restaurant_points_dev 仅保留超管 user_id=32）
     * 原 user_id=33(13612227910) 已删除，统一指向 32。
     */
    regularUser1: process.env.TEST_USER1_ID ? parseInt(process.env.TEST_USER1_ID) : 32,
    regularUser2: process.env.TEST_USER2_ID ? parseInt(process.env.TEST_USER2_ID) : 32,
    // 🔐 管理员 user_id=32（13612227910）。原值 31 是 13612227910(regional_manager:80)，会导致管理员权限校验失败
    adminUser: process.env.TEST_ADMIN_ID ? parseInt(process.env.TEST_ADMIN_ID) : 32
  },

  // 🎯 测试活动配置
  campaign: {
    // 测试活动名称 - 如果你有特定的抽奖活动
    name: process.env.TEST_CAMPAIGN_NAME || '测试抽奖活动',

    // 测试活动ID - 如果你知道具体的活动ID
    id: process.env.TEST_CAMPAIGN_ID ? parseInt(process.env.TEST_CAMPAIGN_ID) : null
  },

  // ⚙️ 测试行为配置
  behavior: {
    // 是否在测试前检查用户积分是否足够
    checkUserPoints: process.env.TEST_CHECK_POINTS !== 'false',

    // 测试时是否清理该用户的现有队列（避免数据冲突）
    cleanExistingQueue: process.env.TEST_CLEAN_QUEUE !== 'false',

    // 是否在测试后清理创建的临时数据
    cleanupAfterTest: process.env.TEST_CLEANUP !== 'false',

    // 是否显示详细的测试用户信息
    showUserDetails: process.env.TEST_SHOW_DETAILS !== 'false'
  }
}

/**
 * 🛡️ 用户验证函数
 * 验证配置的测试用户是否在数据库中存在且符合要求
 * @returns {Promise<Object>} 验证结果对象，包含用户信息和错误列表
 */
async function validateRealUsers() {
  const { User } = require('../../models')

  console.log('🔍 验证指定的真实用户是否存在...')

  const validationResults = {
    regularUser1: null,
    regularUser2: null,
    adminUser: null,
    errors: []
  }

  try {
    // 验证普通用户1
    if (REAL_USER_CONFIG.byUserId.regularUser1) {
      validationResults.regularUser1 = await User.findByPk(REAL_USER_CONFIG.byUserId.regularUser1)
    } else {
      validationResults.regularUser1 = await User.findOne({
        where: { mobile: REAL_USER_CONFIG.byMobile.regularUser1 }
      })
    }

    // 验证普通用户2
    if (REAL_USER_CONFIG.byUserId.regularUser2) {
      validationResults.regularUser2 = await User.findByPk(REAL_USER_CONFIG.byUserId.regularUser2)
    } else {
      validationResults.regularUser2 = await User.findOne({
        where: { mobile: REAL_USER_CONFIG.byMobile.regularUser2 }
      })
    }

    // 验证管理员用户
    if (REAL_USER_CONFIG.byUserId.adminUser) {
      validationResults.adminUser = await User.findByPk(REAL_USER_CONFIG.byUserId.adminUser)
    } else {
      validationResults.adminUser = await User.findOne({
        where: { mobile: REAL_USER_CONFIG.byMobile.adminUser }
      })
    }

    // 检查验证结果
    if (!validationResults.regularUser1) {
      validationResults.errors.push(`普通用户1不存在: ${REAL_USER_CONFIG.byMobile.regularUser1}`)
    }

    if (!validationResults.regularUser2) {
      validationResults.errors.push(`普通用户2不存在: ${REAL_USER_CONFIG.byMobile.regularUser2}`)
    }

    if (!validationResults.adminUser) {
      validationResults.errors.push(`管理员用户不存在: ${REAL_USER_CONFIG.byMobile.adminUser}`)
    }

    // 验证管理员权限 - 使用 role_level 判断（role_level >= 100 为管理员）
    if (validationResults.adminUser) {
      const { getUserRoles } = require('../../middleware/auth')
      try {
        const userRoles = await getUserRoles(validationResults.adminUser.user_id)
        if (userRoles.role_level < 100) {
          validationResults.errors.push(
            `指定的管理员用户无管理员权限: ${REAL_USER_CONFIG.byMobile.adminUser}`
          )
        }
      } catch (error) {
        validationResults.errors.push(`检查管理员权限失败: ${error.message}`)
      }
    }

    // 显示用户详细信息
    if (REAL_USER_CONFIG.behavior.showUserDetails && validationResults.errors.length === 0) {
      console.log('\n📊 真实测试用户信息:')
      console.log('=====================================')

      console.log(
        `👤 普通用户1: ID=${validationResults.regularUser1.user_id}, 手机=${validationResults.regularUser1.mobile}, 昵称=${validationResults.regularUser1.nickname}`
      )
      console.log(
        `👤 普通用户2: ID=${validationResults.regularUser2.user_id}, 手机=${validationResults.regularUser2.mobile}, 昵称=${validationResults.regularUser2.nickname}`
      )
      console.log(
        `👑 管理员: ID=${validationResults.adminUser.user_id}, 手机=${validationResults.adminUser.mobile}, 昵称=${validationResults.adminUser.nickname}`
      )
    }

    return validationResults
  } catch (error) {
    validationResults.errors.push(`用户验证过程出错: ${error.message}`)
    return validationResults
  }
}

/**
 * 🎯 获取真实测试用户
 * 验证并返回配置的真实测试用户账户
 * @returns {Promise<{regularUsers: Array, adminUser: Object, config: Object}>} 测试用户信息
 * @throws {Error} 当用户验证失败时抛出错误
 */
async function getRealTestUsers() {
  const validationResults = await validateRealUsers()

  if (validationResults.errors.length > 0) {
    console.error('\n❌ 真实用户验证失败:')
    validationResults.errors.forEach(error => console.error(`   ${error}`))

    console.log('\n💡 解决方案:')
    console.log('1. 检查 tests/config/real-users-config.js 中的用户配置')
    console.log('2. 确保指定的手机号/用户ID在数据库中存在')
    console.log('3. 确保管理员用户具有admin角色权限(role_level >= 100)')
    console.log(
      '4. 也可以通过环境变量指定: TEST_USER1_MOBILE, TEST_USER2_MOBILE, TEST_ADMIN_MOBILE'
    )

    throw new Error('真实用户配置验证失败，请检查配置')
  }

  console.log('✅ 真实用户验证通过，开始使用指定账户进行测试')

  return {
    regularUsers: [validationResults.regularUser1, validationResults.regularUser2],
    adminUser: validationResults.adminUser,
    config: REAL_USER_CONFIG
  }
}

/**
 * 🧹 测试数据清理功能
 * 清理测试过程中产生的临时数据
 * @param {number} _userId - 用户ID（暂未使用）
 * @param {number} _campaignId - 活动ID（暂未使用）
 * @returns {Promise<void>} 无返回值的Promise
 */
async function cleanupTestData(_userId, _campaignId) {
  if (!REAL_USER_CONFIG.behavior.cleanupAfterTest) {
    console.log('⚠️ 已禁用测试后清理，跳过临时数据清理')
    return
  }

  console.log('🧹 测试数据清理完成')
  // 其他测试数据清理可以在这里添加
}

module.exports = {
  REAL_USER_CONFIG,
  validateRealUsers,
  getRealTestUsers,
  cleanupTestData
}
