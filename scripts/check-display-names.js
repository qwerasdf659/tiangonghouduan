#!/usr/bin/env node
/**
 * 后端 displayNames 完整性检查脚本
 *
 * 验证内容：
 * 1. 字典数据完整性（必需的 dict_type 是否存在）
 * 2. Service 文件是否引入 attachDisplayNames
 * 3. 新增字典类型数据验证
 *
 * 使用方式：
 *   node scripts/check-display-names.js
 *
 * @since 2026-02-06
 */
'use strict'

require('dotenv').config()
const fs = require('fs')
const path = require('path')

async function checkDisplayNames() {
  const { sequelize } = require('../models')

  console.log('🔍 检查后端 displayNames 实现情况...\n')

  let allPassed = true
  let checkCount = 0
  let passCount = 0

  // ========== 1. 检查字典数据完整性 ==========
  console.log('📊 [1/3] 检查字典数据完整性...')

  const [dictTypes] = await sequelize.query(`
    SELECT dict_type, COUNT(*) as count 
    FROM system_dictionaries 
    WHERE is_enabled = 1
    GROUP BY dict_type 
    ORDER BY count DESC
  `)

  const existingTypes = dictTypes.map(d => d.dict_type)
  const totalRecords = dictTypes.reduce((sum, d) => sum + parseInt(d.count), 0)

  console.log(`  字典类型数量: ${dictTypes.length}`)
  console.log(`  字典记录总数: ${totalRecords}`)

  // 必需的字典类型
  const requiredTypes = [
    'campaign_status',
    'campaign_type',
    'user_status',
    'trade_order_status',
    'listing_status',
    'store_status',
    'lottery_alert_type',
    'lottery_alert_status',
    'lottery_alert_severity',
    'target_type',
    'operation_type'
  ]

  const missingTypes = requiredTypes.filter(t => !existingTypes.includes(t))
  checkCount++
  if (missingTypes.length > 0) {
    console.log(`  ❌ 缺失的字典类型: ${missingTypes.join(', ')}`)
    allPassed = false
  } else {
    console.log('  ✅ 所有必需的字典类型已存在')
    passCount++
  }

  // ========== 2. 检查 Service 文件是否引入 attachDisplayNames ==========
  console.log('\n📋 [2/3] 检查 Service 文件 attachDisplayNames 使用...')

  const serviceFiles = [
    // 已有使用的（验证未被破坏）
    { path: 'services/TradeOrderService.js', required: true },
    { path: 'services/UserService.js', required: true },
    { path: 'services/AuditLogService.js', required: true },
    { path: 'services/BackpackService.js', required: true },
    { path: 'services/FeedbackService.js', required: true },
    // 中文化指南要求新增
    { path: 'services/StoreService.js', required: true },
    { path: 'services/LotteryAlertService.js', required: true },
    { path: 'routes/v4/console/lottery-campaigns.js', required: true },
    // 活动管理 + 用户侧活动列表
    { path: 'services/admin-lottery/CampaignService.js', required: true },
    { path: 'services/lottery/QueryService.js', required: true },
    // 物品实例查询（资产管理模块）
    { path: 'services/asset/ItemService.js', required: true }
  ]

  for (const file of serviceFiles) {
    const filePath = path.join(__dirname, '..', file.path)
    checkCount++
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      if (content.includes('attachDisplayNames')) {
        console.log(`  ✅ ${file.path}: 已使用 attachDisplayNames`)
        passCount++
      } else if (file.required) {
        console.log(`  ❌ ${file.path}: 未使用 attachDisplayNames`)
        allPassed = false
      } else {
        console.log(`  ⚠️ ${file.path}: 未使用（非必需）`)
        passCount++
      }
    } else {
      console.log(`  ⚠️ ${file.path}: 文件不存在`)
      if (file.required) {
        allPassed = false
      } else {
        passCount++
      }
    }
  }

  // ========== 3. 验证新增字典类型数据 ==========
  console.log('\n🔍 [3/3] 验证新增字典类型数据...')

  const newTypes = ['lottery_alert_type', 'lottery_alert_status', 'lottery_alert_severity']
  const expectedCounts = { lottery_alert_type: 13, lottery_alert_status: 3, lottery_alert_severity: 3 }

  for (const dictType of newTypes) {
    checkCount++
    const [rows] = await sequelize.query(
      `SELECT dict_code, dict_name FROM system_dictionaries WHERE dict_type = '${dictType}' AND is_enabled = 1 ORDER BY sort_order`
    )

    const expected = expectedCounts[dictType]
    if (rows.length >= expected) {
      console.log(`  ✅ ${dictType}: ${rows.length}条 (期望≥${expected})`)
      passCount++
    } else {
      console.log(`  ❌ ${dictType}: ${rows.length}条 (期望≥${expected})`)
      allPassed = false
    }
  }

  // 验证 DICT_TYPES 常量是否包含新增类型
  checkCount++
  const { DICT_TYPES } = require('../utils/displayNameHelper')
  const dictTypesCheck = newTypes.every(t => {
    const constName = t.toUpperCase()
    return Object.values(DICT_TYPES).includes(t)
  })
  if (dictTypesCheck) {
    console.log('  ✅ DICT_TYPES 常量包含所有新增类型')
    passCount++
  } else {
    console.log('  ❌ DICT_TYPES 常量缺少新增类型')
    allPassed = false
  }

  // ========== 总结 ==========
  console.log('\n' + '='.repeat(50))
  console.log(`📊 检查完成: ${passCount}/${checkCount} 通过`)
  console.log(allPassed ? '✅ 后端 displayNames 检查全部通过' : '❌ 后端 displayNames 检查未通过')
  console.log('='.repeat(50))

  await sequelize.close()
  return allPassed
}

checkDisplayNames()
  .then(passed => {
    process.exit(passed ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ 检查脚本执行失败:', err.message)
    process.exit(1)
  })

