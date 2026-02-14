'use strict'

/**
 * 数据库迁移：多活动抽奖展示配置 + 奖品稀有度 + 活动位置配置
 *
 * 业务背景：
 * - 前端小程序支持14种玩法组件、6套主题色、4级稀有度光效、3种中奖动画
 * - 后端需要提供展示配置字段，让运营在Web后台配置后，前端自动适配
 * - 活动位置配置通过 system_configs 表管理（已有表，仅插入记录）
 *
 * 变更内容：
 * 1. lottery_campaigns 新增 6 列展示配置字段
 * 2. lottery_prizes 新增 rarity_code 列 + 外键约束 + 索引
 * 3. system_configs 插入 campaign_placement 配置记录
 * 4. 清理 rarity_defs 脏数据（commonly 重复记录）
 * 5. 修正 LotteryCampaign.status 枚举（补 ended/cancelled）
 * 6. 修正 LotteryPrize.prize_type 枚举（补 product/special）
 * 7. 修正 LotteryPrize.status 枚举（去掉 out_of_stock/expired）
 *
 * 回滚方案：down() 逐项回滚所有变更
 *
 * @see docs/后端与Web管理平台-对接需求总览.md Section 8.7
 * @date 2026-02-15
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：多活动展示配置 + 奖品稀有度 + 活动位置配置...')

    // ====== 1. lottery_campaigns 新增 6 列展示配置字段 ======
    console.log('  📋 Step 1/7: lottery_campaigns 新增展示配置字段...')

    await queryInterface.addColumn('lottery_campaigns', 'display_mode', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'grid_3x3',
      comment:
        '前端展示方式（14种玩法）: grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale'
    })

    await queryInterface.addColumn('lottery_campaigns', 'grid_cols', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 3,
      comment: '网格列数（仅 grid 模式有效）: 3/4/5'
    })

    await queryInterface.addColumn('lottery_campaigns', 'effect_theme', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'default',
      comment: '特效主题（6套）: default/gold_luxury/purple_mystery/spring_festival/christmas/summer'
    })

    await queryInterface.addColumn('lottery_campaigns', 'rarity_effects_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否启用稀有度光效（前端根据 rarity_code 显示不同颜色光效）'
    })

    await queryInterface.addColumn('lottery_campaigns', 'win_animation', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'simple',
      comment: '中奖动画类型: simple（简单弹窗）/card_flip（卡牌翻转）/fireworks（烟花特效）'
    })

    await queryInterface.addColumn('lottery_campaigns', 'background_image_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '活动背景图URL（运营上传，可选）'
    })

    console.log('  ✅ lottery_campaigns 展示配置 6 列已添加')

    // ====== 2. lottery_prizes 新增 rarity_code 列 + 外键 + 索引 ======
    console.log('  📋 Step 2/7: lottery_prizes 新增 rarity_code 列...')

    await queryInterface.addColumn('lottery_prizes', 'rarity_code', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'common',
      comment:
        '稀有度代码（外键关联 rarity_defs.rarity_code）: common/uncommon/rare/epic/legendary'
    })

    // 添加外键约束
    await queryInterface.addConstraint('lottery_prizes', {
      fields: ['rarity_code'],
      type: 'foreign key',
      name: 'fk_lottery_prizes_rarity_code',
      references: {
        table: 'rarity_defs',
        field: 'rarity_code'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 添加索引
    await queryInterface.addIndex('lottery_prizes', ['rarity_code'], {
      name: 'idx_lp_rarity_code',
      comment: '稀有度代码索引 - 支持按稀有度筛选奖品'
    })

    console.log('  ✅ lottery_prizes.rarity_code 列 + 外键 + 索引已添加')

    // ====== 3. system_configs 插入 campaign_placement 配置记录 ======
    console.log('  📋 Step 3/7: system_configs 插入 campaign_placement 配置...')

    await queryInterface.bulkInsert('system_configs', [
      {
        config_key: 'campaign_placement',
        config_value: JSON.stringify({
          placements: [
            {
              campaign_code: 'BASIC_LOTTERY',
              placement: {
                page: 'lottery',
                position: 'main',
                size: 'full',
                priority: 100
              }
            }
          ]
        }),
        description: '活动位置配置 - 控制每个活动在小程序中的展示位置和尺寸',
        config_category: 'feature',
        is_active: 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])

    console.log('  ✅ campaign_placement 配置记录已插入')

    // ====== 4. 清理 rarity_defs 脏数据 ======
    console.log('  📋 Step 4/7: 清理 rarity_defs 脏数据（commonly）...')

    const [deletedRows] = await queryInterface.sequelize.query(
      "DELETE FROM rarity_defs WHERE rarity_code = 'commonly'"
    )
    console.log(`  ✅ rarity_defs 脏数据已清理（影响行数: ${deletedRows.affectedRows || 0}）`)

    // ====== 5. 修正 lottery_campaigns.status 枚举（补 ended/cancelled） ======
    console.log('  📋 Step 5/7: 修正 lottery_campaigns.status 枚举...')

    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_campaigns 
      MODIFY COLUMN status ENUM('draft', 'active', 'paused', 'ended', 'cancelled') 
      NOT NULL DEFAULT 'draft' 
      COMMENT '活动状态: draft=草稿, active=进行中, paused=已暂停, ended=已结束, cancelled=已取消'
    `)

    console.log('  ✅ lottery_campaigns.status 枚举已修正（含 ended/cancelled）')

    // ====== 6. 修正 lottery_prizes.prize_type 枚举（补 product/special） ======
    console.log('  📋 Step 6/7: 修正 lottery_prizes.prize_type 枚举...')

    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_prizes 
      MODIFY COLUMN prize_type ENUM('points', 'coupon', 'physical', 'virtual', 'service', 'product', 'special') 
      NOT NULL DEFAULT 'points' 
      COMMENT '奖品类型: points=积分/coupon=优惠券/physical=实物/virtual=虚拟/service=服务/product=商品/special=特殊'
    `)

    console.log('  ✅ lottery_prizes.prize_type 枚举已修正（含 product/special）')

    // ====== 7. 修正 lottery_prizes.status 枚举（对齐数据库实际只有 active/inactive） ======
    console.log('  📋 Step 7/7: 修正 lottery_prizes.status 枚举...')

    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_prizes 
      MODIFY COLUMN status ENUM('active', 'inactive') 
      NOT NULL DEFAULT 'active' 
      COMMENT '奖品状态: active=激活中, inactive=已停用'
    `)

    console.log('  ✅ lottery_prizes.status 枚举已修正（仅 active/inactive）')

    console.log(
      '✅ [迁移] 完成：6列展示配置 + rarity_code + placement配置 + 脏数据清理 + 枚举修正'
    )
  },

  async down(queryInterface, Sequelize) {
    console.log('⏪ [回滚] 开始...')

    // 反序回滚

    // 7. 恢复 lottery_prizes.status 枚举
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_prizes 
      MODIFY COLUMN status ENUM('active', 'inactive', 'out_of_stock', 'expired') 
      NOT NULL DEFAULT 'active'
    `)

    // 6. 恢复 lottery_prizes.prize_type 枚举
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_prizes 
      MODIFY COLUMN prize_type ENUM('points', 'physical', 'virtual', 'coupon', 'service') 
      NOT NULL DEFAULT 'points'
    `)

    // 5. 恢复 lottery_campaigns.status 枚举
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_campaigns 
      MODIFY COLUMN status ENUM('draft', 'active', 'paused', 'completed') 
      NOT NULL DEFAULT 'draft'
    `)

    // 4. 无法恢复脏数据（可忽略）

    // 3. 删除 campaign_placement 配置记录
    await queryInterface.bulkDelete('system_configs', {
      config_key: 'campaign_placement'
    })

    // 2. 删除 lottery_prizes.rarity_code 相关
    await queryInterface.removeConstraint('lottery_prizes', 'fk_lottery_prizes_rarity_code')
    await queryInterface.removeIndex('lottery_prizes', 'idx_lp_rarity_code')
    await queryInterface.removeColumn('lottery_prizes', 'rarity_code')

    // 1. 删除 lottery_campaigns 展示配置 6 列
    await queryInterface.removeColumn('lottery_campaigns', 'background_image_url')
    await queryInterface.removeColumn('lottery_campaigns', 'win_animation')
    await queryInterface.removeColumn('lottery_campaigns', 'rarity_effects_enabled')
    await queryInterface.removeColumn('lottery_campaigns', 'effect_theme')
    await queryInterface.removeColumn('lottery_campaigns', 'grid_cols')
    await queryInterface.removeColumn('lottery_campaigns', 'display_mode')

    console.log('✅ [回滚] 完成')
  }
}










