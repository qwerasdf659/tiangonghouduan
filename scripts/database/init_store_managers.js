#!/usr/bin/env node
/**
 * 上线前初始化数据脚本 - 确保每店至少一个 active merchant_manager
 *
 * @description 检查并初始化每个门店至少有一个在职的 merchant_manager
 *              这是商家员工域权限体系升级的上线前置条件
 *
 * 业务场景：
 * - 当前真实库 store_staff 全是 inactive
 * - 如果商家员工调用商家域接口会被挡（NO_STORE_BINDING/STORE_ACCESS_DENIED）
 * - 需要确保每个门店有可用的 merchant_manager 在职记录
 *
 * 运行方式：
 *   - 预览模式（默认）：node scripts/database/init_store_managers.js
 *   - 执行模式：node scripts/database/init_store_managers.js --execute
 *
 * 逻辑说明：
 * 1. 检查每个 active 门店是否有在职的 merchant_manager
 * 2. 如果门店有员工但全是 inactive，将最近一个 manager 或 staff 激活为 manager
 * 3. 如果门店完全没有员工，需要人工指定（生成待处理列表）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - P1 上线前初始化数据
 */

'use strict'

require('dotenv').config()

const { sequelize } = require('../../models')
const { Store, StoreStaff, User } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 是否为执行模式（默认预览模式）
const EXECUTE_MODE = process.argv.includes('--execute')

console.log('='.repeat(60))
console.log('📋 上线前初始化数据脚本 - 门店店长初始化')
console.log('='.repeat(60))
console.log(`⏰ 执行时间: ${BeijingTimeHelper.formatForAPI(new Date())}`)
console.log(
  `🔧 运行模式: ${EXECUTE_MODE ? '🔴 执行模式' : '🟢 预览模式（使用 --execute 参数执行）'}`
)
console.log('')

/**
 * 获取所有 active 门店及其员工状态
 *
 * @returns {Promise<Array>} 门店列表及员工状态
 */
async function getStoreStaffStatus() {
  const stores = await Store.findAll({
    where: { status: 'active' },
    include: [
      {
        model: User,
        as: 'merchant',
        attributes: ['user_id', 'nickname', 'mobile']
      }
    ],
    order: [['store_id', 'ASC']]
  })

  const result = []

  for (const store of stores) {
    // 获取该门店的所有员工记录
    const allStaff = await StoreStaff.findAll({
      where: { store_id: store.store_id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [
        ['role_in_store', 'DESC'], // manager 优先
        ['updated_at', 'DESC'] // 最近更新的优先
      ]
    })

    // 获取在职员工
    const activeStaff = allStaff.filter(s => s.status === 'active')
    const activeManagers = activeStaff.filter(s => s.role_in_store === 'manager')

    // 获取非在职员工（可能恢复为在职）
    const inactiveStaff = allStaff.filter(s => s.status !== 'active')
    const pendingStaff = allStaff.filter(s => s.status === 'pending')

    result.push({
      store_id: store.store_id,
      store_name: store.store_name,
      store_code: store.store_code,
      merchant: store.merchant,
      all_staff_count: allStaff.length,
      active_staff_count: activeStaff.length,
      active_manager_count: activeManagers.length,
      inactive_staff_count: inactiveStaff.length,
      pending_staff_count: pendingStaff.length,
      has_active_manager: activeManagers.length > 0,
      all_staff: allStaff,
      inactive_staff: inactiveStaff,
      pending_staff: pendingStaff
    })
  }

  return result
}

/**
 * 激活员工为 manager
 *
 * @param {number} store_staff_id - store_staff 记录 ID
 * @param {Transaction} [transaction] - 事务对象
 * @returns {Promise<Object>} 激活结果
 */
async function activateAsManager(store_staff_id, transaction) {
  const record = await StoreStaff.findByPk(store_staff_id, { transaction })
  if (!record) {
    throw new Error(`store_staff_id ${store_staff_id} 不存在`)
  }

  await record.update(
    {
      status: 'active',
      role_in_store: 'manager',
      joined_at: BeijingTimeHelper.createDatabaseTime(),
      notes: '上线前初始化脚本自动激活为店长'
    },
    { transaction }
  )

  return record
}

/**
 * 主执行函数
 */
async function main() {
  const transaction = EXECUTE_MODE ? await sequelize.transaction() : null

  try {
    // 1. 获取门店员工状态
    console.log('🔍 正在检查门店员工状态...')
    const storeStatus = await getStoreStaffStatus()

    console.log(`📊 共有 ${storeStatus.length} 个 active 门店\n`)

    // 2. 分类统计
    const storesNeedAction = storeStatus.filter(s => !s.has_active_manager)
    const storesOK = storeStatus.filter(s => s.has_active_manager)

    console.log('='.repeat(60))
    console.log('📈 统计摘要')
    console.log('='.repeat(60))
    console.log(`✅ 已有在职店长的门店: ${storesOK.length} 个`)
    console.log(`⚠️  需要处理的门店: ${storesNeedAction.length} 个`)
    console.log('')

    if (storesOK.length > 0) {
      console.log('--- 已有在职店长的门店 ---')
      storesOK.forEach(s => {
        console.log(`  ✅ [${s.store_id}] ${s.store_name} - ${s.active_manager_count} 个店长`)
      })
      console.log('')
    }

    if (storesNeedAction.length === 0) {
      console.log('🎉 所有门店都已有在职店长，无需处理！')
      if (transaction) {
        await transaction.rollback()
      }
      return
    }

    // 3. 处理需要操作的门店
    console.log('='.repeat(60))
    console.log('🔧 处理需要操作的门店')
    console.log('='.repeat(60))

    const autoActivated = []
    const needManualAction = []

    for (const store of storesNeedAction) {
      console.log(`\n📍 [${store.store_id}] ${store.store_name}`)
      console.log(
        `   员工总数: ${store.all_staff_count}, 在职: ${store.active_staff_count}, 非在职: ${store.inactive_staff_count}`
      )

      if (store.all_staff_count === 0) {
        // 门店完全没有员工，需要人工创建
        console.log('   ❌ 无任何员工记录，需要人工创建店长')
        needManualAction.push({
          store_id: store.store_id,
          store_name: store.store_name,
          store_code: store.store_code,
          merchant: store.merchant,
          reason: '无任何员工记录',
          action: '需要人工在管理后台创建店长并绑定到门店'
        })
      } else if (store.inactive_staff_count > 0 || store.pending_staff_count > 0) {
        // 有非在职员工，选择一个激活为店长
        const candidates = [...store.inactive_staff, ...store.pending_staff]
        // 优先选择原来是 manager 的，其次选择最近更新的
        const bestCandidate = candidates.find(s => s.role_in_store === 'manager') || candidates[0]

        if (bestCandidate) {
          console.log(
            `   🔄 选择激活: store_staff_id=${bestCandidate.store_staff_id}, user_id=${bestCandidate.user_id}`
          )
          console.log(
            `      用户: ${bestCandidate.user?.nickname || '未知'} (${bestCandidate.user?.mobile || '未知'})`
          )
          console.log(
            `      原角色: ${bestCandidate.role_in_store}, 原状态: ${bestCandidate.status}`
          )

          if (EXECUTE_MODE) {
            await activateAsManager(bestCandidate.store_staff_id, transaction)
            console.log('   ✅ 已激活为店长')
          } else {
            console.log('   📝 [预览] 将激活为店长')
          }

          autoActivated.push({
            store_id: store.store_id,
            store_name: store.store_name,
            store_staff_id: bestCandidate.store_staff_id,
            user_id: bestCandidate.user_id,
            user_nickname: bestCandidate.user?.nickname,
            user_mobile: bestCandidate.user?.mobile
          })
        }
      } else {
        // 只有在职员工但没有店长（理论上不应该发生）
        console.log('   ⚠️ 有在职员工但无店长，需要人工指定一个员工为店长')
        needManualAction.push({
          store_id: store.store_id,
          store_name: store.store_name,
          store_code: store.store_code,
          reason: '有在职员工但无店长',
          action: '需要人工在管理后台指定一个员工为店长'
        })
      }
    }

    // 4. 输出汇总
    console.log('\n' + '='.repeat(60))
    console.log('📋 处理结果汇总')
    console.log('='.repeat(60))

    console.log(`\n✅ 自动激活店长: ${autoActivated.length} 个`)
    if (autoActivated.length > 0) {
      autoActivated.forEach(a => {
        console.log(`   - [${a.store_id}] ${a.store_name}: ${a.user_nickname} (${a.user_mobile})`)
      })
    }

    console.log(`\n⚠️ 需要人工处理: ${needManualAction.length} 个`)
    if (needManualAction.length > 0) {
      console.log('\n--- 需要人工处理的门店清单 ---')
      needManualAction.forEach(m => {
        console.log(`   📍 [${m.store_id}] ${m.store_name}`)
        console.log(`      门店编号: ${m.store_code || '无'}`)
        if (m.merchant) {
          console.log(`      商户: ${m.merchant.nickname} (${m.merchant.mobile})`)
        }
        console.log(`      原因: ${m.reason}`)
        console.log(`      操作: ${m.action}`)
        console.log('')
      })
    }

    // 5. 提交或回滚事务
    if (EXECUTE_MODE && transaction) {
      await transaction.commit()
      console.log('\n🎉 事务已提交，所有更改已生效！')
    } else if (transaction) {
      await transaction.rollback()
      console.log('\n📝 预览模式，事务已回滚，无实际更改')
    }

    // 6. 输出下一步操作提示
    if (needManualAction.length > 0) {
      console.log('\n' + '='.repeat(60))
      console.log('📝 下一步操作')
      console.log('='.repeat(60))
      console.log('请在管理后台为以下门店创建店长:')
      needManualAction.forEach(m => {
        console.log(`  1. 登录管理后台`)
        console.log(`  2. 进入"门店管理" → 找到 [${m.store_id}] ${m.store_name}`)
        console.log(`  3. 添加员工 → 设置角色为"店长" → 设置状态为"在职"`)
        console.log('')
      })
    }

    if (!EXECUTE_MODE && autoActivated.length > 0) {
      console.log('\n💡 提示: 使用 --execute 参数执行实际更改')
      console.log('   node scripts/database/init_store_managers.js --execute')
    }
  } catch (error) {
    if (transaction) {
      await transaction.rollback()
    }
    console.error('\n❌ 执行失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
    console.log('\n🔌 数据库连接已关闭')
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
