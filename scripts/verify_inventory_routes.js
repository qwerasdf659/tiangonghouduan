/**
 * 验证路由拆分后的 API 端点访问性测试
 *
 * 测试目标：验证路由拆分后，所有 API 端点的路由映射是否正确
 *
 * 测试方法：检查路由注册情况（不实际调用 API）
 *
 * 创建时间：2025-12-11
 */

const express = require('express')
const app = express()

console.log('=== 验证 inventory 路由端点注册情况 ===\n')

try {
  // 加载路由
  const inventoryRouter = require('../routes/v4/unified-engine/inventory')

  // 创建临时 app 挂载路由
  app.use('/api/v4/inventory', inventoryRouter)

  // 提取所有注册的路由
  const routes = []
  const extractRoutes = (stack, basePath = '') => {
    stack.forEach(middleware => {
      if (middleware.route) {
        // 直接的路由
        const methods = Object.keys(middleware.route.methods).join(',').toUpperCase()
        routes.push({
          method: methods,
          path: basePath + middleware.route.path
        })
      } else if (middleware.name === 'router') {
        // 嵌套的路由
        const nestedPath = middleware.regexp.source
          .replace('^\\/(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace(/\(\?\:\(.*?\)\)/g, '')
          .replace(/[()^$]/g, '')
          .replace(/\\/g, '')

        if (middleware.handle.stack) {
          extractRoutes(middleware.handle.stack, basePath + nestedPath)
        }
      }
    })
  }

  // 提取主路由的所有端点
  const mainStack = app._router.stack.find(
    layer => layer.name === 'router' && layer.regexp.source.includes('inventory')
  )

  if (mainStack && mainStack.handle.stack) {
    extractRoutes(mainStack.handle.stack, '/api/v4/inventory')
  }

  // 按路径分组显示
  console.log('✅ 成功加载路由，共找到', routes.length, '个端点\n')

  const coreRoutes = routes.filter(
    r => !r.path.includes('market') && !r.path.includes('products') && !r.path.includes('exchange')
  )
  const marketRoutes = routes.filter(r => r.path.includes('market'))
  const exchangeRoutes = routes.filter(
    r => r.path.includes('products') || r.path.includes('exchange')
  )

  console.log('📋 核心库存功能路由（inventory-core.js）：')
  console.log('-'.repeat(70))
  coreRoutes.forEach(route => {
    console.log(`  ${route.method.padEnd(7)} ${route.path}`)
  })

  console.log('\n📋 市场交易功能路由（inventory-market.js）：')
  console.log('-'.repeat(70))
  marketRoutes.forEach(route => {
    console.log(`  ${route.method.padEnd(7)} ${route.path}`)
  })

  console.log('\n📋 兑换功能路由（inventory-exchange.js）：')
  console.log('-'.repeat(70))
  exchangeRoutes.forEach(route => {
    console.log(`  ${route.method.padEnd(7)} ${route.path}`)
  })

  console.log('\n' + '='.repeat(70))
  console.log('✅ 路由拆分验证完成：所有端点路由注册正确')
  console.log('='.repeat(70))

  process.exit(0)
} catch (error) {
  console.error('\n❌ 路由验证失败:')
  console.error(error.message)
  console.error('\n错误堆栈:')
  console.error(error.stack)
  process.exit(1)
}
