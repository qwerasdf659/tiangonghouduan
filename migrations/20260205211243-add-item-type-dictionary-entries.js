'use strict'

/**
 * 新增 item_type 字典数据
 *
 * 业务背景：
 * - 物品实例（item_instances）的 item_type 字段需要中文显示名称
 * - 配合 attachDisplayNames 机制，让前端直接使用 item_type_display 字段
 * - 消除前端 getAssetTypeText 映射函数
 *
 * 新增数据：
 * - dict_type: item_type
 * - 覆盖值: prize(奖品), product(商品), voucher(兑换券), tradable_item(可交易物品), service(服务)
 *
 * 关联文件：
 * - utils/displayNameHelper.js (DICT_TYPES.ITEM_TYPE)
 * - services/asset/ItemService.js (attachDisplayNames 调用)
 *
 * @date 2026-02-06 北京时间
 */
module.exports = {
  async up(queryInterface) {
    // 检查是否已存在（幂等性保护）
    const [existing] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM system_dictionaries WHERE dict_type = 'item_type'"
    )

    if (existing[0].cnt > 0) {
      console.log('⚠️ item_type 字典数据已存在，跳过插入')
      return
    }

    console.log('📝 插入 item_type 字典数据（5条）...')

    await queryInterface.sequelize.query(`
      INSERT INTO system_dictionaries
        (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, created_at, updated_at)
      VALUES
        ('item_type', 'prize',         '奖品',       'bg-warning',   1, 1, NOW(), NOW()),
        ('item_type', 'product',       '商品',       'bg-primary',   2, 1, NOW(), NOW()),
        ('item_type', 'voucher',       '兑换券',     'bg-success',   3, 1, NOW(), NOW()),
        ('item_type', 'tradable_item', '可交易物品', 'bg-info',      4, 1, NOW(), NOW()),
        ('item_type', 'service',       '服务',       'bg-secondary', 5, 1, NOW(), NOW())
    `)

    // 验证插入结果
    const [result] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM system_dictionaries WHERE dict_type = 'item_type' AND is_enabled = 1"
    )
    console.log(`✅ item_type 字典数据插入完成：${result[0].cnt} 条`)
  },

  async down(queryInterface) {
    console.log('🔄 回滚：删除 item_type 字典数据')

    await queryInterface.sequelize.query(
      "DELETE FROM system_dictionaries WHERE dict_type = 'item_type'"
    )

    console.log('✅ item_type 字典数据已删除')
  }
}

