/**
 * 迁移文件：将 consumption_records.store_id 修改为 NOT NULL
 *
 * 业务背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 每笔消费必须归属于一个门店
 * - 门店隔离是商家域权限的核心
 * - 新提交的消费记录必须有明确的 store_id
 *
 * 迁移步骤：
 * 1. 将现有 NULL 的 store_id 更新为默认门店（总店）
 * 2. 修改 store_id 列为 NOT NULL
 *
 * 注意：
 * - 此迁移需要在有门店数据的情况下执行
 * - 需要先执行 20260112140000-seed-initial-store-data.js 创建门店
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：将 consumption_records.store_id 修改为 NOT NULL')

    // =================================================================
    // 步骤1：检查是否有门店数据
    // =================================================================
    const [stores] = await queryInterface.sequelize.query(`
      SELECT store_id, store_name FROM stores WHERE status = 'active' LIMIT 1
    `)

    if (stores.length === 0) {
      throw new Error('❌ 门店表为空，请先执行 seed-initial-store-data 迁移创建门店')
    }

    const defaultStoreId = stores[0].store_id
    console.log(`✅ 使用默认门店: ${stores[0].store_name} (ID: ${defaultStoreId})`)

    // =================================================================
    // 步骤2：检查 store_id 当前状态
    // =================================================================
    const [colInfo] = await queryInterface.sequelize.query(`
      SELECT IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'consumption_records' 
        AND COLUMN_NAME = 'store_id'
    `)

    if (colInfo.length === 0 || colInfo[0].IS_NULLABLE === 'NO') {
      console.log('✅ store_id 列已经是 NOT NULL，跳过迁移')
      return
    }

    // =================================================================
    // 步骤3：更新现有 NULL 数据为默认门店
    // =================================================================
    const [nullRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM consumption_records WHERE store_id IS NULL
    `)
    const nullCount = nullRecords[0].count

    if (nullCount > 0) {
      console.log(`正在更新 ${nullCount} 条 NULL 记录的 store_id...`)

      await queryInterface.sequelize.query(`
        UPDATE consumption_records 
        SET store_id = ${defaultStoreId} 
        WHERE store_id IS NULL
      `)

      console.log(`✅ 已更新 ${nullCount} 条记录的 store_id 为 ${defaultStoreId}`)
    } else {
      console.log('✅ 没有 NULL 记录需要更新')
    }

    // =================================================================
    // 步骤4：修改列为 NOT NULL
    // =================================================================
    console.log('正在修改 store_id 列为 NOT NULL...')

    await queryInterface.changeColumn('consumption_records', 'store_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      comment: '门店ID（外键关联 stores 表，用于多门店管理和权限验证）',
      references: {
        model: 'stores',
        key: 'store_id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    console.log('✅ store_id 列已修改为 NOT NULL')

    // =================================================================
    // 步骤5：验证迁移结果
    // =================================================================
    console.log('\n📊 验证迁移结果...')

    const [verifyCol] = await queryInterface.sequelize.query(`
      SELECT IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'consumption_records' 
        AND COLUMN_NAME = 'store_id'
    `)
    console.log(
      `   store_id.IS_NULLABLE: ${verifyCol[0].IS_NULLABLE} ${verifyCol[0].IS_NULLABLE === 'NO' ? '✅' : '❌'}`
    )

    const [verifyNull] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM consumption_records WHERE store_id IS NULL
    `)
    console.log(
      `   NULL 记录数量: ${verifyNull[0].count} ${verifyNull[0].count === 0 ? '✅' : '❌'}`
    )

    console.log('\n✅ consumption_records.store_id NOT NULL 迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：将 consumption_records.store_id 恢复为 NULL 允许')

    // 修改列为允许 NULL
    await queryInterface.changeColumn('consumption_records', 'store_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '门店ID（外键关联 stores 表，用于多门店管理和权限验证）',
      references: {
        model: 'stores',
        key: 'store_id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    console.log('\n✅ 回滚完成：store_id 列已恢复为允许 NULL')
  }
}
