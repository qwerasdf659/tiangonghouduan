'use strict'

/**
 * 🔥 多池系统数据库迁移 - 阶段一核心功能
 * 创建时间：2025年08月21日
 * 目标：扩展lottery_campaigns表支持多种抽奖池类型
 * 设计原则：基于现有枚举扩展，最小改动实现最大功能
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🎱 开始多池系统数据库迁移...')

    try {
      // 1. 检查当前campaign_type枚举值
      const [results] = await queryInterface.sequelize.query(`
        SELECT COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'lottery_campaigns' 
        AND COLUMN_NAME = 'campaign_type'
        AND TABLE_SCHEMA = DATABASE()
      `)

      console.log('📊 当前campaign_type枚举值:', results[0]?.COLUMN_TYPE)

      // 2. 扩展campaign_type枚举值以支持池类型
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_campaigns 
        MODIFY COLUMN campaign_type ENUM(
          'daily', 'weekly', 'event', 'permanent',
          'pool_basic', 'pool_advanced', 'pool_vip', 'pool_newbie'
        ) NOT NULL COMMENT '活动类型，新增池类型支持'
      `)
      console.log('✅ 扩展campaign_type枚举值完成')

      // 3. 添加池级别要求字段
      await queryInterface.addColumn('lottery_campaigns', 'required_level', {
        type: Sequelize.ENUM('bronze', 'silver', 'gold', 'diamond'),
        allowNull: true,
        comment: '要求的用户等级，用于池访问控制'
      })
      console.log('✅ 添加required_level字段完成')

      // 4. 添加池特殊规则字段
      await queryInterface.addColumn('lottery_campaigns', 'pool_rules', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '池专属规则配置JSON，包含特殊机制'
      })
      console.log('✅ 添加pool_rules字段完成')

      // 5. 检查并添加池类型索引
      const indexes = await queryInterface.showIndex('lottery_campaigns')
      const poolTypeIndexExists = indexes.some(index =>
        index.name === 'idx_lc_pool_type'
      )

      if (!poolTypeIndexExists) {
        await queryInterface.addIndex('lottery_campaigns', ['campaign_type', 'required_level'], {
          name: 'idx_lc_pool_type',
          comment: '池类型和等级复合查询索引'
        })
        console.log('✅ 添加池类型索引完成')
      } else {
        console.log('⚠️ 池类型索引已存在，跳过创建')
      }

      console.log('🎱 多池系统数据库迁移完成！')
    } catch (error) {
      console.error('❌ 多池系统迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 开始回滚多池系统迁移...')

    try {
      // 移除索引
      await queryInterface.removeIndex('lottery_campaigns', 'idx_lc_pool_type')

      // 移除字段
      await queryInterface.removeColumn('lottery_campaigns', 'required_level')
      await queryInterface.removeColumn('lottery_campaigns', 'pool_rules')

      // 恢复原始枚举值
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_campaigns 
        MODIFY COLUMN campaign_type ENUM('daily', 'weekly', 'event', 'permanent') 
        NOT NULL COMMENT '活动类型'
      `)

      console.log('🔄 多池系统迁移回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
