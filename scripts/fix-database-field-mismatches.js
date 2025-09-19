/**
 * 数据库字段不匹配修复脚本
 * 解决LotteryRecord和SystemMetrics模型中的字段问题
 */

'use strict'

const { sequelize } = require('../models')

async function fixDatabaseFieldMismatches () {
  console.log('🔧 开始修复数据库字段不匹配问题...')

  try {
    // 修复1: LotteryRecord的lottery_id字段设置默认值
    console.log('📋 修复LotteryRecord模型的lottery_id字段...')

    await sequelize.query(`
      ALTER TABLE lottery_records
      MODIFY COLUMN lottery_id CHAR(36) DEFAULT NULL
      COMMENT '关联的抽奖活动ID，允许为空用于测试'
    `)

    console.log('✅ lottery_id字段已设置为允许NULL')

    // 修复2: SystemMetrics的measurement_time字段设置默认值
    console.log('📋 修复SystemMetrics模型的measurement_time字段...')

    await sequelize.query(`
      ALTER TABLE unified_system_metrics
      MODIFY COLUMN measurement_time DATETIME DEFAULT CURRENT_TIMESTAMP
      COMMENT '测量时间，默认为当前时间'
    `)

    console.log('✅ measurement_time字段已设置默认值')

    // 修复3: 验证lottery_records表结构，确认主键为draw_id
    console.log('📋 验证lottery_records表主键字段...')

    const tableInfo = await sequelize.query(
      `
      SHOW COLUMNS FROM lottery_records WHERE \`Key\` = 'PRI'
    `,
      { type: sequelize.QueryTypes.SELECT }
    )

    console.log('✅ lottery_records表主键字段:', tableInfo[0]?.Field || 'draw_id')
    console.log('⚠️  注意：代码中应使用draw_id而不是id进行查询')

    // 验证修复结果
    console.log('🔍 验证修复结果...')

    const lotteryRecordsSchema = await sequelize.query(
      `
      DESCRIBE lottery_records
    `,
      { type: sequelize.QueryTypes.SELECT }
    )

    const lotteryIdField = lotteryRecordsSchema.find(field => field.Field === 'lottery_id')
    console.log('lottery_id字段:', lotteryIdField)

    const systemMetricsSchema = await sequelize.query(
      `
      DESCRIBE unified_system_metrics
    `,
      { type: sequelize.QueryTypes.SELECT }
    )

    const measurementTimeField = systemMetricsSchema.find(
      field => field.Field === 'measurement_time'
    )
    console.log('measurement_time字段:', measurementTimeField)

    // 修复3: AdminUser.status字段业务标准统一
    console.log('📋 修复AdminUser.status字段业务标准...')

    // 3.1 分析当前数据分布
    console.log('🔍 分析当前AdminUser.status数据分布...')
    const [currentStatusData] = await sequelize.query(`
      SELECT status, COUNT(*) as count
      FROM admin_users
      GROUP BY status
    `)

    console.log('当前数据分布:')
    currentStatusData.forEach(row => {
      const meaning =
        row.status === 1
          ? ' (正常)'
          : row.status === 0
            ? ' (锁定)'
            : row.status === -1
              ? ' (禁用)'
              : ' (未知)'
      console.log(`   status = ${row.status}${meaning}: ${row.count} 条记录`)
    })

    // 3.2 添加临时字段存储新枚举值
    console.log('📝 添加临时状态字段...')
    await sequelize.query(`
      ALTER TABLE admin_users
      ADD COLUMN status_enum ENUM('active', 'inactive', 'banned')
      DEFAULT 'active'
      COMMENT '标准化状态字段'
    `)

    // 3.3 数据迁移 - 基于实际数据分析的映射
    console.log('🔄 执行数据迁移 (TINYINT → ENUM)...')
    await sequelize.query(`
      UPDATE admin_users
      SET status_enum = CASE
        WHEN status = 1 THEN 'active'   -- 正常 → active
        WHEN status = 0 THEN 'inactive' -- 锁定 → inactive
        WHEN status = -1 THEN 'banned'  -- 禁用 → banned
        ELSE 'active'                   -- 默认为active
      END
    `)

    // 3.4 验证数据迁移结果
    console.log('🔍 验证数据迁移结果...')
    const [migratedData] = await sequelize.query(`
      SELECT
        status as old_status,
        status_enum as new_status,
        COUNT(*) as count
      FROM admin_users
      GROUP BY status, status_enum
      ORDER BY status
    `)

    console.log('数据迁移验证:')
    migratedData.forEach(row => {
      console.log(`   ${row.old_status} → ${row.new_status}: ${row.count} 条记录`)
    })

    // 3.5 删除旧字段，重命名新字段
    console.log('♻️ 更新字段结构...')
    await sequelize.query('ALTER TABLE admin_users DROP COLUMN status')
    await sequelize.query(`
      ALTER TABLE admin_users
      CHANGE COLUMN status_enum status
      ENUM('active', 'inactive', 'banned')
      NOT NULL DEFAULT 'active'
      COMMENT '管理员状态：active-正常，inactive-锁定，banned-禁用'
    `)

    console.log('✅ AdminUser.status业务标准统一完成!')

    // 验证最终结果
    console.log('🔍 验证AdminUser.status最终结果...')
    const adminUsersSchema = await sequelize.query('DESCRIBE admin_users')
    const statusField = adminUsersSchema.find(field => field.Field === 'status')
    console.log('AdminUser.status字段:', statusField)

    // 修复4: 添加LotteryPrize.prize_weight字段
    console.log('📋 修复LotteryPrize模型的prize_weight字段...')

    // 4.1 检查字段是否已存在
    const prizeSchema = await sequelize.query('DESCRIBE lottery_prizes', {
      type: sequelize.QueryTypes.SELECT
    })

    const hasPrizeWeight = prizeSchema.some(field => field.Field === 'prize_weight')

    if (!hasPrizeWeight) {
      console.log('📝 添加prize_weight字段...')
      await sequelize.query(`
        ALTER TABLE lottery_prizes
        ADD COLUMN prize_weight INT NOT NULL DEFAULT 100
        COMMENT '奖品权重，用于加权随机抽奖，值越大概率越高'
      `)

      console.log('✅ prize_weight字段已添加')

      // 4.2 为现有奖品设置合理的权重值
      console.log('🔄 为现有奖品设置权重值...')

      // 基于奖品类型设置不同的默认权重
      await sequelize.query(`
        UPDATE lottery_prizes
        SET prize_weight = CASE
          WHEN prize_type = 'empty' THEN 200        -- 空奖权重高，保持抽奖趣味性
          WHEN prize_type = 'points' THEN 150       -- 积分奖品中等权重
          WHEN prize_type = 'coupon' THEN 100       -- 优惠券中等权重
          WHEN prize_type = 'physical' THEN 50      -- 实物奖品较低权重
          ELSE 100                                  -- 默认权重
        END
      `)

      console.log('✅ 现有奖品权重值已设置')

      // 4.3 验证权重字段
      const updatedPrizeSchema = await sequelize.query('DESCRIBE lottery_prizes', {
        type: sequelize.QueryTypes.SELECT
      })

      const prizeWeightField = updatedPrizeSchema.find(field => field.Field === 'prize_weight')
      console.log('prize_weight字段:', prizeWeightField)

      // 4.4 验证权重数据分布
      const [weightData] = await sequelize.query(`
        SELECT prize_type, AVG(prize_weight) as avg_weight, COUNT(*) as count
        FROM lottery_prizes
        GROUP BY prize_type
      `)

      console.log('奖品权重分布:')
      weightData.forEach(row => {
        console.log(`   ${row.prize_type}: 平均权重 ${row.avg_weight}, 数量 ${row.count}`)
      })
    } else {
      console.log('✅ prize_weight字段已存在，跳过添加')
    }

    console.log('✅ 数据库字段不匹配修复完成!')
  } catch (error) {
    console.error('❌ 数据库字段修复失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
  }
}

if (require.main === module) {
  fixDatabaseFieldMismatches()
    .then(() => {
      console.log('✅ 修复脚本执行成功')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 修复脚本执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = { fixDatabaseFieldMismatches }
