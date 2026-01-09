/**
 * 用户层级管理测试脚本
 * 用途：测试后端API和数据库联动是否正常
 * 创建时间：2026-01-09
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { sequelize, User, Role, UserHierarchy } = require('../models')

async function testUserHierarchy() {
  console.log('='.repeat(60))
  console.log('🔍 用户层级管理测试开始')
  console.log('='.repeat(60))

  try {
    // 1. 测试数据库连接
    console.log('\n📦 1. 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 2. 检查 roles 表数据
    console.log('\n📋 2. 检查角色表数据...')
    const roles = await Role.findAll({
      attributes: ['role_id', 'role_name', 'role_level', 'is_active'],
      order: [['role_level', 'DESC']]
    })
    console.log(`   找到 ${roles.length} 个角色：`)
    roles.forEach(r => {
      console.log(`   - ID: ${r.role_id}, 名称: ${r.role_name}, 级别: ${r.role_level}, 激活: ${r.is_active}`)
    })

    // 检查是否有层级相关角色 (40, 60, 80)
    const hierarchyRoles = roles.filter(r => [40, 60, 80].includes(r.role_level))
    if (hierarchyRoles.length === 0) {
      console.log('⚠️ 缺少层级相关角色 (role_level: 40, 60, 80)，需要创建')
    }

    // 3. 检查 user_hierarchy 表数据
    console.log('\n📋 3. 检查用户层级表数据...')
    const hierarchies = await UserHierarchy.findAll({
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: User, as: 'superior', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: Role, as: 'role', attributes: ['role_id', 'role_name', 'role_level'] }
      ],
      limit: 10
    })
    console.log(`   找到 ${hierarchies.length} 条层级记录：`)
    hierarchies.forEach(h => {
      console.log(`   - hierarchy_id: ${h.hierarchy_id}`)
      console.log(`     user_id: ${h.user_id}, 用户: ${h.user?.nickname || '-'}`)
      console.log(`     superior_user_id: ${h.superior_user_id || '无'}, 上级: ${h.superior?.nickname || '-'}`)
      console.log(`     role: ${h.role?.role_name || '-'} (level: ${h.role?.role_level || '-'})`)
      console.log(`     is_active: ${h.is_active}`)
      console.log('')
    })

    // 4. 检查 users 表是否有管理员用户
    console.log('\n📋 4. 检查用户表数据...')
    const users = await User.findAll({
      attributes: ['user_id', 'mobile', 'nickname', 'status'],
      limit: 10,
      order: [['user_id', 'ASC']]
    })
    console.log(`   找到 ${users.length} 个用户：`)
    users.forEach(u => {
      console.log(`   - ID: ${u.user_id}, 手机: ${u.mobile}, 昵称: ${u.nickname || '-'}, 状态: ${u.status}`)
    })

    // 5. 模拟前端API调用，检查数据格式
    console.log('\n📋 5. 模拟前端API调用数据格式...')
    const { count, rows } = await UserHierarchy.findAndCountAll({
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'mobile', 'nickname', 'status'] },
        { model: User, as: 'superior', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: Role, as: 'role', attributes: ['role_id', 'role_name', 'role_level'] }
      ],
      limit: 20
    })
    
    console.log(`   总记录数: ${count}`)
    console.log('   API返回数据格式检查:')
    
    if (rows.length > 0) {
      const h = rows[0]
      console.log('   原始字段检查:')
      console.log(`   - h.hierarchy_id (正确字段): ${h.hierarchy_id}`)
      console.log(`   - h.user_hierarchy_id (错误字段): ${h.user_hierarchy_id}`)
      console.log(`   - h.user_id: ${h.user_id}`)
      console.log(`   - h.role_id: ${h.role_id}`)
      console.log(`   - h.user?.mobile: ${h.user?.mobile}`)
      console.log(`   - h.role?.role_name: ${h.role?.role_name}`)
    }

    // 6. 输出问题诊断
    console.log('\n' + '='.repeat(60))
    console.log('🔍 问题诊断结果:')
    console.log('='.repeat(60))
    
    if (hierarchyRoles.length === 0) {
      console.log('❌ 问题1: 缺少层级角色 (区域负责人/业务经理/业务员)')
      console.log('   解决: 需要在 roles 表中创建 role_level 为 40, 60, 80 的角色')
    }
    
    if (count === 0) {
      console.log('❌ 问题2: 用户层级表无数据')
      console.log('   解决: 需要创建测试数据')
    }
    
    if (rows.length > 0 && rows[0].user_hierarchy_id === undefined) {
      console.log('⚠️ 问题3: 后端路由使用了错误的字段名 user_hierarchy_id')
      console.log('   解决: 后端路由应该使用 hierarchy_id 而不是 user_hierarchy_id')
    }

    console.log('\n✅ 测试完成')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
    console.log('\n📦 数据库连接已关闭')
  }
}

// 运行测试
testUserHierarchy()

