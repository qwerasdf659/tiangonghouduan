/**
 * 数据迁移：user_inventory → item_instances
 *
 * Phase 3 - P3-2：从现有 user_inventory 迁移数据到新的 item_instances 表
 *
 * 迁移策略：
 * - 将所有 user_inventory 记录迁移到 item_instances
 * - 字段映射关系明确（详见下方映射表）
 * - 保留 user_inventory 表但添加注释标记"已迁移至 item_instances"
 * - meta 字段整合原有的 name/description/icon/value 等信息
 *
 * 字段映射关系：
 * - inventory_id → item_instance_id (直接映射，保持ID一致)
 * - user_id → owner_user_id (所有权映射)
 * - type → item_type (类型映射：voucher/product/service)
 * - status → status (状态映射，需转换)
 * - name/description/icon/value/etc → meta (JSON整合)
 *
 * 状态映射规则：
 * - available → available
 * - pending → locked
 * - used → used
 * - expired → expired
 * - transferred → transferred
 *
 * 创建时间：2025-12-15 22:01:02
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：将 user_inventory 数据迁移到 item_instances
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 开始迁移：user_inventory → item_instances')

    // 1. 查询 user_inventory 所有数据
    const [inventoryRecords] = await queryInterface.sequelize.query(`
      SELECT * FROM user_inventory
    `)

    console.log(`📊 需要迁移的记录数：${inventoryRecords.length}`)

    if (inventoryRecords.length === 0) {
      console.log('✅ user_inventory 表为空，无需迁移')
      return
    }

    // 2. 批量迁移数据到 item_instances
    let successCount = 0
    let errorCount = 0

    for (const record of inventoryRecords) {
      try {
        // 状态映射：user_inventory.status → item_instances.status
        const statusMap = {
          available: 'available',
          pending: 'locked', // pending视为锁定状态
          used: 'used',
          expired: 'expired',
          transferred: 'transferred'
        }

        // 构造 meta JSON（整合所有元数据）
        const meta = {
          // 基础信息
          name: record.name || record.item_name || '未命名物品',
          description: record.description || '',
          icon: record.icon || '',
          value: record.value || 0,

          // 物品类型信息
          type: record.type || record.item_type || 'product',

          // 获取来源信息
          source_type: record.source_type,
          source_id: record.source_id,
          acquisition_method: record.acquisition_method,
          acquisition_cost: record.acquisition_cost,

          // 时间信息
          acquired_at: record.acquired_at,
          expires_at: record.expires_at,
          used_at: record.used_at,

          // 🔒 核销信息 - 不再迁移明文核销码
          // 旧核销码已废弃，核销信息统一通过 redemption_orders 表管理
          // verification_code: [已删除] - 禁止明文存储
          // verification_expires_at: [已删除] - TTL由redemption_orders管理
          operator_id: record.operator_id, // 仅保留操作者ID用于历史追溯

          // 转让信息
          transfer_to_user_id: record.transfer_to_user_id,
          transfer_at: record.transfer_at,
          transfer_count: record.transfer_count || 0,
          last_transfer_at: record.last_transfer_at,
          last_transfer_from: record.last_transfer_from,
          can_transfer: record.can_transfer === 1,

          // 市场信息
          market_status: record.market_status,
          selling_asset_code: record.selling_asset_code,
          selling_amount: record.selling_amount ? parseInt(record.selling_amount) : null,
          condition: record.condition,
          withdraw_count: record.withdraw_count || 0,
          last_withdraw_at: record.last_withdraw_at,
          last_withdraw_reason: record.last_withdraw_reason,

          // 虚拟物品信息
          virtual_amount: record.virtual_amount,
          virtual_value_points: record.virtual_value_points,

          // 关联记录
          lottery_record_id: record.lottery_record_id,
          exchange_record_id: record.exchange_record_id,

          // 权限控制
          can_use: record.can_use === 1,
          is_available: record.is_available === 1
        }

        // 插入到 item_instances
        await queryInterface.sequelize.query(
          `
          INSERT INTO item_instances (
            item_instance_id,
            owner_user_id,
            item_type,
            item_template_id,
            status,
            meta,
            locked_by_order_id,
            locked_at,
            created_at,
            updated_at
          ) VALUES (
            :inventory_id,
            :user_id,
            :item_type,
            NULL, -- item_template_id 暂为 NULL
            :status,
            :meta,
            NULL, -- locked_by_order_id 初始为 NULL
            NULL, -- locked_at 初始为 NULL
            :created_at,
            :updated_at
          )
        `,
          {
            replacements: {
              inventory_id: record.inventory_id,
              user_id: record.user_id,
              item_type: record.type || record.item_type || 'product',
              status: statusMap[record.status] || 'available',
              meta: JSON.stringify(meta),
              created_at: record.created_at,
              updated_at: record.updated_at
            }
          }
        )

        successCount++
      } catch (error) {
        console.error(`❌ 迁移失败 (inventory_id=${record.inventory_id}):`, error.message)
        errorCount++
      }
    }

    console.log(`✅ 迁移完成：成功 ${successCount}，失败 ${errorCount}`)

    // 3. 为 user_inventory 表添加注释标记（已迁移）
    await queryInterface.sequelize.query(`
      ALTER TABLE user_inventory 
      COMMENT '用户库存表（已迁移至 item_instances，保留用于历史兼容）'
    `)

    console.log('✅ user_inventory 表已标记为已迁移')
  },

  /**
   * 回滚迁移：清空 item_instances 中的迁移数据
   *
   * @param {Sequelize.QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 无返回值
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 回滚迁移：清空 item_instances 表')

    // 删除所有迁移的数据（根据迁移时的 item_instance_id 范围）
    await queryInterface.sequelize.query(`
      DELETE FROM item_instances 
      WHERE item_instance_id IN (
        SELECT inventory_id FROM user_inventory
      )
    `)

    // 恢复 user_inventory 表注释
    await queryInterface.sequelize.query(`
      ALTER TABLE user_inventory 
      COMMENT '用户库存表'
    `)

    console.log('✅ 迁移已回滚')
  }
}
