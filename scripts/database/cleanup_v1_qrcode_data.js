/**
 * V1 永久码数据清理脚本
 *
 * 📌 背景（2026-01-12 商家员工域权限体系升级）：
 * - 项目未上线，按"未上线"口径处理 v1 测试数据
 * - 彻底清理 v1 永久码相关数据，为后续移除 v1 字段做准备
 * - 真实库当前有 9 条 v1 重复记录需要清理
 *
 * 📌 清理策略：
 * 1. 删除所有 qr_code_version='v1' 的消费记录
 * 2. 外键约束 merchant_operation_logs.related_record_id 是 SET NULL，会自动置空
 * 3. 保留 v2 数据不受影响
 *
 * 使用方式：
 * 1. 预览模式（推荐先运行）：
 *    DRY_RUN=true node scripts/database/cleanup_v1_qrcode_data.js
 *
 * 2. 实际清理：
 *    node scripts/database/cleanup_v1_qrcode_data.js
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - 3B v1 数据清理
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../config/database')

// 是否为预览模式（不实际删除）
const DRY_RUN = process.env.DRY_RUN === 'true'

/**
 * 获取 v1 消费记录统计
 * @returns {Promise<Object>} v1 数据统计信息
 */
async function getV1Stats() {
  const [results] = await sequelize.query(`
    SELECT 
      qr_code_version,
      is_legacy_v1,
      status,
      COUNT(*) as count,
      GROUP_CONCAT(record_id ORDER BY record_id) as record_ids,
      MIN(created_at) as earliest_created,
      MAX(created_at) as latest_created
    FROM consumption_records
    WHERE qr_code_version = 'v1' OR is_legacy_v1 = 1
    GROUP BY qr_code_version, is_legacy_v1, status
    ORDER BY qr_code_version, status
  `)
  return results
}

/**
 * 获取关联的审计日志统计
 * @param {Array} recordIds - 消费记录ID列表
 * @returns {Promise<number>} 关联的审计日志数量
 */
async function getRelatedAuditLogCount(recordIds) {
  if (!recordIds || recordIds.length === 0) {
    return 0
  }

  const [results] = await sequelize.query(
    `
    SELECT COUNT(*) as count
    FROM merchant_operation_logs
    WHERE related_record_id IN (:recordIds)
  `,
    {
      replacements: { recordIds }
    }
  )

  return results[0]?.count || 0
}

/**
 * 删除 v1 消费记录
 * @returns {Promise<number>} 删除的记录数
 */
async function deleteV1Records() {
  // 开启事务
  const transaction = await sequelize.transaction()

  try {
    // 获取要删除的记录ID
    const [recordsToDelete] = await sequelize.query(
      `
      SELECT record_id, user_id, consumption_amount, status, created_at
      FROM consumption_records
      WHERE qr_code_version = 'v1' OR is_legacy_v1 = 1
      ORDER BY record_id
    `,
      { transaction }
    )

    if (recordsToDelete.length === 0) {
      await transaction.commit()
      return 0
    }

    // 记录删除详情（用于审计）
    console.log('\n📋 将要删除的记录详情:')
    console.log('-'.repeat(80))
    recordsToDelete.forEach((record, index) => {
      console.log(
        `  ${index + 1}. record_id=${record.record_id}, user_id=${record.user_id}, ` +
          `amount=${record.consumption_amount}, status=${record.status}, created=${record.created_at}`
      )
    })
    console.log('-'.repeat(80))

    // 执行删除
    const [deleteResult] = await sequelize.query(
      `
      DELETE FROM consumption_records
      WHERE qr_code_version = 'v1' OR is_legacy_v1 = 1
    `,
      { transaction }
    )

    // 提交事务
    await transaction.commit()

    return deleteResult.affectedRows || recordsToDelete.length
  } catch (error) {
    // 回滚事务
    await transaction.rollback()
    throw error
  }
}

/**
 * 验证清理结果
 * @returns {Promise<Object>} 验证结果
 */
async function verifyCleanup() {
  // 检查是否还有 v1 记录
  const [v1Remaining] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM consumption_records
    WHERE qr_code_version = 'v1' OR is_legacy_v1 = 1
  `)

  // 检查 v2 记录是否完好
  const [v2Stats] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM consumption_records
    WHERE qr_code_version = 'v2' AND is_legacy_v1 = 0
  `)

  // 检查总记录数
  const [totalStats] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM consumption_records
  `)

  return {
    v1_remaining: v1Remaining[0]?.count || 0,
    v2_count: v2Stats[0]?.count || 0,
    total_count: totalStats[0]?.count || 0
  }
}

/**
 * 主执行函数
 */
async function main() {
  console.log('='.repeat(70))
  console.log('🧹 V1 永久码数据清理脚本')
  console.log('='.repeat(70))
  console.log('')
  console.log(
    `📌 执行模式: ${DRY_RUN ? '⚠️ 预览模式（DRY_RUN=true，不实际删除）' : '🔴 实际删除模式'}`
  )
  console.log(`📅 执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log('')

  try {
    // 1. 数据库连接检查
    console.log('1️⃣ 检查数据库连接...')
    await sequelize.authenticate()
    console.log('   ✅ 数据库连接成功')
    console.log('')

    // 2. 获取 v1 数据统计
    console.log('2️⃣ 分析 V1 数据...')
    const v1Stats = await getV1Stats()

    if (v1Stats.length === 0) {
      console.log('   ✅ 未发现 V1 数据，无需清理')
      console.log('')
      console.log('='.repeat(70))
      console.log('🎉 清理完成（无数据需要处理）')
      console.log('='.repeat(70))
      return
    }

    console.log('   📊 V1 数据统计:')
    console.log('-'.repeat(70))

    let totalV1Count = 0
    const allRecordIds = []

    v1Stats.forEach(stat => {
      const count = parseInt(stat.count)
      totalV1Count += count
      if (stat.record_ids) {
        allRecordIds.push(...stat.record_ids.split(',').map(Number))
      }

      console.log(
        `   版本: ${stat.qr_code_version}, 状态: ${stat.status}, 数量: ${count}, ` +
          `记录ID: [${stat.record_ids}]`
      )
    })

    console.log('-'.repeat(70))
    console.log(`   📊 总计需要清理: ${totalV1Count} 条 V1 记录`)
    console.log('')

    // 3. 检查关联数据
    console.log('3️⃣ 检查关联数据...')
    const relatedLogCount = await getRelatedAuditLogCount(allRecordIds)
    console.log(`   📋 关联的审计日志: ${relatedLogCount} 条`)

    if (relatedLogCount > 0) {
      console.log('   ⚠️ 删除后这些审计日志的 related_record_id 将被置为 NULL')
    }
    console.log('')

    // 4. 执行清理
    if (DRY_RUN) {
      console.log('4️⃣ 预览模式 - 跳过实际删除')
      console.log('   ⚠️ 要执行实际删除，请运行:')
      console.log('   node scripts/database/cleanup_v1_qrcode_data.js')
      console.log('')
    } else {
      console.log('4️⃣ 执行清理...')
      const deletedCount = await deleteV1Records()
      console.log(`   ✅ 已删除 ${deletedCount} 条 V1 消费记录`)
      console.log('')

      // 5. 验证清理结果
      console.log('5️⃣ 验证清理结果...')
      const verifyResult = await verifyCleanup()

      console.log(`   📊 V1 剩余记录: ${verifyResult.v1_remaining} 条`)
      console.log(`   📊 V2 记录数: ${verifyResult.v2_count} 条`)
      console.log(`   📊 总记录数: ${verifyResult.total_count} 条`)

      if (verifyResult.v1_remaining === 0) {
        console.log('   ✅ V1 数据已全部清理')
      } else {
        console.log('   ⚠️ 仍有 V1 数据残留，请检查')
      }
      console.log('')
    }

    // 6. 输出下一步提示
    console.log('='.repeat(70))

    if (DRY_RUN) {
      console.log('📌 下一步操作:')
      console.log('   1. 确认预览结果无误')
      console.log('   2. 执行: node scripts/database/cleanup_v1_qrcode_data.js')
      console.log('   3. 运行数据库迁移删除 v1 相关字段')
    } else {
      console.log('🎉 V1 数据清理完成！')
      console.log('')
      console.log('📌 下一步操作:')
      console.log('   1. 运行迁移删除 qr_code_version 和 is_legacy_v1 字段')
      console.log('   2. 清理代码中的 v1 相关逻辑')
    }

    console.log('='.repeat(70))
  } catch (error) {
    console.error('')
    console.error('❌ 执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
