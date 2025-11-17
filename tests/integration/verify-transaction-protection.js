/**
 * 验证事务保护 - 检查消费记录数据一致性
 *
 * 检查项：
 * 1. 每条consumption_record是否都有对应的points_transaction
 * 2. 每条consumption_record是否都有对应的content_review_record
 * 3. 没有孤儿记录
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 创建数据库连接
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: false
  }
)

async function checkDataConsistency () {
  try {
    console.log('🔍 开始检查消费记录数据一致性...\n')

    // 检查孤儿消费记录（有消费记录，但无积分交易）
    const [orphanConsumption] = await sequelize.query(`
      SELECT 
        cr.record_id,
        cr.user_id,
        cr.consumption_amount,
        cr.points_to_award,
        cr.status,
        DATE_FORMAT(cr.created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM consumption_records cr
      LEFT JOIN points_transactions pt 
        ON pt.reference_type = 'consumption' 
        AND pt.reference_id = cr.record_id
      WHERE cr.status = 'pending'
        AND pt.transaction_id IS NULL
      ORDER BY cr.created_at DESC
      LIMIT 10
    `)

    // 检查缺失审核记录
    const [missingReview] = await sequelize.query(`
      SELECT 
        cr.record_id,
        cr.user_id,
        cr.consumption_amount,
        cr.status,
        DATE_FORMAT(cr.created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM consumption_records cr
      LEFT JOIN content_review_records crr
        ON crr.auditable_type = 'consumption'
        AND crr.auditable_id = cr.record_id
      WHERE cr.status = 'pending'
        AND crr.audit_id IS NULL
      ORDER BY cr.created_at DESC
      LIMIT 10
    `)

    // 检查最近10条消费记录的完整性
    const [recentRecords] = await sequelize.query(`
      SELECT 
        cr.record_id,
        cr.user_id,
        cr.consumption_amount,
        cr.points_to_award,
        cr.status,
        DATE_FORMAT(cr.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        (SELECT COUNT(*) FROM points_transactions 
         WHERE reference_type='consumption' AND reference_id=cr.record_id) as has_points_tx,
        (SELECT COUNT(*) FROM content_review_records 
         WHERE auditable_type='consumption' AND auditable_id=cr.record_id) as has_review
      FROM consumption_records cr
      ORDER BY cr.created_at DESC
      LIMIT 10
    `)

    // 输出结果
    console.log('📊 数据一致性检查结果：\n')

    if (orphanConsumption.length > 0) {
      console.log('❌ 发现孤儿消费记录（有消费记录，但无积分交易）:')
      console.log(`   数量: ${orphanConsumption.length}`)
      orphanConsumption.forEach(r => {
        console.log(`   - record_id=${r.record_id}, user_id=${r.user_id}, amount=${r.consumption_amount}, created_at=${r.created_at}`)
      })
      console.log()
    } else {
      console.log('✅ 无孤儿消费记录')
    }

    if (missingReview.length > 0) {
      console.log('❌ 发现缺失审核记录:')
      console.log(`   数量: ${missingReview.length}`)
      missingReview.forEach(r => {
        console.log(`   - record_id=${r.record_id}, user_id=${r.user_id}, created_at=${r.created_at}`)
      })
      console.log()
    } else {
      console.log('✅ 无缺失审核记录')
    }

    console.log('\n📋 最近10条消费记录完整性：')
    console.log('记录ID | 用户 | 金额 | 积分 | 状态 | 创建时间 | 积分记录 | 审核记录 | 一致性')
    console.log('-'.repeat(100))
    recentRecords.forEach(r => {
      const consistent = (r.has_points_tx > 0 && r.has_review > 0) ? '✅ 完整' : '❌ 不完整'
      console.log(`${r.record_id} | ${r.user_id} | ${r.consumption_amount} | ${r.points_to_award} | ${r.status} | ${r.created_at} | ${r.has_points_tx} | ${r.has_review} | ${consistent}`)
    })

    // 统计
    const inconsistentCount = recentRecords.filter(r => !(r.has_points_tx > 0 && r.has_review > 0)).length
    const totalCount = recentRecords.length
    const consistencyRate = ((totalCount - inconsistentCount) / totalCount * 100).toFixed(2)

    console.log('\n📊 数据一致性统计：')
    console.log(`   总记录数: ${totalCount}`)
    console.log(`   一致记录: ${totalCount - inconsistentCount}`)
    console.log(`   不一致记录: ${inconsistentCount}`)
    console.log(`   一致性率: ${consistencyRate}%`)

    if (inconsistentCount === 0) {
      console.log('\n🎉 所有记录数据一致！事务保护正常工作！')
    } else {
      console.log('\n⚠️ 存在数据不一致，需要检查事务保护是否正确实施')
    }

    await sequelize.close()
    process.exit(inconsistentCount > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

checkDataConsistency()
