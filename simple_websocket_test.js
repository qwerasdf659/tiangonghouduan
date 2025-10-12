#!/usr/bin/env node
const axios = require('axios')

const BASE_URL = 'http://localhost:3000'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozMSwibW9iaWxlIjoiMTM2MTIyMjc5MzAiLCJuaWNrbmFtZSI6IueuoeeQhuWRmOeUqOaItyIsInN0YXR1cyI6ImFjdGl2ZSIsInJvbGVfbGV2ZWwiOjEwMCwiaXNfYWRtaW4iOnRydWUsInVzZXJfcm9sZSI6ImFkbWluIiwiaWF0IjoxNzYwMTMzNzc4LCJleHAiOjE3NjAxNDA5Nzh9.eqMAOrBsBJF5RKIgCze0ZcV72fr86kOI9o0Re_pKZHE'

async function testSendMessage () {
  try {
    console.log('📤 发送测试消息...')
    const res = await axios.post(`${BASE_URL}/api/v4/system/chat/send`, {
      session_id: 9,
      content: '这是WebSocket推送测试消息' + Date.now(),
      message_type: 'text'
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000
    })

    console.log('✅ 消息发送成功:', res.data.data.message_id)
    return true
  } catch (error) {
    console.error('❌ 发送失败:', error.message)
    return false
  }
}

async function testWebSocketStatus () {
  try {
    console.log('🔍 查询WebSocket状态...')
    const res = await axios.get(`${BASE_URL}/api/v4/system/chat/ws-status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 5000
    })

    console.log('✅ WebSocket状态:')
    console.log('   运行中:', res.data.data.isRunning)
    console.log('   用户数:', res.data.data.connectedUsers)
    console.log('   客服数:', res.data.data.connectedAdmins)
    return true
  } catch (error) {
    console.error('❌ 查询失败:', error.message)
    return false
  }
}

(async () => {
  const r1 = await testSendMessage()
  const r2 = await testWebSocketStatus()

  if (r1 && r2) {
    console.log('\n🎉 测试通过！')
    process.exit(0)
  } else {
    console.log('\n❌ 部分测试失败')
    process.exit(1)
  }
})()
