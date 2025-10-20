/**
 * 从备份恢复user_roles表数据
 *
 * 问题：数据库迁移后user_roles表数据丢失
 * 解决：从 backups/data_backup_2025-10-13T15-29-37.json 恢复
 *
 * 创建时间：2025年10月13日
 */

const fs = require('fs')
const { sequelize } = require('../../models')

async function restoreUserRoles () {
  console.log('========================================')
  console.log('📦 从备份恢复user_roles数据')
  console.log('========================================\n')

  try {
    // 1. 读取备份文件
    console.log('📋 步骤1: 读取备份文件...')
    const backupPath = './backups/data_backup_2025-10-13T15-29-37.json'
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))

    const userRolesBackup = backup.tables.user_roles
    console.log(`  ✅ 找到 ${userRolesBackup.length} 条user_roles备份记录`)
    console.log('')

    // 2. 清空当前数据（如果有）
    console.log('📋 步骤2: 检查当前数据...')
    const [currentData] = await sequelize.query('SELECT COUNT(*) as count FROM user_roles')
    console.log(`  当前记录数: ${currentData[0].count}`)

    if (currentData[0].count > 0) {
      console.log('  ⚠️ 表中已有数据，将清空后恢复')
      await sequelize.query('DELETE FROM user_roles')
      console.log('  ✅ 已清空')
    }
    console.log('')

    // 3. 恢复数据
    console.log('📋 步骤3: 恢复备份数据...')

    for (const record of userRolesBackup) {
      try {
        await sequelize.query(`
          INSERT INTO user_roles 
          (user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at)
          VALUES 
          (?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            record.user_id,
            record.role_id,
            record.assigned_at,
            record.assigned_by,
            record.is_active,
            record.created_at,
            record.updated_at
          ]
        })

        // 获取角色名
        const [roleInfo] = await sequelize.query(
          'SELECT role_name FROM roles WHERE role_id = ?',
          { replacements: [record.role_id] }
        )
        const roleName = roleInfo[0]?.role_name || '未知'

        console.log(`  ✅ 恢复: 用户${record.user_id} → ${roleName} (is_active: ${record.is_active})`)
      } catch (error) {
        if (error.message.includes('Duplicate entry')) {
          console.log(`  ⚠️ 跳过: 用户${record.user_id}角色${record.role_id}已存在`)
        } else {
          throw error
        }
      }
    }
    console.log('')

    // 4. 验证恢复结果
    console.log('📋 步骤4: 验证恢复结果...')
    const [afterData] = await sequelize.query('SELECT COUNT(*) as count FROM user_roles')
    console.log(`  恢复后记录数: ${afterData[0].count}`)

    // 特别检查测试用户31
    const [user31Roles] = await sequelize.query(`
      SELECT ur.*, r.role_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = 31
    `)

    console.log('')
    console.log('📋 重点验证 - 用户31 (13612227930) 的角色:')
    if (user31Roles.length > 0) {
      user31Roles.forEach(role => {
        console.log(`  ✅ ${role.role_name} (is_active: ${role.is_active})`)
      })

      const hasAdmin = user31Roles.some(r => r.role_name === 'admin' && r.is_active)
      if (hasAdmin) {
        console.log('  🎉 用户31现在有admin权限，可以参与抽奖了！')
      }
    } else {
      console.log('  ❌ 用户31仍然没有角色')
    }
    console.log('')

    console.log('========================================')
    console.log('✅ user_roles数据恢复完成！')
    console.log('========================================')
    console.log('')
    console.log('📊 恢复摘要:')
    console.log(`  - 备份记录数: ${userRolesBackup.length}`)
    console.log(`  - 恢复记录数: ${afterData[0].count}`)
    console.log(`  - 恢复成功率: ${(afterData[0].count / userRolesBackup.length * 100).toFixed(1)}%`)
    console.log('')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 恢复失败:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行恢复
restoreUserRoles()
