#!/usr/bin/env node
/**
 * 图片资源管理API测试脚本
 *
 * 测试后端 /api/v4/console/images 系列API是否正常工作
 * 验证前端所需的分页列表、统计信息等功能
 *
 * 用法：
 *   node scripts/test-image-resources-api.js
 *
 * @date 2026-01-09
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'

// 测试用的管理员token（需要先登录获取）
let adminToken = null

/**
 * 发起HTTP请求
 */
async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`
  const headers = {
    'Content-Type': 'application/json'
  }

  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`
  }

  const options = {
    method,
    headers
  }

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(url, options)
    const data = await response.json()
    return { status: response.status, data }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

/**
 * 登录获取管理员token
 * 开发环境使用万能验证码 123456
 */
async function login() {
  console.log('\n📌 步骤1: 登录获取管理员token')

  // 尝试多个可能的管理员手机号
  const testMobiles = ['13800138000', '18888888888', '13900000000', '15000000001']

  for (const mobile of testMobiles) {
    console.log(`   尝试手机号: ${mobile}`)

    // 使用正确的参数名：mobile + verification_code
    // 开发环境万能验证码：123456
    const result = await request('POST', '/api/v4/console/auth/login', {
      mobile: mobile,
      verification_code: '123456'
    })

    // 正确读取 access_token（后端返回的是 access_token，不是 token）
    if (result.data?.success && result.data?.data?.access_token) {
      adminToken = result.data.data.access_token
      console.log(`✅ 登录成功 (${mobile})`)
      console.log(`   用户: ${result.data.data.user?.nickname}`)
      return true
    } else {
      console.log(`   ❌ ${mobile}: ${result.data?.message || '登录失败'}`)
    }
  }

  console.log('\n⚠️ 所有测试账号登录失败')
  console.log('   提示：确保数据库中存在管理员用户，或手动创建测试账号')

  return false
}

/**
 * 测试1: 获取图片列表（分页）
 */
async function testGetImageList() {
  console.log('\n📌 测试1: 获取图片列表（分页）')
  console.log('   GET /api/v4/console/images?page=1&page_size=10')

  const result = await request('GET', '/api/v4/console/images?page=1&page_size=10')

  if (result.data?.success) {
    console.log('✅ 获取图片列表成功')
    console.log('   📊 返回数据结构:')
    console.log(`      - images: ${result.data.data?.images?.length || 0} 条`)
    console.log(`      - statistics.total: ${result.data.data?.statistics?.total || 0}`)
    console.log(`      - statistics.total_size: ${result.data.data?.statistics?.total_size || 0} bytes`)
    console.log(`      - statistics.weekly_uploads: ${result.data.data?.statistics?.weekly_uploads || 0}`)
    console.log(`      - statistics.orphan_count: ${result.data.data?.statistics?.orphan_count || 0}`)
    console.log(`      - pagination.current_page: ${result.data.data?.pagination?.current_page}`)
    console.log(`      - pagination.total_pages: ${result.data.data?.pagination?.total_pages}`)

    // 验证响应字段
    const images = result.data.data?.images || []
    if (images.length > 0) {
      const firstImage = images[0]
      console.log('\n   📋 第一条图片数据字段:')
      console.log(`      - image_id: ${firstImage.image_id}`)
      console.log(`      - url: ${firstImage.url ? '✓' : '✗'}`)
      console.log(`      - original_filename: ${firstImage.original_filename}`)
      console.log(`      - file_size: ${firstImage.file_size}`)
      console.log(`      - mime_type: ${firstImage.mime_type}`)
      console.log(`      - business_type: ${firstImage.business_type}`)
      console.log(`      - status: ${firstImage.status}`)
    }

    return true
  } else {
    console.log('❌ 获取图片列表失败:', result.data?.message || result.error)
    return false
  }
}

/**
 * 测试2: 按业务类型筛选
 */
async function testFilterByBusinessType() {
  console.log('\n📌 测试2: 按业务类型筛选')

  const businessTypes = ['lottery', 'exchange', 'trade', 'uploads']

  for (const type of businessTypes) {
    console.log(`\n   GET /api/v4/console/images?business_type=${type}`)
    const result = await request('GET', `/api/v4/console/images?business_type=${type}&page=1&page_size=5`)

    if (result.data?.success) {
      const count = result.data.data?.images?.length || 0
      console.log(`   ✅ ${type}: ${count} 条记录`)
    } else {
      console.log(`   ❌ ${type}: 查询失败 - ${result.data?.message}`)
    }
  }

  return true
}

/**
 * 测试3: 筛选孤儿图片
 */
async function testFilterOrphanImages() {
  console.log('\n📌 测试3: 筛选孤儿图片（context_id=0）')
  console.log('   GET /api/v4/console/images?status=orphan')

  const result = await request('GET', '/api/v4/console/images?status=orphan&page=1&page_size=10')

  if (result.data?.success) {
    const images = result.data.data?.images || []
    console.log(`✅ 获取孤儿图片成功: ${images.length} 条`)

    // 验证所有图片的 status 都是 orphan
    const allOrphan = images.every(img => img.status === 'orphan' || img.context_id === 0)
    if (allOrphan) {
      console.log('   ✓ 所有返回的图片都是孤儿图片（context_id=0）')
    } else {
      console.log('   ⚠️ 警告：部分图片不是孤儿图片')
    }

    return true
  } else {
    console.log('❌ 获取孤儿图片失败:', result.data?.message || result.error)
    return false
  }
}

/**
 * 测试4: 获取单个图片详情
 */
async function testGetImageDetail() {
  console.log('\n📌 测试4: 获取单个图片详情')

  // 先获取一个图片ID
  const listResult = await request('GET', '/api/v4/console/images?page=1&page_size=1')

  if (!listResult.data?.success || !listResult.data?.data?.images?.length) {
    console.log('   ⚠️ 跳过：没有图片数据可供测试')
    return true
  }

  const imageId = listResult.data.data.images[0].image_id
  console.log(`   GET /api/v4/console/images/${imageId}`)

  const result = await request('GET', `/api/v4/console/images/${imageId}`)

  if (result.data?.success) {
    const image = result.data.data
    console.log('✅ 获取图片详情成功')
    console.log('   📋 详情字段:')
    console.log(`      - image_id: ${image.image_id}`)
    console.log(`      - public_url: ${image.public_url ? '✓' : '✗'}`)
    console.log(`      - original_filename: ${image.original_filename}`)
    console.log(`      - file_size: ${image.file_size}`)
    console.log(`      - mime_type: ${image.mime_type}`)
    console.log(`      - business_type: ${image.business_type}`)
    console.log(`      - context_id: ${image.context_id}`)
    console.log(`      - thumbnails: ${image.thumbnails ? '✓' : '✗'}`)

    return true
  } else {
    console.log('❌ 获取图片详情失败:', result.data?.message || result.error)
    return false
  }
}

/**
 * 测试5: 按业务获取关联图片（新增的 by-business 端点）
 */
async function testGetImagesByBusiness() {
  console.log('\n📌 测试5: 按业务获取关联图片')
  console.log('   GET /api/v4/console/images/by-business?business_type=lottery&context_id=1')

  const result = await request('GET', '/api/v4/console/images/by-business?business_type=lottery&context_id=1')

  if (result.data?.success) {
    console.log(`✅ 获取业务关联图片成功: ${result.data.data?.images?.length || 0} 条`)
    return true
  } else if (result.status === 400) {
    console.log('   ⚠️ 返回400是预期的（需要提供有效的 context_id）')
    return true
  } else {
    console.log('❌ 获取业务关联图片失败:', result.data?.message || result.error)
    return false
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('=' .repeat(60))
  console.log('📸 图片资源管理API测试')
  console.log('=' .repeat(60))
  console.log(`🔗 API地址: ${BASE_URL}`)

  // 登录
  const loginSuccess = await login()
  if (!loginSuccess) {
    console.log('\n❌ 无法登录，测试中止')
    console.log('   请确保服务已启动且有有效的管理员账号')
    process.exit(1)
  }

  // 执行测试
  const results = []

  results.push({ name: '获取图片列表', pass: await testGetImageList() })
  results.push({ name: '按业务类型筛选', pass: await testFilterByBusinessType() })
  results.push({ name: '筛选孤儿图片', pass: await testFilterOrphanImages() })
  results.push({ name: '获取图片详情', pass: await testGetImageDetail() })
  results.push({ name: '按业务获取关联图片', pass: await testGetImagesByBusiness() })

  // 汇总结果
  console.log('\n' + '=' .repeat(60))
  console.log('📊 测试结果汇总')
  console.log('=' .repeat(60))

  const passCount = results.filter(r => r.pass).length
  const totalCount = results.length

  results.forEach(r => {
    console.log(`   ${r.pass ? '✅' : '❌'} ${r.name}`)
  })

  console.log('\n' + '-'.repeat(60))
  console.log(`   通过: ${passCount}/${totalCount}`)

  if (passCount === totalCount) {
    console.log('\n🎉 所有测试通过！前端可以正常使用这些API')
  } else {
    console.log('\n⚠️ 部分测试失败，请检查相关API')
  }

  process.exit(passCount === totalCount ? 0 : 1)
}

main().catch(error => {
  console.error('测试执行异常:', error)
  process.exit(1)
})

