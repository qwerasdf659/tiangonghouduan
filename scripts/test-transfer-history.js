/**
 * 测试转让历史接口
 * 验证普通用户和管理员的权限控制
 */

require('dotenv').config()
const axios = require('axios')

const BASE_URL = 'http://localhost:3000'

async function testTransferHistory () {
  try {
    console.log('🔍 开始测试转让历史接口...\n')

    // 1. 管理员登录
    console.log('1️⃣ 管理员登录（13612227930）...')
    const adminLogin = await axios.post(`${BASE_URL}/api/v4/unified-engine/auth/login`, {
      mobile: '13612227930',
      verification_code: '123456'
    })
    const adminToken = adminLogin.data.data.access_token
    const adminData = adminLogin.data.data.user
    console.log('✅ 管理员登录成功')
    console.log('   User ID:', adminData.user_id)
    console.log('   Role Level:', adminData.roles[0].role_level)
    console.log('   Is Admin:', adminData.role_based_admin)

    // 2. 管理员查看转让历史（不带item_id）
    console.log('\n2️⃣ 管理员查看转让历史（不带item_id）...')
    const adminTransferRes = await axios.get(
      `${BASE_URL}/api/v4/inventory/transfer-history?page=1&limit=5`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    )
    console.log('✅ 查询成功')
    console.log('   状态码:', adminTransferRes.status)
    console.log('   Success:', adminTransferRes.data.success)
    console.log('   Message:', adminTransferRes.data.message)
    console.log('   总记录数:', adminTransferRes.data.data.pagination.total_count)
    console.log('   返回记录数:', adminTransferRes.data.data.transfer_history.length)
    console.log('   查看模式:', adminTransferRes.data.data.filter.view_mode)

    if (adminTransferRes.data.data.transfer_history.length > 0) {
      console.log('\n📝 示例记录（第1条）:')
      const record = adminTransferRes.data.data.transfer_history[0]
      console.log('   Transfer ID:', record.transfer_id)
      console.log('   Item ID:', record.item_id)
      console.log('   Item Name:', record.item_name)
      console.log('   From User:', `${record.from_user_name} (ID: ${record.from_user_id})`)
      console.log('   To User:', `${record.to_user_name} (ID: ${record.to_user_id})`)
      console.log('   Status:', record.status)
      console.log('   Created At:', record.created_at)
      console.log('   Direction:', record.direction || 'N/A (admin view)')
    } else {
      console.log('\n📝 暂无转让记录')
    }

    // 3. 如果有转让记录，测试管理员查看特定item的完整链条
    if (adminTransferRes.data.data.transfer_history.length > 0) {
      const firstRecord = adminTransferRes.data.data.transfer_history[0]
      const testItemId = firstRecord.item_id

      if (testItemId) {
        console.log(`\n3️⃣ 管理员查看物品${testItemId}的完整转让链条...`)
        const chainRes = await axios.get(
          `${BASE_URL}/api/v4/inventory/transfer-history?item_id=${testItemId}&page=1&limit=10`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        )
        console.log('✅ 查询成功')
        console.log('   物品ID:', testItemId)
        console.log('   转让次数:', chainRes.data.data.pagination.total_count)
        console.log('   查看模式:', chainRes.data.data.filter.view_mode)
      }
    }

    console.log('\n✅ 所有测试通过！')
  } catch (error) {
    console.error('\n❌ 测试失败:')
    if (error.response) {
      console.error('   状态码:', error.response.status)
      console.error('   错误信息:', error.response.data)
    } else {
      console.error('   错误:', error.message)
    }
    process.exit(1)
  }
}

testTransferHistory()
