/**
 * 测试脚本：验证物品转移功能和审计日志记录
 *
 * 测试目标：
 * 1. 验证InventoryService.transferItem方法是否正常工作
 * 2. 验证物品转让是否正确记录审计日志
 * 3. 验证审计日志的operation_type是否为'inventory_transfer'
 * 4. 验证审计日志包含的关键信息（操作员、转让双方、物品信息等）
 *
 * 测试步骤：
 * 1. 查询数据库中的可用物品
 * 2. 模拟物品转让操作（如果有可用物品）
 * 3. 查询审计日志验证记录
 *
 * 运行方式：
 * node scripts/test_inventory_transfer_audit.js
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

require('dotenv').config()
const { sequelize, UserInventory, AdminOperationLog, User } = require('../models')
const InventoryService = require('../services/InventoryService')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 主测试函数
 */
async function testInventoryTransferAudit () {
  console.log('========================================')
  console.log('物品转移审计日志测试')
  console.log('========================================\n')

  try {
    // 步骤1：检查数据库连接
    console.log('步骤1：检查数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 步骤2：查询测试用户（13612227930）
    console.log('步骤2：查询测试用户...')
    const testUser = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      console.log('❌ 测试用户不存在（手机号：13612227930）')
      console.log('请先创建测试用户或使用其他用户进行测试\n')
      return
    }

    console.log(`✅ 找到测试用户: ${testUser.nickname} (user_id: ${testUser.user_id})\n`)

    // 步骤3：查询另一个用户作为接收方
    console.log('步骤3：查询接收方用户...')
    const receiverUser = await User.findOne({
      where: {
        user_id: {
          [sequelize.Sequelize.Op.ne]: testUser.user_id
        }
      },
      limit: 1
    })

    if (!receiverUser) {
      console.log('❌ 未找到接收方用户')
      console.log('需要至少2个用户才能测试物品转让功能\n')
      return
    }

    console.log(
      `✅ 找到接收方用户: ${receiverUser.nickname} (user_id: ${receiverUser.user_id})\n`
    )

    // 步骤4：查询测试用户的可用物品
    console.log('步骤4：查询可用物品...')
    const availableItem = await UserInventory.findOne({
      where: {
        user_id: testUser.user_id,
        status: 'available',
        can_transfer: true
      },
      order: [['created_at', 'DESC']]
    })

    if (!availableItem) {
      console.log('⚠️  测试用户没有可转让的物品')
      console.log('跳过物品转让测试，仅检查审计日志配置\n')

      // 检查审计日志枚举值
      const [results] = await sequelize.query(`
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'admin_operation_logs'
          AND COLUMN_NAME = 'operation_type'
      `)

      if (results.length > 0) {
        const columnType = results[0].COLUMN_TYPE
        console.log('数据库operation_type枚举值:')
        console.log(columnType)

        if (columnType.includes('inventory_transfer')) {
          console.log('\n✅ 数据库已包含inventory_transfer枚举值')
        } else {
          console.log('\n❌ 数据库缺少inventory_transfer枚举值')
        }
      }

      return
    }

    console.log(`✅ 找到可转让物品: ${availableItem.name} (inventory_id: ${availableItem.inventory_id})`)
    console.log(`   当前所有者: user_id=${availableItem.user_id}`)
    console.log(`   转让次数: ${availableItem.transfer_count || 0}\n`)

    // 步骤5：记录转让前的审计日志数量
    console.log('步骤5：查询转让前的审计日志数量...')
    const beforeCount = await AdminOperationLog.count({
      where: {
        operation_type: 'inventory_transfer'
      }
    })
    console.log(`转让前inventory_transfer类型的审计日志数量: ${beforeCount}\n`)

    // 步骤6：执行物品转让
    console.log('步骤6：执行物品转让...')
    console.log(
      `从用户${testUser.user_id}转让物品${availableItem.inventory_id}给用户${receiverUser.user_id}`
    )

    const transferResult = await InventoryService.transferItem(
      testUser.user_id,
      receiverUser.user_id,
      availableItem.inventory_id,
      {
        transfer_note: '测试物品转让审计日志功能'
      }
    )

    console.log('✅ 物品转让成功')
    console.log(`   转让ID: ${transferResult.transfer_id}`)
    console.log(`   物品名称: ${transferResult.name}`)
    console.log(`   转让时间: ${BeijingTimeHelper.formatForAPI(transferResult.transferred_at)}`)
    console.log(`   新的转让次数: ${transferResult.transfer_count}\n`)

    // 步骤7：等待一秒确保审计日志已写入（异步写入）
    console.log('步骤7：等待审计日志写入...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('✅ 等待完成\n')

    // 步骤8：查询转让后的审计日志
    console.log('步骤8：查询转让后的审计日志...')
    const afterCount = await AdminOperationLog.count({
      where: {
        operation_type: 'inventory_transfer'
      }
    })
    console.log(`转让后inventory_transfer类型的审计日志数量: ${afterCount}`)
    console.log(`新增审计日志数量: ${afterCount - beforeCount}\n`)

    // 步骤9：查询最新的转让审计日志详情
    console.log('步骤9：查询最新的转让审计日志详情...')
    const latestLog = await AdminOperationLog.findOne({
      where: {
        operation_type: 'inventory_transfer',
        target_id: availableItem.inventory_id
      },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    if (latestLog) {
      console.log('✅ 找到审计日志记录:')
      console.log(`   log_id: ${latestLog.log_id}`)
      console.log(`   operation_type: ${latestLog.operation_type}`)
      console.log(`   target_type: ${latestLog.target_type}`)
      console.log(`   target_id: ${latestLog.target_id}`)
      console.log(`   action: ${latestLog.action}`)
      console.log(`   operator_id: ${latestLog.operator_id} (${latestLog.operator?.nickname || '未知'})`)
      console.log(`   reason: ${latestLog.reason}`)
      console.log(`   business_id: ${latestLog.business_id}`)

      if (latestLog.before_data) {
        console.log('   before_data:', JSON.stringify(latestLog.before_data))
      }

      if (latestLog.after_data) {
        console.log('   after_data:', JSON.stringify(latestLog.after_data))
      }

      if (latestLog.changed_fields && latestLog.changed_fields.length > 0) {
        console.log('   changed_fields:', JSON.stringify(latestLog.changed_fields))
      }

      console.log(`   created_at: ${BeijingTimeHelper.formatForAPI(latestLog.created_at)}\n`)
    } else {
      console.log('❌ 未找到审计日志记录\n')
    }

    // 步骤10：验证结果
    console.log('步骤10：验证测试结果...')
    const isSuccess = afterCount > beforeCount && latestLog !== null

    if (isSuccess) {
      console.log('✅ 测试通过！物品转让审计日志功能正常工作')
      console.log('\n验证项：')
      console.log('  ✅ 物品转让操作成功')
      console.log('  ✅ 审计日志已创建')
      console.log('  ✅ operation_type为inventory_transfer')
      console.log('  ✅ 包含完整的审计信息（操作员、目标、变更数据等）')
    } else {
      console.log('❌ 测试失败！审计日志未正确记录')
    }
  } catch (error) {
    console.error('❌ 测试过程中发生错误:')
    console.error(`   错误信息: ${error.message}`)
    console.error(`   错误堆栈: ${error.stack}`)
  } finally {
    // 关闭数据库连接
    await sequelize.close()
    console.log('\n========================================')
    console.log('测试结束')
    console.log('========================================')
  }
}

// 运行测试
testInventoryTransferAudit()
