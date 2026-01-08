'use strict'

/**
 * 添加 admin_withdrawn 状态到 market_listings 表的 status 枚举
 *
 * 业务背景：
 * - C2C 材料交易 Phase 2 需要客服强制撤回功能
 * - admin_withdrawn 状态区分于用户自主撤回（withdrawn）
 * - 便于审计追踪和统计报表
 *
 * 解决方案：
 * - 修改 status 枚举，添加 admin_withdrawn 值
 * - 新枚举值：on_sale, locked, sold, withdrawn, admin_withdrawn
 *
 * 决策时间：2026-01-08
 * 风险等级：🟢 低风险（仅添加枚举值，不影响现有数据）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 admin_withdrawn 状态到 market_listings 表')

      // 1. 检查当前枚举值
      console.log('📊 步骤1：检查当前枚举值...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM market_listings WHERE Field = 'status'`,
        { transaction }
      )

      if (columns.length === 0) {
        throw new Error('status 字段不存在')
      }

      const currentType = columns[0].Type
      console.log(`   当前类型: ${currentType}`)

      // 检查是否已包含 admin_withdrawn
      if (currentType.includes('admin_withdrawn')) {
        console.log('   ⏭️ admin_withdrawn 已存在于枚举中，跳过修改')
        await transaction.commit()
        return
      }

      // 2. 修改枚举值
      console.log('📊 步骤2：修改 status 枚举...')
      await queryInterface.sequelize.query(
        `ALTER TABLE market_listings 
         MODIFY COLUMN status ENUM('on_sale', 'locked', 'sold', 'withdrawn', 'admin_withdrawn') 
         NOT NULL DEFAULT 'on_sale' 
         COMMENT '挂牌状态（Status）：on_sale-在售中 | locked-已锁定 | sold-已售出 | withdrawn-已撤回 | admin_withdrawn-管理员强制撤回'`,
        { transaction }
      )
      console.log('   ✅ status 枚举修改成功')

      // 3. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：admin_withdrawn 状态已添加')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始回滚：移除 admin_withdrawn 状态')

      // 1. 检查是否有使用 admin_withdrawn 状态的数据
      console.log('📊 步骤1：检查是否有 admin_withdrawn 状态的数据...')
      const [count] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM market_listings WHERE status = 'admin_withdrawn'`,
        { transaction }
      )

      if (count[0].count > 0) {
        console.log(`   ⚠️ 发现 ${count[0].count} 条 admin_withdrawn 状态的数据`)
        console.log('   🔄 将这些数据转换为 withdrawn 状态...')

        await queryInterface.sequelize.query(
          `UPDATE market_listings SET status = 'withdrawn' WHERE status = 'admin_withdrawn'`,
          { transaction }
        )
        console.log('   ✅ 数据转换完成')
      }

      // 2. 还原枚举值
      console.log('📊 步骤2：还原 status 枚举...')
      await queryInterface.sequelize.query(
        `ALTER TABLE market_listings 
         MODIFY COLUMN status ENUM('on_sale', 'locked', 'sold', 'withdrawn') 
         NOT NULL DEFAULT 'on_sale' 
         COMMENT '挂牌状态（Status）：on_sale-在售中 | locked-已锁定 | sold-已售出 | withdrawn-已撤回'`,
        { transaction }
      )
      console.log('   ✅ status 枚举还原成功')

      // 3. 提交事务
      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
