/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：扩展trade_records表支持物品转让记录
 * 迁移类型：alter-table（修改表）+ alter-column（修改列）
 * 版本号：v4.2.0
 * 创建时间：2025-11-07
 *
 * 变更说明：
 * 1. 扩展trade_type枚举值，添加'inventory_transfer'（物品转让）
 * 2. 添加item_id字段（INT），用于关联inventory_id
 * 3. 添加name字段（VARCHAR(100)），记录转让物品名称（统一使用name字段）
 * 4. 添加transfer_note字段（VARCHAR(500)），记录转让备注
 *
 * 业务场景：
 * - 用户A将物品转让给用户B，需要记录完整的转让历史
 * - 普通用户只能查看与自己直接相关的一手转让记录
 * - 管理员可以通过item_id查看物品的完整转让链条
 *
 * 依赖关系：
 * - 依赖trade_records表已存在
 * - 依赖user_inventory表已存在
 *
 * 影响范围：
 * - 修改trade_records表的trade_type字段（扩展枚举）
 * - 添加3个新字段：item_id、name、transfer_note
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始扩展trade_records表以支持物品转让...')

      /*
       * ========================================
       * 第1步：扩展trade_type枚举值
       * ========================================
       * 添加'inventory_transfer'类型
       */
      console.log('1. 扩展trade_type枚举值...')
      await queryInterface.sequelize.query(
        `ALTER TABLE trade_records 
         MODIFY COLUMN trade_type ENUM(
           'point_transfer',
           'exchange_refund',
           'prize_claim',
           'admin_adjustment',
           'system_reward',
           'inventory_transfer'
         ) NOT NULL COMMENT '交易类型：point_transfer-积分转账，exchange_refund-兑换退款，prize_claim-奖品领取，admin_adjustment-管理员调整，system_reward-系统奖励，inventory_transfer-物品转让'`,
        { transaction }
      )

      /*
       * ========================================
       * 第2步：添加item_id字段
       * ========================================
       * 用于关联user_inventory表的inventory_id
       */
      console.log('2. 添加item_id字段...')
      await queryInterface.addColumn(
        'trade_records',
        'item_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment:
            '物品ID（关联user_inventory.inventory_id，仅用于inventory_transfer类型，用于追踪物品转让历史）'
        },
        { transaction }
      )

      /*
       * ========================================
       * 第3步：添加name字段
       * ========================================
       * 记录转让物品的名称（冗余字段，提高查询效率）
       * 统一使用name字段，与UserInventory保持一致
       */
      console.log('3. 添加name字段...')
      await queryInterface.addColumn(
        'trade_records',
        'name',
        {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment:
            '物品名称（Item Name - 仅用于inventory_transfer类型，冗余字段用于快速查询显示；统一使用name字段，与UserInventory保持一致）'
        },
        { transaction }
      )

      /*
       * ========================================
       * 第4步：添加transfer_note字段
       * ========================================
       * 记录转让备注信息
       */
      console.log('4. 添加transfer_note字段...')
      await queryInterface.addColumn(
        'trade_records',
        'transfer_note',
        {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '转让备注（仅用于inventory_transfer类型，记录转让原因或说明）'
        },
        { transaction }
      )

      /*
       * ========================================
       * 第5步：创建索引以优化查询性能
       * ========================================
       * 为item_id创建索引，用于快速查询物品的转让历史
       */
      console.log('5. 创建item_id索引...')
      await queryInterface.addIndex('trade_records', ['item_id', 'trade_type', 'created_at'], {
        name: 'idx_item_transfer_history',
        transaction
      })

      await transaction.commit()
      console.log('✅ trade_records表扩展完成，已支持物品转让记录')
      console.log('📊 新增功能：')
      console.log('   - trade_type新增inventory_transfer类型')
      console.log('   - 可记录物品转让历史（from_user_id → to_user_id）')
      console.log('   - 管理员可通过item_id查询完整转让链条')
      console.log('   - 普通用户仅可查看与自己相关的一手转让')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize实例（未使用）
   * @returns {Promise<void>} Promise对象
   */
  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚trade_records表的物品转让支持...')

      // 检查是否有inventory_transfer类型的记录
      const [results] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM trade_records WHERE trade_type = 'inventory_transfer'",
        { transaction }
      )

      if (results[0].count > 0) {
        console.warn(`⚠️ 警告：存在${results[0].count}条inventory_transfer类型的记录`)
        console.warn('⚠️ 回滚将删除这些记录')

        // 删除inventory_transfer类型的记录
        await queryInterface.sequelize.query(
          "DELETE FROM trade_records WHERE trade_type = 'inventory_transfer'",
          { transaction }
        )
      }

      // 删除索引
      console.log('1. 删除idx_item_transfer_history索引...')
      await queryInterface.removeIndex('trade_records', 'idx_item_transfer_history', {
        transaction
      })

      // 删除字段
      console.log('2. 删除transfer_note字段...')
      await queryInterface.removeColumn('trade_records', 'transfer_note', { transaction })

      console.log('3. 删除name字段...')
      await queryInterface.removeColumn('trade_records', 'name', { transaction })

      console.log('4. 删除item_id字段...')
      await queryInterface.removeColumn('trade_records', 'item_id', { transaction })

      // 恢复原ENUM值（移除inventory_transfer）
      console.log('5. 恢复trade_type枚举值...')
      await queryInterface.sequelize.query(
        `ALTER TABLE trade_records 
         MODIFY COLUMN trade_type ENUM(
           'point_transfer',
           'exchange_refund',
           'prize_claim',
           'admin_adjustment',
           'system_reward'
         ) NOT NULL COMMENT '交易类型'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成，trade_records表已恢复原状')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
