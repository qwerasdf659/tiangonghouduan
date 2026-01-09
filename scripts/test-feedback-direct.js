#!/usr/bin/env node
/**
 * 反馈管理直接测试脚本
 * 
 * 直接通过服务层测试，不依赖HTTP认证
 * 
 * 使用方法：
 *   node scripts/test-feedback-direct.js
 * 
 * 创建时间：2026-01-09
 */

require('dotenv').config()

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function main() {
  log('=' .repeat(60), 'cyan')
  log('🧪 反馈管理直接测试（通过Service层）', 'cyan')
  log('=' .repeat(60), 'cyan')
  
  try {
    // 加载models
    log('\n📦 加载数据库模型...', 'cyan')
    const { sequelize } = require('../config/database')
    const models = require('../models')
    
    // 测试数据库连接
    log('🔌 测试数据库连接...', 'cyan')
    await sequelize.authenticate()
    log('✅ 数据库连接成功', 'green')
    
    // 加载FeedbackService
    const FeedbackService = require('../services/FeedbackService')
    
    // 测试1: 获取反馈列表
    log('\n📋 测试1: 获取反馈列表', 'cyan')
    try {
      const result = await FeedbackService.getFeedbackList({
        limit: 10,
        offset: 0
      })
      
      log(`✅ 获取成功: 共${result.total}条反馈`, 'green')
      
      if (result.feedbacks && result.feedbacks.length > 0) {
        log('📊 反馈列表:', 'cyan')
        result.feedbacks.slice(0, 5).forEach((f, i) => {
          log(`   ${i+1}. ID:${f.feedback_id} | 用户:${f.user?.nickname || f.user_id} | 分类:${f.category} | 状态:${f.status}`)
        })
        
        // 测试2: 获取反馈详情
        const firstId = result.feedbacks[0].feedback_id
        log(`\n🔍 测试2: 获取反馈详情 (ID: ${firstId})`, 'cyan')
        
        const detail = await FeedbackService.getFeedbackById(firstId)
        if (detail) {
          log('✅ 获取详情成功:', 'green')
          log(`   - ID: ${detail.feedback_id}`)
          log(`   - 用户ID: ${detail.user_id}`)
          log(`   - 用户昵称: ${detail.user?.nickname || '未知'}`)
          log(`   - 分类(category): ${detail.category}`)
          log(`   - 状态(status): ${detail.status}`)
          log(`   - 内容: ${(detail.content || '').substring(0, 50)}...`)
          log(`   - 附件(attachments): ${JSON.stringify(detail.attachments) || '无'}`)
          log(`   - 回复内容(reply_content): ${detail.reply_content || '暂无'}`)
          log(`   - 创建时间: ${detail.created_at}`)
        } else {
          log('❌ 反馈不存在', 'red')
        }
      } else {
        log('⚠️  没有反馈数据，将创建测试数据', 'yellow')
        
        // 查找一个用户来创建测试反馈
        const user = await models.User.findOne({ where: { status: 'active' } })
        if (user) {
          log(`📝 使用用户 ${user.user_id} 创建测试反馈...`, 'cyan')
          
          const testFeedback = await FeedbackService.createFeedback({
            user_id: user.user_id,
            category: 'bug',
            content: '这是一条测试反馈内容，用于验证反馈功能是否正常工作。',
            priority: 'medium',
            attachments: null,
            user_ip: '127.0.0.1',
            device_info: { platform: 'test' }
          })
          
          log(`✅ 创建测试反馈成功: ID=${testFeedback.feedback_id}`, 'green')
        } else {
          log('❌ 没有可用的用户', 'red')
        }
      }
      
      // 测试3: 按状态筛选
      log('\n🔎 测试3: 按状态筛选', 'cyan')
      const statuses = ['pending', 'processing', 'replied', 'closed']
      for (const status of statuses) {
        const filtered = await FeedbackService.getFeedbackList({ status, limit: 5 })
        log(`   ${status}: ${filtered.total}条`, filtered.total > 0 ? 'green' : 'yellow')
      }
      
      // 测试4: 按分类筛选
      log('\n🔎 测试4: 按分类筛选', 'cyan')
      const categories = ['technical', 'feature', 'bug', 'complaint', 'suggestion', 'other']
      for (const category of categories) {
        const filtered = await FeedbackService.getFeedbackList({ category, limit: 5 })
        log(`   ${category}: ${filtered.total}条`, filtered.total > 0 ? 'green' : 'yellow')
      }
      
    } catch (error) {
      log(`❌ 测试失败: ${error.message}`, 'red')
      console.error(error)
    }
    
    log('\n' + '=' .repeat(60), 'cyan')
    log('✅ 测试完成', 'green')
    log('=' .repeat(60), 'cyan')
    
    log('\n💡 前端字段映射确认:', 'yellow')
    log('   - 后端category字段 → 前端"反馈类型"筛选', 'cyan')
    log('   - 后端status枚举: pending/processing/replied/closed', 'cyan')
    log('   - 后端category枚举: technical/feature/bug/complaint/suggestion/other', 'cyan')
    log('   - 后端reply_content字段 → 前端"管理员回复"', 'cyan')
    log('   - 后端attachments字段 → 前端"附件图片"', 'cyan')
    
    process.exit(0)
  } catch (error) {
    log(`\n❌ 初始化失败: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  }
}

main()

