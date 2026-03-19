'use strict'

/**
 * 迁移：兑换系统数据质量修复
 *
 * 修复内容：
 * 1. exchange_page 配置补写 detail_page 节点（合并进现有 JSON，不覆盖其他配置）
 * 2. 硬删除孤儿图片资源 image_resource_id=78（context_id=196 指向已不存在的商品）
 * 3. 硬删除测试商品 209/215/220 及其关联的 28 条测试兑换订单
 *    - exchange_records: 12条(209) + 8条(215) + 8条(220) = 28条
 *    - 全部 status=pending，无 debit_transaction_id（无资产交易影响）
 *    - 不涉及 account_asset_balances / asset_transactions 互锁体系
 *
 * 产生原因：
 * - detail_page：管理后台从未保存过"详情页配置"面板，API 靠运行时兜底
 * - 孤儿图片：商品 196 被删除时未级联清理图片资源
 * - 测试数据：幂等性测试创建，已设为 inactive 但未硬删除
 *
 * @see routes/v4/system/config.js - 第 360-366 行 detail_page 兜底逻辑
 * @see docs/兑换详情页B+C混合方案设计文档.md - 决策4 配置结构
 */
module.exports = {
  async up(queryInterface) {
    // ========== 第一步：exchange_page 配置补写 detail_page ==========
    console.log('[迁移] 步骤1: 检查并补写 exchange_page.detail_page 配置...')

    const [configRows] = await queryInterface.sequelize.query(
      `SELECT system_config_id, config_value
       FROM system_configs
       WHERE config_key = 'exchange_page' AND is_active = 1
       LIMIT 1`
    )

    if (configRows.length > 0) {
      const row = configRows[0]
      const configValue = typeof row.config_value === 'string'
        ? JSON.parse(row.config_value)
        : row.config_value

      if (!configValue.detail_page) {
        configValue.detail_page = {
          attr_display_mode: 'grid',
          tag_style_type: 'game'
        }

        await queryInterface.sequelize.query(
          `UPDATE system_configs
           SET config_value = :configValue, updated_at = NOW()
           WHERE system_config_id = :id`,
          {
            replacements: {
              configValue: JSON.stringify(configValue),
              id: row.system_config_id
            }
          }
        )
        console.log('[迁移] exchange_page.detail_page 已写入数据库:', JSON.stringify(configValue.detail_page))
      } else {
        console.log('[迁移] exchange_page.detail_page 已存在，跳过')
      }
    } else {
      console.log('[迁移] 警告: 未找到 exchange_page 配置记录')
    }

    // ========== 第二步：硬删除孤儿图片资源（已迁移至 media_files 体系，安全跳过） ==========
    // 注：image_resources 表已被 20260316231845 迁移删除，此步骤仅在表存在时执行
    console.log('[迁移] 步骤2: 检查孤儿图片资源清理...')

    const [tableCheck] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'image_resources'`
    )
    if (parseInt(tableCheck[0].cnt) > 0) {
      const [orphanCheck] = await queryInterface.sequelize.query(
        `SELECT ir.image_resource_id, ir.context_id, ir.file_path
         FROM image_resources ir
         LEFT JOIN exchange_items ei ON ir.context_id = ei.exchange_item_id
         WHERE ir.image_resource_id = 78
           AND ir.business_type = 'exchange'
           AND ei.exchange_item_id IS NULL`
      )

      if (orphanCheck.length > 0) {
        await queryInterface.sequelize.query(
          `DELETE FROM image_resources WHERE image_resource_id = 78`
        )
        console.log('[迁移] 孤儿图片资源 image_resource_id=78 已硬删除')
      } else {
        console.log('[迁移] image_resource_id=78 不是孤儿或已不存在，跳过')
      }
    } else {
      console.log('[迁移] image_resources 表已不存在（已迁移至 media_files），跳过孤儿清理')
    }

    // ========== 第三步：硬删除测试商品关联的 exchange_order_events 和 exchange_records ==========
    console.log('[迁移] 步骤3: 清理测试商品 209/215/220 关联的订单事件和兑换订单...')

    const testItemIds = [209, 215, 220]

    // 3a. 统计待删除订单
    const [recordCounts] = await queryInterface.sequelize.query(
      `SELECT exchange_item_id, COUNT(*) as count
       FROM exchange_records
       WHERE exchange_item_id IN (:ids)
       GROUP BY exchange_item_id`,
      { replacements: { ids: testItemIds } }
    )

    const totalRecords = recordCounts.reduce((sum, r) => sum + parseInt(r.count), 0)
    if (totalRecords > 0) {
      console.log(`[迁移] 发现 ${totalRecords} 条测试兑换订单:`)
      recordCounts.forEach(r => console.log(`  商品 ${r.exchange_item_id}: ${r.count} 条`))

      // 3b. 安全检查：确认全部无资产交易关联
      const [withTxn] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM exchange_records
         WHERE exchange_item_id IN (:ids)
           AND debit_transaction_id IS NOT NULL`,
        { replacements: { ids: testItemIds } }
      )
      if (parseInt(withTxn[0].count) > 0) {
        throw new Error(`[迁移] 安全中止: ${withTxn[0].count} 条测试订单关联了资产交易，不能硬删除`)
      }

      // 3c. 先删除 exchange_order_events（FK 引用 exchange_records.order_no，ON DELETE RESTRICT）
      const [orderNos] = await queryInterface.sequelize.query(
        `SELECT order_no FROM exchange_records WHERE exchange_item_id IN (:ids)`,
        { replacements: { ids: testItemIds } }
      )
      const nos = orderNos.map(r => r.order_no)

      if (nos.length > 0) {
        const [eventCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM exchange_order_events WHERE order_no IN (:nos)`,
          { replacements: { nos } }
        )
        const evtTotal = parseInt(eventCount[0].count)
        if (evtTotal > 0) {
          await queryInterface.sequelize.query(
            `DELETE FROM exchange_order_events WHERE order_no IN (:nos)`,
            { replacements: { nos } }
          )
          console.log(`[迁移] 已硬删除 ${evtTotal} 条测试订单事件 (exchange_order_events)`)
        }
      }

      // 3d. 硬删除测试兑换订单
      await queryInterface.sequelize.query(
        `DELETE FROM exchange_records WHERE exchange_item_id IN (:ids)`,
        { replacements: { ids: testItemIds } }
      )
      console.log(`[迁移] 已硬删除 ${totalRecords} 条测试兑换订单 (exchange_records)`)
    } else {
      console.log('[迁移] 无测试兑换订单需要清理')
    }

    // ========== 第四步：硬删除测试商品 209/215/220 ==========
    console.log('[迁移] 步骤4: 清理测试商品 209/215/220...')

    // 4a. 确认商品存在且为测试数据
    const [testItems] = await queryInterface.sequelize.query(
      `SELECT exchange_item_id, item_name, status
       FROM exchange_items
       WHERE exchange_item_id IN (:ids)`,
      { replacements: { ids: testItemIds } }
    )

    if (testItems.length > 0) {
      console.log(`[迁移] 待删除测试商品 ${testItems.length} 条:`)
      testItems.forEach(item => {
        console.log(`  ID=${item.exchange_item_id}: "${item.item_name}" (${item.status})`)
      })

      // 4b. 检查 bid_products 外键依赖
      const [bidRefs] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM bid_products WHERE exchange_item_id IN (:ids)`,
        { replacements: { ids: testItemIds } }
      )
      if (parseInt(bidRefs[0].count) > 0) {
        console.log(`[迁移] 清理 bid_products 中 ${bidRefs[0].count} 条关联记录...`)
        await queryInterface.sequelize.query(
          `DELETE FROM bid_products WHERE exchange_item_id IN (:ids)`,
          { replacements: { ids: testItemIds } }
        )
      }

      // 4c. 硬删除测试商品
      const deletedIds = testItems.map(i => i.exchange_item_id)
      await queryInterface.sequelize.query(
        `DELETE FROM exchange_items WHERE exchange_item_id IN (:ids)`,
        { replacements: { ids: deletedIds } }
      )
      console.log(`[迁移] 已硬删除 ${deletedIds.length} 条测试商品: [${deletedIds.join(', ')}]`)
    } else {
      console.log('[迁移] 测试商品 209/215/220 已不存在，跳过')
    }

    // ========== 第五步：验证清理结果 ==========
    console.log('[迁移] 步骤5: 验证清理结果...')

    // 验证 exchange_page 配置
    const [verifyConfig] = await queryInterface.sequelize.query(
      `SELECT JSON_CONTAINS_PATH(config_value, 'one', '$.detail_page') as has_detail_page
       FROM system_configs
       WHERE config_key = 'exchange_page'`
    )
    console.log(`  exchange_page.detail_page 存在: ${verifyConfig[0]?.has_detail_page === 1 ? '是' : '否'}`)

    // 验证孤儿图片已删除（仅在 image_resources 表存在时验证）
    const [tableCheck2] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'image_resources'`
    )
    if (parseInt(tableCheck2[0].cnt) > 0) {
      const [verifyOrphan] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM image_resources WHERE image_resource_id = 78`
      )
      console.log(`  孤儿图片 78 已删除: ${parseInt(verifyOrphan[0].count) === 0 ? '是' : '否'}`)
    } else {
      console.log('  孤儿图片验证: image_resources 表已不存在（已迁移至 media_files）')
    }

    // 验证测试商品已删除
    const [verifyItems] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM exchange_items WHERE exchange_item_id IN (209, 215, 220)`
    )
    console.log(`  测试商品已删除: ${parseInt(verifyItems[0].count) === 0 ? '是' : '否'}`)

    // 验证测试订单已删除
    const [verifyRecords] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM exchange_records WHERE exchange_item_id IN (209, 215, 220)`
    )
    console.log(`  测试订单已删除: ${parseInt(verifyRecords[0].count) === 0 ? '是' : '否'}`)

    // 输出最终数据概况
    const [finalItems] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
       FROM exchange_items`
    )
    console.log(`  exchange_items 最终状态: 总计 ${finalItems[0].total} 条, 活跃 ${finalItems[0].active_count} 条`)

    if (parseInt(tableCheck2[0].cnt) > 0) {
      const [finalImages] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as total FROM image_resources WHERE business_type = 'exchange'`
      )
      console.log(`  exchange 图片资源: ${finalImages[0].total} 条`)
    } else {
      console.log('  exchange 图片资源: 已迁移至 media_files 体系')
    }

    console.log('[迁移] 兑换系统数据质量修复完成')
  },

  async down() {
    console.log('[迁移] 回滚说明:')
    console.log('  - detail_page 配置可通过管理后台重新保存')
    console.log('  - 孤儿图片资源和测试数据为无效数据，不可恢复也无需恢复')
  }
}
