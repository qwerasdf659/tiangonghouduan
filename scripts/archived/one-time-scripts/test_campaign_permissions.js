/**
 * 活动权限功能测试脚本
 * 功能：测试活动权限分配、撤销和权限检查功能
 * 使用：node scripts/test_campaign_permissions.js
 * 创建时间：2025年10月02日
 */

const { User, Role, UserRole, LotteryCampaign } = require('../models')

async function testCampaignPermissions () {
  try {
    console.log('🧪 开始测试活动权限功能...\n')

    // 1. 查找测试用户（user_id=31）
    console.log('━'.repeat(60))
    console.log('步骤1：查找测试用户')
    const testUser = await User.findByPk(31, {
      attributes: ['user_id', 'mobile', 'nickname']
    })

    if (!testUser) {
      console.error('❌ 测试用户不存在（user_id=31），请先创建测试用户')
      process.exit(1)
    }

    console.log(`✅ 找到测试用户：user_id=${testUser.user_id}, mobile=${testUser.mobile}, nickname=${testUser.nickname}`)

    // 2. 查找测试活动（campaign_id=2）
    console.log('\n━'.repeat(60))
    console.log('步骤2：查找测试活动')
    const testCampaign = await LotteryCampaign.findByPk(2, {
      attributes: ['campaign_id', 'campaign_name', 'status']
    })

    if (!testCampaign) {
      console.error('❌ 测试活动不存在（campaign_id=2），请先创建测试活动')
      process.exit(1)
    }

    console.log(`✅ 找到测试活动：campaign_id=${testCampaign.campaign_id}, name=${testCampaign.campaign_name}, status=${testCampaign.status}`)

    // 3. 查找活动角色
    console.log('\n━'.repeat(60))
    console.log('步骤3：查找活动角色')
    const campaignRole = await Role.findOne({
      where: { role_name: `campaign_${testCampaign.campaign_id}` },
      attributes: ['role_id', 'role_name', 'is_active'] // ✅ 修复: 移除role_code
    })

    if (!campaignRole) {
      console.error(`❌ 活动角色不存在（role_name=campaign_${testCampaign.campaign_id}）`)
      console.log('请先运行：node scripts/create_campaign_roles.js')
      process.exit(1)
    }

    console.log(`✅ 找到活动角色：role_id=${campaignRole.role_id}, name=${campaignRole.role_name}`)

    // 4. 检查当前权限状态
    console.log('\n━'.repeat(60))
    console.log('步骤4：检查当前权限状态')
    const existingPermission = await UserRole.findOne({
      where: {
        user_id: testUser.user_id,
        role_id: campaignRole.role_id
      }
    })

    if (existingPermission) {
      console.log(`⚠️ 用户已有此权限，is_active=${existingPermission.is_active}`)
      if (existingPermission.is_active) {
        console.log('先撤销权限...')
        await existingPermission.update({ is_active: false })
        console.log('✅ 权限已撤销')
      }
    } else {
      console.log('✅ 用户暂无此权限（初始状态正确）')
    }

    // 5. 测试分配权限
    console.log('\n━'.repeat(60))
    console.log('步骤5：测试分配权限')
    const newPermission = await UserRole.create({
      user_id: testUser.user_id,
      role_id: campaignRole.role_id,
      is_active: true,
      assigned_by: 1,
      assigned_at: new Date()
    })

    console.log('✅ 权限分配成功')
    console.log(`   - user_id: ${newPermission.user_id}`)
    console.log(`   - role_id: ${newPermission.role_id}`)
    console.log(`   - is_active: ${newPermission.is_active}`)

    // 6. 验证权限检查
    console.log('\n━'.repeat(60))
    console.log('步骤6：验证权限检查')
    const userWithRoles = await User.findOne({
      where: { user_id: testUser.user_id },
      include: [{
        model: Role,
        as: 'roles',
        where: { role_name: `campaign_${testCampaign.campaign_id}`, is_active: true },
        through: { where: { is_active: true } },
        required: false
      }]
    })

    const hasPermission = userWithRoles.roles.length > 0
    console.log(`权限检查结果：${hasPermission ? '✅ 有权限' : '❌ 无权限'}`)

    if (!hasPermission) {
      console.error('❌ 权限检查失败，分配的权限未生效')
      process.exit(1)
    }

    // 7. 测试撤销权限
    console.log('\n━'.repeat(60))
    console.log('步骤7：测试撤销权限')
    await newPermission.update({ is_active: false })
    console.log('✅ 权限撤销成功')

    // 8. 再次验证权限检查
    console.log('\n━'.repeat(60))
    console.log('步骤8：验证撤销后的权限检查')
    const userAfterRevoke = await User.findOne({
      where: { user_id: testUser.user_id },
      include: [{
        model: Role,
        as: 'roles',
        where: { role_name: `campaign_${testCampaign.campaign_id}`, is_active: true },
        through: { where: { is_active: true } },
        required: false
      }]
    })

    const hasPermissionAfterRevoke = userAfterRevoke.roles.length > 0
    console.log(`权限检查结果：${hasPermissionAfterRevoke ? '❌ 仍有权限（异常）' : '✅ 无权限（正确）'}`)

    if (hasPermissionAfterRevoke) {
      console.error('❌ 权限撤销失败，权限仍然生效')
      process.exit(1)
    }

    // 9. 测试总结
    console.log('\n' + '━'.repeat(60))
    console.log('🎉 所有测试通过！')
    console.log('\n测试总结：')
    console.log('  ✅ 用户查找正常')
    console.log('  ✅ 活动查找正常')
    console.log('  ✅ 活动角色查找正常')
    console.log('  ✅ 权限分配功能正常')
    console.log('  ✅ 权限检查功能正常')
    console.log('  ✅ 权限撤销功能正常')
    console.log('  ✅ 撤销后权限检查正常')
    console.log('\n📋 下一步：')
    console.log('  1. 启动后端服务：npm start')
    console.log('  2. 测试API接口：')
    console.log('     - POST /api/v4/unified-engine/admin/campaign-permissions/assign')
    console.log('     - DELETE /api/v4/unified-engine/admin/campaign-permissions/revoke')
    console.log('     - GET /api/v4/unified-engine/admin/campaign-permissions/list')
    console.log('  3. 测试抽奖权限检查：')
    console.log('     - POST /api/v4/unified-engine/lottery/draw')

    process.exit(0)
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行测试
testCampaignPermissions()
