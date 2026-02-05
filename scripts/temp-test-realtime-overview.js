#!/usr/bin/env node
/**
 * 临时测试脚本 - 测试 RealtimeService.getRealtimeOverview 方法
 * 测试完成后删除
 */

require('dotenv').config()

const { sequelize } = require('../config/database')
const serviceManager = require('../services')
const { initializeServices } = require('../services')

async function test() {
  console.log('🔍 测试 getLotteryRealtimeService().getRealtimeOverview()...\n')
  
  try {
    // 初始化服务管理器
    await initializeServices(sequelize.models)
    const services = serviceManager
    
    // 获取 RealtimeService
    const realtimeService = services.getService('lottery_analytics_realtime')
    
    if (!realtimeService) {
      console.error('❌ 服务 lottery_analytics_realtime 不存在')
      process.exit(1)
    }
    
    console.log('✅ 服务 lottery_analytics_realtime 已加载')
    
    // 检查方法是否存在
    if (typeof realtimeService.getRealtimeOverview !== 'function') {
      console.error('❌ 方法 getRealtimeOverview 不存在于 RealtimeService')
      console.log('可用方法:', Object.keys(realtimeService).filter(k => typeof realtimeService[k] === 'function'))
      process.exit(1)
    }
    
    console.log('✅ 方法 getRealtimeOverview 存在')
    
    // 调用方法
    console.log('\n📋 调用 getRealtimeOverview(1)...')
    const result = await realtimeService.getRealtimeOverview(1)
    
    console.log('\n✅ 调用成功！返回数据:')
    console.log(JSON.stringify(result, null, 2))
    
    console.log('\n🎉 测试通过！后端服务修复成功')
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

test()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ 测试异常:', err)
    process.exit(1)
  })

