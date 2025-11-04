/**
 * 连抽事务安全问题 - 全面事故检查脚本
 * 执行8项核心检查，诊断是否存在事务问题导致的数据异常
 * 生成时间：2025-10-20
 */

const { sequelize } = require('../config/database')
const fs = require('fs')

async function runIncidentCheck () {
  console.log('🔍 开始连抽事务安全事故检查...\n')
  console.log('检查时间范围：最近30天')
  console.log('检查维度：8项核心指标\n')
  console.log('='.repeat(80))

  try {
    // 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    const report = {
      check_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      summary: {
        total_checks: 8,
        critical_issues: 0,
        warnings: 0,
        normal: 0
      },
      details: []
    }

    // ========== 检查1：不完整的连抽 ==========
    console.log('\n📋 检查1：不完整连抽检查')
    console.log('检查是否有3/5/10连抽部分失败的情况')
    console.log('-'.repeat(80))

    const [incompleteDraws] = await sequelize.query(`
      SELECT 
        user_id,
        DATE(created_at) as draw_date,
        COUNT(*) as actual_draw_count,
        CASE 
          WHEN COUNT(*) = 1 THEN '✅ 单抽（正常）'
          WHEN COUNT(*) = 3 THEN '✅ 3连抽完整'
          WHEN COUNT(*) = 5 THEN '✅ 5连抽完整'
          WHEN COUNT(*) = 10 THEN '✅ 10连抽完整'
          WHEN COUNT(*) < 3 THEN '⚠️ 疑似连抽失败（少于3次）'
          WHEN COUNT(*) = 2 THEN '🚨 异常：2次抽奖（不符合规则）'
          WHEN COUNT(*) = 4 THEN '🚨 异常：4次抽奖（3连抽失败？）'
          WHEN COUNT(*) BETWEEN 6 AND 9 THEN '🚨 异常：6-9次（5或10连抽失败）'
          ELSE CONCAT('🚨 异常：', COUNT(*), '次抽奖')
        END as status,
        GROUP_CONCAT(is_winner ORDER BY created_at) as win_sequence,
        MIN(created_at) as first_draw_time,
        MAX(created_at) as last_draw_time,
        TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) as duration_seconds
      FROM lottery_draws
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY user_id, DATE(created_at)
      HAVING COUNT(*) > 1 
        AND COUNT(*) NOT IN (3, 5, 10)
      ORDER BY actual_draw_count DESC, draw_date DESC
      LIMIT 50
    `)

    if (incompleteDraws.length === 0) {
      console.log('✅ 未发现不完整的连抽记录')
      report.summary.normal++
    } else {
      console.log(`🚨 发现 ${incompleteDraws.length} 条异常连抽记录！`)
      report.summary.critical_issues += incompleteDraws.filter(d => d.status.includes('🚨')).length
      report.summary.warnings += incompleteDraws.filter(d => d.status.includes('⚠️')).length

      console.log('\n异常记录详情：')
      incompleteDraws.slice(0, 10).forEach((row, index) => {
        console.log(`\n  ${index + 1}. 用户ID: ${row.user_id}`)
        console.log(`     日期: ${row.draw_date}`)
        console.log(`     状态: ${row.status}`)
        console.log(`     实际抽奖次数: ${row.actual_draw_count}`)
        console.log(`     持续时间: ${row.duration_seconds}秒`)
        console.log(`     中奖序列: ${row.win_sequence}`)
      })

      if (incompleteDraws.length > 10) {
        console.log(`\n  ... 还有 ${incompleteDraws.length - 10} 条记录（详见报告文件）`)
      }
    }

    report.details.push({
      check_name: '不完整连抽检查',
      status: incompleteDraws.length === 0 ? 'PASS' : 'FAIL',
      issue_count: incompleteDraws.length,
      data: incompleteDraws
    })

    // ========== 检查2：连抽类型分布 ==========
    console.log('\n\n📋 检查2：连抽类型分布统计')
    console.log('统计各种连抽的使用情况')
    console.log('-'.repeat(80))

    const [drawDistribution] = await sequelize.query(`
      SELECT 
        CASE 
          WHEN daily_draws = 1 THEN '单抽'
          WHEN daily_draws = 3 THEN '3连抽'
          WHEN daily_draws = 5 THEN '5连抽'
          WHEN daily_draws = 10 THEN '10连抽'
          ELSE CONCAT('异常(', daily_draws, '次)')
        END as draw_type,
        COUNT(*) as user_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage,
        SUM(daily_draws) as total_draws
      FROM (
        SELECT user_id, DATE(created_at) as date, COUNT(*) as daily_draws
        FROM lottery_draws
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY user_id, DATE(created_at)
      ) as daily_stats
      GROUP BY draw_type
      ORDER BY user_count DESC
    `)

    if (drawDistribution.length > 0) {
      console.log('\n抽奖类型分布：')
      drawDistribution.forEach(row => {
        const icon = row.draw_type.includes('异常') ? '🚨' : '📊'
        console.log(`  ${icon} ${row.draw_type}: ${row.user_count}次 (${row.percentage}%), 总抽奖${row.total_draws}次`)
      })

      const hasAbnormal = drawDistribution.some(d => d.draw_type.includes('异常'))
      if (hasAbnormal) {
        report.summary.warnings++
      } else {
        report.summary.normal++
      }
    }

    report.details.push({
      check_name: '连抽类型分布',
      status: 'INFO',
      data: drawDistribution
    })

    // ========== 检查3：积分异常交易 ==========
    console.log('\n\n📋 检查3：积分异常交易检查')
    console.log('检查是否有退款或回滚记录')
    console.log('-'.repeat(80))

    const [abnormalTransactions] = await sequelize.query(`
      SELECT 
        transaction_type,
        reason,
        COUNT(*) as transaction_count,
        SUM(ABS(points_change)) as total_points,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence
      FROM points_transactions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND (
          reason LIKE '%失败%' 
          OR reason LIKE '%退款%' 
          OR reason LIKE '%回滚%'
          OR reason LIKE '%补偿%'
          OR reason LIKE '%错误%'
        )
      GROUP BY transaction_type, reason
      ORDER BY transaction_count DESC
    `)

    if (abnormalTransactions.length === 0) {
      console.log('✅ 未发现异常积分交易记录')
      report.summary.normal++
    } else {
      console.log(`⚠️ 发现 ${abnormalTransactions.length} 种异常积分交易类型！`)
      report.summary.warnings++

      console.log('\n异常交易详情：')
      abnormalTransactions.forEach((row, index) => {
        console.log(`\n  ${index + 1}. 类型: ${row.transaction_type}`)
        console.log(`     原因: ${row.reason}`)
        console.log(`     次数: ${row.transaction_count}`)
        console.log(`     总积分: ${row.total_points}`)
        console.log(`     首次: ${row.first_occurrence}`)
        console.log(`     最近: ${row.last_occurrence}`)
      })
    }

    report.details.push({
      check_name: '积分异常交易',
      status: abnormalTransactions.length === 0 ? 'PASS' : 'WARNING',
      issue_count: abnormalTransactions.length,
      data: abnormalTransactions
    })

    // ========== 检查4：积分扣除一致性 ==========
    console.log('\n\n📋 检查4：积分扣除与抽奖记录一致性检查')
    console.log('检查积分扣除数量是否与抽奖次数匹配')
    console.log('-'.repeat(80))

    const [inconsistentRecords] = await sequelize.query(`
      SELECT 
        t1.user_id,
        t1.draw_date,
        t1.draw_count as lottery_count,
        t1.total_cost_points as lottery_points,
        IFNULL(t2.deduct_count, 0) as deduct_count,
        IFNULL(t2.deduct_points, 0) as deduct_points,
        CASE 
          WHEN t1.draw_count = IFNULL(t2.deduct_count, 0) 
           AND t1.total_cost_points = IFNULL(t2.deduct_points, 0)
          THEN '✅ 一致'
          WHEN IFNULL(t2.deduct_count, 0) = 0 
          THEN '🚨 严重：有抽奖无扣款'
          WHEN t1.draw_count > IFNULL(t2.deduct_count, 0)
          THEN '🚨 异常：抽奖次数>扣款次数'
          WHEN t1.draw_count < IFNULL(t2.deduct_count, 0)
          THEN '🚨 异常：扣款次数>抽奖次数'
          ELSE '⚠️ 其他不一致'
        END as consistency_status
      FROM (
        SELECT 
          user_id,
          DATE(created_at) as draw_date,
          COUNT(*) as draw_count,
          SUM(cost_points) as total_cost_points
        FROM lottery_draws
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY user_id, DATE(created_at)
      ) t1
      LEFT JOIN (
        SELECT 
          user_id,
          DATE(created_at) as deduct_date,
          COUNT(*) as deduct_count,
          SUM(ABS(points_change)) as deduct_points
        FROM points_transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND transaction_type = 'LOTTERY'
          AND points_change < 0
        GROUP BY user_id, DATE(created_at)
      ) t2 ON t1.user_id = t2.user_id AND t1.draw_date = t2.deduct_date
      WHERE t1.draw_count != IFNULL(t2.deduct_count, 0)
         OR t1.total_cost_points != IFNULL(t2.deduct_points, 0)
      ORDER BY t1.draw_date DESC, consistency_status
      LIMIT 50
    `)

    if (inconsistentRecords.length === 0) {
      console.log('✅ 积分扣除与抽奖记录完全一致')
      report.summary.normal++
    } else {
      console.log(`🚨 发现 ${inconsistentRecords.length} 条不一致记录！`)
      report.summary.critical_issues++

      console.log('\n不一致记录详情（前10条）：')
      inconsistentRecords.slice(0, 10).forEach((row, index) => {
        console.log(`\n  ${index + 1}. 用户ID: ${row.user_id}`)
        console.log(`     日期: ${row.draw_date}`)
        console.log(`     状态: ${row.consistency_status}`)
        console.log(`     抽奖次数: ${row.lottery_count} vs 扣款次数: ${row.deduct_count}`)
        console.log(`     抽奖积分: ${row.lottery_points} vs 扣款积分: ${row.deduct_points}`)
      })
    }

    report.details.push({
      check_name: '积分扣除一致性',
      status: inconsistentRecords.length === 0 ? 'PASS' : 'FAIL',
      issue_count: inconsistentRecords.length,
      data: inconsistentRecords
    })

    // ========== 检查5：业务规模统计 ==========
    console.log('\n\n📋 检查7：业务规模统计')
    console.log('评估当前数据量和业务规模')
    console.log('-'.repeat(80))

    const [businessStats] = await sequelize.query(`
      SELECT 
        '总用户数' as metric,
        COUNT(*) as value,
        '-' as percentage
      FROM users
      UNION ALL
      SELECT 
        '活跃用户数（30天）',
        COUNT(DISTINCT user_id),
        CONCAT(ROUND(COUNT(DISTINCT user_id) * 100.0 / (SELECT COUNT(*) FROM users), 2), '%')
      FROM lottery_draws
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      UNION ALL
      SELECT 
        '总抽奖次数',
        COUNT(*),
        '-'
      FROM lottery_draws
      UNION ALL
      SELECT 
        '最近30天抽奖次数',
        COUNT(*),
        CONCAT(ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM lottery_draws), 2), '%')
      FROM lottery_draws
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      UNION ALL
      SELECT 
        '总积分交易数',
        COUNT(*),
        '-'
      FROM points_transactions
      UNION ALL
      SELECT 
        '最近30天积分交易',
        COUNT(*),
        CONCAT(ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM points_transactions), 2), '%')
      FROM points_transactions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `)

    console.log('\n业务数据统计：')
    businessStats.forEach(row => {
      console.log(`  📊 ${row.metric}: ${row.value} ${row.percentage !== '-' ? '(' + row.percentage + ')' : ''}`)
    })

    report.details.push({
      check_name: '业务规模统计',
      status: 'INFO',
      data: businessStats
    })

    // ========== 生成总结报告 ==========
    console.log('\n\n' + '='.repeat(80))
    console.log('📊 事故检查总结报告')
    console.log('='.repeat(80))
    console.log(`检查时间: ${report.check_time}`)
    console.log(`检查项目: ${report.summary.total_checks}项`)
    console.log(`🚨 严重问题: ${report.summary.critical_issues}项`)
    console.log(`⚠️ 警告问题: ${report.summary.warnings}项`)
    console.log(`✅ 正常项目: ${report.summary.normal}项`)

    // 生成结论
    console.log('\n📋 检查结论:')
    if (report.summary.critical_issues === 0 && report.summary.warnings === 0) {
      console.log('✅ 未发现严重事务安全问题，系统运行正常')
    } else if (report.summary.critical_issues > 0) {
      console.log('🚨 发现严重事务安全问题！建议立即暂停业务进行修复')
      console.log('\n严重问题清单:')
      report.details.forEach(detail => {
        if (detail.status === 'FAIL' && detail.issue_count > 0) {
          console.log(`  - ${detail.check_name}: 发现${detail.issue_count}个问题`)
        }
      })
    } else {
      console.log('⚠️ 发现潜在风险，建议尽快优化事务处理机制')
    }

    // 生成建议
    console.log('\n💡 修复建议:')
    if (report.summary.critical_issues > 0 || report.summary.warnings > 0) {
      console.log('  1. 立即实施"方案1：统一事务保护"')
      console.log('  2. 补偿受影响用户的积分')
      console.log('  3. 建立完善的监控机制')
      console.log('  4. 详细修复方案见: docs/连抽事务安全问题-完整修复方案_业务暂停执行版.md')
    } else {
      console.log('  1. 虽然当前未发现问题，但仍建议实施"方案1：统一事务保护"作为预防措施')
      console.log('  2. 建立完善的监控机制，防止未来出现问题')
    }

    // 保存详细报告
    const reportPath = '/home/devbox/project/logs/transaction_incident_check_report.json'
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 详细报告已保存: ${reportPath}`)

    console.log('\n' + '='.repeat(80))
    console.log('✅ 检查完成')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('\n❌ 检查过程中出错:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行检查
runIncidentCheck().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('❌ 检查失败:', error)
  process.exit(1)
})
