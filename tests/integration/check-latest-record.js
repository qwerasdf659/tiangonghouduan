/**
 * 检查最新消费记录的完整性
 */
'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

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

async function checkLatestRecord () {
  try {
    // 查询最新的消费记录
    const [records] = await sequelize.query(`
      SELECT 
        cr.record_id,
        cr.user_id,
        cr.merchant_id,
        cr.consumption_amount,
        cr.points_to_award,
        cr.status,
        cr.qr_code,
        cr.merchant_notes,
        DATE_FORMAT(cr.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        -- 检查积分交易记录
        pt.transaction_id,
        pt.points_amount,
        pt.status as points_status,
        DATE_FORMAT(pt.transaction_time, '%Y-%m-%d %H:%i:%s') as points_created_at,
        -- 检查审核记录
        crr.audit_id,
        crr.audit_status,
        DATE_FORMAT(crr.created_at, '%Y-%m-%d %H:%i:%s') as review_created_at
      FROM consumption_records cr
      LEFT JOIN points_transactions pt 
        ON pt.reference_type = 'consumption' 
        AND pt.reference_id = cr.record_id
      LEFT JOIN content_review_records crr
        ON crr.auditable_type = 'consumption'
        AND crr.auditable_id = cr.record_id
      ORDER BY cr.record_id DESC
      LIMIT 5
    `)

    console.log('\n📊 最新5条消费记录详细信息：\n')

    records.forEach((r, index) => {
      console.log(`\n记录${index + 1}:`)
      console.log(`  消费记录ID: ${r.record_id}`)
      console.log(`  用户ID: ${r.user_id}`)
      console.log(`  商家ID: ${r.merchant_id}`)
      console.log(`  消费金额: ${r.consumption_amount}元`)
      console.log(`  预计积分: ${r.points_to_award}分`)
      console.log(`  记录状态: ${r.status}`)
      console.log(`  创建时间: ${r.created_at}`)

      // 检查积分交易记录
      if (r.transaction_id) {
        console.log(`  ✅ 积分交易记录: transaction_id=${r.transaction_id}, points=${r.points_amount}, status=${r.points_status}`)
      } else {
        console.log('  ❌ 缺失积分交易记录')
      }

      // 检查审核记录
      if (r.audit_id) {
        console.log(`  ✅ 审核记录: audit_id=${r.audit_id}, status=${r.audit_status}`)
      } else {
        console.log('  ❌ 缺失审核记录')
      }

      // 完整性判断
      const isComplete = r.transaction_id && r.audit_id
      if (isComplete) {
        console.log('  🎉 数据完整性: ✅ 完整（事务保护成功）')
      } else {
        console.log('  ⚠️ 数据完整性: ❌ 不完整（可能是历史数据）')
      }
    })

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

checkLatestRecord()
