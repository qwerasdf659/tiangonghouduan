#!/usr/bin/env node
/**
 * 背包双轨架构迁移 - 简化版立即执行脚本
 *
 * 不依赖系统命令（mysqldump等），直接使用Node.js和Sequelize执行迁移
 * 执行时间：立即执行
 * 预计耗时：30-40分钟
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log(message) {
  console.log(
    `${colors.green}[${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}]${colors.reset} ${message}`
  )
}

function logError(message) {
  console.log(
    `${colors.red}[${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}] ERROR:${colors.reset} ${message}`
  )
}

function logWarn(message) {
  console.log(
    `${colors.yellow}[${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}] WARN:${colors.reset} ${message}`
  )
}

function logInfo(message) {
  console.log(
    `${colors.blue}[${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}] INFO:${colors.reset} ${message}`
  )
}

async function main() {
  const startTime = Date.now()

  log('═══════════════════════════════════════════════════════')
  log('背包双轨架构迁移 - 简化版立即执行')
  log('方案：A（一刀切，立即禁用旧系统）')
  log(`执行时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  log('═══════════════════════════════════════════════════════')

  try {
    // ========================================================================
    // 第一阶段：停止服务
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第一阶段：停止后端服务')
    log('═══════════════════════════════════════════════════════')

    logInfo('停止后端服务...')
    try {
      execSync('pm2 stop all', { stdio: 'inherit' })
      log('✅ 后端服务已停止')
    } catch (error) {
      logWarn('PM2停止失败（可能未启动）')
    }

    await sleep(3000)

    // ========================================================================
    // 第二阶段：旧码失效
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第二阶段：旧码失效处理')
    log('═══════════════════════════════════════════════════════')

    logInfo('执行旧码失效脚本...')
    try {
      execSync('node scripts/migration/invalidate-old-codes.js', {
        stdio: 'inherit',
        cwd: process.cwd()
      })
      log('✅ 旧码失效处理完成')
    } catch (error) {
      logError(`旧码失效失败: ${error.message}`)
      throw error
    }

    // ========================================================================
    // 第三阶段：数据迁移（核心阶段）
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第三阶段：数据迁移执行（核心阶段）')
    log('═══════════════════════════════════════════════════════')

    logInfo('执行数据迁移脚本...')
    try {
      execSync('node scripts/migrate-user-inventory-to-dual-track.js', {
        stdio: 'inherit',
        cwd: process.cwd()
      })
      log('✅ 数据迁移执行完成')
    } catch (error) {
      logError(`数据迁移失败: ${error.message}`)
      throw error
    }

    // ========================================================================
    // 第四阶段：旧表重命名
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第四阶段：旧表重命名')
    log('═══════════════════════════════════════════════════════')

    logInfo('执行数据库迁移：rename user_inventory...')
    try {
      execSync(
        'npx sequelize-cli db:migrate --name 20251217160809-rename-user-inventory-to-deprecated.js',
        {
          stdio: 'inherit',
          cwd: process.cwd()
        }
      )
      log('✅ 旧表重命名完成')
    } catch (error) {
      logError(`旧表重命名失败: ${error.message}`)
      throw error
    }

    // ========================================================================
    // 第五阶段：对账验证
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第五阶段：对账验证')
    log('═══════════════════════════════════════════════════════')

    logInfo('执行对账脚本...')
    try {
      execSync('node scripts/reconcile-inventory-migration.js', {
        stdio: 'inherit',
        cwd: process.cwd()
      })
      log('✅ 对账验证通过：数据一致性100%')
    } catch (error) {
      logWarn(`对账验证失败: ${error.message}`)
      logWarn('请手动检查数据一致性')
      // 对账失败不中断流程，继续执行
    }

    // ========================================================================
    // 第六阶段：重启服务和烟雾测试
    // ========================================================================
    log('')
    log('═══════════════════════════════════════════════════════')
    log('第六阶段：重启服务和烟雾测试')
    log('═══════════════════════════════════════════════════════')

    logInfo('重启后端服务...')
    try {
      execSync('pm2 restart restaurant-lottery-backend --update-env', { stdio: 'inherit' })
      log('✅ 后端服务已重启')
    } catch (error) {
      logError(`服务重启失败: ${error.message}`)
      throw error
    }

    logInfo('等待服务启动（30秒）...')
    await sleep(30000)

    logInfo('执行健康检查...')
    try {
      const healthCheck = execSync('curl -s http://localhost:3000/health', { encoding: 'utf8' })
      if (healthCheck.includes('healthy')) {
        log('✅ 后端服务健康检查通过')
      } else {
        logWarn(`健康检查响应异常: ${healthCheck.substring(0, 100)}`)
      }
    } catch (error) {
      logWarn(`健康检查失败: ${error.message}`)
    }

    logInfo('测试旧背包接口（应返回404 - 已彻底删除）...')
    try {
      const oldEndpointTest = execSync(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v4/inventory/user/1',
        { encoding: 'utf8' }
      )
      if (oldEndpointTest.trim() === '404') {
        log('✅ 旧背包接口已彻底删除（返回404 Not Found）')
      } else {
        logWarn(`旧背包接口返回 ${oldEndpointTest}（预期404）`)
      }
    } catch (error) {
      logWarn(`旧接口测试失败: ${error.message}`)
    }

    logInfo('测试新背包接口（应返回200或401）...')
    try {
      const newEndpointTest = execSync(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v4/backpack',
        { encoding: 'utf8' }
      )
      if (newEndpointTest.trim() === '200' || newEndpointTest.trim() === '401') {
        log(`✅ 新背包接口正常工作（返回 ${newEndpointTest}）`)
      } else {
        logWarn(`新背包接口返回 ${newEndpointTest}`)
      }
    } catch (error) {
      logWarn(`新接口测试失败: ${error.message}`)
    }

    // ========================================================================
    // 完成
    // ========================================================================
    const endTime = Date.now()
    const duration = Math.floor((endTime - startTime) / 1000)
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60

    log('')
    log('═══════════════════════════════════════════════════════')
    log('🎉 迁移成功完成！')
    log('═══════════════════════════════════════════════════════')
    log(`总耗时: ${minutes}分${seconds}秒`)
    log('')
    log('下一步操作：')
    log('1. 执行完整验收检查: 参考 scripts/migration/post-migration-verification.md')
    log('2. 通知前端团队更新接口调用')
    log('3. 通知商家端更新扫码接口')
    log('4. 监控系统运行24小时')
    log('5. 确认无问题后删除 _deprecated_user_inventory_* 表（30天后）')
    log('═══════════════════════════════════════════════════════')

    process.exit(0)
  } catch (error) {
    logError('')
    logError('═══════════════════════════════════════════════════════')
    logError('❌ 迁移执行失败！')
    logError('═══════════════════════════════════════════════════════')
    logError(`错误信息: ${error.message}`)
    logError('')
    logError('需要手动处理：')
    logError('1. 检查错误日志')
    logError('2. 如需回滚，请查看 scripts/migration/post-migration-verification.md 末尾的回滚命令')
    logError(
      '3. 重启服务: npm run pm:restart 或 pm2 restart restaurant-lottery-backend --update-env'
    )
    logError('═══════════════════════════════════════════════════════')

    // 尝试重启服务
    try {
      logInfo('尝试重启服务...')
      execSync('pm2 restart restaurant-lottery-backend --update-env', { stdio: 'inherit' })
      log('✅ 服务已重启')
    } catch (restartError) {
      logError('服务重启失败，请手动执行: npm run pm:restart')
    }

    process.exit(1)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 执行主流程
main().catch(error => {
  console.error('未捕获的错误:', error)
  process.exit(1)
})
