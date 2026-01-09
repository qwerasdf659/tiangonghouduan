/**
 * 初始化用户层级测试数据
 * 用途：创建测试的层级关系数据，验证前后端联动
 * 创建时间：2026-01-09
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { sequelize, User, Role, UserHierarchy } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

async function initHierarchyTestData() {
  console.log('='.repeat(60))
  console.log('📋 初始化用户层级测试数据')
  console.log('='.repeat(60))

  const transaction = await sequelize.transaction()

  try {
    // 1. 获取层级相关角色
    console.log('\n1. 获取层级角色...')
    const regionalManagerRole = await Role.findOne({ 
      where: { role_level: 80 },
      transaction 
    })
    const businessManagerRole = await Role.findOne({ 
      where: { role_level: 60 },
      transaction 
    })
    const salesStaffRole = await Role.findOne({ 
      where: { role_level: 40 },
      transaction 
    })

    if (!regionalManagerRole || !businessManagerRole || !salesStaffRole) {
      throw new Error('缺少层级角色，请先创建角色')
    }

    console.log(`   区域负责人角色: ${regionalManagerRole.role_name} (ID: ${regionalManagerRole.role_id})`)
    console.log(`   业务经理角色: ${businessManagerRole.role_name} (ID: ${businessManagerRole.role_id})`)
    console.log(`   业务员角色: ${salesStaffRole.role_name} (ID: ${salesStaffRole.role_id})`)

    // 2. 获取用户数据
    console.log('\n2. 获取用户数据...')
    const users = await User.findAll({
      where: { status: 'active' },
      limit: 10,
      order: [['user_id', 'ASC']],
      transaction
    })

    if (users.length < 5) {
      throw new Error('用户数量不足，至少需要5个用户来创建层级关系')
    }

    console.log(`   找到 ${users.length} 个活跃用户`)

    // 3. 检查是否已有层级数据
    const existingCount = await UserHierarchy.count({ transaction })
    if (existingCount > 0) {
      console.log(`\n⚠️ 已存在 ${existingCount} 条层级记录，跳过创建`)
      await transaction.rollback()
      return
    }

    // 4. 创建层级关系
    console.log('\n3. 创建层级关系...')
    const now = BeijingTimeHelper.createDatabaseTime()

    // 用户分配：
    // - 用户 0: 区域负责人 (无上级)
    // - 用户 1, 2: 业务经理 (上级为用户0)
    // - 用户 3, 4, 5...: 业务员 (上级为用户1或2)
    
    const hierarchyData = []

    // 区域负责人 (用户0)
    hierarchyData.push({
      user_id: users[0].user_id,
      superior_user_id: null,  // 顶级，无上级
      role_id: regionalManagerRole.role_id,
      store_id: null,
      is_active: true,
      activated_at: now
    })
    console.log(`   创建区域负责人: ${users[0].nickname || users[0].mobile} (ID: ${users[0].user_id})`)

    // 业务经理 (用户1, 2，上级为用户0)
    for (let i = 1; i <= 2 && i < users.length; i++) {
      hierarchyData.push({
        user_id: users[i].user_id,
        superior_user_id: users[0].user_id,
        role_id: businessManagerRole.role_id,
        store_id: null,
        is_active: true,
        activated_at: now
      })
      console.log(`   创建业务经理: ${users[i].nickname || users[i].mobile} (ID: ${users[i].user_id}) → 上级: ${users[0].user_id}`)
    }

    // 业务员 (用户3及以后，交替分配给业务经理1和2)
    for (let i = 3; i < users.length && i < 8; i++) {
      const superiorIndex = (i % 2 === 1) ? 1 : 2
      hierarchyData.push({
        user_id: users[i].user_id,
        superior_user_id: users[superiorIndex].user_id,
        role_id: salesStaffRole.role_id,
        store_id: null,  // 暂不分配门店（避免外键约束问题）
        is_active: i < 6,  // 部分设为非激活状态用于测试
        activated_at: now,
        deactivated_at: i >= 6 ? now : null,
        deactivation_reason: i >= 6 ? '测试数据：模拟离职' : null
      })
      console.log(`   创建业务员: ${users[i].nickname || users[i].mobile} (ID: ${users[i].user_id}) → 上级: ${users[superiorIndex].user_id}, 激活: ${i < 6}`)
    }

    // 批量插入
    await UserHierarchy.bulkCreate(hierarchyData, { transaction })
    console.log(`\n✅ 成功创建 ${hierarchyData.length} 条层级记录`)

    // 5. 提交事务
    await transaction.commit()
    console.log('✅ 事务已提交')

    // 6. 验证数据
    console.log('\n4. 验证数据...')
    const createdHierarchies = await UserHierarchy.findAll({
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: User, as: 'superior', attributes: ['user_id', 'mobile', 'nickname'] },
        { model: Role, as: 'role', attributes: ['role_id', 'role_name', 'role_level'] }
      ]
    })

    console.log(`   总计 ${createdHierarchies.length} 条记录:`)
    createdHierarchies.forEach(h => {
      const superiorInfo = h.superior 
        ? `→ 上级: ${h.superior.nickname || h.superior.mobile}` 
        : '(顶级)'
      console.log(`   [${h.hierarchy_id}] ${h.user?.nickname || h.user?.mobile} | ${h.role?.role_name} ${superiorInfo} | 激活: ${h.is_active}`)
    })

    console.log('\n' + '='.repeat(60))
    console.log('✅ 初始化完成！现在可以刷新前端页面查看数据')
    console.log('='.repeat(60))

  } catch (error) {
    await transaction.rollback()
    console.error('❌ 初始化失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }
}

// 运行
initHierarchyTestData()

