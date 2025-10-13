/**
 * 验证备份文件完整性
 */

const { Sequelize } = require('sequelize')
const fs = require('fs')
require('dotenv').config()

const sequelize = new Sequelize(
  process.env.DB_NAME || process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false
  }
)

async function verifyBackup () {
  const sqlFile = fs.readFileSync('/tmp/backup_sql_path.txt', 'utf8').trim()
  const jsonFile = fs.readFileSync('/tmp/backup_json_path.txt', 'utf8').trim()

  console.log('🔍 验证备份完整性...\n')
  console.log(`📁 SQL备份: ${sqlFile.split('/').pop()}`)
  console.log(`📁 JSON备份: ${jsonFile.split('/').pop()}\n`)

  const results = {
    sql: { valid: true, issues: [] },
    json: { valid: true, issues: [] },
    comparison: { match: true, differences: [] }
  }

  try {
    // 1. 验证SQL备份
    console.log('📊 验证SQL备份...')

    // 检查文件存在
    if (!fs.existsSync(sqlFile)) {
      results.sql.valid = false
      results.sql.issues.push('文件不存在')
      console.log('   ❌ 文件不存在')
    } else {
      const sqlStat = fs.statSync(sqlFile)
      console.log(`   ✓ 文件大小: ${(sqlStat.size / 1024).toFixed(2)} KB`)

      // 检查文件大小
      if (sqlStat.size < 10000) {
        results.sql.valid = false
        results.sql.issues.push('文件太小，可能不完整')
        console.log('   ❌ 文件太小 (< 10KB)')
      }

      // 检查SQL内容
      const sqlContent = fs.readFileSync(sqlFile, 'utf8')

      const createTableCount = (sqlContent.match(/CREATE TABLE/gi) || []).length
      const insertCount = (sqlContent.match(/INSERT INTO/gi) || []).length

      console.log(`   ✓ CREATE TABLE语句: ${createTableCount} 个`)
      console.log(`   ✓ INSERT INTO语句: ${insertCount} 个`)

      // 验证关键表
      const keyTables = ['lottery_campaigns', 'lottery_prizes', 'users', 'roles']
      keyTables.forEach(table => {
        if (!sqlContent.includes(`CREATE TABLE \`${table}\``)) {
          results.sql.valid = false
          results.sql.issues.push(`缺少表: ${table}`)
          console.log(`   ❌ 缺少表: ${table}`)
        } else {
          console.log(`   ✓ 包含表: ${table}`)
        }
      })

      // 验证BASIC_LOTTERY活动
      if (!sqlContent.includes('BASIC_LOTTERY')) {
        results.sql.valid = false
        results.sql.issues.push('缺少BASIC_LOTTERY活动数据')
        console.log('   ❌ 缺少BASIC_LOTTERY活动')
      } else {
        console.log('   ✓ 包含BASIC_LOTTERY活动')
      }
    }

    // 2. 验证JSON备份
    console.log('\n📊 验证JSON备份...')

    if (!fs.existsSync(jsonFile)) {
      results.json.valid = false
      results.json.issues.push('文件不存在')
      console.log('   ❌ 文件不存在')
    } else {
      const jsonStat = fs.statSync(jsonFile)
      console.log(`   ✓ 文件大小: ${(jsonStat.size / 1024).toFixed(2)} KB`)

      // 解析JSON
      try {
        const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))

        console.log('   ✓ JSON格式正确')
        console.log(`   ✓ 时间戳: ${jsonData.timestamp}`)
        console.log(`   ✓ 数据库: ${jsonData.database}`)
        console.log(`   ✓ 表数量: ${Object.keys(jsonData.tables).length}`)
        console.log(`   ✓ 总记录数: ${Object.values(jsonData.statistics).reduce((sum, c) => sum + c, 0)}`)

        // 验证关键表数据
        const keyTables = ['lottery_campaigns', 'lottery_prizes', 'users', 'roles']
        keyTables.forEach(table => {
          if (!jsonData.tables[table]) {
            results.json.valid = false
            results.json.issues.push(`缺少表: ${table}`)
            console.log(`   ❌ 缺少表: ${table}`)
          } else {
            console.log(`   ✓ ${table}: ${jsonData.tables[table].length} 条记录`)
          }
        })

        // 验证BASIC_LOTTERY
        const campaigns = jsonData.tables.lottery_campaigns || []
        const hasBasicLottery = campaigns.some(c => c.campaign_code === 'BASIC_LOTTERY')
        if (!hasBasicLottery) {
          results.json.valid = false
          results.json.issues.push('缺少BASIC_LOTTERY活动')
          console.log('   ❌ 缺少BASIC_LOTTERY活动')
        } else {
          console.log('   ✓ 包含BASIC_LOTTERY活动')
        }
      } catch (e) {
        results.json.valid = false
        results.json.issues.push(`JSON解析失败: ${e.message}`)
        console.log(`   ❌ JSON解析失败: ${e.message}`)
      }
    }

    // 3. 对比备份与当前数据库
    console.log('\n📊 对比备份与当前数据库...')

    const [currentTables] = await sequelize.query('SHOW TABLES')
    const currentTableNames = currentTables.map(t => Object.values(t)[0])

    const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
    const backupTableNames = Object.keys(jsonData.tables)

    console.log(`   当前数据库: ${currentTableNames.length} 个表`)
    console.log(`   备份文件: ${backupTableNames.length} 个表`)

    // 检查表数量是否一致
    if (currentTableNames.length !== backupTableNames.length) {
      results.comparison.match = false
      results.comparison.differences.push('表数量不一致')
      console.log('   ⚠️ 表数量不一致')
    } else {
      console.log('   ✓ 表数量一致')
    }

    // 检查每个表的数据量
    for (const tableName of currentTableNames) {
      const [currentCount] = await sequelize.query(`SELECT COUNT(*) as count FROM \`${tableName}\``)
      const currentRows = currentCount[0].count
      const backupRows = jsonData.statistics[tableName] || 0

      if (currentRows !== backupRows) {
        results.comparison.match = false
        results.comparison.differences.push(`${tableName}: 当前${currentRows}条 vs 备份${backupRows}条`)
        console.log(`   ⚠️ ${tableName}: 当前${currentRows}条 ≠ 备份${backupRows}条`)
      } else if (currentRows > 0) {
        console.log(`   ✓ ${tableName}: ${currentRows} 条记录匹配`)
      }
    }

    // 4. 验证关键数据
    console.log('\n📊 验证关键数据...')

    // 验证BASIC_LOTTERY活动
    const [campaigns] = await sequelize.query('SELECT campaign_id, campaign_code FROM lottery_campaigns WHERE campaign_code = "BASIC_LOTTERY"')
    if (campaigns.length === 0) {
      results.comparison.match = false
      results.comparison.differences.push('当前数据库缺少BASIC_LOTTERY活动')
      console.log('   ❌ 当前数据库缺少BASIC_LOTTERY活动')
    } else {
      const backupCampaigns = jsonData.tables.lottery_campaigns.filter(c => c.campaign_code === 'BASIC_LOTTERY')
      if (backupCampaigns.length > 0 && backupCampaigns[0].campaign_id === campaigns[0].campaign_id) {
        console.log(`   ✓ BASIC_LOTTERY活动匹配 (campaign_id=${campaigns[0].campaign_id})`)
      } else {
        console.log('   ⚠️ BASIC_LOTTERY活动ID不一致')
      }
    }

    // 验证奖品关联
    const [prizes] = await sequelize.query('SELECT COUNT(*) as count FROM lottery_prizes WHERE campaign_id = (SELECT campaign_id FROM lottery_campaigns WHERE campaign_code = "BASIC_LOTTERY")')
    const prizeCount = prizes[0].count
    console.log(`   ✓ BASIC_LOTTERY奖品: ${prizeCount} 个`)

    // 5. 总结
    console.log('\n' + '='.repeat(60))
    console.log('📊 验证结果总结\n')

    console.log(`SQL备份: ${results.sql.valid ? '✅ 有效' : '❌ 无效'}`)
    if (results.sql.issues.length > 0) {
      results.sql.issues.forEach(issue => console.log(`   - ${issue}`))
    }

    console.log(`\nJSON备份: ${results.json.valid ? '✅ 有效' : '❌ 无效'}`)
    if (results.json.issues.length > 0) {
      results.json.issues.forEach(issue => console.log(`   - ${issue}`))
    }

    console.log(`\n数据一致性: ${results.comparison.match ? '✅ 完全匹配' : '⚠️ 存在差异'}`)
    if (results.comparison.differences.length > 0) {
      results.comparison.differences.forEach(diff => console.log(`   - ${diff}`))
    }

    const overallValid = results.sql.valid && results.json.valid && results.comparison.match
    console.log(`\n${overallValid ? '✅ 备份验证通过！' : '⚠️ 备份验证存在问题'}`)
    console.log('='.repeat(60))

    // 保存验证结果
    fs.writeFileSync('/tmp/backup_verification.json', JSON.stringify(results, null, 2))

    return results
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
  }
}

verifyBackup()
