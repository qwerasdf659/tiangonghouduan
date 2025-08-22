/**
 * 🔥 数据迁移脚本 - 升级到v3分离式架构
 * 创建时间：2025年08月19日 UTC
 * 目标：确保所有用户都有积分账户，创建必要的抽奖活动
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../models')

async function migrateToNewArchitecture () {
  const transaction = await sequelize.transaction()

  try {
    console.log('🔥 开始执行v3架构数据迁移...')

    // 1. 获取所有用户
    const [users] = await sequelize.query(
      `
      SELECT user_id, nickname, mobile, is_admin, status, created_at
      FROM users 
      WHERE status = 'active'
      ORDER BY user_id
    `,
      { transaction }
    )

    console.log(`\n👥 发现 ${users.length} 个活跃用户`)

    // 2. 检查哪些用户缺少积分账户
    const [existingAccounts] = await sequelize.query(
      `
      SELECT user_id FROM user_points_accounts
    `,
      { transaction }
    )

    const existingUserIds = existingAccounts.map(acc => acc.user_id)
    const missingUsers = users.filter(user => !existingUserIds.includes(user.user_id))

    console.log(`\n💰 需要创建积分账户的用户: ${missingUsers.length} 个`)

    // 3. 为缺少积分账户的用户创建账户
    for (const user of missingUsers) {
      await sequelize.query(
        `
        INSERT INTO user_points_accounts (
          user_id, available_points, total_earned, total_consumed,
          account_level, is_active, behavior_score, activity_level,
          recommendation_enabled, created_at, updated_at
        ) VALUES (
          :user_id, 0.00, 0.00, 0.00,
          'bronze', 1, 0.00, 'medium',
          1, NOW(), NOW()
        )
      `,
        {
          replacements: { user_id: user.user_id },
          transaction
        }
      )

      console.log(`  ✅ 为用户 ${user.user_id} (${user.nickname}) 创建积分账户`)
    }

    // 4. 检查抽奖活动
    const [campaigns] = await sequelize.query(
      `
      SELECT COUNT(*) as count FROM lottery_campaigns
    `,
      { transaction }
    )

    console.log(`\n🎯 当前抽奖活动数量: ${campaigns[0].count}`)

    // 5. 创建默认抽奖活动（如果不存在）
    if (campaigns[0].count === 0) {
      console.log('🎯 创建默认抽奖活动...')

      await sequelize.query(
        `
        INSERT INTO lottery_campaigns (
          campaign_name, campaign_code, campaign_type, description,
          cost_per_draw, start_time, end_time, status,
          max_draws_per_user_daily, prize_distribution_config,
          total_prize_pool, remaining_prize_pool, created_at, updated_at
        ) VALUES (
          '餐厅积分抽奖', 'RESTAURANT_LOTTERY_2025', 'permanent', '使用积分参与抽奖，赢取丰厚奖品！',
          100.00, '2025-08-19 00:00:00', '2025-12-31 23:59:59', 'active',
          5, '{}', 10000.00, 10000.00, NOW(), NOW()
        )
      `,
        { transaction }
      )

      console.log('  ✅ 默认抽奖活动创建成功')
    }

    // 6. 为新用户赠送初始积分
    const newUserBonus = 50.0
    for (const user of missingUsers) {
      // 更新积分账户
      await sequelize.query(
        `
        UPDATE user_points_accounts 
        SET available_points = :bonus, total_earned = :bonus, updated_at = NOW()
        WHERE user_id = :user_id
      `,
        {
          replacements: {
            bonus: newUserBonus,
            user_id: user.user_id
          },
          transaction
        }
      )

      // 创建积分交易记录
      await sequelize.query(
        `
        INSERT INTO points_transactions (
          user_id, account_id, transaction_type, points_amount, 
          points_balance_before, points_balance_after, business_type,
          business_id, transaction_title, transaction_description, 
          transaction_time, status, created_at, updated_at
        ) SELECT 
          user_id, account_id, 'earn', :amount,
          0.00, :amount, 'admin_adjust',
          CONCAT('welcome_bonus_', user_id), '新用户注册奖励', '系统自动发放的新用户积分奖励',
          NOW(), 'completed', NOW(), NOW()
        FROM user_points_accounts 
        WHERE user_id = :user_id
      `,
        {
          replacements: {
            amount: newUserBonus,
            user_id: user.user_id
          },
          transaction
        }
      )

      console.log(`  💰 为用户 ${user.user_id} 赠送 ${newUserBonus} 积分`)
    }

    // 7. 创建业务事件记录
    console.log('\n📈 创建系统升级事件记录...')
    await sequelize.query(
      `
      INSERT INTO business_events (
        event_type, event_source, event_data, user_id,
        created_at, updated_at
      ) VALUES (
        'system_upgrade', 'migration_script', 
        JSON_OBJECT(
          'migration_version', 'v3.0',
          'users_migrated', :users_count,
          'accounts_created', :accounts_created,
          'bonus_distributed', :total_bonus
        ),
        1, NOW(), NOW()
      )
    `,
      {
        replacements: {
          users_count: users.length,
          accounts_created: missingUsers.length,
          total_bonus: missingUsers.length * newUserBonus
        },
        transaction
      }
    )

    await transaction.commit()

    console.log('\n🎉 v3架构数据迁移完成！')
    console.log('📊 迁移统计:')
    console.log(`  - 总用户数: ${users.length}`)
    console.log(`  - 新建积分账户: ${missingUsers.length}`)
    console.log(`  - 发放奖励积分: ${missingUsers.length * newUserBonus}`)
    console.log('  - 抽奖活动: 已确保存在')

    await sequelize.close()
  } catch (error) {
    await transaction.rollback()
    console.error('❌ 迁移失败:', error.message)
    console.error('📜 错误详情:', error)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行迁移
migrateToNewArchitecture()
