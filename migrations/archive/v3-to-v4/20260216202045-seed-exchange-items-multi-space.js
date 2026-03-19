'use strict'

/**
 * 数据库迁移：插入兑换商品种子数据（覆盖三种空间归属场景）
 *
 * 业务背景：
 * - 臻选空间（premium）目前没有任何商品，前端无法对接臻选空间功能
 * - 需要覆盖三种空间归属场景：仅幸运空间(lucky)、仅臻选空间(premium)、两者都展示(both)
 * - 商品使用已有的材料资产类型：red_shard（红水晶碎片）、DIAMOND（钻石）
 * - 商品数据为真实业务场景，非模拟数据
 *
 * 商品分布设计（共12个商品）：
 * - 仅幸运空间（lucky）：4个 - 日常低门槛兑换品
 * - 仅臻选空间（premium）：4个 - 高端精选商品
 * - 两者都展示（both）：4个 - 跨空间通用商品
 *
 * 注意事项：
 * - 所有 cost_price 字段需由运营填写真实成本价（此处为占位值，标记 TODO）
 * - 商品图片需运营通过管理后台上传绑定（primary_media_id 暂为 NULL）
 *
 * 回滚方案：
 * - down() 根据 item_name 前缀删除本次插入的商品（使用 LIKE 'S%' 匹配防误删）
 *
 * @date 2026-02-17
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('📦 [迁移] 开始：插入兑换商品种子数据（三种空间归属）...')

    const now = new Date()

    /**
     * 兑换商品种子数据
     *
     * ⚠️ cost_price 字段说明：
     * - 此字段为商品实际成本价（人民币），属于商业机密
     * - 当前值为占位默认值，需要运营人员在管理后台填写真实成本价
     * - TODO: 由运营在管理后台更新每个商品的真实 cost_price
     */
    const exchangeItems = [
      // ========== 仅幸运空间（lucky）：4个日常低门槛兑换品 ==========
      {
        item_name: '定制手机支架',
        description: '品牌定制亚克力手机支架，适配各型号手机，桌面办公必备好物',
        cost_asset_code: 'red_shard',
        cost_amount: 50,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 200,
        sold_count: 0,
        category: '日用百货',
        status: 'active',
        sort_order: 10,
        space: 'lucky',
        original_price: 80,
        tags: JSON.stringify(['热销', '包邮']),
        is_new: false,
        is_hot: true,
        is_lucky: true,
        has_warranty: false,
        free_shipping: true,
        sell_point: '办公桌面必备，稳固不滑',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '品牌保温杯 350ml',
        description: '304不锈钢内胆保温杯，12小时长效保温，便携随行',
        cost_asset_code: 'red_shard',
        cost_amount: 120,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 150,
        sold_count: 0,
        category: '日用百货',
        status: 'active',
        sort_order: 20,
        space: 'lucky',
        original_price: 180,
        tags: JSON.stringify(['实用', '品质']),
        is_new: false,
        is_hot: true,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '304不锈钢，12小时保温',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '创意冰箱贴套装',
        description: '6枚装创意磁性冰箱贴，食物造型设计，装饰厨房好帮手',
        cost_asset_code: 'red_shard',
        cost_amount: 30,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 500,
        sold_count: 0,
        category: '创意礼品',
        status: 'active',
        sort_order: 30,
        space: 'lucky',
        original_price: 50,
        tags: JSON.stringify(['萌趣', '6枚装']),
        is_new: true,
        is_hot: false,
        is_lucky: true,
        has_warranty: false,
        free_shipping: true,
        sell_point: '食物造型，萌趣可爱',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '多功能数据线',
        description: '三合一快充数据线（Type-C/Lightning/Micro USB），1.2米编织线缆',
        cost_asset_code: 'red_shard',
        cost_amount: 80,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 300,
        sold_count: 0,
        category: '数码配件',
        status: 'active',
        sort_order: 40,
        space: 'lucky',
        original_price: 120,
        tags: JSON.stringify(['三合一', '快充']),
        is_new: false,
        is_hot: false,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '三合一接口，一线走天下',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },

      // ========== 仅臻选空间（premium）：4个高端精选商品 ==========
      {
        item_name: '蓝牙降噪耳机',
        description: '主动降噪蓝牙耳机，40小时续航，高清音质，商务通勤首选',
        cost_asset_code: 'DIAMOND',
        cost_amount: 5,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 30,
        sold_count: 0,
        category: '数码配件',
        status: 'active',
        sort_order: 10,
        space: 'premium',
        original_price: 8,
        tags: JSON.stringify(['臻选', '降噪', '限量']),
        is_new: true,
        is_hot: true,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '主动降噪，40小时超长续航',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '智能保温壶套装',
        description: '智能温度显示保温壶+两个杯子套装，LED温度实时显示，商务送礼佳品',
        cost_asset_code: 'DIAMOND',
        cost_amount: 3,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 50,
        sold_count: 0,
        category: '品质生活',
        status: 'active',
        sort_order: 20,
        space: 'premium',
        original_price: 5,
        tags: JSON.stringify(['臻选', '智能', '套装']),
        is_new: true,
        is_hot: false,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: 'LED温度显示，送礼有面子',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '品牌双肩包',
        description: '商务休闲双肩包，防泼水面料，15.6寸笔记本专用夹层，USB充电接口',
        cost_asset_code: 'DIAMOND',
        cost_amount: 8,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 20,
        sold_count: 0,
        category: '品质生活',
        status: 'active',
        sort_order: 30,
        space: 'premium',
        original_price: 12,
        tags: JSON.stringify(['臻选', '限量', '商务']),
        is_new: false,
        is_hot: true,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '防泼水面料，USB充电接口',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '高端美食礼盒',
        description: '精选进口零食礼盒装，包含坚果、巧克力、饼干等12种美味，节日送礼首选',
        cost_asset_code: 'DIAMOND',
        cost_amount: 2,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 80,
        sold_count: 0,
        category: '美食特产',
        status: 'active',
        sort_order: 40,
        space: 'premium',
        original_price: 3,
        tags: JSON.stringify(['臻选', '礼盒', '进口']),
        is_new: false,
        is_hot: false,
        is_lucky: false,
        has_warranty: false,
        free_shipping: true,
        sell_point: '12种进口美味，高端礼盒包装',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },

      // ========== 两者都展示（both）：4个跨空间通用商品 ==========
      {
        item_name: '无线充电器',
        description: '15W快充无线充电板，兼容iPhone/Android，超薄设计，桌面百搭',
        cost_asset_code: 'red_shard',
        cost_amount: 200,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 100,
        sold_count: 0,
        category: '数码配件',
        status: 'active',
        sort_order: 10,
        space: 'both',
        original_price: 300,
        tags: JSON.stringify(['跨空间', '快充', '热销']),
        is_new: true,
        is_hot: true,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '15W快充，全机型兼容',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '精美餐具套装',
        description: '日式简约陶瓷餐具4件套（饭碗+汤碗+盘子+筷子），家用送礼两相宜',
        cost_asset_code: 'red_shard',
        cost_amount: 300,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 60,
        sold_count: 0,
        category: '品质生活',
        status: 'active',
        sort_order: 20,
        space: 'both',
        original_price: 450,
        tags: JSON.stringify(['跨空间', '套装', '日式']),
        is_new: false,
        is_hot: true,
        is_lucky: false,
        has_warranty: false,
        free_shipping: true,
        sell_point: '日式简约设计，4件套装',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '品牌运动毛巾',
        description: '速干运动毛巾，冷感降温面料，健身跑步必备，两条装',
        cost_asset_code: 'red_shard',
        cost_amount: 60,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 400,
        sold_count: 0,
        category: '运动户外',
        status: 'active',
        sort_order: 30,
        space: 'both',
        original_price: 100,
        tags: JSON.stringify(['跨空间', '速干', '两条装']),
        is_new: true,
        is_hot: false,
        is_lucky: true,
        has_warranty: false,
        free_shipping: true,
        sell_point: '冷感降温，越擦越凉爽',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      },
      {
        item_name: '便携蓝牙音箱',
        description: 'IPX5防水便携蓝牙音箱，8小时续航，户外野营好伙伴',
        cost_asset_code: 'DIAMOND',
        cost_amount: 1,
        cost_price: 0, // TODO: 由运营填写真实成本价
        stock: 40,
        sold_count: 0,
        category: '数码配件',
        status: 'active',
        sort_order: 40,
        space: 'both',
        original_price: 2,
        tags: JSON.stringify(['跨空间', '防水', '户外']),
        is_new: false,
        is_hot: false,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: 'IPX5防水，户外随心听',
        primary_media_id: null,
        created_at: now,
        updated_at: now
      }
    ]

    // 防重复检查：如果已存在同名商品则跳过
    const [existing] = await queryInterface.sequelize.query(
      "SELECT item_name FROM exchange_items WHERE item_name IN ('定制手机支架', '蓝牙降噪耳机', '无线充电器')"
    )

    if (existing.length > 0) {
      console.log(`  ⚠️ 已存在 ${existing.length} 个同名商品，跳过本次种子数据插入`)
      console.log(`  已存在的商品: ${existing.map(e => e.item_name).join(', ')}`)
      return
    }

    await queryInterface.bulkInsert('exchange_items', exchangeItems)

    console.log(`  ✅ 成功插入 ${exchangeItems.length} 个兑换商品`)
    console.log('  📊 空间分布:')
    console.log('     - 仅幸运空间(lucky): 4个（定制手机支架、品牌保温杯、创意冰箱贴、多功能数据线）')
    console.log('     - 仅臻选空间(premium): 4个（蓝牙降噪耳机、智能保温壶套装、品牌双肩包、高端美食礼盒）')
    console.log('     - 两者都展示(both): 4个（无线充电器、精美餐具套装、品牌运动毛巾、便携蓝牙音箱）')
    console.log('')
    console.log('  ⚠️ 待运营操作:')
    console.log('     1. 在管理后台为每个商品上传图片（当前 primary_media_id 为空）')
    console.log('     2. 更新每个商品的真实 cost_price（当前为占位值 0）')
    console.log('📦 [迁移] 完成：兑换商品种子数据插入完毕')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：删除本次插入的兑换商品种子数据...')

    // 根据精确商品名列表删除（避免误删其他商品）
    const itemNames = [
      '定制手机支架',
      '品牌保温杯 350ml',
      '创意冰箱贴套装',
      '多功能数据线',
      '蓝牙降噪耳机',
      '智能保温壶套装',
      '品牌双肩包',
      '高端美食礼盒',
      '无线充电器',
      '精美餐具套装',
      '品牌运动毛巾',
      '便携蓝牙音箱'
    ]

    const placeholders = itemNames.map(() => '?').join(', ')
    await queryInterface.sequelize.query(
      `DELETE FROM exchange_items WHERE item_name IN (${placeholders})`,
      { replacements: itemNames }
    )

    console.log(`📦 [回滚] 完成：已删除 ${itemNames.length} 个种子商品`)
  }
}
