/**
 * 权限API测试脚本
 * 🛡️ 测试权限路由是否正常工作
 */

const axios = require('axios')

async function testPermissionAPI () {
  try {
    console.log('🔍 测试权限API...\n')

    // 1. 先登录获取token
    console.log('1. 登录获取token...')
    const loginResponse = await axios.post(
      'http://localhost:3000/api/v4/unified-engine/auth/login',
      {
        mobile: '13612227930',
        verification_code: '123456'
      }
    )

    if (!loginResponse.data.success) {
      console.error('❌ 登录失败:', loginResponse.data)
      return
    }

    const token = loginResponse.data.data.access_token
    console.log('✅ 登录成功，获取到token')

    // 2. 测试权限API
    console.log('\n2. 测试权限API...')
    try {
      const permissionResponse = await axios.get(
        'http://localhost:3000/api/v4/permissions/user/31',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      console.log('✅ 权限API调用成功:')
      console.log(JSON.stringify(permissionResponse.data, null, 2))
    } catch (error) {
      console.error('❌ 权限API调用失败:')
      if (error.response) {
        console.error('状态码:', error.response.status)
        console.error('响应数据:', error.response.data)
      } else {
        console.error('错误信息:', error.message)
      }
    }

    console.log('\n✅ 权限API测试完成')
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
  }
}

if (require.main === module) {
  testPermissionAPI()
}

module.exports = { testPermissionAPI }
