#!/usr/bin/env node
/**
 * 用户管理API测试脚本
 * 
 * 测试目的：
 * 1. 验证后端 /api/v4/console/user-management/users API返回的数据结构
 * 2. 检查统计数据（statistics）字段是否正确返回
 * 
 * 使用方法：
 * node scripts/test_user_management_api.js
 */

const http = require('http')

// 配置
const API_HOST = 'localhost'
const API_PORT = process.env.PORT || 3000
const API_PATH = '/api/v4/console/user-management/users'

// 需要一个有效的管理员token才能访问这个API
// 这里我们使用一个测试用的方式 - 通过服务直接调用
async function testViaService() {
  console.log('🔍 测试用户管理API（通过服务层直接调用）\n')
  console.log('=' .repeat(60))
  
  try {
    // 加载配置
    require('dotenv').config()
    
    // 设置数据库连接
    const { sequelize } = require('../models')
    
    // 等待数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')
    
    // 加载服务
    const UserRoleService = require('../services/UserRoleService')
    
    // 调用服务
    console.log('📡 调用 UserRoleService.getUserList()...\n')
    
    const result = await UserRoleService.getUserList({
      page: 1,
      limit: 20
    })
    
    // 打印结果结构
    console.log('📊 API返回数据结构分析:\n')
    console.log('-'.repeat(60))
    
    // 检查顶层字段
    console.log('顶层字段:')
    Object.keys(result).forEach(key => {
      const value = result[key]
      const type = Array.isArray(value) ? 'Array' : typeof value
      const preview = type === 'Array' 
        ? `[${value.length}个元素]` 
        : type === 'object' 
          ? JSON.stringify(value, null, 2).substring(0, 100) + '...'
          : value
      console.log(`  - ${key}: ${type} = ${preview}`)
    })
    
    console.log('\n' + '-'.repeat(60))
    console.log('\n📈 统计数据检查:\n')
    
    // 检查 statistics 字段
    if (result.statistics) {
      console.log('✅ statistics 字段存在')
      console.log('  statistics:', JSON.stringify(result.statistics, null, 4))
      
      // 验证每个统计字段
      const expectedFields = ['total_users', 'today_new', 'active_users', 'vip_users']
      const missingFields = expectedFields.filter(f => result.statistics[f] === undefined)
      
      if (missingFields.length > 0) {
        console.log(`\n⚠️  缺失的统计字段: ${missingFields.join(', ')}`)
      } else {
        console.log('\n✅ 所有期望的统计字段都存在')
      }
      
      // 打印每个统计值
      console.log('\n📊 统计数据值:')
      console.log(`  - total_users (总用户数): ${result.statistics.total_users}`)
      console.log(`  - today_new (今日新增): ${result.statistics.today_new}`)
      console.log(`  - active_users (活跃用户): ${result.statistics.active_users}`)
      console.log(`  - vip_users (VIP用户): ${result.statistics.vip_users}`)
    } else {
      console.log('❌ statistics 字段不存在!')
      console.log('   这可能是导致前端显示 "-" 的原因')
    }
    
    console.log('\n' + '-'.repeat(60))
    console.log('\n📋 分页数据检查:\n')
    
    if (result.pagination) {
      console.log('✅ pagination 字段存在')
      console.log('  pagination:', JSON.stringify(result.pagination, null, 4))
    } else {
      console.log('⚠️  pagination 字段不存在')
    }
    
    console.log('\n' + '-'.repeat(60))
    console.log('\n👥 用户数据预览 (前3条):\n')
    
    if (result.users && result.users.length > 0) {
      console.log(`✅ users 字段存在，共 ${result.users.length} 条记录`)
      result.users.slice(0, 3).forEach((user, i) => {
        console.log(`\n  用户 ${i + 1}:`)
        console.log(`    - user_id: ${user.user_id}`)
        console.log(`    - nickname: ${user.nickname}`)
        console.log(`    - mobile: ${user.mobile}`)
        console.log(`    - status: ${user.status}`)
        console.log(`    - roles: ${JSON.stringify(user.roles)}`)
      })
    } else {
      console.log('⚠️  users 字段为空或不存在')
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('\n🏁 测试完成\n')
    
    // 前端配置与后端数据的对照
    console.log('📝 前端配置与后端数据对照:\n')
    console.log('前端 PageConfigRegistry.js 配置的 stats 字段映射:')
    console.log("  { key: 'total', field: 'statistics.total_users' }    -> 后端返回: " + (result.statistics?.total_users ?? '未定义'))
    console.log("  { key: 'new_today', field: 'statistics.today_new' }  -> 后端返回: " + (result.statistics?.today_new ?? '未定义'))
    console.log("  { key: 'active', field: 'statistics.active_users' }  -> 后端返回: " + (result.statistics?.active_users ?? '未定义'))
    console.log("  { key: 'vip', field: 'statistics.vip_users' }        -> 后端返回: " + (result.statistics?.vip_users ?? '未定义'))
    
    // 关闭数据库连接
    await sequelize.close()
    
    return result
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 运行测试
testViaService()

