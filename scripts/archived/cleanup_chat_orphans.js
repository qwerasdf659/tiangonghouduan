#!/usr/bin/env node

/**
 * Chat Messages孤儿数据清理脚本
 *
 * 问题：80条chat_messages引用不存在的customer_sessions
 * 原因：历史数据清理不完整，会话被删除但消息未删除
 * 影响：外键关联失效，数据完整性问题
 *
 * 功能：
 * - 分析孤儿记录详情
 * - 备份受影响的数据
 * - 支持干运行模式（--dry-run）
 * - 安全清理孤儿数据
 * - 验证清理结果
 *
 * 使用方法：
 *   node scripts/cleanup-chat-orphans.js --dry-run  # 分析模式
 *   node scripts/cleanup-chat-orphans.js            # 实际清理
 *
 * 创建时间：2025年09月30日
 */

require('dotenv').config()
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const fs = require('fs')
const path = require('path')

class ChatOrphanCleaner {
  constructor () {
    this.stats = {
      totalMessages: 0,
      orphanMessages: 0,
      validSessions: 0,
      orphanSessions: [],
      cleanedMessages: 0,
      errors: []
    }
  }

  /**
   * 执行完整的清理流程
   */
  async run (dryRun = false) {
    console.log('🧹 === Chat Messages孤儿数据清理 ===\n')
    console.log(`模式: ${dryRun ? '🔍 分析模式（不会删除数据）' : '⚠️ 实际清理模式'}\n`)

    try {
      // 步骤1: 分析数据
      await this.analyzeOrphanData()

      if (this.stats.orphanMessages === 0) {
        console.log('✅ 未发现孤儿数据，无需清理\n')
        return
      }

      // 步骤2: 备份数据
      if (!dryRun) {
        await this.backupOrphanData()
      }

      // 步骤3: 清理数据
      if (!dryRun) {
        await this.cleanupOrphanData()
      }

      // 步骤4: 验证结果
      if (!dryRun) {
        await this.verifyCleanup()
      }

      // 步骤5: 生成报告
      this.generateReport(dryRun)
    } catch (error) {
      console.error('❌ 清理失败:', error.message)
      this.stats.errors.push(error.message)
      throw error
    } finally {
      await sequelize.close()
    }
  }

  /**
   * 分析孤儿数据
   */
  async analyzeOrphanData () {
    console.log('📊 === 数据分析 ===\n')

    // 获取总消息数
    const [totalCount] = await sequelize.query('SELECT COUNT(*) as count FROM chat_messages')
    this.stats.totalMessages = totalCount[0].count
    console.log(`📋 总消息数: ${this.stats.totalMessages}条\n`)

    // 获取有效会话数
    const [sessionCount] = await sequelize.query('SELECT COUNT(*) as count FROM customer_sessions')
    this.stats.validSessions = sessionCount[0].count
    console.log(`📋 有效会话数: ${this.stats.validSessions}个\n`)

    // 查找孤儿消息
    const [orphanData] = await sequelize.query(`
      SELECT 
        cm.session_id,
        COUNT(*) as message_count,
        MIN(cm.created_at) as first_message,
        MAX(cm.created_at) as last_message,
        GROUP_CONCAT(DISTINCT cm.sender_id) as sender_ids
      FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
      GROUP BY cm.session_id
      ORDER BY message_count DESC
    `)

    this.stats.orphanMessages = orphanData.reduce((sum, item) => sum + item.message_count, 0)
    this.stats.orphanSessions = orphanData

    if (this.stats.orphanMessages > 0) {
      console.log(`❌ 发现孤儿消息: ${this.stats.orphanMessages}条`)
      console.log(`❌ 涉及会话: ${this.stats.orphanSessions.length}个\n`)

      console.log('📋 孤儿会话详情：\n')
      this.stats.orphanSessions.forEach((session, index) => {
        console.log(`${index + 1}. 会话ID: ${session.session_id}`)
        console.log(`   消息数量: ${session.message_count}条`)
        console.log(`   时间范围: ${session.first_message} ~ ${session.last_message}`)
        console.log(`   发送者ID: ${session.sender_ids}`)
        console.log('')
      })
    } else {
      console.log('✅ 未发现孤儿消息\n')
    }
  }

  /**
   * 备份孤儿数据
   */
  async backupOrphanData () {
    console.log('💾 === 备份孤儿数据 ===\n')

    const backupDir = path.join(__dirname, '../backups/orphan_data')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const timestamp = BeijingTimeHelper.nowLocale().replace(/[^0-9]/g, '')
    const backupFile = path.join(backupDir, `chat_orphans_${timestamp}.json`)

    // 获取完整的孤儿消息数据
    const [orphanMessages] = await sequelize.query(`
      SELECT cm.*
      FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    const backupData = {
      backup_time: BeijingTimeHelper.nowLocale(),
      total_orphan_messages: orphanMessages.length,
      orphan_sessions: this.stats.orphanSessions.length,
      messages: orphanMessages
    }

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8')

    console.log(`✅ 备份完成: ${backupFile}`)
    console.log(`📦 备份大小: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB\n`)
  }

  /**
   * 清理孤儿数据
   */
  async cleanupOrphanData () {
    console.log('🗑️ === 清理孤儿数据 ===\n')

    try {
      const [result] = await sequelize.query(`
        DELETE cm FROM chat_messages cm
        LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
        WHERE cs.session_id IS NULL
      `)

      this.stats.cleanedMessages = result.affectedRows || this.stats.orphanMessages
      console.log(`✅ 已清理 ${this.stats.cleanedMessages} 条孤儿消息\n`)
    } catch (error) {
      console.error(`❌ 清理失败: ${error.message}\n`)
      throw error
    }
  }

  /**
   * 验证清理结果
   */
  async verifyCleanup () {
    console.log('✅ === 验证清理结果 ===\n')

    // 重新检查孤儿记录
    const [orphanCheck] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM chat_messages cm
      LEFT JOIN customer_sessions cs ON cm.session_id = cs.session_id
      WHERE cs.session_id IS NULL
    `)

    const remainingOrphans = orphanCheck[0].count

    if (remainingOrphans === 0) {
      console.log('✅ 验证通过：所有孤儿消息已清理\n')
    } else {
      console.error(`❌ 验证失败：仍有 ${remainingOrphans} 条孤儿消息\n`)
      this.stats.errors.push(`清理不完整，剩余${remainingOrphans}条孤儿消息`)
    }

    // 检查剩余消息数
    const [messageCount] = await sequelize.query('SELECT COUNT(*) as count FROM chat_messages')
    console.log(`📋 剩余消息总数: ${messageCount[0].count}条\n`)
  }

  /**
   * 生成清理报告
   */
  generateReport (dryRun) {
    console.log('📊 === 清理报告 ===\n')

    if (dryRun) {
      console.log('🔍 分析结果：')
      console.log(`   总消息数: ${this.stats.totalMessages}条`)
      console.log(`   有效会话数: ${this.stats.validSessions}个`)
      console.log(`   孤儿消息数: ${this.stats.orphanMessages}条`)
      console.log(`   孤儿会话数: ${this.stats.orphanSessions.length}个`)
      console.log('')
      console.log('💡 建议：')
      console.log('   1. 运行不带--dry-run参数进行实际清理')
      console.log('   2. 清理前会自动备份数据')
      console.log('   3. 建议在维护窗口执行清理操作')
    } else {
      console.log('✅ 清理完成：')
      console.log(`   原始消息数: ${this.stats.totalMessages}条`)
      console.log(`   清理消息数: ${this.stats.cleanedMessages}条`)
      console.log(`   剩余消息数: ${this.stats.totalMessages - this.stats.cleanedMessages}条`)
      console.log(`   有效会话数: ${this.stats.validSessions}个`)
      console.log('')
      console.log('📦 备份位置: backups/orphan_data/')
    }

    if (this.stats.errors.length > 0) {
      console.log('\n⚠️ 错误记录：')
      this.stats.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`)
      })
    }

    console.log('\n' + '='.repeat(50))
    console.log('🎉 清理流程完成！')
  }
}

// 主程序
async function main () {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const cleaner = new ChatOrphanCleaner()
  await cleaner.run(dryRun)
}

// 运行
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ 脚本执行成功')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 脚本执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = ChatOrphanCleaner
