/**
 * 角色系统简化脚本
 * 将权限体系简化为只有超级管理员和普通用户两种角色
 * 更新时间：2025年09月29日 UTC时间 - 使用统一数据库连接
 */

require('dotenv').config()
const { getDatabaseHelper } = require('../utils/database')

// 使用统一数据库助手
const dbHelper = getDatabaseHelper()
const sequelize = dbHelper.getSequelize()

async function simplifyRoles () {
  try {
    await sequelize.authenticate()
    console.log('🔄 开始简化角色系统...')

    // 1. 检查现有角色
    const [existingRoles] = await sequelize.query('SELECT * FROM roles')
    console.log(
      '现有角色:',
      existingRoles.map(r => r.role_name)
    )

    // 2. 删除不需要的角色（除了admin和user）
    const allowedRoles = ['admin', 'user']
    const rolesToDelete = existingRoles.filter(r => !allowedRoles.includes(r.role_name))

    if (rolesToDelete.length > 0) {
      console.log(
        '删除角色:',
        rolesToDelete.map(r => r.role_name)
      )

      // 先删除用户角色关联
      for (const role of rolesToDelete) {
        await sequelize.query('DELETE FROM user_roles WHERE role_id = ?', {
          replacements: [role.id]
        })
      }

      // 再删除角色
      const roleIds = rolesToDelete.map(r => r.id)
      if (roleIds.length > 0) {
        await sequelize.query(`DELETE FROM roles WHERE id IN (${roleIds.join(',')})`)
      }
    }

    // 3. 更新角色权限配置
    await sequelize.query(`
      UPDATE roles
      SET permissions = '{"*": ["*"]}', description = '超级管理员，拥有所有权限'
      WHERE role_name = 'admin'
    `)

    await sequelize.query(`
      UPDATE roles
      SET permissions = '{"lottery": ["read", "participate"], "profile": ["read", "update"], "points": ["read"]}',
          description = '普通用户'
      WHERE role_name = 'user'
    `)

    // 4. 确保13612227930有admin角色
    const [adminUser] = await sequelize.query('SELECT * FROM users WHERE mobile = ?', {
      replacements: ['13612227930']
    })

    if (adminUser.length > 0) {
      const [adminRole] = await sequelize.query('SELECT * FROM roles WHERE role_name = ?', {
        replacements: ['admin']
      })

      if (adminRole.length > 0) {
        // 检查是否已有关联
        const [existingAssoc] = await sequelize.query(
          'SELECT * FROM user_roles WHERE user_id = ? AND role_id = ?',
          { replacements: [adminUser[0].user_id, adminRole[0].id] }
        )

        if (existingAssoc.length === 0) {
          await sequelize.query(
            'INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, ?)',
            { replacements: [adminUser[0].user_id, adminRole[0].id, true] }
          )
          console.log('✅ 为13612227930分配admin角色')
        } else {
          console.log('✅ 13612227930已有admin角色')
        }
      }
    }

    // 5. 显示最终结果
    const [finalRoles] = await sequelize.query('SELECT * FROM roles ORDER BY role_level DESC')
    console.log('\n=== 简化后的角色系统 ===')
    finalRoles.forEach(role => {
      console.log(`✅ ${role.role_name}: 级别${role.role_level} - ${role.description}`)
    })

    // 6. 显示13612227930的角色
    const [userRoles] = await sequelize.query(
      `
      SELECT u.mobile, r.role_name, r.role_level
      FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.mobile = ? AND ur.is_active = 1
    `,
      {
        replacements: ['13612227930']
      }
    )

    console.log('\n=== 13612227930角色确认 ===')
    userRoles.forEach(ur => {
      console.log(`✅ ${ur.mobile} -> ${ur.role_name} (级别${ur.role_level})`)
    })

    await sequelize.close()
    console.log('\n🎉 角色系统简化完成！')
  } catch (error) {
    console.error('❌ 简化失败:', error.message)
    console.error(error.stack)
  }
}

if (require.main === module) {
  simplifyRoles()
}

module.exports = { simplifyRoles }
