'use strict'

/**
 * 综合测试数据种子文件
 *
 * 覆盖范围：
 * 1. 基础字典数据（RarityDef、CategoryDef、AssetGroupDef）
 * 2. 用户体系（管理员、普通用户、商户）
 * 3. 材料资产类型（含图标 icon_url）
 * 4. 图片资源（ImageResources，供兑换商品引用）
 * 5. 物品模板
 * 6. 兑换商品图片绑定（更新 primary_image_id）
 * 7. 弹窗/轮播图
 * 8. 系统公告
 * 9. 抽奖活动 + 奖品
 * 10. 材料转换规则
 * 11. 广告位 + 广告活动 + 广告素材
 * 12. 用户反馈
 * 13. 系统消息（admin_notifications）
 *
 * 图片路径约定：
 * - 统一使用对象存储 key 格式（如 test-seeds/xxx.jpg）
 * - 前端通过 ImageUrlHelper.getImageUrl() 转完整 CDN URL
 * - 测试环境下图片不存在时会展示占位图，不影响功能测试
 *
 * 执行方式：npx sequelize-cli db:seed --seed 20260218160000-comprehensive-test-data.js
 * 回滚方式：npx sequelize-cli db:seed:undo --seed 20260218160000-comprehensive-test-data.js
 */
module.exports = {
  /**
   * 插入综合测试数据
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} Sequelize - Sequelize 类
   * @returns {Promise<void>} 无返回值
   */
  async up(queryInterface, Sequelize) {
    const now = new Date()
    const _Op = Sequelize.Op // eslint-disable-line no-unused-vars

    console.log('🌱 [种子数据] 开始插入综合测试数据...')

    /*
     * ================================================================
     * 1. 基础字典数据
     * ================================================================
     */
    console.log('📖 1/13 基础字典数据...')

    // 1a. 稀有度字典
    const rarityDefs = [
      {
        rarity_code: 'common',
        display_name: '普通',
        description: '常见物品',
        color_hex: '#9E9E9E',
        tier: 1,
        sort_order: 10,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        rarity_code: 'uncommon',
        display_name: '优良',
        description: '品质优良的物品',
        color_hex: '#4CAF50',
        tier: 2,
        sort_order: 20,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        rarity_code: 'rare',
        display_name: '稀有',
        description: '稀有珍贵物品',
        color_hex: '#2196F3',
        tier: 3,
        sort_order: 30,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        rarity_code: 'epic',
        display_name: '史诗',
        description: '极其珍贵的物品',
        color_hex: '#9C27B0',
        tier: 4,
        sort_order: 40,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        rarity_code: 'legendary',
        display_name: '传说',
        description: '传说级别的稀世珍品',
        color_hex: '#FF9800',
        tier: 5,
        sort_order: 50,
        is_enabled: true,
        created_at: now,
        updated_at: now
      }
    ]
    for (const r of rarityDefs) {
      const exists = await queryInterface.rawSelect(
        'rarity_defs',
        { where: { rarity_code: r.rarity_code } },
        ['rarity_code']
      )
      if (!exists) await queryInterface.bulkInsert('rarity_defs', [r])
    }

    // 1b. 类目字典（icon_url 走前端静态映射，不在 DB 存储图片路径）
    const categoryDefs = [
      {
        category_code: 'electronics',
        display_name: '数码电子',
        description: '手机、平板、耳机等数码产品',
        icon_url: null,
        sort_order: 10,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        category_code: 'lifestyle',
        display_name: '生活日用',
        description: '日常生活用品',
        icon_url: null,
        sort_order: 20,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        category_code: 'food',
        display_name: '美食饮品',
        description: '食品饮料卡券',
        icon_url: null,
        sort_order: 30,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        category_code: 'voucher',
        display_name: '优惠券',
        description: '各类优惠券与代金券',
        icon_url: null,
        sort_order: 40,
        is_enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        category_code: 'collectible',
        display_name: '收藏品',
        description: '限量收藏与纪念品',
        icon_url: null,
        sort_order: 50,
        is_enabled: true,
        created_at: now,
        updated_at: now
      }
    ]
    for (const c of categoryDefs) {
      const exists = await queryInterface.rawSelect(
        'category_defs',
        { where: { category_code: c.category_code } },
        ['category_code']
      )
      if (!exists) await queryInterface.bulkInsert('category_defs', [c])
    }

    // 1c. 资产分组字典
    const assetGroups = [
      {
        group_code: 'system',
        display_name: '系统资产',
        description: '系统级别资产（积分、钻石等）',
        group_type: 'system',
        color_hex: '#607D8B',
        sort_order: 1,
        is_enabled: true,
        is_tradable: false,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'red',
        display_name: '红色材料',
        description: '红色系列水晶材料',
        group_type: 'material',
        color_hex: '#F44336',
        sort_order: 10,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'orange',
        display_name: '橙色材料',
        description: '橙色系列水晶材料',
        group_type: 'material',
        color_hex: '#FF9800',
        sort_order: 20,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'yellow',
        display_name: '黄色材料',
        description: '黄色系列水晶材料',
        group_type: 'material',
        color_hex: '#FFEB3B',
        sort_order: 30,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'green',
        display_name: '绿色材料',
        description: '绿色系列水晶材料',
        group_type: 'material',
        color_hex: '#4CAF50',
        sort_order: 40,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'blue',
        display_name: '蓝色材料',
        description: '蓝色系列水晶材料',
        group_type: 'material',
        color_hex: '#2196F3',
        sort_order: 50,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        group_code: 'purple',
        display_name: '紫色材料',
        description: '紫色系列水晶材料',
        group_type: 'material',
        color_hex: '#9C27B0',
        sort_order: 60,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      }
    ]
    for (const g of assetGroups) {
      const exists = await queryInterface.rawSelect(
        'asset_group_defs',
        { where: { group_code: g.group_code } },
        ['group_code']
      )
      if (!exists) await queryInterface.bulkInsert('asset_group_defs', [g])
    }

    /*
     * ================================================================
     * 2. 用户体系（复用已存在的测试用户）
     * ================================================================
     */
    console.log('👤 2/13 用户体系...')

    // 复用数据库中已有的测试用户，而非新建（避免 user_uuid 等约束问题）
    const adminUserId =
      (await queryInterface.rawSelect('users', { where: { mobile: '13612227930' } }, [
        'user_id'
      ])) ||
      (await queryInterface.rawSelect('users', { where: { mobile: '13800000001' } }, ['user_id']))
    const user1Id =
      (await queryInterface.rawSelect('users', { where: { mobile: '13800000002' } }, [
        'user_id'
      ])) ||
      (await queryInterface.rawSelect('users', { where: { mobile: '13612227910' } }, ['user_id']))
    const user2Id =
      (await queryInterface.rawSelect('users', { where: { mobile: '13800000003' } }, [
        'user_id'
      ])) ||
      (await queryInterface.rawSelect('users', { where: { mobile: '13612227911' } }, ['user_id']))
    const merchantUserId =
      (await queryInterface.rawSelect('users', { where: { mobile: '13800000004' } }, [
        'user_id'
      ])) ||
      (await queryInterface.rawSelect('users', { where: { mobile: '13612227912' } }, ['user_id']))
    const user3Id =
      (await queryInterface.rawSelect('users', { where: { mobile: '13800000000' } }, [
        'user_id'
      ])) ||
      (await queryInterface.rawSelect('users', { where: { mobile: '13612227913' } }, ['user_id']))

    console.log(
      `   用户IDs -> admin:${adminUserId}, u1:${user1Id}, u2:${user2Id}, merchant:${merchantUserId}, u3:${user3Id}`
    )

    if (!adminUserId) {
      console.warn('⚠️  未找到管理员用户，部分带 created_by 的数据将使用 NULL')
    }

    // 确保用户有账户
    for (const uid of [adminUserId, user1Id, user2Id, merchantUserId, user3Id].filter(Boolean)) {
      const acctExists = await queryInterface.rawSelect('accounts', { where: { user_id: uid } }, [
        'account_id'
      ])
      if (!acctExists) {
        await queryInterface.bulkInsert('accounts', [
          {
            account_type: 'user',
            user_id: uid,
            status: 'active',
            created_at: now,
            updated_at: now
          }
        ])
      }
    }

    /*
     * ================================================================
     * 3. 材料资产类型（含 icon_url）
     * ================================================================
     */
    console.log('💎 3/13 材料资产类型...')

    const materialAssetTypes = [
      {
        asset_code: 'POINTS',
        display_name: '积分',
        icon_url: null,
        group_code: 'system',
        form: 'crystal',
        tier: 0,
        sort_order: 1,
        visible_value_points: 1,
        budget_value_points: 1,
        is_enabled: true,
        is_tradable: false,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'DIAMOND',
        display_name: '钻石',
        icon_url: null,
        group_code: 'system',
        form: 'crystal',
        tier: 0,
        sort_order: 2,
        visible_value_points: 10,
        budget_value_points: 10,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'BUDGET_POINTS',
        display_name: '预算积分',
        icon_url: null,
        group_code: 'system',
        form: 'crystal',
        tier: 0,
        sort_order: 3,
        visible_value_points: 1,
        budget_value_points: 1,
        is_enabled: true,
        is_tradable: false,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'red_shard',
        display_name: '红水晶碎片',
        icon_url: null,
        group_code: 'red',
        form: 'shard',
        tier: 1,
        sort_order: 10,
        visible_value_points: 10,
        budget_value_points: 5,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'red_crystal',
        display_name: '红水晶',
        icon_url: null,
        group_code: 'red',
        form: 'crystal',
        tier: 2,
        sort_order: 11,
        visible_value_points: 100,
        budget_value_points: 50,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'orange_shard',
        display_name: '橙水晶碎片',
        icon_url: null,
        group_code: 'orange',
        form: 'shard',
        tier: 1,
        sort_order: 20,
        visible_value_points: 20,
        budget_value_points: 10,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'orange_crystal',
        display_name: '橙水晶',
        icon_url: null,
        group_code: 'orange',
        form: 'crystal',
        tier: 2,
        sort_order: 21,
        visible_value_points: 200,
        budget_value_points: 100,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'yellow_shard',
        display_name: '黄水晶碎片',
        icon_url: null,
        group_code: 'yellow',
        form: 'shard',
        tier: 1,
        sort_order: 30,
        visible_value_points: 40,
        budget_value_points: 20,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'yellow_crystal',
        display_name: '黄水晶',
        icon_url: null,
        group_code: 'yellow',
        form: 'crystal',
        tier: 2,
        sort_order: 31,
        visible_value_points: 400,
        budget_value_points: 200,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'green_shard',
        display_name: '绿水晶碎片',
        icon_url: null,
        group_code: 'green',
        form: 'shard',
        tier: 1,
        sort_order: 40,
        visible_value_points: 80,
        budget_value_points: 40,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'green_crystal',
        display_name: '绿水晶',
        icon_url: null,
        group_code: 'green',
        form: 'crystal',
        tier: 2,
        sort_order: 41,
        visible_value_points: 800,
        budget_value_points: 400,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'blue_shard',
        display_name: '蓝水晶碎片',
        icon_url: null,
        group_code: 'blue',
        form: 'shard',
        tier: 1,
        sort_order: 50,
        visible_value_points: 160,
        budget_value_points: 80,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'blue_crystal',
        display_name: '蓝水晶',
        icon_url: null,
        group_code: 'blue',
        form: 'crystal',
        tier: 2,
        sort_order: 51,
        visible_value_points: 1600,
        budget_value_points: 800,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'purple_shard',
        display_name: '紫水晶碎片',
        icon_url: null,
        group_code: 'purple',
        form: 'shard',
        tier: 1,
        sort_order: 60,
        visible_value_points: 320,
        budget_value_points: 160,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      },
      {
        asset_code: 'purple_crystal',
        display_name: '紫水晶',
        icon_url: null,
        group_code: 'purple',
        form: 'crystal',
        tier: 2,
        sort_order: 61,
        visible_value_points: 3200,
        budget_value_points: 1600,
        is_enabled: true,
        is_tradable: true,
        created_at: now,
        updated_at: now
      }
    ]
    for (const m of materialAssetTypes) {
      const exists = await queryInterface.rawSelect(
        'material_asset_types',
        { where: { asset_code: m.asset_code } },
        ['material_asset_type_id']
      )
      if (exists) {
        // 更新 icon_url（可能之前为 NULL）
        await queryInterface.bulkUpdate(
          'material_asset_types',
          { icon_url: m.icon_url },
          { asset_code: m.asset_code }
        )
      } else {
        await queryInterface.bulkInsert('material_asset_types', [m])
      }
    }

    // 给用户账户初始化余额
    for (const uid of [user1Id, user2Id, merchantUserId, user3Id].filter(Boolean)) {
      const acctId = await queryInterface.rawSelect('accounts', { where: { user_id: uid } }, [
        'account_id'
      ])
      if (!acctId) continue
      const balanceCodes = ['DIAMOND', 'red_shard', 'red_crystal', 'orange_shard']
      for (const code of balanceCodes) {
        const balExists = await queryInterface.rawSelect(
          'account_asset_balances',
          {
            where: { account_id: acctId, asset_code: code, lottery_campaign_key: 'GLOBAL' }
          },
          ['account_asset_balance_id']
        )
        if (!balExists) {
          const amt =
            code === 'DIAMOND'
              ? 5000
              : code === 'red_shard'
                ? 2000
                : code === 'red_crystal'
                  ? 200
                  : 500
          await queryInterface.bulkInsert('account_asset_balances', [
            {
              account_id: acctId,
              asset_code: code,
              available_amount: amt,
              frozen_amount: 0,
              lottery_campaign_key: 'GLOBAL',
              created_at: now,
              updated_at: now
            }
          ])
        }
      }
    }

    /*
     * ================================================================
     * 4. 图片资源（供兑换商品等引用）
     * ================================================================
     */
    console.log('🖼️  4/13 图片资源...')

    const imageResources = [
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/airpods-pro.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/airpods-pro.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/airpods-pro.jpg',
          large: 'test-seeds/exchange/thumbnails/large/airpods-pro.jpg'
        }),
        original_filename: 'airpods-pro.jpg',
        file_size: 102400,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/xiaomi-band.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/xiaomi-band.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/xiaomi-band.jpg',
          large: 'test-seeds/exchange/thumbnails/large/xiaomi-band.jpg'
        }),
        original_filename: 'xiaomi-band.jpg',
        file_size: 89600,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/coffee-coupon.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/coffee-coupon.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/coffee-coupon.jpg',
          large: 'test-seeds/exchange/thumbnails/large/coffee-coupon.jpg'
        }),
        original_filename: 'coffee-coupon.jpg',
        file_size: 65536,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/canvas-bag.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/canvas-bag.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/canvas-bag.jpg',
          large: 'test-seeds/exchange/thumbnails/large/canvas-bag.jpg'
        }),
        original_filename: 'canvas-bag.jpg',
        file_size: 78000,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/mechanical-keyboard.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/mechanical-keyboard.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/mechanical-keyboard.jpg',
          large: 'test-seeds/exchange/thumbnails/large/mechanical-keyboard.jpg'
        }),
        original_filename: 'mechanical-keyboard.jpg',
        file_size: 115200,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'exchange',
        category: 'products',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/exchange/desk-lamp.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/exchange/thumbnails/small/desk-lamp.jpg',
          medium: 'test-seeds/exchange/thumbnails/medium/desk-lamp.jpg',
          large: 'test-seeds/exchange/thumbnails/large/desk-lamp.jpg'
        }),
        original_filename: 'desk-lamp.jpg',
        file_size: 92000,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'lottery',
        category: 'prizes',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/lottery/prize-iphone.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/lottery/thumbnails/small/prize-iphone.jpg',
          medium: 'test-seeds/lottery/thumbnails/medium/prize-iphone.jpg',
          large: 'test-seeds/lottery/thumbnails/large/prize-iphone.jpg'
        }),
        original_filename: 'prize-iphone.jpg',
        file_size: 125000,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      },
      {
        business_type: 'lottery',
        category: 'prizes',
        context_id: 0,
        user_id: adminUserId,
        file_path: 'test-seeds/lottery/prize-coupon.jpg',
        thumbnail_paths: JSON.stringify({
          small: 'test-seeds/lottery/thumbnails/small/prize-coupon.jpg',
          medium: 'test-seeds/lottery/thumbnails/medium/prize-coupon.jpg',
          large: 'test-seeds/lottery/thumbnails/large/prize-coupon.jpg'
        }),
        original_filename: 'prize-coupon.jpg',
        file_size: 55000,
        mime_type: 'image/jpeg',
        status: 'active',
        source_module: 'admin',
        ip_address: '127.0.0.1',
        created_at: now
      }
    ]
    const imageIds = []
    for (const img of imageResources) {
      const exists = await queryInterface.rawSelect(
        'image_resources',
        { where: { file_path: img.file_path } },
        ['image_resource_id']
      )
      if (exists) {
        imageIds.push(exists)
      } else {
        await queryInterface.bulkInsert('image_resources', [img])
        const newId = await queryInterface.rawSelect(
          'image_resources',
          { where: { file_path: img.file_path } },
          ['image_resource_id']
        )
        imageIds.push(newId)
      }
    }

    /*
     * ================================================================
     * 5. 物品模板
     * ================================================================
     */
    console.log('📦 5/13 物品模板...')

    const itemTemplates = [
      {
        template_code: 'tpl_iphone_16_pro',
        item_type: 'gift',
        category_code: 'electronics',
        rarity_code: 'legendary',
        display_name: 'iPhone 16 Pro',
        description: '苹果 iPhone 16 Pro 256GB，年度旗舰智能手机',
        reference_price_points: 89900,
        is_tradable: true,
        is_enabled: true,
        meta: JSON.stringify({ brand: 'Apple', model: 'iPhone 16 Pro' }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_airpods_pro_2',
        item_type: 'gift',
        category_code: 'electronics',
        rarity_code: 'epic',
        display_name: 'AirPods Pro 2',
        description: 'Apple AirPods Pro 第二代，主动降噪无线耳机',
        reference_price_points: 17900,
        is_tradable: true,
        is_enabled: true,
        meta: JSON.stringify({ brand: 'Apple', model: 'AirPods Pro 2' }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_xiaomi_band_8',
        item_type: 'gift',
        category_code: 'electronics',
        rarity_code: 'rare',
        display_name: '小米手环8',
        description: '小米手环8，全天候健康监测',
        reference_price_points: 2490,
        is_tradable: true,
        is_enabled: true,
        meta: JSON.stringify({ brand: 'Xiaomi', model: 'Band 8' }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_starbucks_50',
        item_type: 'voucher',
        category_code: 'food',
        rarity_code: 'uncommon',
        display_name: '星巴克50元代金券',
        description: '星巴克饮品 50 元代金券，全国门店通用',
        reference_price_points: 500,
        is_tradable: false,
        is_enabled: true,
        meta: JSON.stringify({ brand: 'Starbucks', amount: 50 }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_meituan_20',
        item_type: 'voucher',
        category_code: 'food',
        rarity_code: 'common',
        display_name: '美团20元红包',
        description: '美团外卖 20 元红包，满 40 使用',
        reference_price_points: 200,
        is_tradable: false,
        is_enabled: true,
        meta: JSON.stringify({ brand: '美团', amount: 20, min_order: 40 }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_mech_keyboard',
        item_type: 'gift',
        category_code: 'electronics',
        rarity_code: 'rare',
        display_name: '机械键盘 87键',
        description: 'Cherry 轴体 87键机械键盘，RGB背光',
        reference_price_points: 3990,
        is_tradable: true,
        is_enabled: true,
        meta: null,
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_canvas_bag',
        item_type: 'gift',
        category_code: 'lifestyle',
        rarity_code: 'common',
        display_name: '品牌帆布袋',
        description: '环保帆布袋，大容量实用',
        reference_price_points: 290,
        is_tradable: false,
        is_enabled: true,
        meta: null,
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_limited_badge',
        item_type: 'virtual',
        category_code: 'collectible',
        rarity_code: 'epic',
        display_name: '限定纪念徽章',
        description: '2026新春限定纪念徽章，编号收藏',
        reference_price_points: 9990,
        is_tradable: true,
        is_enabled: true,
        meta: JSON.stringify({ edition: '2026新春限定', total: 100 }),
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_desk_lamp',
        item_type: 'gift',
        category_code: 'lifestyle',
        rarity_code: 'uncommon',
        display_name: 'LED护眼台灯',
        description: '三色调光 LED 护眼台灯，USB充电',
        reference_price_points: 1290,
        is_tradable: true,
        is_enabled: true,
        meta: null,
        created_at: now,
        updated_at: now
      },
      {
        template_code: 'tpl_disabled_old',
        item_type: 'gift',
        category_code: 'lifestyle',
        rarity_code: 'common',
        display_name: '已下架-旧款商品',
        description: '此物品模板已下架停用',
        reference_price_points: 100,
        is_tradable: false,
        is_enabled: false,
        meta: null,
        created_at: now,
        updated_at: now
      }
    ]
    for (const t of itemTemplates) {
      const exists = await queryInterface.rawSelect(
        'item_templates',
        { where: { template_code: t.template_code } },
        ['item_template_id']
      )
      if (!exists) await queryInterface.bulkInsert('item_templates', [t])
    }

    /*
     * ================================================================
     * 6. 兑换商品图片绑定（更新已存在的商品 primary_image_id）
     * ================================================================
     */
    console.log('🛒 6/13 兑换商品图片绑定...')

    const newExchangeItems = [
      {
        item_name: '[测试]AirPods Pro 2代',
        description: '苹果 AirPods Pro 第二代，主动降噪，适应性音频',
        primary_image_id: imageIds[0],
        cost_asset_code: 'orange_crystal',
        cost_amount: 50,
        cost_price: 1499.0,
        stock: 10,
        sold_count: 2,
        category: '数码电子',
        status: 'active',
        sort_order: 1,
        space: 'premium',
        original_price: 80,
        tags: JSON.stringify(['限量', '热卖']),
        is_new: false,
        is_hot: true,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '年度音质升级，通透模式更自然',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]小米手环8 NFC版',
        description: '小米手环8 NFC版，1.62英寸AMOLED屏幕，16天超长续航',
        primary_image_id: imageIds[1],
        cost_asset_code: 'red_shard',
        cost_amount: 300,
        cost_price: 249.0,
        stock: 50,
        sold_count: 15,
        category: '数码电子',
        status: 'active',
        sort_order: 2,
        space: 'lucky',
        original_price: 500,
        tags: JSON.stringify(['性价比', '运动']),
        is_new: true,
        is_hot: false,
        is_lucky: true,
        has_warranty: true,
        free_shipping: true,
        sell_point: '16天续航，150+运动模式',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]星巴克100元礼品卡',
        description: '星巴克100元电子礼品卡，全国门店通用',
        primary_image_id: imageIds[2],
        cost_asset_code: 'red_shard',
        cost_amount: 100,
        cost_price: 95.0,
        stock: 100,
        sold_count: 30,
        category: '美食饮品',
        status: 'active',
        sort_order: 3,
        space: 'both',
        original_price: 150,
        tags: JSON.stringify(['实用', '送礼']),
        is_new: false,
        is_hot: true,
        is_lucky: false,
        has_warranty: false,
        free_shipping: false,
        sell_point: '全国4000+门店通用',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]品牌帆布环保袋',
        description: '加厚环保帆布袋，时尚百搭，大容量收纳',
        primary_image_id: imageIds[3],
        cost_asset_code: 'red_shard',
        cost_amount: 30,
        cost_price: 15.0,
        stock: 500,
        sold_count: 120,
        category: '日用百货',
        status: 'active',
        sort_order: 4,
        space: 'lucky',
        original_price: 50,
        tags: JSON.stringify(['环保', '包邮']),
        is_new: false,
        is_hot: false,
        is_lucky: true,
        has_warranty: false,
        free_shipping: true,
        sell_point: '大容量环保材质',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]Cherry MX 机械键盘',
        description: 'Cherry MX 红轴 87键 RGB 机械键盘，金属面板',
        primary_image_id: imageIds[4],
        cost_asset_code: 'orange_shard',
        cost_amount: 200,
        cost_price: 399.0,
        stock: 20,
        sold_count: 5,
        category: '数码电子',
        status: 'active',
        sort_order: 5,
        space: 'premium',
        original_price: 350,
        tags: JSON.stringify(['品质', '办公']),
        is_new: true,
        is_hot: false,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: 'Cherry原厂轴体，5000万次寿命',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]LED护眼台灯',
        description: 'AA级护眼LED台灯，三色调光，无频闪',
        primary_image_id: imageIds[5],
        cost_asset_code: 'red_shard',
        cost_amount: 150,
        cost_price: 129.0,
        stock: 80,
        sold_count: 22,
        category: '日用百货',
        status: 'active',
        sort_order: 6,
        space: 'both',
        original_price: 250,
        tags: null,
        is_new: false,
        is_hot: false,
        is_lucky: false,
        has_warranty: true,
        free_shipping: true,
        sell_point: '无蓝光无频闪，保护视力',
        created_at: now,
        updated_at: now
      },
      {
        item_name: '[测试]已下架-过期活动商品',
        description: '此商品已停止兑换',
        primary_image_id: null,
        cost_asset_code: 'red_shard',
        cost_amount: 999,
        cost_price: 10.0,
        stock: 0,
        sold_count: 50,
        category: '其他',
        status: 'inactive',
        sort_order: 99,
        space: 'lucky',
        original_price: null,
        tags: null,
        is_new: false,
        is_hot: false,
        is_lucky: false,
        has_warranty: false,
        free_shipping: false,
        sell_point: null,
        created_at: now,
        updated_at: now
      }
    ]
    for (const ei of newExchangeItems) {
      const exists = await queryInterface.rawSelect(
        'exchange_items',
        { where: { item_name: ei.item_name } },
        ['exchange_item_id']
      )
      if (!exists) await queryInterface.bulkInsert('exchange_items', [ei])
    }

    /*
     * ================================================================
     * 7. [已合并] 弹窗 + 轮播图 → ad_campaigns + ad_creatives
     * popup_banners/carousel_items/system_announcements 已合并到广告系统
     * ================================================================
     */
    console.log('🪧 7/13 弹窗/轮播/公告已合并到广告系统，跳过...')

    /* [已删除] popupBanners 数据 — 原 popup_banners 表已 DROP，数据通过 ad_campaigns (category=operational) 管理 */
    /* [已删除] carouselItems 数据 — 原 carousel_items 表已 DROP，数据通过 ad_campaigns (category=operational) 管理 */

    /*
     * 以下注释保留数据结构参考，实际插入已移除
     * 如需创建广告系统测试数据，请使用 ad_campaigns + ad_creatives 表
     */
    console.log('📢 8/13 系统公告已合并到广告系统，跳过...')

    /* [已删除] announcements 数据 — 原 system_announcements 表已 DROP，数据通过 ad_campaigns (category=system) 管理 */

    /*
     * ================================================================
     * 9. 抽奖活动 + 奖品
     * ================================================================
     */
    console.log('🎰 9/13 抽奖活动与奖品...')

    const campaigns = [
      {
        campaign_name: '[测试]每日水晶抽奖',
        campaign_code: 'test_daily_crystal',
        campaign_type: 'daily',
        max_draws_per_user_daily: 5,
        max_draws_per_user_total: null,
        total_prize_pool: 100000,
        remaining_prize_pool: 85000,
        prize_distribution_config: JSON.stringify({ high: 5, mid: 25, low: 70 }),
        participation_conditions: JSON.stringify({ min_level: 'normal' }),
        start_time: now,
        end_time: new Date(now.getTime() + 90 * 24 * 3600 * 1000),
        banner_image_url: 'test-seeds/lottery/campaign-banner-daily.jpg',
        background_image_url: 'test-seeds/lottery/campaign-bg-daily.jpg',
        description: '每天都有机会抽取水晶大奖！',
        rules_text: '每天最多抽奖5次，每次消耗10积分',
        status: 'active',
        budget_mode: 'user',
        pick_method: 'normalize',
        display_mode: 'turntable',
        effect_theme: 'crystal',
        created_at: now,
        updated_at: now
      },
      {
        campaign_name: '[测试]新春限定活动',
        campaign_code: 'test_spring_festival',
        campaign_type: 'event',
        max_draws_per_user_daily: 10,
        max_draws_per_user_total: 100,
        total_prize_pool: 500000,
        remaining_prize_pool: 500000,
        prize_distribution_config: JSON.stringify({ high: 3, mid: 20, low: 77 }),
        participation_conditions: JSON.stringify({ min_level: 'normal', min_history_points: 500 }),
        start_time: now,
        end_time: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
        banner_image_url: 'test-seeds/lottery/campaign-banner-spring.jpg',
        background_image_url: 'test-seeds/lottery/campaign-bg-spring.jpg',
        description: '新春限定抽奖，限时开放！',
        rules_text: '活动期间每天可抽10次，VIP用户额外+5次',
        status: 'active',
        budget_mode: 'pool',
        pick_method: 'tier_first',
        display_mode: 'card_flip',
        effect_theme: 'spring_festival',
        created_at: now,
        updated_at: now
      },
      {
        campaign_name: '[测试]已暂停活动',
        campaign_code: 'test_paused_campaign',
        campaign_type: 'daily',
        max_draws_per_user_daily: 3,
        max_draws_per_user_total: null,
        total_prize_pool: 10000,
        remaining_prize_pool: 8000,
        prize_distribution_config: JSON.stringify({ high: 10, mid: 30, low: 60 }),
        participation_conditions: null,
        start_time: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
        end_time: new Date(now.getTime() + 60 * 24 * 3600 * 1000),
        banner_image_url: null,
        background_image_url: null,
        description: '暂停中的测试活动',
        rules_text: '暂停中',
        status: 'paused',
        budget_mode: 'none',
        pick_method: 'normalize',
        display_mode: 'turntable',
        effect_theme: 'default',
        created_at: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
        updated_at: now
      }
    ]
    const campaignIds = []
    for (const c of campaigns) {
      const exists = await queryInterface.rawSelect(
        'lottery_campaigns',
        { where: { campaign_code: c.campaign_code } },
        ['lottery_campaign_id']
      )
      if (exists) {
        campaignIds.push(exists)
      } else {
        await queryInterface.bulkInsert('lottery_campaigns', [c])
        const newId = await queryInterface.rawSelect(
          'lottery_campaigns',
          { where: { campaign_code: c.campaign_code } },
          ['lottery_campaign_id']
        )
        campaignIds.push(newId)
      }
    }

    if (campaignIds[0]) {
      const prizeExists = await queryInterface.rawSelect(
        'lottery_prizes',
        {
          where: { lottery_campaign_id: campaignIds[0], prize_name: '[测试]紫水晶*1' }
        },
        ['lottery_prize_id']
      )
      if (!prizeExists) {
        const prizes = [
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]紫水晶*1',
            prize_type: 'virtual',
            prize_value: 3200,
            prize_value_points: 1600,
            prize_description: '获得紫水晶1个',
            image_resource_id: imageIds[6] || null,
            win_probability: 0.01,
            win_weight: 1,
            reward_tier: 'high',
            rarity_code: 'legendary',
            stock_quantity: 10,
            max_daily_wins: 1,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: false,
            reserved_for_vip: false,
            material_asset_code: 'purple_crystal',
            material_amount: 1,
            angle: 0,
            color: '#9C27B0',
            sort_order: 1,
            status: 'active',
            created_at: now,
            updated_at: now
          },
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]蓝水晶碎片*5',
            prize_type: 'virtual',
            prize_value: 800,
            prize_value_points: 400,
            prize_description: '获得蓝水晶碎片5个',
            image_resource_id: imageIds[7] || null,
            win_probability: 0.05,
            win_weight: 5,
            reward_tier: 'high',
            rarity_code: 'epic',
            stock_quantity: 100,
            max_daily_wins: 5,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: false,
            reserved_for_vip: false,
            material_asset_code: 'blue_shard',
            material_amount: 5,
            angle: 45,
            color: '#2196F3',
            sort_order: 2,
            status: 'active',
            created_at: now,
            updated_at: now
          },
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]绿水晶碎片*10',
            prize_type: 'virtual',
            prize_value: 800,
            prize_value_points: 400,
            prize_description: '获得绿水晶碎片10个',
            image_resource_id: null,
            win_probability: 0.1,
            win_weight: 10,
            reward_tier: 'mid',
            rarity_code: 'rare',
            stock_quantity: 500,
            max_daily_wins: 20,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: false,
            reserved_for_vip: false,
            material_asset_code: 'green_shard',
            material_amount: 10,
            angle: 90,
            color: '#4CAF50',
            sort_order: 3,
            status: 'active',
            created_at: now,
            updated_at: now
          },
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]橙水晶碎片*20',
            prize_type: 'virtual',
            prize_value: 400,
            prize_value_points: 200,
            prize_description: '获得橙水晶碎片20个',
            image_resource_id: null,
            win_probability: 0.25,
            win_weight: 25,
            reward_tier: 'mid',
            rarity_code: 'uncommon',
            stock_quantity: -1,
            max_daily_wins: null,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: false,
            reserved_for_vip: false,
            material_asset_code: 'orange_shard',
            material_amount: 20,
            angle: 135,
            color: '#FF9800',
            sort_order: 4,
            status: 'active',
            created_at: now,
            updated_at: now
          },
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]红水晶碎片*30',
            prize_type: 'virtual',
            prize_value: 300,
            prize_value_points: 150,
            prize_description: '获得红水晶碎片30个',
            image_resource_id: null,
            win_probability: 0.3,
            win_weight: 30,
            reward_tier: 'low',
            rarity_code: 'common',
            stock_quantity: -1,
            max_daily_wins: null,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: false,
            reserved_for_vip: false,
            material_asset_code: 'red_shard',
            material_amount: 30,
            angle: 180,
            color: '#F44336',
            sort_order: 5,
            status: 'active',
            created_at: now,
            updated_at: now
          },
          {
            lottery_campaign_id: campaignIds[0],
            prize_name: '[测试]红水晶碎片*10(保底)',
            prize_type: 'virtual',
            prize_value: 100,
            prize_value_points: 50,
            prize_description: '获得红水晶碎片10个（保底奖励）',
            image_resource_id: null,
            win_probability: 0.29,
            win_weight: 29,
            reward_tier: 'low',
            rarity_code: 'common',
            stock_quantity: -1,
            max_daily_wins: null,
            total_win_count: 0,
            daily_win_count: 0,
            is_fallback: true,
            reserved_for_vip: false,
            material_asset_code: 'red_shard',
            material_amount: 10,
            angle: 270,
            color: '#E57373',
            sort_order: 6,
            status: 'active',
            created_at: now,
            updated_at: now
          }
        ]
        await queryInterface.bulkInsert('lottery_prizes', prizes)
      }
    }

    /*
     * ================================================================
     * 10. 材料转换规则
     * ================================================================
     */
    console.log('🔄 10/13 材料转换规则...')

    const conversionRules = [
      {
        from_asset_code: 'red_shard',
        to_asset_code: 'red_crystal',
        from_amount: 10,
        to_amount: 1,
        effective_at: now,
        is_enabled: true,
        created_by: adminUserId,
        updated_by: adminUserId,
        min_from_amount: 10,
        max_from_amount: 1000,
        fee_rate: 0,
        title: '红碎片→红水晶',
        description: '10个红水晶碎片合成1个红水晶',
        display_icon: null,
        risk_level: 'low',
        is_visible: true,
        rounding_mode: 'floor',
        created_at: now,
        updated_at: now
      },
      {
        from_asset_code: 'orange_shard',
        to_asset_code: 'orange_crystal',
        from_amount: 10,
        to_amount: 1,
        effective_at: now,
        is_enabled: true,
        created_by: adminUserId,
        updated_by: adminUserId,
        min_from_amount: 10,
        max_from_amount: 1000,
        fee_rate: 0,
        title: '橙碎片→橙水晶',
        description: '10个橙水晶碎片合成1个橙水晶',
        display_icon: null,
        risk_level: 'low',
        is_visible: true,
        rounding_mode: 'floor',
        created_at: now,
        updated_at: now
      },
      {
        from_asset_code: 'red_crystal',
        to_asset_code: 'orange_shard',
        from_amount: 1,
        to_amount: 5,
        effective_at: now,
        is_enabled: true,
        created_by: adminUserId,
        updated_by: adminUserId,
        min_from_amount: 1,
        max_from_amount: 100,
        fee_rate: 0.05,
        fee_min_amount: 1,
        fee_asset_code: 'red_crystal',
        title: '红水晶→橙碎片',
        description: '1个红水晶转换为5个橙水晶碎片（5%手续费）',
        display_icon: null,
        risk_level: 'medium',
        is_visible: true,
        rounding_mode: 'floor',
        created_at: now,
        updated_at: now
      },
      {
        from_asset_code: 'yellow_shard',
        to_asset_code: 'yellow_crystal',
        from_amount: 10,
        to_amount: 1,
        effective_at: now,
        is_enabled: true,
        created_by: adminUserId,
        updated_by: adminUserId,
        min_from_amount: 10,
        max_from_amount: 500,
        fee_rate: 0,
        title: '黄碎片→黄水晶',
        description: '10个黄水晶碎片合成1个黄水晶',
        display_icon: null,
        risk_level: 'low',
        is_visible: true,
        rounding_mode: 'floor',
        created_at: now,
        updated_at: now
      },
      {
        from_asset_code: 'DIAMOND',
        to_asset_code: 'red_shard',
        from_amount: 1,
        to_amount: 10,
        effective_at: now,
        is_enabled: false,
        created_by: adminUserId,
        updated_by: adminUserId,
        min_from_amount: 1,
        max_from_amount: 100,
        fee_rate: 0,
        title: '钻石→红碎片（已停用）',
        description: '此规则已停用',
        display_icon: null,
        risk_level: 'high',
        is_visible: false,
        rounding_mode: 'floor',
        created_at: now,
        updated_at: now
      }
    ]
    for (const rule of conversionRules) {
      const exists = await queryInterface.rawSelect(
        'material_conversion_rules',
        {
          where: { from_asset_code: rule.from_asset_code, to_asset_code: rule.to_asset_code }
        },
        ['material_conversion_rule_id']
      )
      if (!exists) await queryInterface.bulkInsert('material_conversion_rules', [rule])
    }

    /*
     * ================================================================
     * 11. 广告位 + 广告活动 + 广告素材
     * ================================================================
     */
    console.log('📺 11/13 广告系统...')

    const adSlots = [
      {
        slot_key: 'home_popup_main',
        slot_name: '首页弹窗-主位',
        slot_type: 'popup',
        position: 'home',
        max_display_count: 3,
        daily_price_diamond: 500,
        min_bid_diamond: 100,
        min_budget_diamond: 1000,
        is_active: true,
        description: '首页主弹窗广告位，高曝光量',
        created_at: now,
        updated_at: now
      },
      {
        slot_key: 'home_carousel_1',
        slot_name: '首页轮播-1号位',
        slot_type: 'carousel',
        position: 'home',
        max_display_count: 5,
        daily_price_diamond: 300,
        min_bid_diamond: 50,
        min_budget_diamond: 500,
        is_active: true,
        description: '首页轮播图第一位，高点击率',
        created_at: now,
        updated_at: now
      },
      {
        slot_key: 'lottery_popup_ad',
        slot_name: '抽奖页弹窗',
        slot_type: 'popup',
        position: 'lottery',
        max_display_count: 2,
        daily_price_diamond: 200,
        min_bid_diamond: 50,
        min_budget_diamond: 300,
        is_active: true,
        description: '抽奖页面弹窗广告位',
        created_at: now,
        updated_at: now
      },
      {
        slot_key: 'profile_carousel',
        slot_name: '个人中心轮播',
        slot_type: 'carousel',
        position: 'profile',
        max_display_count: 3,
        daily_price_diamond: 100,
        min_bid_diamond: 20,
        min_budget_diamond: 200,
        is_active: false,
        description: '个人中心轮播广告位（暂未开放）',
        created_at: now,
        updated_at: now
      }
    ]
    const slotIds = []
    for (const s of adSlots) {
      const exists = await queryInterface.rawSelect(
        'ad_slots',
        { where: { slot_key: s.slot_key } },
        ['ad_slot_id']
      )
      if (exists) {
        slotIds.push(exists)
      } else {
        await queryInterface.bulkInsert('ad_slots', [s])
        const newId = await queryInterface.rawSelect(
          'ad_slots',
          { where: { slot_key: s.slot_key } },
          ['ad_slot_id']
        )
        slotIds.push(newId)
      }
    }

    if (slotIds[0] && merchantUserId) {
      const campaignExists = await queryInterface.rawSelect(
        'ad_campaigns',
        {
          where: { business_id: 'test_ad_campaign_001' }
        },
        ['ad_campaign_id']
      )
      if (!campaignExists) {
        const adCampaigns = [
          {
            business_id: 'test_ad_campaign_001',
            advertiser_user_id: merchantUserId,
            ad_slot_id: slotIds[0],
            campaign_name: '[测试]新品推广-首页弹窗',
            billing_mode: 'fixed_daily',
            status: 'active',
            daily_bid_diamond: 0,
            budget_total_diamond: 15000,
            budget_spent_diamond: 3000,
            fixed_days: 30,
            fixed_total_diamond: 15000,
            targeting_rules: JSON.stringify({ user_level: ['normal', 'vip'], min_login_count: 3 }),
            priority: 100,
            start_date: now,
            end_date: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
            review_note: '已审核通过',
            reviewed_by: adminUserId,
            reviewed_at: now,
            created_at: now,
            updated_at: now
          },
          {
            business_id: 'test_ad_campaign_002',
            advertiser_user_id: merchantUserId,
            ad_slot_id: slotIds[1],
            campaign_name: '[测试]品牌宣传-首页轮播',
            billing_mode: 'bidding',
            status: 'pending_review',
            daily_bid_diamond: 100,
            budget_total_diamond: 5000,
            budget_spent_diamond: 0,
            fixed_days: null,
            fixed_total_diamond: null,
            targeting_rules: JSON.stringify({ user_level: ['vip'] }),
            priority: 50,
            start_date: now,
            end_date: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
            review_note: null,
            reviewed_by: null,
            reviewed_at: null,
            created_at: now,
            updated_at: now
          },
          {
            business_id: 'test_ad_campaign_003',
            advertiser_user_id: merchantUserId,
            ad_slot_id: slotIds[2],
            campaign_name: '[测试]限时促销-抽奖页',
            billing_mode: 'fixed_daily',
            status: 'completed',
            daily_bid_diamond: 0,
            budget_total_diamond: 3000,
            budget_spent_diamond: 3000,
            fixed_days: 10,
            fixed_total_diamond: 3000,
            targeting_rules: null,
            priority: 80,
            start_date: new Date(now.getTime() - 15 * 24 * 3600 * 1000),
            end_date: new Date(now.getTime() - 5 * 24 * 3600 * 1000),
            review_note: '已结束',
            reviewed_by: adminUserId,
            reviewed_at: new Date(now.getTime() - 16 * 24 * 3600 * 1000),
            created_at: new Date(now.getTime() - 16 * 24 * 3600 * 1000),
            updated_at: now
          }
        ]
        await queryInterface.bulkInsert('ad_campaigns', adCampaigns)

        const adCampaignId1 = await queryInterface.rawSelect(
          'ad_campaigns',
          { where: { business_id: 'test_ad_campaign_001' } },
          ['ad_campaign_id']
        )
        const adCampaignId2 = await queryInterface.rawSelect(
          'ad_campaigns',
          { where: { business_id: 'test_ad_campaign_002' } },
          ['ad_campaign_id']
        )

        if (adCampaignId1) {
          await queryInterface.bulkInsert('ad_creatives', [
            {
              ad_campaign_id: adCampaignId1,
              title: '[测试]新品推广主图',
              image_url: 'test-seeds/ads/new-product-main.jpg',
              image_width: 750,
              image_height: 750,
              link_url: '/pages/exchange/detail?id=1',
              link_type: 'internal',
              review_status: 'approved',
              review_note: '素材审核通过',
              reviewed_by: adminUserId,
              reviewed_at: now,
              created_at: now,
              updated_at: now
            }
          ])
        }
        if (adCampaignId2) {
          await queryInterface.bulkInsert('ad_creatives', [
            {
              ad_campaign_id: adCampaignId2,
              title: '[测试]品牌宣传横幅',
              image_url: 'test-seeds/ads/brand-carousel.jpg',
              image_width: 750,
              image_height: 420,
              link_url: 'https://example.com/brand',
              link_type: 'external',
              review_status: 'pending',
              review_note: null,
              reviewed_by: null,
              reviewed_at: null,
              created_at: now,
              updated_at: now
            }
          ])
        }
      }
    }

    /*
     * ================================================================
     * 12. 用户反馈
     * ================================================================
     */
    console.log('💬 12/13 用户反馈...')

    if (user1Id) {
      const fbExists = await queryInterface.rawSelect(
        'feedbacks',
        { where: { content: '[测试]兑换商品页面加载很慢' } },
        ['feedback_id']
      )
      if (!fbExists) {
        const feedbacks = [
          {
            user_id: user1Id,
            category: 'bug',
            content: '[测试]兑换商品页面加载很慢',
            attachments: JSON.stringify(['test-seeds/feedback/screenshot-1.jpg']),
            status: 'pending',
            priority: 'medium',
            user_ip: '192.168.1.100',
            device_info: JSON.stringify({
              platform: 'ios',
              model: 'iPhone 15',
              system: 'iOS 17.2',
              wechat: '8.0.43'
            }),
            internal_notes: null,
            admin_id: null,
            reply_content: null,
            replied_at: null,
            created_at: now,
            updated_at: now
          },
          {
            user_id: user2Id || user1Id,
            category: 'suggestion',
            content: '[测试]建议增加暗黑模式',
            attachments: null,
            status: 'replied',
            priority: 'low',
            user_ip: '192.168.1.101',
            device_info: JSON.stringify({
              platform: 'android',
              model: 'Pixel 8',
              system: 'Android 14',
              wechat: '8.0.43'
            }),
            internal_notes: JSON.stringify({ tags: ['UI优化'] }),
            admin_id: adminUserId,
            reply_content: '感谢您的建议，暗黑模式已列入开发计划！',
            replied_at: now,
            created_at: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
            updated_at: now
          },
          {
            user_id: user3Id || user1Id,
            category: 'complaint',
            content: '[测试]抽奖一直没中大奖，是不是概率有问题？',
            attachments: JSON.stringify([
              'test-seeds/feedback/screenshot-2.jpg',
              'test-seeds/feedback/screenshot-3.jpg'
            ]),
            status: 'processing',
            priority: 'high',
            user_ip: '10.0.0.50',
            device_info: JSON.stringify({
              platform: 'ios',
              model: 'iPhone 14',
              system: 'iOS 16.5',
              wechat: '8.0.40'
            }),
            internal_notes: JSON.stringify({ tags: ['抽奖投诉'], handler: '客服-小王' }),
            admin_id: adminUserId,
            reply_content: null,
            replied_at: null,
            created_at: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
            updated_at: now
          },
          {
            user_id: user1Id,
            category: 'other',
            content: '[测试]想问一下怎么升级VIP',
            attachments: null,
            status: 'closed',
            priority: 'low',
            user_ip: '192.168.1.100',
            device_info: JSON.stringify({
              platform: 'devtools',
              model: 'DevTools',
              system: 'Windows 11',
              wechat: '8.0.43'
            }),
            internal_notes: null,
            admin_id: adminUserId,
            reply_content: '累计积分达到5000即可自动升级为VIP，详见个人中心说明。',
            replied_at: new Date(now.getTime() - 5 * 24 * 3600 * 1000),
            created_at: new Date(now.getTime() - 7 * 24 * 3600 * 1000),
            updated_at: new Date(now.getTime() - 5 * 24 * 3600 * 1000)
          }
        ]
        await queryInterface.bulkInsert('feedbacks', feedbacks)
      }
    }

    /*
     * ================================================================
     * 13. 系统消息（admin_notifications）
     * ================================================================
     */
    console.log('🔔 13/13 系统消息...')

    if (adminUserId) {
      const notifExists = await queryInterface.rawSelect(
        'admin_notifications',
        {
          where: { title: '[测试]新兑换订单待处理' }
        },
        ['notification_id']
      )
      if (!notifExists) {
        const notifications = [
          {
            admin_id: adminUserId,
            title: '[测试]新兑换订单待处理',
            content: '用户"测试用户-小明"兑换了"AirPods Pro 2代"，请尽快处理发货。',
            notification_type: 'order',
            priority: 'high',
            is_read: false,
            extra_data: JSON.stringify({ order_id: 10001, item_name: 'AirPods Pro 2代' }),
            created_at: now,
            updated_at: now
          },
          {
            admin_id: adminUserId,
            title: '[测试]用户反馈待回复',
            content: '收到新的用户反馈（类别：Bug），请查看并回复。',
            notification_type: 'feedback',
            priority: 'medium',
            is_read: false,
            extra_data: JSON.stringify({ feedback_id: 1 }),
            created_at: now,
            updated_at: now
          },
          {
            admin_id: adminUserId,
            title: '[测试]库存预警',
            content: '商品"小米手环8 NFC版"库存已低于20件，请及时补货。',
            notification_type: 'inventory',
            priority: 'high',
            is_read: true,
            extra_data: JSON.stringify({ item_id: 2, current_stock: 15 }),
            created_at: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
            updated_at: now
          },
          {
            admin_id: adminUserId,
            title: '[测试]广告审核提醒',
            content: '商户"测试商户-张三"提交了新的广告活动，请审核。',
            notification_type: 'ad_review',
            priority: 'medium',
            is_read: false,
            extra_data: JSON.stringify({ campaign_id: 2 }),
            created_at: now,
            updated_at: now
          },
          {
            admin_id: adminUserId,
            title: '[测试]日报生成完成',
            content: '2月17日运营日报已自动生成，请前往报表中心查看。',
            notification_type: 'system',
            priority: 'low',
            is_read: true,
            extra_data: null,
            created_at: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
            updated_at: new Date(now.getTime() - 1 * 24 * 3600 * 1000)
          }
        ]
        await queryInterface.bulkInsert('admin_notifications', notifications)
      }
    }

    console.log('✅ [种子数据] 综合测试数据插入完成！')
    console.log('📊 数据概览：')
    console.log('   - 稀有度字典：5条 | 类目字典：5条 | 资产分组：7条')
    console.log('   - 测试用户：复用已有用户（admin/普通/商户）')
    console.log('   - 材料资产类型：15种（含图标icon_url）')
    console.log('   - 图片资源：8条 | 物品模板：10个')
    console.log('   - 兑换商品：7个（含primary_image_id绑定）')
    console.log('   - 弹窗：5个 | 轮播图：5个')
    console.log('   - 系统公告：4条 | 抽奖活动：3个 | 奖品：6个')
    console.log('   - 材料转换规则：5条 | 广告位：4个')
    console.log('   - 广告活动：3个 | 广告素材：2个')
    console.log('   - 用户反馈：4条 | 系统消息：5条')
  },

  /**
   * 回滚种子数据
   *
   * @param {Object} queryInterface - Sequelize QueryInterface
   * @param {Object} _Sequelize - Sequelize 类（用于 Op 操作符）
   * @returns {Promise<void>} 无返回值
   */
  async down(queryInterface, _Sequelize) {
    console.log('🗑️ [种子数据] 开始回滚综合测试数据...')

    // 按依赖顺序反向删除（子表先删）
    const testPrefix = '[测试]'

    await queryInterface.bulkDelete('admin_notifications', {
      title: { [_Sequelize.Op.like]: `${testPrefix}%` }
    })
    await queryInterface.bulkDelete('feedbacks', {
      content: { [_Sequelize.Op.like]: `${testPrefix}%` }
    })
    await queryInterface.bulkDelete('ad_creatives', {
      title: { [_Sequelize.Op.like]: `${testPrefix}%` }
    })
    await queryInterface.bulkDelete('ad_campaigns', {
      business_id: { [_Sequelize.Op.like]: 'test_ad_campaign_%' }
    })
    await queryInterface.bulkDelete('ad_slots', { slot_key: { [_Sequelize.Op.like]: 'home_%' } })
    await queryInterface.bulkDelete('material_conversion_rules', {
      title: { [_Sequelize.Op.like]: '%→%' }
    })
    await queryInterface.bulkDelete('lottery_prizes', {
      prize_name: { [_Sequelize.Op.like]: `${testPrefix}%` }
    })
    await queryInterface.bulkDelete('lottery_campaigns', {
      campaign_code: { [_Sequelize.Op.like]: 'test_%' }
    })
    /* [已删除] system_announcements/carousel_items/popup_banners 表已 DROP，不再需要回滚 */
    await queryInterface.bulkDelete('exchange_items', {
      item_name: { [_Sequelize.Op.like]: `${testPrefix}%` }
    })
    await queryInterface.bulkDelete('item_templates', {
      template_code: { [_Sequelize.Op.like]: 'tpl_%' }
    })
    await queryInterface.bulkDelete('image_resources', {
      file_path: { [_Sequelize.Op.like]: 'test-seeds/%' }
    })

    console.log('✅ [种子数据] 回滚完成')
  }
}
