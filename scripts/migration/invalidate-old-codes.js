/**
 * 餐厅积分抽奖系统 V4.2 - 旧版核销码作废脚本
 *
 * 职责：
 * - 批量作废 user_inventory 表中的旧版8位HEX核销码
 * - 清空 verification_code 字段
 * - 将 verification_expires_at 设置为过去时间（确保已过期）
 * - 为后续废弃 user_inventory 表做准备
 *
 * 业务背景：
 * - 旧版核销系统：8位HEX核销码，24小时有效期，存储在 user_inventory 表
 * - 新版核销系统：12位Base32核销码，30天有效期，存储在 redemption_orders 表
 * - 迁移策略：双轨并行 → 旧接口废弃（410 GONE）→ 旧数据作废 → 7天观察期 → 删表
 *
 * 执行时机：
 * - P1阶段：新版核销系统上线后立即执行
 * - 确保所有旧版核销码立即失效
 *
 * 安全保障：
 * - 事务保护
 * - 影响行数统计
 * - 操作日志记录
 * - 可回滚（通过数据库备份）
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 *
 * 使用方法：
 * node scripts/migration/invalidate-old-codes.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const { sequelize, UserInventory } = require('../../models')
const logger = require('../../utils/logger').logger

/**
 * 作废旧版核销码
 *
 * 业务逻辑：
 * 1. 查询所有有核销码的记录（verification_code IS NOT NULL）
 * 2. 批量更新：
 *    - verification_code = NULL
 *    - verification_expires_at = '2020-01-01 00:00:00'（确保过期）
 * 3. 记录影响行数
 * 4. 输出详细日志
 *
 * @returns {Promise<number>} 作废的核销码数量
 */
async function invalidateOldCodes() {
  const startTime = Date.now()
  logger.info('===== 开始作废旧版核销码 =====')

  const transaction = await sequelize.transaction()

  try {
    // 1. 查询有核销码的记录数量（执行前统计）
    const beforeCount = await UserInventory.count({
      where: {
        verification_code: {
          [sequelize.Sequelize.Op.ne]: null
        }
      },
      transaction
    })

    logger.info('查询到待作废的核销码记录', {
      total_codes: beforeCount,
      note: '这些核销码将被立即作废'
    })

    if (beforeCount === 0) {
      logger.info('没有需要作废的核销码，脚本退出')
      await transaction.commit()
      return 0
    }

    // 2. 批量作废核销码
    const [affectedCount] = await UserInventory.update(
      {
        verification_code: null, // 清空核销码
        verification_expires_at: new Date('2020-01-01T00:00:00+08:00') // 设置为过去时间（确保过期）
      },
      {
        where: {
          verification_code: {
            [sequelize.Sequelize.Op.ne]: null
          }
        },
        transaction
      }
    )

    // 3. 验证作废结果
    const afterCount = await UserInventory.count({
      where: {
        verification_code: {
          [sequelize.Sequelize.Op.ne]: null
        }
      },
      transaction
    })

    if (afterCount > 0) {
      throw new Error(`作废失败：仍有 ${afterCount} 条记录有核销码`)
    }

    // 4. 提交事务
    await transaction.commit()

    const duration = Date.now() - startTime

    logger.info('===== 旧版核销码作废成功 =====', {
      affected_count: affectedCount,
      expected_count: beforeCount,
      remaining_count: afterCount,
      duration_ms: duration,
      duration_seconds: (duration / 1000).toFixed(2)
    })

    // 5. 输出操作摘要
    console.log('\n========================================')
    console.log('✅ 旧版核销码作废成功')
    console.log('========================================')
    console.log(`📊 作废数量: ${affectedCount} 条记录`)
    console.log(`⏱️  执行耗时: ${(duration / 1000).toFixed(2)} 秒`)
    console.log(`🔍 验证结果: 剩余有效核销码 ${afterCount} 个`)
    console.log('========================================')
    console.log('📝 操作详情:')
    console.log('   - verification_code → NULL')
    console.log('   - verification_expires_at → 2020-01-01 00:00:00')
    console.log('========================================')
    console.log('⚠️  注意事项:')
    console.log('   1. 旧版核销接口已返回 410 GONE')
    console.log('   2. 用户需使用新版核销系统（/api/v4/redemption）')
    console.log('   3. 7天观察期后将执行 DROP TABLE user_inventory')
    console.log('========================================\n')

    return affectedCount
  } catch (error) {
    // 回滚事务
    await transaction.rollback()

    logger.error('===== 旧版核销码作废失败 =====', {
      error: error.message,
      stack: error.stack
    })

    console.error('\n========================================')
    console.error('❌ 旧版核销码作废失败')
    console.error('========================================')
    console.error(`错误信息: ${error.message}`)
    console.error('========================================')
    console.error('📝 操作已回滚，数据库未受影响')
    console.error('========================================\n')

    throw error
  }
}

/**
 * 查询作废后的统计信息
 *
 * @returns {Promise<Object>} 统计信息
 */
async function getInvalidationStats() {
  try {
    const [totalInventory, validCodes, expiredCodes] = await Promise.all([
      // 总库存记录数
      UserInventory.count(),
      // 有效核销码数量
      UserInventory.count({
        where: {
          verification_code: {
            [sequelize.Sequelize.Op.ne]: null
          }
        }
      }),
      // 已过期核销码数量
      UserInventory.count({
        where: {
          verification_code: null,
          verification_expires_at: {
            [sequelize.Sequelize.Op.lt]: new Date()
          }
        }
      })
    ])

    return {
      total_inventory: totalInventory,
      valid_codes: validCodes,
      expired_codes: expiredCodes,
      invalidation_rate: totalInventory > 0 ? ((expiredCodes / totalInventory) * 100).toFixed(2) : 0
    }
  } catch (error) {
    logger.error('查询统计信息失败', { error: error.message })
    throw error
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 1. 执行前统计
    logger.info('查询执行前统计信息...')
    const beforeStats = await getInvalidationStats()
    logger.info('执行前统计', beforeStats)

    // 2. 执行作废操作
    const affectedCount = await invalidateOldCodes()

    // 3. 执行后统计
    logger.info('查询执行后统计信息...')
    const afterStats = await getInvalidationStats()
    logger.info('执行后统计', afterStats)

    // 4. 关闭数据库连接
    await sequelize.close()

    // 5. 退出进程
    process.exit(0)
  } catch (error) {
    logger.error('脚本执行失败', {
      error: error.message,
      stack: error.stack
    })

    // 关闭数据库连接
    await sequelize.close()

    // 非0退出码
    process.exit(1)
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  invalidateOldCodes,
  getInvalidationStats
}
