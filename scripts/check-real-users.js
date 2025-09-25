#!/usr/bin/env node

/**
 * 真实用户查看工具
 * 帮助用户查看数据库中的真实用户，选择合适的测试账户
 *
 * 使用方法：
 * node scripts/check-real-users.js
 *
 * @version 4.0.0
 * @date 2025-01-21
 */

const { User, UserPointsAccount, LotteryCampaign } = require('../models')

async function checkRealUsers () {
  try {
    console.log('🔍 查看数据库中的真实用户信息...\n')

    // 1. 查看所有用户概览
    const allUsers = await User.findAll({
      attributes: ['user_id', 'mobile', 'nickname', 'status', 'is_admin', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: 20 // 只显示最近20个用户
    })

    console.log('👥 最近注册的用户 (前20个):')
    console.log('=====================================')
    allUsers.forEach((user, index) => {
      const roleIcon = user.is_admin ? '👑' : '👤'
      const statusIcon = user.status === 'active' ? '✅' : '❌'
      const createdDate = new Date(user.created_at).toISOString().slice(0, 10)
      console.log(
        `${index + 1}.  ${roleIcon} ID: ${user.user_id} | 手机: ${user.mobile} | 昵称: ${user.nickname} | 状态: ${statusIcon}${user.status} | 注册: ${createdDate}`
      )
    })

    // 2. 查看管理员用户
    const adminUsers = await User.findAll({
      where: { is_admin: 1 },
      attributes: ['user_id', 'mobile', 'nickname', 'status', 'created_at'],
      order: [['created_at', 'DESC']]
    })

    console.log('\n👑 管理员用户:')
    console.log('=====================================')
    if (adminUsers.length === 0) {
      console.log('❌ 没有找到管理员用户')
    } else {
      adminUsers.forEach((user, index) => {
        const statusIcon = user.status === 'active' ? '✅' : '❌'
        console.log(
          `${index + 1}.  👑 ID: ${user.user_id} | 手机: ${user.mobile} | 昵称: ${user.nickname} | 状态: ${statusIcon}${user.status}`
        )
      })
    }

    // 3. 查看用户积分概况
    console.log('\n💰 用户积分概况:')
    console.log('=====================================')

    const richestUsers = await User.findAll({
      // 获取积分前10的用户
      include: [
        {
          model: UserPointsAccount,
          as: 'pointsAccount',
          attributes: ['available_points', 'total_earned', 'total_consumed']
        }
      ],
      order: [['pointsAccount', 'available_points', 'DESC']],
      limit: 10
    })

    if (richestUsers.length > 0) {
      richestUsers.forEach((user, index) => {
        console.log(
          `${index + 1}.  💰 ${user.nickname}(${user.mobile}) | 积分: ${user.pointsAccount.available_points} | 总获得: ${user.pointsAccount.total_earned}`
        )
      })
    } else {
      console.log('无用户积分记录')
    }

    // 4. 查看抽奖活动
    console.log('\n🎯 可用的抽奖活动:')
    console.log('=====================================')

    const campaigns = await LotteryCampaign.findAll({
      attributes: ['campaign_id', 'campaign_name', 'status', 'start_date', 'end_date'],
      order: [['created_at', 'DESC']],
      limit: 5
    })

    campaigns.forEach((campaign, index) => {
      const statusIcon = campaign.status === 'active' ? '🟢' : '🔴'
      console.log(
        `${index + 1}.  ${statusIcon} ID: ${campaign.campaign_id} | 名称: ${campaign.campaign_name} | 状态: ${campaign.status}`
      )
    })

    // 🗑️ V4.2简化：UserSpecificPrizeQueue功能已删除 - 2025年01月21日
    console.log('\n🎪 用户特定奖品队列功能已删除:')
    console.log('=====================================')
    console.log('📭 V4.2版本已简化，不再支持用户特定奖品队列功能')

    // 6. 提供配置建议
    console.log('\n💡 配置建议:')
    console.log('=====================================')

    if (allUsers.length >= 2) {
      const suggestedUser1 = allUsers.find(u => !u.is_admin) || allUsers[0]
      const suggestedUser2 =
        allUsers.find(u => !u.is_admin && u.user_id !== suggestedUser1.user_id) || allUsers[1]
      const suggestedAdmin = adminUsers.length > 0 ? adminUsers[0] : allUsers.find(u => u.is_admin)

      console.log('📋 推荐的测试用户配置:')

      if (suggestedUser1) {
        console.log(
          `   普通用户1: ${suggestedUser1.mobile} (ID: ${suggestedUser1.user_id}, 昵称: ${suggestedUser1.nickname})`
        )
      }

      if (suggestedUser2) {
        console.log(
          `   普通用户2: ${suggestedUser2.mobile} (ID: ${suggestedUser2.user_id}, 昵称: ${suggestedUser2.nickname})`
        )
      }

      if (suggestedAdmin) {
        console.log(
          `   管理员用户: ${suggestedAdmin.mobile} (ID: ${suggestedAdmin.user_id}, 昵称: ${suggestedAdmin.nickname})`
        )
      } else {
        console.log('   ⚠️ 未找到管理员用户，建议将其中一个用户设置为管理员 (is_admin=1)')
      }

      console.log('\n🔧 配置方法:')
      console.log('方法1: 修改 tests/config/real-users-config.js 文件')
      console.log('方法2: 设置环境变量:')
      if (suggestedUser1) console.log(`   export TEST_USER1_MOBILE="${suggestedUser1.mobile}"`)
      if (suggestedUser2) console.log(`   export TEST_USER2_MOBILE="${suggestedUser2.mobile}"`)
      if (suggestedAdmin) console.log(`   export TEST_ADMIN_MOBILE="${suggestedAdmin.mobile}"`)

      console.log('\n🚀 运行真实用户测试:')
      console.log('   # 🗑️ UserSpecificPrizeQueue测试已删除')
    } else {
      console.log('⚠️ 数据库中用户不足，建议先创建一些测试用户')
    }

    console.log('\n✅ 真实用户检查完成')
  } catch (error) {
    console.error('❌ 检查真实用户时出错:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkRealUsers()
}

module.exports = { checkRealUsers }
