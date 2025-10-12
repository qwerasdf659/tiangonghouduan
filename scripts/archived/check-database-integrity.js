/**
 * 数据库完整性检查脚本
 * 用途：
 * 1. 统计用户账号数量（总数、管理员、普通用户）
 * 2. 检测孤儿数据（外键引用不存在的记录）
 * 3. 检查数据一致性问题
 *
 * 创建时间：2025年10月09日
 */

require('dotenv').config()
const { sequelize } = require('../models')
const models = require('../models')

/**
 * 统计用户账号数据
 */
async function checkUserAccounts () {
  console.log('\n=== 📊 用户账号统计 ===\n')

  try {
    // 1. 统计总用户数
    const totalUsers = await models.User.count()
    console.log(`📋 总用户数: ${totalUsers}`)

    // 2. 按状态统计
    const activeUsers = await models.User.count({ where: { status: 'active' } })
    const inactiveUsers = await models.User.count({ where: { status: 'inactive' } })
    const bannedUsers = await models.User.count({ where: { status: 'banned' } })

    console.log('\n📊 按状态统计:')
    console.log(`  ✅ 活跃用户: ${activeUsers}`)
    console.log(`  ⏸️  未激活用户: ${inactiveUsers}`)
    console.log(`  🚫 封禁用户: ${bannedUsers}`)

    // 3. 统计管理员账号（通过角色系统）
    const adminRole = await models.Role.findOne({
      where: { role_name: 'admin' }
    })

    let adminCount = 0
    let adminUsers = []

    if (adminRole) {
      const adminUserRoles = await models.UserRole.findAll({
        where: {
          role_id: adminRole.role_id,
          is_active: true
        },
        include: [{
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname', 'status']
        }]
      })

      adminCount = adminUserRoles.length
      adminUsers = adminUserRoles.map(ur => ur.user)

      console.log('\n👑 管理员账号统计:')
      console.log(`  总数: ${adminCount}`)

      if (adminUsers.length > 0) {
        console.log('\n  详细列表:')
        adminUsers.forEach((user, index) => {
          console.log(`  ${index + 1}. 用户ID: ${user.user_id} | 手机: ${user.mobile} | 昵称: ${user.nickname || '未设置'} | 状态: ${user.status}`)
        })
      }
    } else {
      console.log('\n⚠️  未找到admin角色')
    }

    // 4. 统计普通用户（有user角色或没有任何角色）
    const userRole = await models.Role.findOne({
      where: { role_name: 'user' }
    })

    let regularUserCount = 0
    if (userRole) {
      const regularUserRoles = await models.UserRole.count({
        where: {
          role_id: userRole.role_id,
          is_active: true
        }
      })
      regularUserCount = regularUserRoles
    }

    // 没有任何角色的用户
    const usersWithoutRole = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
      WHERE ur.user_role_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    const noRoleCount = usersWithoutRole[0]?.count || 0

    console.log('\n👥 普通用户统计:')
    console.log(`  有user角色: ${regularUserCount}`)
    console.log(`  无任何角色: ${noRoleCount}`)
    console.log(`  合计: ${Number(regularUserCount) + Number(noRoleCount)}`)

    return {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      banned: bannedUsers,
      admins: adminCount,
      regularUsers: regularUserCount + noRoleCount,
      noRole: noRoleCount
    }
  } catch (error) {
    console.error('❌ 统计用户账号时出错:', error.message)
    throw error
  }
}

/**
 * 检查孤儿数据
 */
async function checkOrphanData () {
  console.log('\n=== 🔍 孤儿数据检测 ===\n')

  const orphans = {
    userRoles: [],
    pointsAccounts: [],
    pointsTransactions: [],
    lotteryDraws: [],
    userInventory: [],
    imageResources: [],
    sessions: [],
    feedback: [],
    total: 0
  }

  try {
    // 1. 检查 user_roles 表中的孤儿数据
    console.log('🔍 检查 user_roles 表...')

    // 检查引用不存在的user_id
    const orphanUserRoles = await sequelize.query(`
      SELECT ur.user_role_id, ur.user_id, ur.role_id
      FROM user_roles ur
      LEFT JOIN users u ON ur.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanUserRoles.length > 0) {
      console.log(`  ❌ 发现 ${orphanUserRoles.length} 条孤儿记录（引用不存在的user_id）`)
      orphans.userRoles.push(...orphanUserRoles)
    } else {
      console.log('  ✅ user_roles 表无孤儿数据')
    }

    // 检查引用不存在的role_id
    const orphanRoleRefs = await sequelize.query(`
      SELECT ur.user_role_id, ur.user_id, ur.role_id
      FROM user_roles ur
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE r.role_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanRoleRefs.length > 0) {
      console.log(`  ❌ 发现 ${orphanRoleRefs.length} 条记录引用不存在的role_id`)
      orphans.userRoles.push(...orphanRoleRefs)
    }

    // 2. 检查 user_points_accounts 表
    console.log('🔍 检查 user_points_accounts 表...')

    const orphanPointsAccounts = await sequelize.query(`
      SELECT upa.account_id, upa.user_id
      FROM user_points_accounts upa
      LEFT JOIN users u ON upa.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanPointsAccounts.length > 0) {
      console.log(`  ❌ 发现 ${orphanPointsAccounts.length} 条孤儿积分账户`)
      orphans.pointsAccounts = orphanPointsAccounts
    } else {
      console.log('  ✅ user_points_accounts 表无孤儿数据')
    }

    // 3. 检查 points_transactions 表
    console.log('🔍 检查 points_transactions 表...')

    const orphanTransactions = await sequelize.query(`
      SELECT pt.transaction_id, pt.user_id
      FROM points_transactions pt
      LEFT JOIN users u ON pt.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanTransactions.length > 0) {
      console.log(`  ❌ 发现 ${orphanTransactions.length} 条孤儿积分交易记录`)
      orphans.pointsTransactions = orphanTransactions
    } else {
      console.log('  ✅ points_transactions 表无孤儿数据')
    }

    // 4. 检查 lottery_draws 表
    console.log('🔍 检查 lottery_draws 表...')

    const orphanDraws = await sequelize.query(`
      SELECT ld.draw_id, ld.user_id
      FROM lottery_draws ld
      LEFT JOIN users u ON ld.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanDraws.length > 0) {
      console.log(`  ❌ 发现 ${orphanDraws.length} 条孤儿抽奖记录`)
      orphans.lotteryDraws = orphanDraws
    } else {
      console.log('  ✅ lottery_draws 表无孤儿数据')
    }

    // 5. 检查 user_inventory 表
    console.log('🔍 检查 user_inventory 表...')

    const orphanInventory = await sequelize.query(`
      SELECT ui.inventory_id, ui.user_id
      FROM user_inventory ui
      LEFT JOIN users u ON ui.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanInventory.length > 0) {
      console.log(`  ❌ 发现 ${orphanInventory.length} 条孤儿库存记录`)
      orphans.userInventory = orphanInventory
    } else {
      console.log('  ✅ user_inventory 表无孤儿数据')
    }

    // 6. 检查 image_resources 表
    console.log('🔍 检查 image_resources 表...')

    const orphanImages = await sequelize.query(`
      SELECT ir.image_id, ir.user_id
      FROM image_resources ir
      LEFT JOIN users u ON ir.user_id = u.user_id
      WHERE ir.user_id IS NOT NULL AND u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanImages.length > 0) {
      console.log(`  ❌ 发现 ${orphanImages.length} 条孤儿图片资源`)
      orphans.imageResources = orphanImages
    } else {
      console.log('  ✅ image_resources 表无孤儿数据')
    }

    // 7. 检查 user_sessions 表
    console.log('🔍 检查 user_sessions 表...')

    const orphanSessions = await sequelize.query(`
      SELECT us.user_session_id, us.user_id
      FROM user_sessions us
      LEFT JOIN users u ON us.user_id = u.user_id
      WHERE u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanSessions.length > 0) {
      console.log(`  ❌ 发现 ${orphanSessions.length} 条孤儿会话记录`)
      orphans.sessions = orphanSessions
    } else {
      console.log('  ✅ user_sessions 表无孤儿数据')
    }

    // 8. 检查 feedbacks 表
    console.log('🔍 检查 feedbacks 表...')

    const orphanFeedback = await sequelize.query(`
      SELECT f.feedback_id, f.user_id
      FROM feedbacks f
      LEFT JOIN users u ON f.user_id = u.user_id
      WHERE f.user_id IS NOT NULL AND u.user_id IS NULL
    `, { type: sequelize.QueryTypes.SELECT })

    if (orphanFeedback.length > 0) {
      console.log(`  ❌ 发现 ${orphanFeedback.length} 条孤儿反馈记录`)
      orphans.feedback = orphanFeedback
    } else {
      console.log('  ✅ feedbacks 表无孤儿数据')
    }

    // 计算总孤儿数据
    orphans.total =
      orphans.userRoles.length +
      orphans.pointsAccounts.length +
      orphans.pointsTransactions.length +
      orphans.lotteryDraws.length +
      orphans.userInventory.length +
      orphans.imageResources.length +
      orphans.sessions.length +
      orphans.feedback.length

    return orphans
  } catch (error) {
    console.error('❌ 检查孤儿数据时出错:', error.message)
    throw error
  }
}

/**
 * 检查数据一致性问题
 */
async function checkDataConsistency () {
  console.log('\n=== 🔧 数据一致性检查 ===\n')

  const issues = []

  try {
    // 1. 检查用户是否有积分账户
    console.log('🔍 检查用户积分账户完整性...')

    const usersWithoutPointsAccount = await sequelize.query(`
      SELECT u.user_id, u.mobile, u.nickname
      FROM users u
      LEFT JOIN user_points_accounts upa ON u.user_id = upa.user_id
      WHERE upa.account_id IS NULL AND u.status = 'active'
    `, { type: sequelize.QueryTypes.SELECT })

    if (usersWithoutPointsAccount.length > 0) {
      console.log(`  ⚠️  发现 ${usersWithoutPointsAccount.length} 个活跃用户没有积分账户`)
      issues.push({
        type: 'missing_points_account',
        count: usersWithoutPointsAccount.length,
        users: usersWithoutPointsAccount
      })
    } else {
      console.log('  ✅ 所有活跃用户都有积分账户')
    }

    // 2. 检查是否有用户没有角色
    console.log('🔍 检查用户角色分配完整性...')

    const usersWithoutRoles = await sequelize.query(`
      SELECT u.user_id, u.mobile, u.nickname, u.status
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
      WHERE ur.user_role_id IS NULL AND u.status = 'active'
    `, { type: sequelize.QueryTypes.SELECT })

    if (usersWithoutRoles.length > 0) {
      console.log(`  ⚠️  发现 ${usersWithoutRoles.length} 个活跃用户没有分配角色`)
      issues.push({
        type: 'missing_role',
        count: usersWithoutRoles.length,
        users: usersWithoutRoles
      })
    } else {
      console.log('  ✅ 所有活跃用户都已分配角色')
    }

    // 3. 检查是否有重复的手机号
    console.log('🔍 检查手机号唯一性...')

    const duplicateMobiles = await sequelize.query(`
      SELECT mobile, COUNT(*) as count
      FROM users
      GROUP BY mobile
      HAVING count > 1
    `, { type: sequelize.QueryTypes.SELECT })

    if (duplicateMobiles.length > 0) {
      console.log(`  ❌ 发现 ${duplicateMobiles.length} 个重复的手机号`)
      issues.push({
        type: 'duplicate_mobile',
        count: duplicateMobiles.length,
        mobiles: duplicateMobiles
      })
    } else {
      console.log('  ✅ 所有手机号都是唯一的')
    }

    return issues
  } catch (error) {
    console.error('❌ 检查数据一致性时出错:', error.message)
    throw error
  }
}

/**
 * 主函数
 */
async function main () {
  console.log('🚀 开始数据库完整性检查...')
  console.log(`📅 检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 统计用户账号
    const accountStats = await checkUserAccounts()

    // 2. 检查孤儿数据
    const orphanData = await checkOrphanData()

    // 3. 检查数据一致性
    const consistencyIssues = await checkDataConsistency()

    // 生成总结报告
    console.log('\n' + '='.repeat(50))
    console.log('📊 数据库完整性检查总结报告')
    console.log('='.repeat(50))

    console.log('\n📋 用户账号统计:')
    console.log(`  总用户数: ${accountStats.total}`)
    console.log(`  活跃用户: ${accountStats.active}`)
    console.log(`  管理员账号: ${accountStats.admins}`)
    console.log(`  普通用户: ${accountStats.regularUsers}`)
    console.log(`  未分配角色: ${accountStats.noRole}`)

    console.log('\n🔍 孤儿数据检测:')
    if (orphanData.total === 0) {
      console.log('  ✅ 未发现孤儿数据，数据库引用完整性良好')
    } else {
      console.log(`  ❌ 发现 ${orphanData.total} 条孤儿数据:`)
      if (orphanData.userRoles.length > 0) {
        console.log(`    - user_roles: ${orphanData.userRoles.length} 条`)
      }
      if (orphanData.pointsAccounts.length > 0) {
        console.log(`    - user_points_accounts: ${orphanData.pointsAccounts.length} 条`)
      }
      if (orphanData.pointsTransactions.length > 0) {
        console.log(`    - points_transactions: ${orphanData.pointsTransactions.length} 条`)
      }
      if (orphanData.lotteryDraws.length > 0) {
        console.log(`    - lottery_draws: ${orphanData.lotteryDraws.length} 条`)
      }
      if (orphanData.userInventory.length > 0) {
        console.log(`    - user_inventory: ${orphanData.userInventory.length} 条`)
      }
      if (orphanData.imageResources.length > 0) {
        console.log(`    - image_resources: ${orphanData.imageResources.length} 条`)
      }
      if (orphanData.sessions.length > 0) {
        console.log(`    - user_sessions: ${orphanData.sessions.length} 条`)
      }
      if (orphanData.feedback.length > 0) {
        console.log(`    - feedback: ${orphanData.feedback.length} 条`)
      }
    }

    console.log('\n🔧 数据一致性检查:')
    if (consistencyIssues.length === 0) {
      console.log('  ✅ 未发现数据一致性问题')
    } else {
      console.log(`  ⚠️  发现 ${consistencyIssues.length} 类数据一致性问题:`)
      consistencyIssues.forEach(issue => {
        console.log(`    - ${issue.type}: ${issue.count} 条`)
      })
    }

    console.log('\n' + '='.repeat(50))
    console.log('✅ 数据库完整性检查完成')
    console.log('='.repeat(50) + '\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 数据库完整性检查失败:', error.message)
    console.error('错误详情:', error)
    process.exit(1)
  }
}

// 运行主函数
main()
