/**
 * 数据库备份脚本
 * 用于新需求实施前的数据安全保障
 */

const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

// 数据库配置
const DB_CONFIG = {
  host: 'dbconn.sealosbja.site',
  port: 42182,
  username: 'root',
  password: 'mc6r9cgb',
  database: 'restaurant_points_dev'
}

/**
 * 创建数据库备份
 */
async function createBackup () {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(__dirname, '../backups')
    const backupFile = path.join(backupDir, `backup_${timestamp}.sql`)

    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
      console.log('✅ 创建备份目录:', backupDir)
    }

    console.log('🔄 开始数据库备份...')
    console.log('📁 备份文件:', backupFile)

    // 构建mysqldump命令
    const command = `mysqldump -h ${DB_CONFIG.host} -P ${DB_CONFIG.port} -u ${DB_CONFIG.username} -p${DB_CONFIG.password} --single-transaction --routines --triggers ${DB_CONFIG.database} > "${backupFile}"`

    // 执行备份
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ 备份失败:', error.message)
          reject(error)
          return
        }

        if (stderr) {
          console.warn('⚠️ 备份警告:', stderr)
        }

        resolve(stdout)
      })
    })

    // 验证备份文件
    const stats = fs.statSync(backupFile)
    if (stats.size === 0) {
      throw new Error('备份文件为空')
    }

    console.log('✅ 数据库备份完成!')
    console.log('📊 备份文件大小:', (stats.size / 1024 / 1024).toFixed(2), 'MB')
    console.log('📁 备份文件路径:', backupFile)

    return backupFile
  } catch (error) {
    console.error('❌ 备份过程出错:', error.message)
    throw error
  }
}

/**
 * 清理旧备份文件（保留最近10个）
 */
function cleanOldBackups () {
  try {
    const backupDir = path.join(__dirname, '../backups')
    if (!fs.existsSync(backupDir)) {
      return
    }

    const files = fs
      .readdirSync(backupDir)
      .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        mtime: fs.statSync(path.join(backupDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // 保留最近10个备份，删除其余的
    if (files.length > 10) {
      const filesToDelete = files.slice(10)
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path)
        console.log('🗑️ 删除旧备份:', file.name)
      })
      console.log('✅ 清理完成，保留最近10个备份文件')
    }
  } catch (error) {
    console.error('⚠️ 清理旧备份时出错:', error.message)
  }
}

/**
 * 验证备份文件完整性
 */
async function validateBackup (backupFile) {
  try {
    console.log('🔄 验证备份文件完整性...')

    // 检查文件是否包含关键表结构
    const content = fs.readFileSync(backupFile, 'utf8')
    const requiredTables = ['users', 'products', 'lottery_draws', 'points_records']

    for (const table of requiredTables) {
      if (!content.includes(`CREATE TABLE \`${table}\``)) {
        throw new Error(`备份文件缺少表: ${table}`)
      }
    }

    console.log('✅ 备份文件验证通过')
    return true
  } catch (error) {
    console.error('❌ 备份文件验证失败:', error.message)
    throw error
  }
}

// 主函数
async function main () {
  try {
    console.log('🚀 启动数据库备份流程...')

    // 创建备份
    const backupFile = await createBackup()

    // 验证备份
    await validateBackup(backupFile)

    // 清理旧备份
    cleanOldBackups()

    console.log('🎉 数据库备份流程完成!')
    process.exit(0)
  } catch (error) {
    console.error('💥 备份流程失败:', error.message)
    process.exit(1)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = {
  createBackup,
  validateBackup,
  cleanOldBackups
}
