#!/usr/bin/env node
/**
 * 幂等服务 Canonical Operation 验证脚本
 * 验证 canonical operation 映射完整性和严格模式是否工作正常
 *
 * 功能：
 * 1. 验证所有写路由是否都在 CANONICAL_OPERATION_MAP 中定义
 * 2. 验证同一业务操作通过不同URL路径产生相同的 request_fingerprint
 * 3. 验证严格模式下未映射路径会抛出错误
 *
 * 执行：node scripts/validation/verify_idempotency_canonical.js
 *
 * 【决策4-B】严格模式验证：未映射的写接口将在运行时抛出500错误
 * 更新时间：2026-01-13
 */

const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

// 验证映射配置
console.log('=== 幂等服务 Canonical Operation 验证（严格模式）===\n')

/*
 * 通过 ServiceManager 获取 IdempotencyService
 * 服务键：'idempotency'（snake_case）
 */
let IdempotencyService
let CANONICAL_OPERATION_MAP

async function initializeService() {
  try {
    const serviceManager = require('../../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    IdempotencyService = serviceManager.getService('idempotency')

    // 直接获取 CANONICAL_OPERATION_MAP 用于验证
    CANONICAL_OPERATION_MAP = require('../../services/IdempotencyService').CANONICAL_OPERATION_MAP

    console.log('✅ IdempotencyService 加载成功')
    console.log(`   已定义 ${Object.keys(CANONICAL_OPERATION_MAP).length} 个 canonical 映射`)
    return true
  } catch (error) {
    console.error('❌ IdempotencyService 加载失败:', error.message)
    return false
  }
}

/**
 * 路由文件到 API 前缀的映射表
 * 基于 app.js 中的路由挂载点
 */
const ROUTE_FILE_PREFIX_MAP = {
  'routes/v4/auth': '/api/v4/auth',
  'routes/v4/auth/permissions.js': '/api/v4/permissions', // 权限独立挂载
  'routes/v4/console': '/api/v4/console',
  'routes/v4/lottery': '/api/v4/lottery',
  'routes/v4/market': '/api/v4/market',
  'routes/v4/shop': '/api/v4/shop',
  'routes/v4/system': '/api/v4/system',
  'routes/v4/user': '/api/v4/user',
  'routes/v4/assets': '/api/v4/assets',
  'routes/v4/backpack': '/api/v4/backpack',
  'routes/v4/merchant-points.js': '/api/v4/merchant-points',
  'routes/v4/activities.js': '/api/v4/activities',
  'routes/v4/debug-control.js': '/api/v4/debug-control'
}

/**
 * 根据路由文件路径获取 API 前缀
 * @param {string} file_path - 路由文件路径
 * @returns {string} API 前缀
 */
function getApiPrefix(file_path) {
  // 标准化路径分隔符
  const normalized_path = file_path.replace(/\\/g, '/')

  // 尝试精确匹配
  for (const [pattern, prefix] of Object.entries(ROUTE_FILE_PREFIX_MAP)) {
    if (normalized_path.includes(pattern)) {
      return prefix
    }
  }

  // 默认使用文件路径推断
  if (normalized_path.includes('routes/v4/')) {
    const relative = normalized_path.split('routes/v4/')[1]
    if (relative) {
      const base = relative.replace(/\.js$/, '').replace(/\/index$/, '')
      return `/api/v4/${base}`
    }
  }

  return '/api/v4'
}

/**
 * 扫描项目中的所有写路由（POST/PUT/DELETE）
 * @returns {Object[]} 写路由路径列表
 */
function scanWriteRoutes() {
  const routes_dir = path.resolve(__dirname, '../../routes')
  const write_routes = []

  // 递归扫描路由文件
  function scanDirectory(dir) {
    if (!fs.existsSync(dir)) return

    const files = fs.readdirSync(dir)
    for (const file of files) {
      const full_path = path.join(dir, file)
      const stat = fs.statSync(full_path)

      if (stat.isDirectory()) {
        scanDirectory(full_path)
      } else if (file.endsWith('.js')) {
        try {
          const content = fs.readFileSync(full_path, 'utf8')
          const relative_path = full_path.replace(routes_dir, 'routes').replace(/\\/g, '/')
          const api_prefix = getApiPrefix(relative_path)

          // 匹配写操作路由定义
          const route_patterns = [
            /router\.post\s*\(\s*['"`]([^'"`]+)['"`]/g,
            /router\.put\s*\(\s*['"`]([^'"`]+)['"`]/g,
            /router\.delete\s*\(\s*['"`]([^'"`]+)['"`]/g,
            /router\.patch\s*\(\s*['"`]([^'"`]+)['"`]/g
          ]

          for (const pattern of route_patterns) {
            let match
            while ((match = pattern.exec(content)) !== null) {
              const route_path = match[1]
              // 构建完整 API 路径
              const full_api_path = route_path.startsWith('/')
                ? `${api_prefix}${route_path}`
                : `${api_prefix}/${route_path}`

              write_routes.push({
                file: relative_path,
                route_path: route_path,
                full_api_path: full_api_path.replace(/\/+/g, '/') // 清理多余斜杠
              })
            }
          }
        } catch (error) {
          // 忽略解析错误
        }
      }
    }
  }

  scanDirectory(routes_dir)
  return write_routes
}

/**
 * 标准化路由路径中的参数名
 * 将所有命名参数（如 :idOrCode, :campaign_id）统一转换为 :id
 * 这是为了与 CANONICAL_OPERATION_MAP 中的映射保持一致
 * @param {string} path - 路由路径
 * @returns {string} 标准化后的路径
 */
function normalizeRouteParams(path) {
  if (!path) return ''

  // 将所有 :xxx 格式的参数替换为 :id（保留路径结构）
  return (
    path
      // 匹配 :开头后跟字母数字下划线的参数名
      .replace(/:\w+/g, ':id')
      // 清理多余斜杠
      .replace(/\/+/g, '/')
  )
}

/**
 * 验证 CANONICAL_OPERATION_MAP 的完整性
 */
function validateMappingCompleteness() {
  console.log('--- 验证 CANONICAL_OPERATION_MAP 完整性 ---\n')

  const write_routes = scanWriteRoutes()
  console.log(`📊 扫描到 ${write_routes.length} 个写路由定义\n`)

  const unmapped_routes = []
  const mapped_routes = []

  for (const route of write_routes) {
    const api_path = route.full_api_path

    // 尝试查找映射
    try {
      // 1. 先尝试原始路径
      if (CANONICAL_OPERATION_MAP[api_path]) {
        mapped_routes.push({ ...route, canonical: CANONICAL_OPERATION_MAP[api_path] })
        continue
      }

      // 2. 使用 normalizePath 处理纯数字（运行时会用到）
      const normalized = IdempotencyService.normalizePath
        ? IdempotencyService.normalizePath(api_path)
        : api_path
      if (CANONICAL_OPERATION_MAP[normalized]) {
        mapped_routes.push({ ...route, canonical: CANONICAL_OPERATION_MAP[normalized] })
        continue
      }

      // 3. 将命名参数标准化为 :id（路由定义使用具体参数名）
      const standardized = normalizeRouteParams(api_path)
      if (CANONICAL_OPERATION_MAP[standardized]) {
        mapped_routes.push({ ...route, canonical: CANONICAL_OPERATION_MAP[standardized] })
        continue
      }

      // 4. 都未找到，标记为未映射
      unmapped_routes.push({ ...route, standardized_path: standardized })
    } catch (error) {
      unmapped_routes.push({ ...route, error: error.message })
    }
  }

  console.log(`✅ 已映射路由: ${mapped_routes.length}`)
  console.log(`⚠️  未映射路由: ${unmapped_routes.length}`)

  if (unmapped_routes.length > 0) {
    console.log('\n未映射路由清单（需要在 CANONICAL_OPERATION_MAP 中添加）:')
    unmapped_routes.slice(0, 20).forEach(r => {
      console.log(`   - ${r.full_api_path} → ${r.standardized_path || '?'} (${r.file})`)
    })
    if (unmapped_routes.length > 20) {
      console.log(`   ... 还有 ${unmapped_routes.length - 20} 个未显示`)
    }
  }

  return { mapped_routes, unmapped_routes }
}

/**
 * 验证严格模式是否正确工作
 */
function validateStrictMode() {
  console.log('\n--- 验证严格模式（决策4-B）---\n')

  const undefined_path = '/api/v4/some/undefined/write/endpoint'

  try {
    IdempotencyService.getCanonicalOperation(undefined_path)
    console.log(`❌ 严格模式失败：未映射路径 ${undefined_path} 没有抛出错误`)
    return false
  } catch (error) {
    if (error.code === 'CANONICAL_OPERATION_NOT_MAPPED') {
      console.log(`✅ 严格模式生效：未映射路径正确抛出 CANONICAL_OPERATION_NOT_MAPPED 错误`)
      console.log(`   错误消息: ${error.message.substring(0, 80)}...`)
      return true
    } else {
      console.log(`❌ 严格模式异常：抛出了非预期错误 - ${error.message}`)
      return false
    }
  }
}

/**
 * 验证 canonical operation 映射的正确性
 */
function runValidation() {
  // 1. 验证 getCanonicalOperation 方法存在
  if (typeof IdempotencyService.getCanonicalOperation !== 'function') {
    console.error('❌ getCanonicalOperation 方法不存在')
    process.exit(1)
  }
  console.log('✅ getCanonicalOperation 方法已实现\n')

  // 2. 验证严格模式
  const strict_mode_valid = validateStrictMode()

  // 3. 验证映射完整性
  const { unmapped_routes } = validateMappingCompleteness()

  // 4. 测试同业务操作不同路径的 canonical operation
  console.log('\n--- 测试 Canonical Operation 映射一致性 ---')

  const test_cases = [
    // 商城兑换操作 - 测试单一路径映射
    {
      name: '商城兑换操作',
      paths: ['/api/v4/shop/exchange/exchange'],
      expected_canonical: 'SHOP_EXCHANGE_CREATE_ORDER'
    },
    // 资产转换操作
    {
      name: '资产转换操作',
      paths: ['/api/v4/shop/assets/convert'],
      expected_canonical: 'SHOP_ASSET_CONVERT'
    },
    // 抽奖操作
    {
      name: '抽奖操作',
      paths: ['/api/v4/lottery/draw'],
      expected_canonical: 'LOTTERY_DRAW'
    },
    // 市场操作 - 测试带参数路径的归一化
    {
      name: '市场购买操作',
      paths: [
        '/api/v4/market/listings/:id/purchase',
        '/api/v4/market/listings/123/purchase',
        '/api/v4/market/listings/456/purchase'
      ],
      expected_canonical: 'MARKET_PURCHASE_LISTING'
    },
    // 市场撤回操作（使用 withdraw 而不是 cancel）
    {
      name: '市场撤回操作',
      paths: ['/api/v4/market/listings/:id/withdraw', '/api/v4/market/listings/789/withdraw'],
      expected_canonical: 'MARKET_CANCEL_LISTING'
    },
    // 核销订单创建
    {
      name: '核销订单创建',
      paths: ['/api/v4/shop/redemption/orders'],
      expected_canonical: 'REDEMPTION_CREATE_ORDER'
    },
    // 物品上架
    {
      name: '物品上架',
      paths: ['/api/v4/market/list'],
      expected_canonical: 'MARKET_CREATE_LISTING'
    }
  ]

  let all_passed = strict_mode_valid

  test_cases.forEach(test_case => {
    console.log(`\n📋 ${test_case.name}:`)

    const canonical_operations = []
    let has_error = false

    for (const p of test_case.paths) {
      try {
        const canonical = IdempotencyService.getCanonicalOperation(p)
        console.log(`   路径: ${p}`)
        console.log(`   → canonical: ${canonical}`)
        canonical_operations.push(canonical)
      } catch (error) {
        console.log(`   路径: ${p}`)
        console.log(`   → 错误: ${error.code || error.message}`)
        has_error = true
      }
    }

    if (has_error) {
      console.log(`   ❌ 部分路径未映射，需要添加到 CANONICAL_OPERATION_MAP`)
      all_passed = false
    } else {
      // 验证所有路径都映射到相同的 canonical operation
      const all_same = canonical_operations.every(c => c === test_case.expected_canonical)

      if (all_same) {
        console.log(`   ✅ 所有路径正确映射到: ${test_case.expected_canonical}`)
      } else {
        console.log(`   ❌ 映射不一致! 期望: ${test_case.expected_canonical}`)
        console.log(`   实际结果: ${JSON.stringify(canonical_operations)}`)
        all_passed = false
      }
    }
  })

  // 5. 测试指纹生成
  console.log('\n--- 测试 Request Fingerprint 生成 ---')

  const fingerprint_tests = [
    {
      name: '相同业务相同参数应产生相同指纹',
      context_1: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/shop/exchange/exchange',
        query: {},
        body: { item_id: 100, quantity: 1 }
      },
      context_2: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/shop/exchange/exchange',
        query: {},
        body: { item_id: 100, quantity: 1 }
      },
      should_match: true
    },
    {
      name: '不同业务操作应产生不同指纹',
      context_1: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/lottery/draw',
        query: {},
        body: { pool_id: 1 }
      },
      context_2: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/market/list',
        query: {},
        body: { pool_id: 1 }
      },
      should_match: false
    },
    {
      name: '相同操作不同参数应产生不同指纹',
      context_1: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/lottery/draw',
        query: {},
        body: { pool_id: 1 }
      },
      context_2: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/lottery/draw',
        query: {},
        body: { pool_id: 2 }
      },
      should_match: false
    }
  ]

  fingerprint_tests.forEach(test => {
    console.log(`\n📋 ${test.name}:`)

    try {
      const fp1 = IdempotencyService.generateRequestFingerprint(test.context_1)
      const fp2 = IdempotencyService.generateRequestFingerprint(test.context_2)

      console.log(`   指纹1: ${fp1.substring(0, 16)}...`)
      console.log(`   指纹2: ${fp2.substring(0, 16)}...`)

      const matches = fp1 === fp2
      const expected = test.should_match

      if (matches === expected) {
        console.log(`   ✅ 符合预期 (${expected ? '相同' : '不同'})`)
      } else {
        console.log(
          `   ❌ 不符合预期! 期望: ${expected ? '相同' : '不同'}, 实际: ${matches ? '相同' : '不同'}`
        )
        all_passed = false
      }
    } catch (error) {
      console.log(`   ❌ 指纹生成失败: ${error.code || error.message}`)
      all_passed = false
    }
  })

  // 6. 总结
  console.log('\n' + '='.repeat(60))
  console.log('📊 验证总结')
  console.log('='.repeat(60))

  console.log(`\n严格模式（决策4-B）: ${strict_mode_valid ? '✅ 已启用' : '❌ 未正常工作'}`)
  console.log(`未映射路由数量: ${unmapped_routes.length}`)

  if (all_passed && unmapped_routes.length === 0) {
    console.log('\n🎉 所有验证通过!')
    console.log('\nCanonical Operation 机制工作正常:')
    console.log('  - 严格模式已启用（未映射路径抛出500错误）')
    console.log('  - 同业务操作通过不同URL路径产生相同指纹')
    console.log('  - 不同业务操作产生不同指纹')
    console.log('  - URL路径已与幂等性解耦')
    process.exit(0)
  } else if (all_passed) {
    console.log('\n⚠️  验证通过，但存在未映射路由')
    console.log(`   请在 CANONICAL_OPERATION_MAP 中补充 ${unmapped_routes.length} 个映射`)
    process.exit(0) // 警告但不阻止启动
  } else {
    console.log('\n❌ 部分验证失败，请检查上述错误')
    process.exit(1)
  }
}

/**
 * 供 pre_start_check.js 调用的验证函数
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
async function verifyCanonicalOperations() {
  const errors = []
  const warnings = []

  try {
    const initialized = await initializeService()
    if (!initialized) {
      errors.push('IdempotencyService 初始化失败')
      return { valid: false, errors, warnings }
    }

    // 验证 getCanonicalOperation 方法存在
    if (typeof IdempotencyService.getCanonicalOperation !== 'function') {
      errors.push('getCanonicalOperation 方法不存在')
      return { valid: false, errors, warnings }
    }

    // 验证严格模式
    const undefined_path = '/api/v4/some/undefined/write/endpoint'
    try {
      IdempotencyService.getCanonicalOperation(undefined_path)
      errors.push('严格模式失败：未映射路径没有抛出错误')
    } catch (error) {
      if (error.code !== 'CANONICAL_OPERATION_NOT_MAPPED') {
        errors.push(`严格模式异常：抛出了非预期错误 - ${error.message}`)
      }
      // 正常情况，严格模式工作正常
    }

    // 扫描未映射路由
    const write_routes = scanWriteRoutes()
    let unmapped_count = 0

    for (const route of write_routes) {
      const api_path = route.full_api_path
      const normalized = IdempotencyService.normalizePath
        ? IdempotencyService.normalizePath(api_path)
        : api_path

      if (!CANONICAL_OPERATION_MAP[api_path] && !CANONICAL_OPERATION_MAP[normalized]) {
        unmapped_count++
      }
    }

    if (unmapped_count > 0) {
      warnings.push(`${unmapped_count} 个写路由未在 CANONICAL_OPERATION_MAP 中定义`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        total_routes: write_routes.length,
        unmapped_routes: unmapped_count,
        mapped_operations: Object.keys(CANONICAL_OPERATION_MAP).length
      }
    }
  } catch (error) {
    errors.push(`验证异常: ${error.message}`)
    return { valid: false, errors, warnings }
  }
}

// 异步主函数执行
async function main() {
  const initialized = await initializeService()
  if (!initialized) {
    process.exit(1)
  }
  runValidation()
}

// 命令行执行
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 验证脚本执行失败:', error.message)
    process.exit(1)
  })
}

module.exports = { verifyCanonicalOperations }
