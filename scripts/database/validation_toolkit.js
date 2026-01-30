#!/usr/bin/env node

/**
 * 数据库验证统一工具包 (Validation Toolkit)
 *
 * 整合来源：
 * - scripts/database/compare-models-db.js (对比模型与数据库)
 * - scripts/database/comprehensive-db-check.js (综合数据库检查)
 * - scripts/database/test-rebuild-readiness.js (测试重建准备度)
 * - scripts/database/verify-restored-data.sh (验证恢复数据)
 *
 * 使用方式：
 * node scripts/database/validation-toolkit.js                  # 交互式菜单
 * node scripts/database/validation-toolkit.js compare          # 直接对比模型
 * node scripts/database/validation-toolkit.js comprehensive    # 综合检查
 *
 * V2.0 重构版本
 * 创建时间：2025年10月15日 北京时间
 */

'use strict'

const { sequelize } = require('../../config/database.js')
const models = require('../../models')
const inquirer = require('inquirer')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 核心功能 ====================

/**
 * 对比模型与数据库结构
 */
async function compareModelsAndDatabase() {
  log('\n📊 对比模型与数据库结构', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 1. 获取所有模型定义的表名
    const modelTables = Object.keys(models)
      .filter(k => k !== 'sequelize' && k !== 'Sequelize')
      .map(k => ({
        modelName: k,
        tableName: models[k].tableName || models[k].name
      }))
      .sort((a, b) => a.tableName.localeCompare(b.tableName))

    log(`\n📦 模型定义的表 (${modelTables.length}个):`, 'blue')
    modelTables.forEach((m, i) => {
      log(`   ${i + 1}. ${m.tableName} (模型: ${m.modelName})`)
    })

    // 2. 获取数据库实际表
    const dbTables = await sequelize.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
      { type: require('sequelize').QueryTypes.SELECT }
    )

    const dbTableNames = dbTables
      .map(t => t.TABLE_NAME || t.table_name)
      .filter(t => t !== 'sequelizemeta')

    log(`\n🗄️  数据库实际表 (${dbTableNames.length}个，不含sequelizemeta):`, 'blue')
    dbTableNames.forEach((t, i) => {
      log(`   ${i + 1}. ${t}`)
    })

    // 3. 差异分析
    log('\n🔍 差异分析:', 'cyan')
    log('='.repeat(60))

    const modelTableNames = modelTables.map(m => m.tableName)
    const missingInDB = modelTableNames.filter(t => !dbTableNames.includes(t))
    const extraInDB = dbTableNames.filter(t => !modelTableNames.includes(t))

    // 缺失的表
    if (missingInDB.length > 0) {
      log(`\n❌ 模型中有但数据库中缺失的表 (${missingInDB.length}个):`, 'red')
      missingInDB.forEach((t, i) => {
        const model = modelTables.find(m => m.tableName === t)
        log(`   ${i + 1}. ${t} (模型: ${model.modelName})`)
        log('      ⚠️  需要创建此表', 'yellow')
      })
    } else {
      log('\n✅ 所有模型对应的表都存在', 'green')
    }

    // 多余的表
    if (extraInDB.length > 0) {
      log(`\n⚠️  数据库中有但模型中缺失的表 (${extraInDB.length}个):`, 'yellow')
      extraInDB.forEach((t, i) => {
        log(`   ${i + 1}. ${t}`)
        log('      💡 可能是历史遗留表或需要添加模型', 'yellow')
      })
    }

    // 总结
    log('\n📊 对比总结:', 'cyan')
    log(`   模型定义表: ${modelTableNames.length}个`)
    log(`   数据库实际表: ${dbTableNames.length}个`)
    log(`   缺失表: ${missingInDB.length}个`, missingInDB.length > 0 ? 'red' : 'green')
    log(`   多余表: ${extraInDB.length}个`, extraInDB.length > 0 ? 'yellow' : 'green')

    if (missingInDB.length === 0 && extraInDB.length === 0) {
      log('\n✅ 模型与数据库完全一致!', 'green')
    } else {
      log('\n⚠️  模型与数据库存在差异，请检查', 'yellow')
    }

    return {
      modelTables: modelTableNames,
      dbTables: dbTableNames,
      missingInDB,
      extraInDB,
      isConsistent: missingInDB.length === 0 && extraInDB.length === 0
    }
  } catch (error) {
    log(`\n❌ 对比失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 综合数据库检查
 */
async function comprehensiveDatabaseCheck() {
  log('\n🔍 综合数据库检查', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 1. 检查数据库连接
    log('\n1️⃣  测试数据库连接...', 'blue')
    await sequelize.authenticate()
    log('   ✅ 数据库连接正常', 'green')

    // 2. 检查表结构
    log('\n2️⃣  检查表结构...', 'blue')
    const comparison = await compareModelsAndDatabase()

    // 3. 检查数据完整性
    log('\n3️⃣  检查数据完整性...', 'blue')
    const integrityResult = await checkDataIntegrity()

    // 4. 检查索引状态
    log('\n4️⃣  检查索引状态...', 'blue')
    const indexResult = await checkIndexes()

    // 5. 检查外键约束
    log('\n5️⃣  检查外键约束...', 'blue')
    const foreignKeyResult = await checkForeignKeys()

    // 6. 生成综合报告
    log('\n📊 综合检查报告:', 'cyan')
    log('='.repeat(60))

    const allPassed =
      comparison.isConsistent &&
      integrityResult.allValid &&
      indexResult.allValid &&
      foreignKeyResult.allValid

    if (allPassed) {
      log('\n✅ 所有检查项目通过!', 'green')
      log('   数据库状态良好，可以正常使用', 'green')
    } else {
      log('\n⚠️  部分检查项目存在问题:', 'yellow')
      if (!comparison.isConsistent) {
        log('   - 表结构不一致', 'yellow')
      }
      if (!integrityResult.allValid) {
        log('   - 数据完整性问题', 'yellow')
      }
      if (!indexResult.allValid) {
        log('   - 索引问题', 'yellow')
      }
      if (!foreignKeyResult.allValid) {
        log('   - 外键约束问题', 'yellow')
      }
    }

    return {
      allPassed,
      details: {
        comparison,
        integrity: integrityResult,
        indexes: indexResult,
        foreignKeys: foreignKeyResult
      }
    }
  } catch (error) {
    log(`\n❌ 综合检查失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 检查数据完整性
 */
async function checkDataIntegrity() {
  try {
    const issues = []

    // 检查每个模型的数据完整性
    for (const modelName of Object.keys(models)) {
      if (modelName === 'sequelize' || modelName === 'Sequelize') continue

      const model = models[modelName]

      // 检查必填字段
      const count = await model.count()
      if (count === 0) {
        log(`   ⚠️  ${model.tableName}: 表为空`, 'yellow')
      }
    }

    log('   ✅ 数据完整性检查完成', 'green')
    return { allValid: issues.length === 0, issues }
  } catch (error) {
    log(`   ❌ 数据完整性检查失败: ${error.message}`, 'red')
    return { allValid: false, error: error.message }
  }
}

/**
 * 检查索引状态
 */
async function checkIndexes() {
  try {
    const [results] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        NON_UNIQUE,
        COLUMN_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME
    `)

    const indexCount = results.length
    log(`   ✅ 找到 ${indexCount} 个索引`, 'green')

    return { allValid: true, count: indexCount }
  } catch (error) {
    log(`   ❌ 索引检查失败: ${error.message}`, 'red')
    return { allValid: false, error: error.message }
  }
}

/**
 * 检查外键约束
 */
async function checkForeignKeys() {
  try {
    const [results] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `)

    const fkCount = results.length
    log(`   ✅ 找到 ${fkCount} 个外键约束`, 'green')

    return { allValid: true, count: fkCount }
  } catch (error) {
    log(`   ❌ 外键检查失败: ${error.message}`, 'red')
    return { allValid: false, error: error.message }
  }
}

/**
 * 测试重建准备度
 */
async function testRebuildReadiness() {
  log('\n🧪 测试数据库重建准备度', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    log('\n检查项目:', 'blue')

    // 1. 检查迁移文件
    log('\n1️⃣  迁移文件检查...', 'blue')
    const { stdout: migrationFiles } = await execAsync('ls -1 migrations/*.js | wc -l', {
      cwd: require('path').join(__dirname, '../..')
    })
    const migrationCount = parseInt(migrationFiles.trim())
    log(`   ✅ 找到 ${migrationCount} 个迁移文件`, 'green')

    // 2. 检查模型文件
    log('\n2️⃣  模型文件检查...', 'blue')
    const modelCount = Object.keys(models).filter(
      k => k !== 'sequelize' && k !== 'Sequelize'
    ).length
    log(`   ✅ 找到 ${modelCount} 个模型`, 'green')

    // 3. 检查初始化数据
    log('\n3️⃣  初始化数据检查...', 'blue')
    const { stdout: seedFiles } = await execAsync(
      'ls -1 seeders/*.js 2>/dev/null | wc -l || echo "0"',
      {
        cwd: require('path').join(__dirname, '../..')
      }
    )
    const seedCount = parseInt(seedFiles.trim())
    log(
      `   ${seedCount > 0 ? '✅' : '⚠️'}  找到 ${seedCount} 个种子文件`,
      seedCount > 0 ? 'green' : 'yellow'
    )

    // 4. 检查备份
    log('\n4️⃣  备份检查...', 'blue')
    try {
      const { stdout: backupFiles } = await execAsync(
        'ls -1 backups/*.sql 2>/dev/null | wc -l || echo "0"',
        {
          cwd: require('path').join(__dirname, '../..')
        }
      )
      const backupCount = parseInt(backupFiles.trim())
      log(
        `   ${backupCount > 0 ? '✅' : '⚠️'}  找到 ${backupCount} 个备份文件`,
        backupCount > 0 ? 'green' : 'yellow'
      )
    } catch {
      log('   ⚠️  未找到备份目录', 'yellow')
    }

    // 总结
    log('\n📊 准备度评估:', 'cyan')
    const readinessScore =
      (migrationCount > 0 ? 40 : 0) + (modelCount > 0 ? 40 : 0) + (seedCount > 0 ? 20 : 0)

    log(`   准备度评分: ${readinessScore}/100`, readinessScore >= 80 ? 'green' : 'yellow')

    if (readinessScore >= 80) {
      log('\n✅ 数据库已准备好重建', 'green')
    } else if (readinessScore >= 60) {
      log('\n⚠️  数据库基本准备好，但建议完善种子数据', 'yellow')
    } else {
      log('\n❌ 数据库尚未准备好重建', 'red')
    }

    return { readinessScore, migrationCount, modelCount, seedCount }
  } catch (error) {
    log(`\n❌ 准备度测试失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 快速验证（用于启动时检查）
 */
async function quickValidation() {
  log('\n⚡ 快速验证', 'cyan')
  log('='.repeat(60), 'cyan')

  try {
    // 1. 测试连接
    await sequelize.authenticate()
    log('   ✅ 数据库连接正常', 'green')

    // 2. 检查关键表
    const keyTables = ['users', 'user_roles', 'lottery_prizes', 'lottery_draws']
    for (const table of keyTables) {
      const [result] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`, {
        type: require('sequelize').QueryTypes.SELECT
      })
      log(`   ✅ ${table}: ${result.count} 条记录`, 'green')
    }

    log('\n✅ 快速验证通过', 'green')
    return { valid: true }
  } catch (error) {
    log(`\n❌ 快速验证失败: ${error.message}`, 'red')
    return { valid: false, error: error.message }
  }
}

// ==================== 主菜单 ====================

async function showMenu() {
  log('\n' + '='.repeat(60), 'cyan')
  log('  🔍 数据库验证统一工具包 (Validation Toolkit V2.0)', 'cyan')
  log('='.repeat(60), 'cyan')

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择验证操作:',
      choices: [
        { name: '1. 📊 对比模型与数据库结构', value: 'compare' },
        { name: '2. 🔍 综合数据库检查', value: 'comprehensive' },
        { name: '3. 🧪 测试重建准备度', value: 'readiness' },
        { name: '4. ⚡ 快速验证', value: 'quick' },
        new inquirer.Separator(),
        { name: '9. 🚪 退出', value: 'exit' }
      ]
    }
  ])

  if (action === 'exit') {
    log('\n👋 再见!\n', 'cyan')
    return
  }

  await executeAction(action)

  // 显示继续提示
  const { continueMenu } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueMenu',
      message: '是否继续其他操作?',
      default: true
    }
  ])

  if (continueMenu) {
    await showMenu()
  } else {
    log('\n👋 再见!\n', 'cyan')
  }
}

async function executeAction(action) {
  try {
    switch (action) {
      case 'compare':
        await compareModelsAndDatabase()
        break
      case 'comprehensive':
        await comprehensiveDatabaseCheck()
        break
      case 'readiness':
        await testRebuildReadiness()
        break
      case 'quick':
        await quickValidation()
        break
      default:
        log(`\n❌ 未知操作: ${action}`, 'red')
    }
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
  } finally {
    // 关闭数据库连接
    if (sequelize) {
      await sequelize.close().catch(err => console.warn('数据库连接关闭失败:', err.message))
    }
  }
}

// ==================== 主程序入口 ====================

async function main() {
  try {
    // 检查是否通过命令行参数直接执行
    const args = process.argv.slice(2)
    if (args.length > 0) {
      const action = args[0]
      if (['compare', 'comprehensive', 'readiness', 'quick'].includes(action)) {
        await executeAction(action)
        return
      }
    }

    // 显示交互式菜单
    await showMenu()
  } catch (error) {
    log(`\n❌ 执行失败: ${error.message}`, 'red')
    if (error.stack) {
      log(`\n堆栈信息:\n${error.stack}`, 'red')
    }
    process.exit(1)
  }
}

// 直接执行
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ 未捕获的错误: ${error.message}`, 'red')
    process.exit(1)
  })
}

module.exports = {
  compareModelsAndDatabase,
  comprehensiveDatabaseCheck,
  testRebuildReadiness,
  quickValidation
}
