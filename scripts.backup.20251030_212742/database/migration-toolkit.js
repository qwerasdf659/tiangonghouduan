#!/usr/bin/env node

/**
 * 数据库迁移统一工具包 (Migration Toolkit)
 *
 * 整合来源：
 * - scripts/database/create-migration.js (创建迁移)
 * - scripts/database/verify-migrations.js (验证迁移)
 * - scripts/database/check-migration-sync.sh (检查同步)
 * - scripts/database/validate-migration-integrity.js (验证完整性)
 * - scripts/migration/ 目录所有脚本 (主键迁移等历史功能)
 *
 * 使用方式：
 * node scripts/database/migration-toolkit.js                # 交互式菜单
 * node scripts/database/migration-toolkit.js create         # 直接创建迁移
 * node scripts/database/migration-toolkit.js verify         # 直接验证迁移
 * node scripts/database/migration-toolkit.js sync           # 检查同步状态
 * node scripts/database/migration-toolkit.js status         # 查看迁移状态
 *
 * V2.0 重构版本
 * 创建时间：2025年10月15日 北京时间
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')
const inquirer = require('inquirer')

const execAsync = promisify(exec)

// ==================== 配置 ====================

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')
const _VERSION_FILE = path.join(MIGRATIONS_DIR, 'VERSION.js') // 保留供未来使用

// 允许的操作类型
const ALLOWED_ACTIONS = {
  1: { key: 'create-table', desc: '创建新表', category: '表操作' },
  2: { key: 'alter-table', desc: '修改表结构', category: '表操作' },
  3: { key: 'drop-table', desc: '删除表', category: '表操作' },
  4: { key: 'rename-table', desc: '重命名表', category: '表操作' },
  5: { key: 'add-column', desc: '添加列', category: '列操作' },
  6: { key: 'alter-column', desc: '修改列', category: '列操作' },
  7: { key: 'drop-column', desc: '删除列', category: '列操作' },
  8: { key: 'rename-column', desc: '重命名列', category: '列操作' },
  9: { key: 'create-index', desc: '创建索引', category: '索引操作' },
  10: { key: 'alter-index', desc: '修改索引', category: '索引操作' },
  11: { key: 'drop-index', desc: '删除索引', category: '索引操作' },
  12: { key: 'add-constraint', desc: '添加约束', category: '约束操作' },
  13: { key: 'drop-constraint', desc: '删除约束', category: '约束操作' },
  14: { key: 'migrate-data', desc: '数据迁移', category: '数据操作' },
  15: { key: 'seed-data', desc: '初始化数据', category: '数据操作' }
}

// 验证规则
const VALIDATION_RULES = {
  fileName: {
    pattern: /^\d{14}-[a-z]+-[a-z][a-z0-9.-]*\.js$/,
    message: '文件名必须符合格式: {YYYYMMDD}{HHMMSS}-{action}-{target}.js'
  },
  allowedActions: [
    'create-table', 'alter-table', 'drop-table', 'rename-table',
    'add-column', 'alter-column', 'drop-column', 'rename-column',
    'create-index', 'alter-index', 'drop-index',
    'add-constraint', 'drop-constraint',
    'migrate-data', 'seed-data',
    'baseline'
  ],
  forbiddenActions: ['fix', 'temp', 'test', 'update', 'change', 'modify'],
  timestampRange: { minYear: 2025, maxYear: 2030 }
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 迁移模板 ====================

const MIGRATION_TEMPLATES = {
  'create-table': (data) => `/**
 * 创建表: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('${data.target}', {
      ${data.target}_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '主键ID'
      },
      // TODO: 添加其他字段定义
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间（北京时间）'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间（北京时间）'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '${data.reason}'
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('${data.target}')
  }
}
`,

  'add-column': (data) => `/**
 * 添加列: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('${data.target.split('.')[0]}', '${data.target.split('.')[1] || 'new_column'}', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '${data.reason}'
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('${data.target.split('.')[0]}', '${data.target.split('.')[1] || 'new_column'}')
  }
}
`,

  'alter-column': (data) => `/**
 * 修改列: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('${data.target.split('.')[0]}', '${data.target.split('.')[1] || 'column_name'}', {
      type: Sequelize.STRING(255),
      allowNull: false,
      comment: '${data.reason}'
    })
  },

  down: async (queryInterface, Sequelize) => {
    // TODO: 添加回滚逻辑
    await queryInterface.changeColumn('${data.target.split('.')[0]}', '${data.target.split('.')[1] || 'column_name'}', {
      type: Sequelize.STRING(100),
      allowNull: true
    })
  }
}
`,

  'create-index': (data) => `/**
 * 创建索引: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addIndex('${data.target.split('.')[0]}', ['${data.target.split('.')[1] || 'column_name'}'], {
      name: 'idx_${data.target.split('.')[0]}_${data.target.split('.')[1] || 'column_name'}',
      unique: false
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('${data.target.split('.')[0]}', 'idx_${data.target.split('.')[0]}_${data.target.split('.')[1] || 'column_name'}')
  }
}
`,

  default: (data) => `/**
 * ${ALLOWED_ACTIONS[data.actionType]?.desc || '数据库操作'}: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // TODO: 实现 ${data.action} 操作
  },

  down: async (queryInterface, Sequelize) => {
    // TODO: 实现回滚逻辑
  }
}
`
}

// ==================== 核心功能 ====================

/**
 * 创建新迁移文件
 */
async function createMigration () {
  log('\n📝 创建新迁移文件', 'cyan')
  log('='.repeat(50), 'cyan')

  try {
    // 1. 选择操作类型
    const actionChoices = Object.entries(ALLOWED_ACTIONS).map(([num, action]) => ({
      name: `${num}. [${action.category}] ${action.desc} (${action.key})`,
      value: num
    }))

    const { actionType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'actionType',
        message: '请选择操作类型:',
        choices: actionChoices,
        pageSize: 15
      }
    ])

    const action = ALLOWED_ACTIONS[actionType].key

    // 2. 输入目标对象
    const { target } = await inquirer.prompt([
      {
        type: 'input',
        name: 'target',
        message: '请输入目标对象（表名/列名等）:',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return '目标对象不能为空'
          }
          if (!/^[a-z][a-z0-9_.-]*$/.test(input)) {
            return '目标对象只能包含小写字母、数字、下划线、点和连字符'
          }
          return true
        }
      }
    ])

    // 3. 输入创建原因
    const { reason } = await inquirer.prompt([
      {
        type: 'input',
        name: 'reason',
        message: '请输入创建原因（必填）:',
        validate: (input) => input.trim().length > 0 || '创建原因不能为空'
      }
    ])

    // 4. 生成文件名
    const timestamp = generateTimestamp()
    const fileName = `${timestamp}-${action}-${target}.js`
    const filePath = path.join(MIGRATIONS_DIR, fileName)

    // 5. 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      log(`\n❌ 文件已存在: ${fileName}`, 'red')
      return
    }

    // 6. 生成文件内容
    const template = MIGRATION_TEMPLATES[action] || MIGRATION_TEMPLATES.default
    const content = template({
      action,
      target,
      reason,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      author: process.env.USER || 'Unknown',
      actionType
    })

    // 7. 写入文件
    fs.writeFileSync(filePath, content, 'utf8')

    log('\n✅ 迁移文件创建成功!', 'green')
    log(`📄 文件名: ${fileName}`, 'cyan')
    log(`📁 路径: ${filePath}`, 'cyan')
    log('\n💡 下一步:', 'yellow')
    log(`   1. 编辑文件完善迁移逻辑: ${filePath}`, 'yellow')
    log('   2. 验证迁移: npm run migration:verify', 'yellow')
    log('   3. 执行迁移: npm run migration:up', 'yellow')
  } catch (error) {
    log(`\n❌ 创建迁移失败: ${error.message}`, 'red')
  }
}

/**
 * 验证所有迁移文件
 */
async function verifyMigrations () {
  log('\n🔍 验证迁移文件', 'cyan')
  log('='.repeat(50), 'cyan')

  try {
    // 1. 检查migrations目录
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      log(`\n❌ migrations目录不存在: ${MIGRATIONS_DIR}`, 'red')
      return
    }

    // 2. 读取所有迁移文件
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js') && f !== 'VERSION.js')
      .sort()

    if (files.length === 0) {
      log('\n⚠️  没有找到迁移文件', 'yellow')
      return
    }

    log(`\n📂 找到 ${files.length} 个迁移文件\n`)

    let errorCount = 0
    let warningCount = 0

    // 3. 验证每个文件
    for (const file of files) {
      const errors = []
      const warnings = []

      // 3.1 验证文件名格式
      if (!VALIDATION_RULES.fileName.pattern.test(file)) {
        errors.push('文件名格式不符合规范')
      }

      // 3.2 验证action类型
      const parts = file.replace('.js', '').split('-')
      if (parts.length >= 2) {
        const action = parts[1]

        if (VALIDATION_RULES.forbiddenActions.includes(action)) {
          errors.push(`禁止使用的action类型: ${action}`)
        }

        if (!VALIDATION_RULES.allowedActions.includes(action)) {
          warnings.push(`未知的action类型: ${action}`)
        }
      }

      // 3.3 验证时间戳
      if (parts.length >= 1) {
        const timestamp = parts[0]
        if (timestamp.length === 14) {
          const year = parseInt(timestamp.substring(0, 4))
          if (year < VALIDATION_RULES.timestampRange.minYear ||
              year > VALIDATION_RULES.timestampRange.maxYear) {
            warnings.push(`时间戳年份超出合理范围: ${year}`)
          }
        }
      }

      // 3.4 输出结果
      if (errors.length > 0) {
        log(`❌ ${file}`, 'red')
        errors.forEach(err => log(`   - ${err}`, 'red'))
        errorCount++
      } else if (warnings.length > 0) {
        log(`⚠️  ${file}`, 'yellow')
        warnings.forEach(warn => log(`   - ${warn}`, 'yellow'))
        warningCount++
      } else {
        log(`✅ ${file}`, 'green')
      }
    }

    // 4. 输出总结
    log(`\n${'='.repeat(50)}`)
    log('📊 验证结果:', 'cyan')
    log(`   总文件数: ${files.length}`)
    log(`   错误: ${errorCount}`, errorCount > 0 ? 'red' : 'green')
    log(`   警告: ${warningCount}`, warningCount > 0 ? 'yellow' : 'green')
    log(`   通过: ${files.length - errorCount - warningCount}`, 'green')

    if (errorCount > 0) {
      log('\n❌ 验证失败! 请修复上述错误', 'red')
      process.exit(1)
    } else if (warningCount > 0) {
      log('\n⚠️  验证通过但有警告', 'yellow')
    } else {
      log('\n✅ 所有迁移文件验证通过!', 'green')
    }
  } catch (error) {
    log(`\n❌ 验证失败: ${error.message}`, 'red')
    process.exit(1)
  }
}

/**
 * 检查迁移同步状态
 */
async function checkMigrationSync () {
  log('\n🔄 检查迁移同步状态', 'cyan')
  log('='.repeat(50), 'cyan')

  try {
    // 执行sequelize-cli status命令
    const { stdout } = await execAsync('npx sequelize-cli db:migrate:status', {
      cwd: path.join(__dirname, '../..')
    })

    log('\n' + stdout)

    // 分析输出
    const lines = stdout.split('\n')
    const upMigrations = lines.filter(line => line.includes('up')).length
    const downMigrations = lines.filter(line => line.includes('down')).length

    log('\n📊 同步状态统计:', 'cyan')
    log(`   已执行: ${upMigrations} 个`, 'green')
    log(`   待执行: ${downMigrations} 个`, downMigrations > 0 ? 'yellow' : 'green')

    if (downMigrations > 0) {
      log('\n💡 执行待定迁移: npm run migration:up', 'yellow')
    }
  } catch (error) {
    log(`\n❌ 检查失败: ${error.message}`, 'red')
  }
}

/**
 * 执行迁移（上线）
 */
async function runMigrationUp () {
  log('\n🚀 执行迁移（上线）', 'cyan')
  log('='.repeat(50), 'cyan')

  try {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确定要执行迁移吗？（此操作将修改数据库）',
        default: false
      }
    ])

    if (!confirm) {
      log('\n❌ 取消执行', 'yellow')
      return
    }

    log('\n正在执行迁移...\n')
    const { stdout, stderr } = await execAsync('npx sequelize-cli db:migrate', {
      cwd: path.join(__dirname, '../..')
    })

    log(stdout)
    if (stderr) log(stderr, 'yellow')

    log('\n✅ 迁移执行完成', 'green')
  } catch (error) {
    log(`\n❌ 迁移执行失败: ${error.message}`, 'red')
  }
}

/**
 * 回滚迁移
 */
async function runMigrationDown () {
  log('\n⏪ 回滚迁移', 'cyan')
  log('='.repeat(50), 'cyan')

  try {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '⚠️  确定要回滚最后一个迁移吗？（此操作将修改数据库）',
        default: false
      }
    ])

    if (!confirm) {
      log('\n❌ 取消回滚', 'yellow')
      return
    }

    log('\n正在回滚迁移...\n')
    const { stdout, stderr } = await execAsync('npx sequelize-cli db:migrate:undo', {
      cwd: path.join(__dirname, '../..')
    })

    log(stdout)
    if (stderr) log(stderr, 'yellow')

    log('\n✅ 迁移回滚完成', 'green')
  } catch (error) {
    log(`\n❌ 迁移回滚失败: ${error.message}`, 'red')
  }
}

/**
 * 查看迁移状态
 */
async function checkMigrationStatus () {
  return checkMigrationSync()
}

// ==================== 辅助函数 ====================

/**
 * 生成时间戳 (YYYYMMDDHHMMSS)
 */
function generateTimestamp () {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

// ==================== 主菜单 ====================

async function showMenu () {
  log('\n' + '='.repeat(60), 'cyan')
  log('  🛠️  数据库迁移统一工具包 (Migration Toolkit V2.0)', 'cyan')
  log('='.repeat(60), 'cyan')

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择迁移操作:',
      choices: [
        { name: '1. 📝 创建新迁移文件', value: 'create' },
        { name: '2. 🔍 验证迁移文件完整性', value: 'verify' },
        { name: '3. 🔄 检查迁移同步状态', value: 'sync' },
        { name: '4. 🚀 执行迁移（上线）', value: 'up' },
        { name: '5. ⏪ 回滚迁移', value: 'down' },
        { name: '6. 📊 查看迁移状态', value: 'status' },
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
    await showMenu() // 递归显示菜单
  } else {
    log('\n👋 再见!\n', 'cyan')
  }
}

async function executeAction (action) {
  switch (action) {
  case 'create':
    await createMigration()
    break
  case 'verify':
    await verifyMigrations()
    break
  case 'sync':
    await checkMigrationSync()
    break
  case 'up':
    await runMigrationUp()
    break
  case 'down':
    await runMigrationDown()
    break
  case 'status':
    await checkMigrationStatus()
    break
  default:
    log(`\n❌ 未知操作: ${action}`, 'red')
  }
}

// ==================== 主程序入口 ====================

async function main () {
  try {
    // 检查是否通过命令行参数直接执行
    const args = process.argv.slice(2)
    if (args.length > 0) {
      const action = args[0]
      if (['create', 'verify', 'sync', 'up', 'down', 'status'].includes(action)) {
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
  createMigration,
  verifyMigrations,
  checkMigrationSync,
  runMigrationUp,
  runMigrationDown,
  checkMigrationStatus
}
