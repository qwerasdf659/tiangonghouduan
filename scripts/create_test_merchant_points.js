/**
 * 创建商家积分审核测试数据
 *
 * 用法: node scripts/create-test-merchant-points.js
 *
 * 功能:
 * - 创建几条待审核的商家积分申请记录
 * - 用于测试前端页面数据显示
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { ContentReviewRecord, User, sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

async function createTestData() {
  console.log('======================================')
  console.log('  创建商家积分审核测试数据')
  console.log('======================================')
  console.log('')

  try {
    // 1. 检查数据库连接
    console.log('[1] 检查数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')
    console.log('')

    // 2. 查找几个用户用于测试
    console.log('[2] 查找测试用户...')
    const users = await User.findAll({
      limit: 3,
      order: [['user_id', 'ASC']]
    })

    if (users.length === 0) {
      console.log('❌ 没有找到用户，请先创建用户')
      process.exit(1)
    }

    console.log(`✅ 找到 ${users.length} 个用户`)
    users.forEach(u => console.log(`  - 用户ID: ${u.user_id}, 昵称: ${u.nickname || u.mobile}`))
    console.log('')

    // 3. 检查是否已有测试数据
    console.log('[3] 检查现有审核记录...')
    const existingCount = await ContentReviewRecord.count({
      where: { auditable_type: 'merchant_points' }
    })
    console.log(`✅ 当前已有 ${existingCount} 条商家积分审核记录`)
    console.log('')

    // 4. 创建测试数据
    console.log('[4] 创建测试审核记录...')
    const testData = [
      {
        userId: users[0].user_id,
        pointsAmount: 100,
        description: '测试申请1 - 销售奖励',
        priority: 'high'
      },
      {
        userId: users[0].user_id,
        pointsAmount: 200,
        description: '测试申请2 - 月度绩效奖励',
        priority: 'medium'
      },
      {
        userId: users.length > 1 ? users[1].user_id : users[0].user_id,
        pointsAmount: 500,
        description: '测试申请3 - 特殊贡献奖励',
        priority: 'high'
      }
    ]

    const createdRecords = []
    for (const data of testData) {
      try {
        const record = await ContentReviewRecord.create({
          auditable_type: 'merchant_points',
          auditable_id: data.userId,
          audit_status: 'pending',
          priority: data.priority,
          audit_data: {
            user_id: data.userId,
            points_amount: data.pointsAmount,
            description: data.description,
            submitted_at: BeijingTimeHelper.apiTimestamp()
          },
          submitted_at: new Date()
        })
        createdRecords.push(record)
        console.log(
          `  ✅ 创建审核记录 audit_id=${record.audit_id}, 用户=${data.userId}, 积分=${data.pointsAmount}`
        )
      } catch (error) {
        console.log(`  ⚠️ 创建失败: ${error.message}`)
      }
    }

    console.log('')
    console.log(`✅ 成功创建 ${createdRecords.length} 条测试审核记录`)
    console.log('')

    // 5. 验证数据
    console.log('[5] 验证数据...')
    const finalCount = await ContentReviewRecord.count({
      where: { auditable_type: 'merchant_points' }
    })
    const pendingCount = await ContentReviewRecord.count({
      where: {
        auditable_type: 'merchant_points',
        audit_status: 'pending'
      }
    })

    console.log(`✅ 总记录数: ${finalCount}`)
    console.log(`✅ 待审核数: ${pendingCount}`)
    console.log('')

    console.log('======================================')
    console.log('  测试数据创建完成')
    console.log('======================================')
    console.log('')
    console.log('现在可以刷新前端页面查看数据')
    console.log('访问: http://localhost:3000/admin/merchant-points.html')
  } catch (error) {
    console.error('❌ 执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行
createTestData()
