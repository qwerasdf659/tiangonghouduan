#!/usr/bin/env node
/**
 * 启用跨组材料转换规则脚本
 *
 * 业务场景：
 * - 启用 red_shard → DIAMOND (1:20) 转换规则
 * - 验证风控校验器（终点货币限制 + 全局套利检测）正常工作
 *
 * 使用方式：
 *   node scripts/database/enable_cross_group_conversion_rule.js
 *
 * 创建时间：2026-01-26
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../config/database')

async function main() {
  console.log('🔧 跨组材料转换规则启用脚本\n')

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 查询当前规则状态
    console.log('='.repeat(50))
    console.log('📋 步骤1：查询当前转换规则状态')
    console.log('='.repeat(50))

    const [rules] = await sequelize.query(`
      SELECT 
        rule_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        is_enabled,
        effective_at,
        title
      FROM material_conversion_rules
      WHERE rule_id = 1
    `)

    if (rules.length === 0) {
      console.log('❌ 未找到 rule_id=1 的规则')
      return
    }

    const rule = rules[0]
    console.log(`  规则ID: ${rule.rule_id}`)
    console.log(`  转换路径: ${rule.from_asset_code} → ${rule.to_asset_code}`)
    console.log(`  转换比例: ${rule.from_amount}:${rule.to_amount}`)
    console.log(`  当前状态: ${rule.is_enabled ? '✅ 已启用' : '❌ 已禁用'}`)
    console.log(`  标题: ${rule.title}`)
    console.log('')

    // 2. 验证风控校验器
    console.log('='.repeat(50))
    console.log('📋 步骤2：验证风控校验器')
    console.log('='.repeat(50))

    const MaterialConversionValidator = require('../../utils/materialConversionValidator')

    // 测试1：正常规则应该通过（red_shard → DIAMOND）
    console.log('\n🧪 测试1：red_shard → DIAMOND 规则校验')
    const validRule = {
      from_asset_code: 'red_shard',
      to_asset_code: 'DIAMOND',
      from_amount: 1,
      to_amount: 20
    }

    const validResult = await MaterialConversionValidator.validate(validRule)
    console.log(`   结果: ${validResult.valid ? '✅ 通过' : '❌ 拒绝'}`)
    if (validResult.errors.length > 0) {
      console.log(`   错误: ${validResult.errors.join(', ')}`)
    }

    // 测试2：终点货币规则应该被拒绝（DIAMOND → red_shard）
    console.log('\n🧪 测试2：DIAMOND → red_shard 规则校验（应被拒绝）')
    const invalidRule = {
      from_asset_code: 'DIAMOND',
      to_asset_code: 'red_shard',
      from_amount: 20,
      to_amount: 1
    }

    const invalidResult = await MaterialConversionValidator.validate(invalidRule)
    console.log(`   结果: ${invalidResult.valid ? '❌ 意外通过' : '✅ 正确拒绝'}`)
    if (invalidResult.errors.length > 0) {
      console.log(`   拒绝原因: ${invalidResult.errors[0]}`)
    }

    // 3. 启用规则
    console.log('\n' + '='.repeat(50))
    console.log('📋 步骤3：启用转换规则')
    console.log('='.repeat(50))

    if (rule.is_enabled) {
      console.log('⚠️ 规则已处于启用状态，无需修改')
    } else {
      // 只有在风控校验通过的情况下才启用
      if (validResult.valid) {
        await sequelize.query(`
          UPDATE material_conversion_rules 
          SET is_enabled = 1 
          WHERE rule_id = 1
        `)
        console.log('✅ 规则已成功启用！')
      } else {
        console.log('❌ 风控校验未通过，拒绝启用规则')
        console.log(`   原因: ${validResult.errors.join(', ')}`)
      }
    }

    // 4. 验证最终状态
    console.log('\n' + '='.repeat(50))
    console.log('📋 步骤4：验证最终状态')
    console.log('='.repeat(50))

    const [finalRules] = await sequelize.query(`
      SELECT 
        rule_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        is_enabled,
        title
      FROM material_conversion_rules
      WHERE rule_id = 1
    `)

    const finalRule = finalRules[0]
    console.log(`  规则ID: ${finalRule.rule_id}`)
    console.log(`  转换路径: ${finalRule.from_asset_code} → ${finalRule.to_asset_code}`)
    console.log(`  转换比例: ${finalRule.from_amount}:${finalRule.to_amount}`)
    console.log(`  最终状态: ${finalRule.is_enabled ? '✅ 已启用' : '❌ 已禁用'}`)

    console.log('\n' + '='.repeat(50))
    console.log('✅ 脚本执行完成')
    console.log('='.repeat(50))

  } catch (error) {
    console.error('❌ 脚本执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

main()

