#!/usr/bin/env node

/**
 * 数据库迁移文件创建工具
 *
 * 用途：强制规范，防止手动创建不规范的迁移文件
 * 执行：npm run migration:create
 *
 * 创建时间：2025年10月12日
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// ==================== 配置 ====================

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')
const VERSION_FILE = path.join(MIGRATIONS_DIR, 'VERSION.js')

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

// ==================== 迁移模板 ====================

const MIGRATION_TEMPLATES = {
  'create-table': (data) => `/**
 * 创建表: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('${data.target}', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },
      // TODO: 添加其他字段
      
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    })
    
    // TODO: 添加索引（如需要）
    // await queryInterface.addIndex('${data.target}', ['column_name'], {
    //   name: 'idx_${data.target}_column_name'
    // })
    
    console.log('✅ 表 ${data.target} 创建成功')
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('${data.target}')
    console.log('✅ 表 ${data.target} 已删除')
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

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = '${data.tableName}'
    const columnName = '${data.columnName}'
    
    await queryInterface.addColumn(tableName, columnName, {
      type: Sequelize.STRING(100),  // TODO: 修改类型
      allowNull: true,              // TODO: 修改是否允许null
      defaultValue: null,           // TODO: 设置默认值
      comment: '${data.columnName}字段'  // TODO: 修改注释
    })
    
    // TODO: 如需添加索引
    // await queryInterface.addIndex(tableName, [columnName], {
    //   name: \`idx_\${tableName}_\${columnName}\`
    // })
    
    console.log(\`✅ 列 \${columnName} 已添加到表 \${tableName}\`)
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('${data.tableName}', '${data.columnName}')
    console.log('✅ 列 ${data.columnName} 已删除')
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

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = '${data.tableName}'
    const columnName = '${data.columnName}'
    const indexName = 'idx_' + tableName + '_' + columnName.replace(/_/g, '_')
    
    await queryInterface.addIndex(tableName, [columnName], {
      name: indexName,
      // type: 'UNIQUE',  // 如果是唯一索引，取消注释
    })
    
    console.log(\`✅ 索引 \${indexName} 已创建\`)
  },
  
  down: async (queryInterface, Sequelize) => {
    const tableName = '${data.tableName}'
    const columnName = '${data.columnName}'
    const indexName = 'idx_' + tableName + '_' + columnName.replace(/_/g, '_')
    
    await queryInterface.removeIndex(tableName, indexName)
    console.log(\`✅ 索引 \${indexName} 已删除\`)
  }
}
`,

  'migrate-data': (data) => `/**
 * 数据迁移: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      // TODO: 执行数据迁移
      // 示例：更新现有数据
      await queryInterface.sequelize.query(
        'UPDATE table_name SET column = ? WHERE condition = ?',
        {
          replacements: ['new_value', 'condition_value'],
          type: Sequelize.QueryTypes.UPDATE,
          transaction
        }
      )
      
      await transaction.commit()
      console.log('✅ 数据迁移完成: ${data.target}')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据迁移失败:', error.message)
      throw error
    }
  },
  
  down: async (queryInterface, Sequelize) => {
    console.warn('⚠️ 数据迁移的回滚需要谨慎处理')
    // TODO: 实现回滚逻辑（如果可行）
    throw new Error('数据迁移回滚未实现，请手动处理')
  }
}
`,

  default: (data) => `/**
 * ${data.actionDesc}: ${data.target}
 * 
 * 创建时间: ${data.timestamp}
 * 创建原因: ${data.reason}
 * 作者: ${data.author || 'Unknown'}
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // TODO: 实现迁移逻辑
    console.log('✅ 迁移完成: ${data.target}')
  },
  
  down: async (queryInterface, Sequelize) => {
    // TODO: 实现回滚逻辑
    console.log('✅ 回滚完成: ${data.target}')
  }
}
`
}

// ==================== 工具函数 ====================

function question (rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

function validateTarget (target) {
  if (!target || target.length === 0) {
    return { valid: false, error: '目标名称不能为空' }
  }

  if (!/^[a-z][a-z0-9-]*$/.test(target)) {
    return {
      valid: false,
      error: '目标名称必须：\n      - 小写字母开头\n      - 只能包含小写字母、数字和连字符\n      - 示例: users, user-vip-level, lottery-campaigns'
    }
  }

  if (target.length > 50) {
    return { valid: false, error: '目标名称过长（最多50字符）' }
  }

  return { valid: true }
}

function parseTarget (target, actionKey) {
  // 对于add-column, create-index等需要表名和字段名的操作
  if (['add-column', 'alter-column', 'drop-column', 'rename-column', 'create-index', 'alter-index', 'drop-index'].includes(actionKey)) {
    const parts = target.split('-')
    if (parts.length < 2) {
      return {
        tableName: target,
        columnName: 'column_name',
        warning: '⚠️ 建议格式: tablename-columnname (如: users-vip-level)'
      }
    }
    return {
      tableName: parts[0],
      columnName: parts.slice(1).join('_')
    }
  }

  return { tableName: target }
}

function generateTimestamp () {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hour}${minute}${second}`
}

function updateVersionFile (fileName, _action, _reason) {
  try {
    if (!fs.existsSync(VERSION_FILE)) {
      console.warn('⚠️ VERSION.js 文件不存在，跳过更新')
      return
    }

    // 读取VERSION.js文件内容（作为字符串）
    let versionContent = fs.readFileSync(VERSION_FILE, 'utf8')

    // 更新lastMigration
    versionContent = versionContent.replace(
      /lastMigration:\s*['"][^'"]*['"]/,
      `lastMigration: '${fileName}'`
    )

    // 更新lastUpdated
    const now = new Date()
    const timestamp = now.toISOString().replace('T', ' ').split('.')[0]
    versionContent = versionContent.replace(
      /lastUpdated:\s*['"][^'"]*['"]/,
      `lastUpdated: '${timestamp}'`
    )

    // 写回文件
    fs.writeFileSync(VERSION_FILE, versionContent)

    console.log('✅ VERSION.js 已自动更新')
  } catch (error) {
    console.warn(`⚠️ VERSION.js 更新失败: ${error.message}`)
  }
}

// ==================== 主函数 ====================

async function createMigration () {
  console.log('\n' + '='.repeat(60))
  console.log('🎯 数据库迁移文件创建工具')
  console.log('='.repeat(60))
  console.log('\n📋 本工具将引导你创建规范的迁移文件\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    // 确保migrations目录存在
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true })
      console.log('✅ 创建 migrations 目录\n')
    }

    // 1. 选择操作类型
    console.log('📌 步骤1: 选择操作类型\n')

    let lastCategory = ''
    Object.entries(ALLOWED_ACTIONS).forEach(([num, action]) => {
      if (action.category !== lastCategory) {
        if (lastCategory !== '') console.log('')
        console.log(`   ${action.category}:`)
        lastCategory = action.category
      }
      console.log(`     ${num.padStart(2)}. ${action.desc.padEnd(15)} (${action.key})`)
    })

    const actionChoice = await question(rl, '\n👉 请选择 (1-15): ')
    const action = ALLOWED_ACTIONS[actionChoice]

    if (!action) {
      throw new Error('❌ 无效的选择，请输入1-15之间的数字')
    }

    console.log(`\n✅ 已选择: ${action.desc} (${action.key})\n`)

    // 2. 输入目标名称
    console.log('📌 步骤2: 输入目标名称\n')
    console.log('   命名规则:')
    console.log('     • 小写字母开头')
    console.log('     • 只能包含: 小写字母、数字、连字符')
    console.log('     • 示例: users, user-vip-level, lottery-campaigns\n')

    const target = (await question(rl, '👉 目标名称: ')).trim().toLowerCase()

    const validation = validateTarget(target)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const parsed = parseTarget(target, action.key)
    if (parsed.warning) {
      console.log(`\n${parsed.warning}`)
    }

    console.log(`\n✅ 目标名称: ${target}\n`)

    // 3. 输入创建原因
    console.log('📌 步骤3: 说明创建原因\n')
    const reason = (await question(rl, '👉 创建原因 (至少5个字符): ')).trim()

    if (!reason || reason.length < 5) {
      throw new Error('❌ 请提供至少5个字符的创建原因')
    }

    console.log(`\n✅ 创建原因: ${reason}\n`)

    // 4. 生成文件名
    const timestamp = generateTimestamp()
    const fileName = `${timestamp}-${action.key}-${target}.js`
    const filePath = path.join(MIGRATIONS_DIR, fileName)

    // 5. 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      throw new Error(`❌ 文件已存在: ${fileName}`)
    }

    // 6. 生成文件内容
    console.log('📌 步骤4: 生成迁移文件\n')

    const templateData = {
      target,
      timestamp: new Date().toISOString(),
      reason,
      author: process.env.USER || process.env.USERNAME,
      actionDesc: action.desc,
      ...parsed
    }

    const templateFunc = MIGRATION_TEMPLATES[action.key] || MIGRATION_TEMPLATES.default
    const content = templateFunc(templateData)

    // 7. 写入文件
    fs.writeFileSync(filePath, content)

    console.log('='.repeat(60))
    console.log('✅ 迁移文件创建成功！')
    console.log('='.repeat(60))
    console.log(`\n📄 文件名: ${fileName}`)
    console.log(`📂 路径: ${filePath}\n`)

    // 8. 更新VERSION.js
    updateVersionFile(fileName, action, reason)

    // 9. 提示下一步
    console.log('\n📋 下一步操作:\n')
    console.log(`   1️⃣  编辑文件: ${fileName}`)
    console.log('   2️⃣  完善迁移逻辑（标记为TODO的部分）')
    console.log('   3️⃣  执行迁移: npm run migration:up')
    console.log('   4️⃣  验证结果: 检查数据库变更')
    console.log('   5️⃣  测试回滚: npm run migration:down\n')

    console.log('💡 提示: 迁移文件已经包含基础模板，请根据实际需求修改\n')
  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}\n`)
    process.exit(1)
  } finally {
    rl.close()
  }
}

// ==================== 执行 ====================

if (require.main === module) {
  createMigration()
}

module.exports = { createMigration }
