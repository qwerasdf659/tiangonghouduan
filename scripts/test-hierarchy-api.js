/**
 * 测试用户层级管理 API 接口
 * 用途：验证 HTTP API 返回格式和数据完整性
 * 创建时间：2026-01-09
 */

const http = require('http')

const BASE_URL = 'http://localhost:3000'

// 简单的 HTTP 请求函数
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    
    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

async function testAPIs() {
  console.log('='.repeat(60))
  console.log('🌐 测试用户层级管理 API 接口')
  console.log('='.repeat(60))

  let adminToken = null

  try {
    // 1. 先登录获取管理员token
    console.log('\n1. 管理员登录获取Token...')
    const loginRes = await makeRequest('/api/v4/console/auth/login', {
      method: 'POST',
      body: {
        mobile: '13612227930',
        password: 'Admin123456'
      }
    })
    
    if (loginRes.data.success && loginRes.data.data?.token) {
      adminToken = loginRes.data.data.token
      console.log('✅ 登录成功，获取到管理员Token')
    } else {
      console.log('⚠️ 登录失败:', loginRes.data.message || '未知错误')
      console.log('   尝试其他登录方式...')
      
      // 尝试另一个登录接口
      const loginRes2 = await makeRequest('/api/v4/auth/admin/login', {
        method: 'POST',
        body: {
          mobile: '13612227930',
          password: 'Admin123456'
        }
      })
      
      if (loginRes2.data.success && loginRes2.data.data?.token) {
        adminToken = loginRes2.data.data.token
        console.log('✅ 登录成功 (备用接口)')
      } else {
        console.log('❌ 登录失败，无法获取Token')
        console.log('   响应:', JSON.stringify(loginRes2.data, null, 2))
      }
    }

    // 2. 测试层级角色列表
    console.log('\n2. 测试获取层级角色列表...')
    const rolesRes = await makeRequest('/api/v4/console/user-hierarchy/roles', {
      headers: adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}
    })
    
    console.log(`   状态码: ${rolesRes.status}`)
    if (rolesRes.data.success) {
      console.log(`   ✅ 获取到 ${rolesRes.data.data?.length || 0} 个角色`)
      if (rolesRes.data.data?.length > 0) {
        rolesRes.data.data.forEach(role => {
          console.log(`      - ${role.role_name}: level=${role.role_level}, id=${role.role_id}`)
        })
      }
    } else {
      console.log(`   ❌ 请求失败: ${rolesRes.data.message || rolesRes.data.code}`)
    }

    // 3. 测试获取层级列表（主要测试接口）
    console.log('\n3. 测试获取用户层级列表...')
    const hierarchyRes = await makeRequest('/api/v4/console/user-hierarchy?page=1&page_size=20', {
      headers: adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}
    })
    
    console.log(`   状态码: ${hierarchyRes.status}`)
    if (hierarchyRes.data.success) {
      const data = hierarchyRes.data.data
      console.log(`   ✅ 获取到 ${data.count} 条记录`)
      console.log(`   📄 分页信息: 第${data.pagination?.page}页，共${data.pagination?.total_pages}页`)
      
      if (data.rows?.length > 0) {
        console.log('\n   📋 数据详情:')
        data.rows.slice(0, 5).forEach((row, index) => {
          console.log(`   [${index + 1}] hierarchy_id: ${row.hierarchy_id}`)
          console.log(`       用户: ${row.user_nickname || '-'} (ID: ${row.user_id})`)
          console.log(`       角色: ${row.role_name || '-'} (级别: ${row.role_level})`)
          console.log(`       上级: ${row.superior_nickname || '无'} (ID: ${row.superior_user_id || '-'})`)
          console.log(`       激活: ${row.is_active}`)
          console.log('')
        })

        // 检查字段完整性
        console.log('   🔍 字段完整性检查:')
        const firstRow = data.rows[0]
        const requiredFields = [
          'hierarchy_id', 'user_id', 'user_nickname', 'user_mobile',
          'role_id', 'role_name', 'role_level', 'is_active', 'activated_at'
        ]
        const missingFields = requiredFields.filter(f => firstRow[f] === undefined)
        
        if (missingFields.length === 0) {
          console.log('   ✅ 所有必需字段都存在')
        } else {
          console.log(`   ⚠️ 缺少字段: ${missingFields.join(', ')}`)
        }
      }
    } else {
      console.log(`   ❌ 请求失败: ${hierarchyRes.data.message || hierarchyRes.data.code}`)
      console.log(`   详情: ${JSON.stringify(hierarchyRes.data)}`)
    }

    // 4. 测试获取下级用户
    if (adminToken && hierarchyRes.data.success) {
      console.log('\n4. 测试获取下级用户 (用户31的下级)...')
      const subRes = await makeRequest('/api/v4/console/user-hierarchy/31/subordinates', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      
      console.log(`   状态码: ${subRes.status}`)
      if (subRes.data.success) {
        const subData = subRes.data.data
        console.log(`   ✅ 用户31有 ${subData.count} 个下级`)
        subData.subordinates?.slice(0, 3).forEach(sub => {
          console.log(`      - ${sub.user_nickname}: ${sub.role_name}, 激活=${sub.is_active}`)
        })
      } else {
        console.log(`   ❌ 请求失败: ${subRes.data.message}`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ API 测试完成')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
  }
}

// 运行测试
testAPIs()

