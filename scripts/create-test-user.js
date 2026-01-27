#!/usr/bin/env node
/**
 * 创建测试用户（business_manager，role_level=60）
 * 运行: node scripts/create-test-user.js
 */

require('dotenv').config()

const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

async function createTestUser() {
  const mobile = '13612227931'
  const nickname = '测试业务经理'
  const roleId = 7  // business_manager 角色
  
  console.log('🔧 创建测试用户...\n')
  console.log(`📱 手机号: ${mobile}`)
  console.log(`🏷️ 昵称: ${nickname}`)
  console.log(`👔 角色: business_manager (role_level=60)\n`)
  
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')
    
    // 1. 检查用户是否已存在
    const existingUser = await sequelize.query(
      `SELECT user_id, mobile, nickname FROM users WHERE mobile = ?`,
      { replacements: [mobile], type: QueryTypes.SELECT }
    )
    
    let userId
    
    if (existingUser.length > 0) {
      userId = existingUser[0].user_id
      console.log(`⚠️ 用户已存在: user_id=${userId}\n`)
    } else {
      // 2. 创建新用户
      const insertResult = await sequelize.query(
        `INSERT INTO users (mobile, nickname, status, user_level, created_at, updated_at) 
         VALUES (?, ?, 'active', 'normal', NOW(), NOW())`,
        { replacements: [mobile, nickname], type: QueryTypes.INSERT }
      )
      userId = insertResult[0]
      console.log(`✅ 用户创建成功: user_id=${userId}\n`)
    }
    
    // 3. 检查角色是否存在
    const role = await sequelize.query(
      `SELECT role_id, role_name, role_level FROM roles WHERE role_id = ?`,
      { replacements: [roleId], type: QueryTypes.SELECT }
    )
    
    if (role.length === 0) {
      console.error(`❌ 角色不存在: role_id=${roleId}`)
      return
    }
    
    console.log(`📋 目标角色: ${role[0].role_name} (role_level=${role[0].role_level})`)
    
    // 4. 检查用户是否已有该角色
    const existingRole = await sequelize.query(
      `SELECT * FROM user_roles WHERE user_id = ? AND role_id = ?`,
      { replacements: [userId, roleId], type: QueryTypes.SELECT }
    )
    
    if (existingRole.length > 0) {
      console.log(`⚠️ 用户已拥有该角色\n`)
    } else {
      // 5. 分配角色
      await sequelize.query(
        `INSERT INTO user_roles (user_id, role_id, is_active, assigned_at, created_at, updated_at) 
         VALUES (?, ?, 1, NOW(), NOW(), NOW())`,
        { replacements: [userId, roleId], type: QueryTypes.INSERT }
      )
      console.log(`✅ 角色分配成功\n`)
    }
    
    // 6. 查询最终结果
    const finalResult = await sequelize.query(
      `SELECT u.user_id, u.mobile, u.nickname, u.status,
              r.role_name, r.role_level,
              (SELECT MAX(r2.role_level) FROM user_roles ur2 
               INNER JOIN roles r2 ON ur2.role_id = r2.role_id 
               WHERE ur2.user_id = u.user_id AND ur2.is_active = 1) AS max_role_level
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
       LEFT JOIN roles r ON ur.role_id = r.role_id
       WHERE u.mobile = ?`,
      { replacements: [mobile], type: QueryTypes.SELECT }
    )
    
    console.log('='.repeat(60))
    console.log('📊 用户信息:')
    console.log(`   user_id: ${finalResult[0].user_id}`)
    console.log(`   手机号: ${finalResult[0].mobile}`)
    console.log(`   昵称: ${finalResult[0].nickname}`)
    console.log(`   状态: ${finalResult[0].status}`)
    console.log(`   最高权限等级: ${finalResult[0].max_role_level}`)
    console.log('\n📌 角色列表:')
    finalResult.forEach(row => {
      if (row.role_name) {
        console.log(`   - ${row.role_name} (role_level=${row.role_level})`)
      }
    })
    console.log('='.repeat(60))
    
    console.log('\n🎯 登录信息:')
    console.log(`   手机号: ${mobile}`)
    console.log(`   验证码: 任意6位数字（开发环境）`)
    console.log(`   预期效果: 登录后只能看到 工作台 + 客服工作台`)
    
  } catch (error) {
    console.error('❌ 操作失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

createTestUser()

