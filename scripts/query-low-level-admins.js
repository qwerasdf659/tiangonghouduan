#!/usr/bin/env node
/**
 * 查询 role_level < 80 的管理员账号
 * 运行命令: node scripts/query-low-level-admins.js
 */

// 加载环境变量
require('dotenv').config()

const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

async function queryLowLevelAdmins() {
  console.log('🔍 查询 role_level < 80 的管理员账号...\n')
  
  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')
    
    // 查询 role_level < 80 且 role_level > 0 的用户（有角色但权限较低）
    const query = `
      SELECT 
        u.user_id,
        u.mobile,
        u.nickname,
        u.status,
        u.user_level,
        r.role_id,
        r.role_name,
        r.role_level,
        r.description AS role_description,
        ur.is_active AS role_is_active,
        ur.assigned_at
      FROM users u
      INNER JOIN user_roles ur ON u.user_id = ur.user_id
      INNER JOIN roles r ON ur.role_id = r.role_id
      WHERE r.role_level > 0 AND r.role_level < 80
        AND ur.is_active = 1
      ORDER BY r.role_level DESC, u.user_id ASC
    `
    
    const results = await sequelize.query(query, { type: QueryTypes.SELECT })
    
    if (results.length === 0) {
      console.log('📋 查询结果: 没有找到 role_level < 80 的管理员账号\n')
    } else {
      console.log(`📋 查询结果: 找到 ${results.length} 个 role_level < 80 的管理员账号\n`)
      console.log('='.repeat(100))
      console.log('| user_id | 手机号       | 昵称           | role_level | 角色名称     | 角色描述           | 状态   |')
      console.log('='.repeat(100))
      
      results.forEach(row => {
        const userId = String(row.user_id).padEnd(7)
        const mobile = (row.mobile || '-').padEnd(12)
        const nickname = (row.nickname || '-').slice(0, 12).padEnd(14)
        const roleLevel = String(row.role_level).padEnd(10)
        const roleName = (row.role_name || '-').padEnd(12)
        const roleDesc = (row.role_description || '-').slice(0, 16).padEnd(18)
        const status = (row.status || '-').padEnd(6)
        
        console.log(`| ${userId} | ${mobile} | ${nickname} | ${roleLevel} | ${roleName} | ${roleDesc} | ${status} |`)
      })
      
      console.log('='.repeat(100))
    }
    
    // 同时查询所有角色定义，了解系统中有哪些角色
    console.log('\n\n📊 系统角色配置一览:\n')
    
    const rolesQuery = `
      SELECT 
        role_id,
        role_name,
        role_level,
        description,
        is_active,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = roles.role_id AND ur.is_active = 1) AS user_count
      FROM roles
      ORDER BY role_level DESC
    `
    
    const roles = await sequelize.query(rolesQuery, { type: QueryTypes.SELECT })
    
    console.log('='.repeat(90))
    console.log('| role_id | 角色名称     | role_level | 描述                     | 启用 | 用户数 |')
    console.log('='.repeat(90))
    
    roles.forEach(role => {
      const roleId = String(role.role_id).padEnd(7)
      const roleName = (role.role_name || '-').padEnd(12)
      const roleLevel = String(role.role_level).padEnd(10)
      const description = (role.description || '-').slice(0, 22).padEnd(24)
      const isActive = role.is_active ? '是'.padEnd(4) : '否'.padEnd(4)
      const userCount = String(role.user_count || 0).padEnd(6)
      
      console.log(`| ${roleId} | ${roleName} | ${roleLevel} | ${description} | ${isActive} | ${userCount} |`)
    })
    
    console.log('='.repeat(90))
    
    // 统计信息
    const stats = {
      totalRoles: roles.length,
      lowLevelAdmins: results.length,
      thresholdRoles: roles.filter(r => r.role_level > 0 && r.role_level < 80).length
    }
    
    console.log('\n📈 统计信息:')
    console.log(`   - 系统总角色数: ${stats.totalRoles}`)
    console.log(`   - role_level < 80 的角色数: ${stats.thresholdRoles}`)
    console.log(`   - role_level < 80 的用户数: ${stats.lowLevelAdmins}`)
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

// 执行查询
queryLowLevelAdmins()

