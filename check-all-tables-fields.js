require('dotenv').config()
const { sequelize } = require('./models')
const fs = require('fs')

async function checkAllTablesFields () {
  try {
    console.log('🔍 全面检查所有表字段与模型定义的匹配情况...\n')

    const issues = []

    // 获取所有模型文件
    const modelFiles = fs.readdirSync('./models')
      .filter(f => f.endsWith('.js') && f !== 'index.js')

    for (const file of modelFiles) {
      const modelName = file.replace('.js', '')
      const content = fs.readFileSync(`./models/${file}`, 'utf8')

      // 提取tableName
      const tableNameMatch = content.match(/tableName:\s*['"]([^'"]+)['"]/)
      if (!tableNameMatch) continue

      const tableName = tableNameMatch[1]

      console.log(`\n📋 检查表: ${tableName} (模型: ${modelName})`)
      console.log('='.repeat(80))

      try {
        // 获取数据库表字段
        const [dbColumns] = await sequelize.query(`DESCRIBE ${tableName}`)
        const dbFieldNames = dbColumns.map(c => c.Field)

        // 从模型中提取字段定义
        const fieldMatches = content.match(/(\w+):\s*{[^}]*type:\s*DataTypes\./g)
        const modelFields = fieldMatches
          ? fieldMatches.map(match => {
            return match.match(/(\w+):/)[1]
          })
          : []

        // 添加timestamps字段
        if (content.includes('timestamps: true')) {
          const createdAtMatch = content.match(/created_at:\s*['"]([^'"]+)['"]/)
          const updatedAtMatch = content.match(/updated_at:\s*['"]([^'"]+)['"]/)

          if (!modelFields.includes('created_at') && !modelFields.includes('createdAt')) {
            modelFields.push(createdAtMatch ? createdAtMatch[1] : 'created_at')
          }
          if (!modelFields.includes('updated_at') && !modelFields.includes('updatedAt')) {
            modelFields.push(updatedAtMatch ? updatedAtMatch[1] : 'updated_at')
          }
        }

        // 对比字段
        const missingInDb = modelFields.filter(f => !dbFieldNames.includes(f))
        const extraInDb = dbFieldNames.filter(f => !modelFields.includes(f) && f !== 'createdAt' && f !== 'updatedAt')

        if (missingInDb.length === 0 && extraInDb.length === 0) {
          console.log('✅ 字段完全匹配')
        } else {
          if (missingInDb.length > 0) {
            console.log(`❌ 数据库缺失字段 (${missingInDb.length}个):`)
            missingInDb.forEach(f => console.log(`   - ${f}`))
            issues.push({
              table: tableName,
              model: modelName,
              type: 'MISSING_FIELDS',
              fields: missingInDb
            })
          }

          if (extraInDb.length > 0) {
            console.log(`⚠️  数据库额外字段 (${extraInDb.length}个):`)
            extraInDb.forEach(f => console.log(`   - ${f}`))
          }
        }

        // 显示字段详情
        console.log(`\n数据库字段 (${dbFieldNames.length}个):`)
        dbColumns.forEach(col => {
          const inModel = modelFields.includes(col.Field)
          console.log(`  ${inModel ? '✅' : '⚠️ '} ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`)
        })
      } catch (error) {
        console.log(`❌ 检查失败: ${error.message}`)
      }
    }

    // 生成报告
    console.log('\n\n' + '='.repeat(80))
    console.log('📊 全面检查报告')
    console.log('='.repeat(80))

    if (issues.length === 0) {
      console.log('✅ 所有表的字段都与模型定义完全匹配！')
    } else {
      console.log(`⚠️  发现 ${issues.length} 个表存在字段不匹配问题:\n`)

      issues.forEach((issue, index) => {
        console.log(`${index + 1}. 表: ${issue.table} (模型: ${issue.model})`)
        console.log(`   问题类型: ${issue.type}`)
        console.log(`   缺失字段: ${issue.fields.join(', ')}`)
      })

      console.log('\n💡 建议创建数据库迁移文件修复这些问题')
    }

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error)
    process.exit(1)
  }
}

checkAllTablesFields()

