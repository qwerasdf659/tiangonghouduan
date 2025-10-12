/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构
 * 数据修复脚本：补全缺失的积分账户
 *
 * 问题：部分用户缺少积分账户（60%数据不完整）
 * 解决：为所有没有积分账户的用户创建积分账户
 *
 * 执行方式：node scripts/fix-missing-points-accounts.js
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 数据库连接
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false
  }
)

async function fixMissingPointsAccounts () {
  const transaction = await sequelize.transaction()

  try {
    console.log('🔍 开始检查缺失的积分账户...\n')

    // 1. 查询所有活跃用户
    const [activeUsers] = await sequelize.query(`
      SELECT user_id, mobile, nickname, created_at
      FROM users
      WHERE status = 'active'
      ORDER BY user_id
    `)

    console.log(`✅ 活跃用户总数: ${activeUsers.length}`)

    // 2. 查询现有积分账户
    const [existingAccounts] = await sequelize.query(`
      SELECT user_id, available_points
      FROM user_points_accounts
      WHERE is_active = 1
    `)

    const accountUserIds = new Set(existingAccounts.map(acc => acc.user_id))
    console.log(`✅ 现有积分账户: ${existingAccounts.length}`)

    // 3. 找出缺失积分账户的用户
    const usersWithoutAccount = activeUsers.filter(user => !accountUserIds.has(user.user_id))

    console.log(`\n❌ 缺失积分账户的用户: ${usersWithoutAccount.length}`)

    if (usersWithoutAccount.length === 0) {
      console.log('\n✅ 所有用户都已有积分账户，无需修复')
      await transaction.rollback()
      return
    }

    // 4. 为缺失账户的用户创建积分账户
    console.log('\n🔧 开始创建缺失的积分账户...\n')

    for (const user of usersWithoutAccount) {
      await sequelize.query(`
        INSERT INTO user_points_accounts (
          user_id,
          available_points,
          total_earned,
          total_consumed,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          :user_id,
          0,
          0,
          0,
          1,
          NOW(),
          NOW()
        )
      `, {
        replacements: { user_id: user.user_id },
        transaction
      })

      console.log(`✅ 创建成功: 用户ID=${user.user_id}, 手机=${user.mobile}, 昵称=${user.nickname}`)
    }

    // 5. 提交事务
    await transaction.commit()

    // 6. 验证修复结果
    console.log('\n🔍 验证修复结果...')
    const [finalUsers] = await sequelize.query('SELECT COUNT(*) as count FROM users WHERE status = "active"')
    const [finalAccounts] = await sequelize.query('SELECT COUNT(*) as count FROM user_points_accounts WHERE is_active = 1')

    console.log('\n📊 修复后统计:')
    console.log(`  活跃用户数: ${finalUsers[0].count}`)
    console.log(`  积分账户数: ${finalAccounts[0].count}`)
    console.log(`  数据完整性: ${finalUsers[0].count === finalAccounts[0].count ? '✅ 100%完整' : '❌ 仍不完整'}`)

    if (finalUsers[0].count === finalAccounts[0].count) {
      console.log('\n🎉 修复成功！所有用户都已拥有积分账户')
    } else {
      console.log('\n⚠️ 修复后仍有差异，请检查')
    }
  } catch (error) {
    await transaction.rollback()
    console.error('\n❌ 修复失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行修复
fixMissingPointsAccounts()
  .then(() => {
    console.log('\n✅ 脚本执行完成')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ 脚本执行失败:', error)
    process.exit(1)
  })
