#!/usr/bin/env node
/**
 * 查询指定用户的完整角色信息
 * 运行: node scripts/query-user-roles.js
 */

require('dotenv').config()

const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

async function queryUserRoles() {
  console.log('🔍 查询用户 13612227930 的完整角色信息...\n')
  
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')
    
    // 查询用户及其所有角色
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
        ur.assigned_at,
        -- 计算用户的最高 role_level
        (SELECT MAX(r2.role_level) 
         FROM user_roles ur2 
         INNER JOIN roles r2 ON ur2.role_id = r2.role_id 
         WHERE ur2.user_id = u.user_id AND ur2.is_active = 1) AS max_role_level
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE u.mobile = '13612227930'
      ORDER BY r.role_level DESC
    `
    
    const results = await sequelize.query(query, { type: QueryTypes.SELECT })
    
    if (results.length === 0) {
      console.log('❌ 未找到该用户\n')
    } else {
      console.log('📋 用户角色详情:\n')
      console.log('='.repeat(80))
      
      const user = results[0]
      console.log(`👤 用户ID: ${user.user_id}`)
      console.log(`📱 手机号: ${user.mobile}`)
      console.log(`🏷️ 昵称: ${user.nickname || '无'}`)
      console.log(`📊 状态: ${user.status}`)
      console.log(`⭐ 用户等级: ${user.user_level}`)
      console.log(`🔝 最高权限等级 (max_role_level): ${user.max_role_level}`)
      
      console.log('\n📌 关联的角色列表:')
      console.log('-'.repeat(80))
      
      results.forEach((row, index) => {
        if (row.role_id) {
          console.log(`  ${index + 1}. role_id=${row.role_id}, role_name=${row.role_name}, role_level=${row.role_level}`)
          console.log(`     描述: ${row.role_description || '无'}`)
          console.log(`     激活: ${row.role_is_active ? '是' : '否'}, 分配时间: ${row.assigned_at}`)
        } else {
          console.log(`  (无关联角色)`)
        }
      })
      
      console.log('='.repeat(80))
      
      // 关键结论
      console.log('\n🎯 权限控制关键结论:')
      const maxLevel = user.max_role_level || 0
      console.log(`   用户最高 role_level: ${maxLevel}`)
      
      if (maxLevel >= 100) {
        console.log(`   ✅ 该用户是管理员 (role_level >= 100)，可以登录并看到所有菜单`)
      } else if (maxLevel >= 80) {
        console.log(`   ⚠️ 该用户是运营 (role_level >= 80)，可以登录并看到运营菜单`)
      } else if (maxLevel > 0) {
        console.log(`   🔒 该用户是低权限用户 (role_level < 80)，理论上只能看到客服功能`)
        console.log(`   ⚠️ 但如果 checkAdminAccess 检查的是 role_name='admin'，可能绕过了权限限制！`)
      } else {
        console.log(`   ❌ 该用户无任何角色，不应该能登录管理后台`)
      }
    }
    
    // 额外：检查是否有 admin 角色
    const adminQuery = `
      SELECT r.* FROM roles r WHERE r.role_name = 'admin' OR r.role_level >= 100
    `
    const adminRoles = await sequelize.query(adminQuery, { type: QueryTypes.SELECT })
    
    console.log('\n\n📊 系统中的管理员角色 (role_level >= 100 或 role_name = "admin"):')
    adminRoles.forEach(role => {
      console.log(`   role_id=${role.role_id}, role_name=${role.role_name}, role_level=${role.role_level}`)
    })
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

queryUserRoles()

