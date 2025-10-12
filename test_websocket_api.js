#!/usr/bin/env node
/**
 * WebSocket聊天功能测试脚本
 * 测试聊天API和WebSocket实时推送功能
 */

const axios = require('axios')

const BASE_URL = 'http://localhost:3000'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozMSwibW9iaWxlIjoiMTM2MTIyMjc5MzAiLCJuaWNrbmFtZSI6IueuoeeQhuWRmOeUqOaItyIsInN0YXR1cyI6ImFjdGl2ZSIsInJvbGVfbGV2ZWwiOjEwMCwiaXNfYWRtaW4iOnRydWUsInVzZXJfcm9sZSI6ImFkbWluIiwiaWF0IjoxNzYwMTMzNzc4LCJleHAiOjE3NjAxNDA5Nzh9.eqMAOrBsBJF5RKIgCze0ZcV72fr86kOI9o0Re_pKZHE'

async function test () {
  console.log('🧪 开始测试WebSocket聊天功能...\n')

  try {
    // 1. 创建聊天会话
    console.log('1️⃣ 测试创建聊天会话...')
    const createRes = await axios.post(`${BASE_URL}/api/v4/system/chat/create`, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })

    console.log('✅ 会话创建成功')
    console.log(`   session_id: ${createRes.data.data.session_id}`)
    console.log(`   status: ${createRes.data.data.status}`)
    console.log(`   source: ${createRes.data.data.source}\n`)

    const sessionId = createRes.data.data.session_id

    // 2. 发送消息（会触发WebSocket推送）
    console.log('2️⃣ 测试发送消息（会触发WebSocket推送）...')
    const sendRes = await axios.post(`${BASE_URL}/api/v4/system/chat/send`, {
      session_id: sessionId,
      content: '测试WebSocket实时推送功能',
      message_type: 'text'
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })

    console.log('✅ 消息发送成功')
    console.log(`   message_id: ${sendRes.data.data.message_id}`)
    console.log(`   content: ${sendRes.data.data.content}\n`)

    // 3. 查询WebSocket状态
    console.log('3️⃣ 查询WebSocket服务状态...')
    const wsStatusRes = await axios.get(`${BASE_URL}/api/v4/system/chat/ws-status`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })

    console.log('✅ WebSocket状态查询成功')
    console.log(`   运行状态: ${wsStatusRes.data.data.isRunning}`)
    console.log(`   在线用户数: ${wsStatusRes.data.data.connectedUsers}`)
    console.log(`   在线客服数: ${wsStatusRes.data.data.connectedAdmins}\n`)

    console.log('🎉 所有测试通过！')
  } catch (error) {
    console.error('\n❌ 测试失败:')
    if (error.response) {
      console.error('   状态码:', error.response.status)
      console.error('   错误信息:', JSON.stringify(error.response.data, null, 2))
    } else {
      console.error('   错误:', error.message)
    }
    process.exit(1)
  }
}

test()
