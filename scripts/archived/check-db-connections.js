#!/usr/bin/env node
/**
 * MySQL连接数和Sequelize连接池实时监控脚本
 * 用途：查看MySQL服务器连接状态 + Sequelize连接池状态
 * 更新时间：2025年10月11日 北京时间
 */

const { sequelize } = require('../config/database')
require('dotenv').config()

async function checkConnections () {
  try {
    console.log('\n📊 MySQL连接状态监控')
    console.log('='.repeat(60))

    // 查询连接状态
    const [status] = await sequelize.query(`
      SHOW STATUS WHERE 
      Variable_name = 'Threads_connected' OR 
      Variable_name = 'Max_used_connections' OR
      Variable_name = 'Uptime'
    `)

    // 查询配置
    const [variables] = await sequelize.query(`
      SHOW VARIABLES WHERE 
      Variable_name = 'max_connections'
    `)

    // 解析数据
    const currentConnections = parseInt(
      status.find(r => r.Variable_name === 'Threads_connected')?.Value || 0
    )
    const maxUsedConnections = parseInt(
      status.find(r => r.Variable_name === 'Max_used_connections')?.Value || 0
    )
    const uptime = parseInt(status.find(r => r.Variable_name === 'Uptime')?.Value || 0)
    const maxConnections = parseInt(
      variables.find(r => r.Variable_name === 'max_connections')?.Value || 0
    )

    // 计算统计数据
    const usagePercent = ((currentConnections / maxConnections) * 100).toFixed(1)
    const peakPercent = ((maxUsedConnections / maxConnections) * 100).toFixed(1)
    const safeLimit = Math.floor(maxConnections * 0.8)
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)

    // 显示结果
    console.log(`🟢 当前连接数: ${currentConnections}个`)
    console.log(`📈 历史最大连接数: ${maxUsedConnections}个 (峰值)`)
    console.log(`🔧 MySQL最大连接: ${maxConnections}个`)
    console.log(`✅ 安全可用连接: ${safeLimit}个 (80%)`)
    console.log(`⏰ MySQL运行时间: ${days}天${hours}小时`)
    console.log('')
    console.log(`📊 当前使用率: ${usagePercent}% (${currentConnections}/${maxConnections})`)
    console.log(`📊 历史峰值率: ${peakPercent}% (${maxUsedConnections}/${maxConnections})`)
    console.log('')

    // 评估状态
    if (currentConnections < safeLimit * 0.5) {
      console.log('💚 状态评估: 连接数很健康，资源充足')
    } else if (currentConnections < safeLimit * 0.8) {
      console.log('💛 状态评估: 连接数正常，注意监控')
    } else if (currentConnections < safeLimit) {
      console.log('🧡 状态评估: 连接数偏高，建议优化')
    } else {
      console.log('🔴 状态评估: 连接数危险，需要立即处理！')
    }

    // 应用配置建议
    console.log('')
    console.log('🎯 应用实例配置建议:')
    const suggestedMax = Math.floor(safeLimit / 3) // 假设3个实例
    console.log(`   单实例max建议: ${suggestedMax}个`)
    console.log(`   可部署实例数: ${Math.floor(safeLimit / 20)}个 (按max=20计算)`)
    console.log(`   3实例总连接: ${20 * 3}个 (占用${((60 / safeLimit) * 100).toFixed(1)}%)`)

    // ⭐ 新增：Sequelize连接池状态监控
    console.log('')
    console.log('='.repeat(60))
    console.log('📊 Sequelize连接池状态')
    console.log('='.repeat(60))

    const pool = sequelize.connectionManager.pool
    if (pool) {
      const poolConfig = sequelize.config.pool
      const totalConnections = pool._allObjects ? pool._allObjects.length : 0
      const availableConnections = pool._availableObjects ? pool._availableObjects.length : 0
      const inUseConnections = totalConnections - availableConnections
      const poolUsage =
        poolConfig.max > 0 ? ((totalConnections / poolConfig.max) * 100).toFixed(1) : 0

      console.log('🔧 连接池配置:')
      console.log(`   最大连接数(max): ${poolConfig.max}个`)
      console.log(`   最小连接数(min): ${poolConfig.min}个`)
      console.log(`   获取超时(acquire): ${poolConfig.acquire}ms (${poolConfig.acquire / 1000}秒)`)
      console.log(`   空闲回收(idle): ${poolConfig.idle}ms (${poolConfig.idle / 60000}分钟)`)
      console.log(`   清理间隔(evict): ${poolConfig.evict}ms (${poolConfig.evict / 1000}秒)`)
      console.log('')

      console.log('📈 连接池实时状态:')
      console.log(`   当前总连接数: ${totalConnections}个`)
      console.log(`   可用连接数: ${availableConnections}个`)
      console.log(`   使用中连接数: ${inUseConnections}个`)
      console.log(`   连接池使用率: ${poolUsage}% (${totalConnections}/${poolConfig.max})`)
      console.log('')

      // 健康状态评估
      let poolHealth = '健康 💚'
      if (poolUsage > 90) {
        poolHealth = '严重负载 🔴'
      } else if (poolUsage > 70) {
        poolHealth = '接近上限 🧡'
      } else if (poolUsage > 50) {
        poolHealth = '正常偏高 💛'
      }

      console.log(`🏥 连接池健康状态: ${poolHealth}`)

      // 容量规划验证
      console.log('')
      console.log('🎯 容量规划验证:')
      const currentMax = poolConfig.max
      const instance3Total = currentMax * 3
      const instance3Usage = ((instance3Total / safeLimit) * 100).toFixed(1)
      const instance5Total = currentMax * 5
      const instance5Usage = ((instance5Total / safeLimit) * 100).toFixed(1)

      console.log(`   当前配置(max=${currentMax}):`)
      console.log(
        `     3实例部署: ${instance3Total}个连接，占用${instance3Usage}% ${instance3Total <= safeLimit ? '✅' : '❌ 超限!'}`
      )
      console.log(
        `     5实例部署: ${instance5Total}个连接，占用${instance5Usage}% ${instance5Total <= safeLimit ? '✅' : '❌ 超限!'}`
      )

      // 优化建议
      if (maxUsedConnections < currentMax * 0.6) {
        console.log('')
        console.log('💡 优化建议: 历史峰值较低，可以考虑降低max值')
        const recommendMax = Math.ceil(maxUsedConnections * 1.2)
        console.log(`   建议max值: ${recommendMax}个 (历史峰值${maxUsedConnections} × 1.2倍余量)`)
      } else if (totalConnections >= currentMax * 0.9) {
        console.log('')
        console.log('⚠️ 优化建议: 连接池使用率过高，考虑增加max值或优化查询')
      }
    } else {
      console.log('⚠️ 无法获取连接池状态（连接池未初始化）')
    }

    console.log('='.repeat(60))

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
    process.exit(1)
  }
}

checkConnections()
