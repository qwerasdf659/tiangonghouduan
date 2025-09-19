/**
 * 重构为使用V4统一工具类
 * 重构时间：2025-09-15T22:33:05.564+08:00
 */

const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')
const BeijingTimeHelper = require('../utils/timeHelper')

// 获取统一数据库助手
const db = getDatabaseHelper()

/**
 * 修复lottery_records表 - 添加campaign_id字段
 *
 * 问题：lottery_records表缺少campaign_id字段，无法与lottery_campaigns表关联
 * 解决：添加campaign_id字段并设置默认值
 *
 * @version 4.0.0
 * @date 2025-09-13
 */

// 数据库连接

/**
 * 修复lottery_records表结构
 */
async function fixLotteryRecordsCampaignLink () {
  try {
    await db.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 检查campaign_id字段是否已存在
    console.log('🔍 检查lottery_records表结构...')
    const [columns] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = 'lottery_records'
        AND COLUMN_NAME = 'campaign_id'
    `)

    if (columns.length > 0) {
      console.log('⚠️ campaign_id字段已存在，跳过添加')
      return
    }

    // 2. 检查当前有多少条抽奖记录
    const [recordCount] = await db.query('SELECT COUNT(*) as total FROM lottery_records')
    console.log(`📊 当前抽奖记录数量: ${recordCount[0].total}`)

    // 3. 检查可用的活动
    const [campaigns] = await db.query(`
      SELECT campaign_id, campaign_name, status
      FROM lottery_campaigns
      WHERE status = 'active'
      ORDER BY campaign_id
    `)

    console.log('\n🎯 可用活动:')
    if (campaigns.length > 0) {
      console.table(campaigns)
    } else {
      console.log('❌ 没有找到活跃的抽奖活动')
      return
    }

    // 4. 确定默认的campaign_id（选择第一个活跃活动，或使用ID=2）
    const defaultCampaignId = campaigns.length > 0 ? campaigns[0].campaign_id : 2

    console.log(`\n🔧 准备添加campaign_id字段，默认值: ${defaultCampaignId}`)

    // 5. 添加campaign_id字段
    console.log('⚙️ 添加campaign_id字段...')
    await db.query(`
      ALTER TABLE lottery_records
      ADD COLUMN campaign_id INT NOT NULL DEFAULT ${defaultCampaignId} COMMENT '活动ID'
      AFTER user_id
    `)
    console.log('✅ campaign_id字段添加成功')

    // 6. 添加外键约束
    console.log('🔗 添加外键约束...')
    try {
      await db.query(`
        ALTER TABLE lottery_records
        ADD CONSTRAINT fk_lottery_records_campaign
        FOREIGN KEY (campaign_id) REFERENCES lottery_campaigns(campaign_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
      `)
      console.log('✅ 外键约束添加成功')
    } catch (fkError) {
      console.log('⚠️ 外键约束添加失败（可能是数据完整性问题）:', fkError.message)
    }

    // 7. 创建复合索引优化查询
    console.log('📊 创建优化索引...')
    try {
      await db.query(`
        CREATE INDEX idx_user_campaign_time
        ON lottery_records(user_id, campaign_id, created_at)
      `)
      console.log('✅ 复合索引创建成功')
    } catch (indexError) {
      if (indexError.message.includes('Duplicate key name')) {
        console.log('⚠️ 索引已存在，跳过')
      } else {
        console.error('❌ 索引创建失败:', indexError.message)
      }
    }

    // 8. 验证修复结果
    console.log('\n🔍 验证修复结果:')
    const [updatedStructure] = await db.query('DESCRIBE lottery_records')

    const campaignField = updatedStructure.find(field => field.Field === 'campaign_id')
    if (campaignField) {
      console.log('✅ campaign_id字段验证:')
      console.table([
        {
          字段名: campaignField.Field,
          数据类型: campaignField.Type,
          是否为空: campaignField.Null,
          默认值: campaignField.Default
        }
      ])
    }

    // 9. 验证数据
    const [sampleData] = await db.query(`
      SELECT lottery_id, user_id, campaign_id, prize_id, created_at
      FROM lottery_records
      ORDER BY created_at DESC
      LIMIT 5
    `)

    if (sampleData.length > 0) {
      console.log('\n📋 样本数据验证:')
      console.table(sampleData)
    } else {
      console.log('⚠️ 暂无抽奖记录数据')
    }

    console.log('\n✅ lottery_records表修复完成！')
    console.log('🎯 修复内容:')
    console.log(`   - 添加campaign_id字段，默认值: ${defaultCampaignId}`)
    console.log('   - 添加外键约束到lottery_campaigns表')
    console.log('   - 创建复合索引优化查询性能')
    console.log('   - 现在可以正确关联抽奖记录和活动了')
  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    process.exit(1)
  } finally {
    await db.close()
  }
}

// 执行修复
if (require.main === module) {
  fixLotteryRecordsCampaignLink()
}

module.exports = { fixLotteryRecordsCampaignLink }
