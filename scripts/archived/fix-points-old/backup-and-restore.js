/**
 * 备份和回滚工具
 *
 * 功能：
 * - 备份积分相关表的数据
 * - 如果修复失败，可以恢复
 *
 * 使用方法：
 *   # 备份数据
 *   cd /home/devbox/project
 *   node scripts/fix-points/backup-and-restore.js backup
 *
 *   # 恢复数据（谨慎使用）
 *   node scripts/fix-points/backup-and-restore.js restore backup-2025-10-10T12-00-00.json
 */

const { sequelize } = require('../../config/database')
const fs = require('fs')
const path = require('path')

/**
 * 备份积分数据
 */
async function backup () {
  console.log('💾 开始备份数据...\n')

  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    const backupFile = path.join(__dirname, `backup-${timestamp}.json`)

    // 备份积分账户表
    console.log('备份积分账户表...')
    const [accounts] = await sequelize.query('SELECT * FROM user_points_accounts')
    console.log(`  ✅ 备份 ${accounts.length} 条账户记录`)

    // 备份积分交易表
    console.log('备份积分交易表...')
    const [transactions] = await sequelize.query('SELECT * FROM points_transactions')
    console.log(`  ✅ 备份 ${transactions.length} 条交易记录`)

    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tables: {
        user_points_accounts: accounts,
        points_transactions: transactions
      },
      stats: {
        accounts_count: accounts.length,
        transactions_count: transactions.length
      }
    }

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2))

    console.log('\n✅ 备份完成！')
    console.log(`   文件: ${backupFile}`)
    console.log(`   账户: ${accounts.length}条`)
    console.log(`   交易: ${transactions.length}条`)
    console.log(`   大小: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB\n`)

    return backupFile
  } catch (error) {
    console.error('❌ 备份失败:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

/**
 * 恢复积分数据
 * @param {string} backupFile - 备份文件路径
 */
async function restore (backupFile) {
  console.log('🔄 开始恢复数据...\n')

  // 二次确认
  console.log('⚠️  警告：恢复数据将覆盖当前所有积分数据！')
  console.log('   这是一个危险操作，请确保您知道自己在做什么。')
  console.log('')

  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const confirmed = await new Promise(resolve => {
    rl.question('确认恢复数据？输入 "YES" 继续: ', answer => {
      rl.close()
      resolve(answer === 'YES')
    })
  })

  if (!confirmed) {
    console.log('❌ 用户取消操作')
    process.exit(0)
  }

  try {
    // 读取备份文件
    const backupPath = path.join(__dirname, backupFile)

    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份文件不存在: ${backupPath}`)
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'))

    console.log(`\n读取备份文件: ${backupFile}`)
    console.log(`备份时间: ${backupData.timestamp}`)
    console.log(`账户数: ${backupData.stats.accounts_count}`)
    console.log(`交易数: ${backupData.stats.transactions_count}\n`)

    const transaction = await sequelize.transaction()

    try {
      // 清空现有数据
      console.log('清空现有数据...')
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })
      await sequelize.query('TRUNCATE TABLE points_transactions', { transaction })
      await sequelize.query('TRUNCATE TABLE user_points_accounts', { transaction })
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })
      console.log('  ✅ 清空完成')

      // 恢复积分账户
      console.log('恢复积分账户...')
      for (const account of backupData.tables.user_points_accounts) {
        const columns = Object.keys(account).join(', ')
        const values = Object.values(account).map(v =>
          v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v
        ).join(', ')

        await sequelize.query(
          `INSERT INTO user_points_accounts (${columns}) VALUES (${values})`,
          { transaction }
        )
      }
      console.log(`  ✅ 恢复 ${backupData.tables.user_points_accounts.length} 条账户记录`)

      // 恢复积分交易
      console.log('恢复积分交易...')
      for (const trans of backupData.tables.points_transactions) {
        const columns = Object.keys(trans).join(', ')
        const values = Object.values(trans).map(v =>
          v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v
        ).join(', ')

        await sequelize.query(
          `INSERT INTO points_transactions (${columns}) VALUES (${values})`,
          { transaction }
        )
      }
      console.log(`  ✅ 恢复 ${backupData.tables.points_transactions.length} 条交易记录`)

      await transaction.commit()

      console.log('\n✅ 数据恢复完成！')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('❌ 恢复失败:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 主程序入口
const command = process.argv[2]
const arg = process.argv[3]

if (command === 'backup') {
  backup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
} else if (command === 'restore') {
  if (!arg) {
    console.error('❌ 请指定备份文件名')
    console.error('   用法: node backup-and-restore.js restore backup-2025-10-10T12-00-00.json')
    process.exit(1)
  }
  restore(arg)
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
} else {
  console.log('用法：')
  console.log('  备份: node backup-and-restore.js backup')
  console.log('  恢复: node backup-and-restore.js restore <备份文件名>')
  process.exit(0)
}
