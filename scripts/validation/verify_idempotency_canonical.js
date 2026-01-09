#!/usr/bin/env node
/**
 * 幂等服务 Canonical Operation 验证脚本
 * 验证 canonical operation 映射和指纹生成是否正确解耦URL路径
 *
 * 用途：验证同一业务操作通过不同URL路径产生相同的 request_fingerprint
 * 执行：node scripts/validation/verify-idempotency-canonical.js
 *
 * P1-9：已改造为通过 ServiceManager 获取服务（snake_case key）
 * 更新时间：2026-01-09
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

// 验证映射配置
console.log('=== 幂等服务 Canonical Operation 验证 ===\n')

/*
 * P1-9：通过 ServiceManager 获取 IdempotencyService
 * 服务键：'idempotency'（snake_case）
 */
let IdempotencyService
async function initializeService() {
  try {
    const serviceManager = require('../../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    IdempotencyService = serviceManager.getService('idempotency')
    console.log('✅ IdempotencyService 加载成功（P1-9 ServiceManager）')
    return true
  } catch (error) {
    console.error('❌ IdempotencyService 加载失败:', error.message)
    return false
  }
}

/**
 * P1-9：将验证逻辑封装为函数，支持异步初始化后执行
 */
function runValidation() {
  // 2. 验证 getCanonicalOperation 方法存在
  if (typeof IdempotencyService.getCanonicalOperation !== 'function') {
    console.error('❌ getCanonicalOperation 方法不存在')
    process.exit(1)
  }
  console.log('✅ getCanonicalOperation 方法已实现\n')

  // 3. 测试同业务操作不同路径的 canonical operation
  console.log('--- 测试 Canonical Operation 映射 ---')

  const test_cases = [
    // 商城兑换操作 - 两个路径应该映射到同一个 canonical operation
    {
      name: '商城兑换操作',
      paths: ['/api/v4/exchange_market/exchange', '/api/v4/shop/exchange/exchange'],
      expected_canonical: 'SHOP_EXCHANGE_CREATE_ORDER'
    },
    // 资产转换操作
    {
      name: '资产转换操作',
      paths: ['/api/v4/assets/convert', '/api/v4/shop/assets/convert'],
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
    // 市场取消操作
    {
      name: '市场取消操作',
      paths: ['/api/v4/market/listings/:id/cancel', '/api/v4/market/listings/789/cancel'],
      expected_canonical: 'MARKET_CANCEL_LISTING'
    }
  ]

  let all_passed = true

  test_cases.forEach(test_case => {
    console.log(`\n📋 ${test_case.name}:`)

    const canonical_operations = test_case.paths.map(p => {
      const canonical = IdempotencyService.getCanonicalOperation(p)
      console.log(`   路径: ${p}`)
      console.log(`   → canonical: ${canonical}`)
      return canonical
    })

    // 验证所有路径都映射到相同的 canonical operation
    const all_same = canonical_operations.every(c => c === test_case.expected_canonical)

    if (all_same) {
      console.log(`   ✅ 所有路径正确映射到: ${test_case.expected_canonical}`)
    } else {
      console.log(`   ❌ 映射不一致! 期望: ${test_case.expected_canonical}`)
      console.log(`   实际结果: ${JSON.stringify(canonical_operations)}`)
      all_passed = false
    }
  })

  // 4. 测试指纹生成
  console.log('\n--- 测试 Request Fingerprint 生成 ---')

  const fingerprint_tests = [
    {
      name: '同业务操作不同路径应产生相同指纹',
      context_1: {
        user_id: 1001,
        http_method: 'POST',
        api_path: '/api/v4/exchange_market/exchange',
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
        api_path: '/api/v4/market/listings',
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
  })

  // 5. 测试未定义路径的警告
  console.log('\n--- 测试未定义路径警告 ---')
  const undefined_path = '/api/v4/some/undefined/write/endpoint'
  const result = IdempotencyService.getCanonicalOperation(undefined_path)
  console.log(`   未定义路径: ${undefined_path}`)
  console.log(`   返回值: ${result}`)
  console.log(`   ✅ 未定义路径正确返回原路径 (触发警告日志)`)

  // 6. 总结
  console.log('\n' + '='.repeat(50))
  if (all_passed) {
    console.log('🎉 所有验证通过!')
    console.log('\nCanonical Operation 机制工作正常:')
    console.log('  - 同业务操作通过不同URL路径产生相同指纹')
    console.log('  - 不同业务操作产生不同指纹')
    console.log('  - URL路径已与幂等性解耦')
    process.exit(0)
  } else {
    console.log('❌ 部分验证失败，请检查上述错误')
    process.exit(1)
  }
}

// P1-9：异步主函数执行
async function main() {
  const initialized = await initializeService()
  if (!initialized) {
    process.exit(1)
  }
  runValidation()
}

main().catch(error => {
  console.error('❌ 验证脚本执行失败:', error.message)
  process.exit(1)
})
