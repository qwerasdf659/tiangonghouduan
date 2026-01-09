#!/usr/bin/env node
/**
 * 测试脚本：验证资产管理功能
 * 1. 创建测试资产类型
 * 2. 验证API返回格式
 *
 * 使用方式：
 * node scripts/test-asset-data.js
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

async function main() {
  console.log('🚀 开始资产管理功能测试...\n')
  console.log(`⏰ 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

  try {
    // 初始化数据库连接
    const { sequelize } = require('../models')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 获取 MaterialAssetType 模型
    const MaterialAssetType = sequelize.models.MaterialAssetType

    // 1. 检查现有资产类型
    console.log('📋 检查现有资产类型...')
    const existingTypes = await MaterialAssetType.findAll()
    console.log(`   现有资产类型数量: ${existingTypes.length}`)

    if (existingTypes.length > 0) {
      console.log('   现有资产类型:')
      existingTypes.forEach(type => {
        console.log(
          `   - ${type.asset_code}: ${type.display_name} (${type.is_enabled ? '启用' : '禁用'})`
        )
      })
    }

    // 2. 如果没有资产类型，创建测试数据
    if (existingTypes.length === 0) {
      console.log('\n📝 创建测试资产类型...')

      const testTypes = [
        {
          asset_code: 'red_shard',
          display_name: '红色碎片',
          group_code: 'red',
          form: 'shard',
          tier: 1,
          sort_order: 10,
          visible_value_points: 10,
          budget_value_points: 5,
          is_enabled: true
        },
        {
          asset_code: 'red_crystal',
          display_name: '红色水晶',
          group_code: 'red',
          form: 'crystal',
          tier: 2,
          sort_order: 20,
          visible_value_points: 100,
          budget_value_points: 50,
          is_enabled: true
        },
        {
          asset_code: 'orange_shard',
          display_name: '橙色碎片',
          group_code: 'orange',
          form: 'shard',
          tier: 1,
          sort_order: 30,
          visible_value_points: 15,
          budget_value_points: 8,
          is_enabled: true
        }
      ]

      for (const typeData of testTypes) {
        try {
          await MaterialAssetType.create(typeData)
          console.log(`   ✅ 创建成功: ${typeData.asset_code}`)
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            console.log(`   ⚠️ 已存在: ${typeData.asset_code}`)
          } else {
            console.log(`   ❌ 创建失败: ${typeData.asset_code} - ${error.message}`)
          }
        }
      }
    }

    // 3. 验证 Service 层返回格式
    console.log('\n🔍 验证 Service 层返回格式...')
    const MaterialManagementService = require('../services/MaterialManagementService')
    const result = await MaterialManagementService.listAssetTypes({})

    console.log('   Service 返回结构:')
    console.log(`   - 类型: ${typeof result}`)
    console.log(`   - 字段: ${Object.keys(result).join(', ')}`)
    console.log(
      `   - asset_types 类型: ${Array.isArray(result.asset_types) ? 'Array' : typeof result.asset_types}`
    )
    console.log(`   - asset_types 数量: ${result.asset_types?.length || 0}`)

    if (result.asset_types?.length > 0) {
      console.log('   - 第一项字段:')
      const firstItem = result.asset_types[0]
      Object.keys(firstItem).forEach(key => {
        console.log(
          `     - ${key}: ${typeof firstItem[key]} = ${JSON.stringify(firstItem[key]).substring(0, 50)}`
        )
      })
    }

    // 4. 验证 ApiResponse 格式
    console.log('\n🔍 验证 API 响应格式...')
    const ApiResponse = require('../utils/ApiResponse')
    const mockResponse = ApiResponse.success(result, '查询成功')

    console.log('   API 响应结构:')
    console.log(`   - success: ${mockResponse.success}`)
    console.log(`   - code: ${mockResponse.code}`)
    console.log(`   - message: ${mockResponse.message}`)
    console.log(`   - data 类型: ${typeof mockResponse.data}`)
    console.log(
      `   - data.asset_types: ${Array.isArray(mockResponse.data?.asset_types) ? `Array[${mockResponse.data.asset_types.length}]` : 'undefined'}`
    )

    console.log('\n✅ 测试完成！')
    console.log('\n📊 前端数据解析指南:')
    console.log('   response.data.asset_types - 获取资产类型数组')
    console.log('   response.data.rules - 获取转换规则数组')
    console.log('   response.data.transactions - 获取流水记录数组')

    // 关闭数据库连接
    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
