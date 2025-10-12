/**
 * 活动角色初始化脚本
 * 功能：为所有现有抽奖活动创建对应的权限角色
 * 使用：node scripts/create_campaign_roles.js
 * 创建时间：2025年10月02日
 */

const { Role, LotteryCampaign } = require('../models')
const { v4: uuidv4 } = require('uuid')

async function createCampaignRoles () {
  try {
    console.log('🚀 开始初始化活动权限角色...\n')

    // 查询所有活动
    const campaigns = await LotteryCampaign.findAll({
      attributes: ['campaign_id', 'campaign_name', 'campaign_code', 'status'],
      order: [['campaign_id', 'ASC']]
    })

    console.log(`📊 找到 ${campaigns.length} 个活动\n`)

    let createdCount = 0
    let skippedCount = 0

    for (const campaign of campaigns) {
      const campaignRoleName = `campaign_${campaign.campaign_id}` // 使用role_name字段标识
      const displayName = `${campaign.campaign_name}权限`

      // 检查角色是否已存在
      const existing = await Role.findOne({ where: { role_name: campaignRoleName } })

      if (existing) {
        console.log(`⏭️ 跳过：角色已存在 - ${campaignRoleName} (${existing.description})`)
        skippedCount++
        continue
      }

      // 创建新角色
      const newRole = await Role.create({
        role_uuid: uuidv4(),
        role_name: campaignRoleName, // 使用campaign_{id}作为唯一标识
        role_level: 10, // 普通权限级别
        permissions: JSON.stringify({
          campaign: ['access'],
          description: '活动参与权限'
        }),
        is_active: true,
        description: displayName // 友好显示名称放在description
      })

      console.log(`✅ 创建成功：${campaignRoleName}`)
      console.log(`   UUID: ${newRole.role_uuid}`)
      console.log(`   活动: ${campaign.campaign_name} (ID: ${campaign.campaign_id})`)
      console.log(`   描述: ${displayName}`)
      console.log(`   状态: ${campaign.status}\n`)

      createdCount++
    }

    console.log('━'.repeat(60))
    console.log('🎉 活动角色初始化完成！')
    console.log(`   新创建: ${createdCount} 个`)
    console.log(`   已跳过: ${skippedCount} 个`)
    console.log(`   总计: ${campaigns.length} 个活动`)
    console.log('━'.repeat(60))

    // 验证结果
    const allCampaignRoles = await Role.findAll({
      where: {
        role_name: {
          [require('sequelize').Op.like]: 'campaign_%'
        }
      },
      attributes: ['role_name', 'description', 'is_active']
    })

    console.log('\n📋 当前所有活动角色：')
    allCampaignRoles.forEach(role => {
      console.log(`   - ${role.role_name}: ${role.description} (${role.is_active ? '✅活跃' : '❌禁用'})`)
    })

    process.exit(0)
  } catch (error) {
    console.error('❌ 初始化失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行初始化
createCampaignRoles()
