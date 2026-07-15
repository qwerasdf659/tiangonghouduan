'use strict'

/**
 * 合规整改 阶段一：资产去交易化 + 竞价能力位 + 礼品卡下线 + C2C 总开关
 *
 * 文件路径：migrations/20260604152031-migrate-compliance-c2c-detrade.js
 *
 * 业务背景（合规整改执行清单 §10.15 阶段一 Step 1）：
 * - 系统从「保留 C2C 用户间交易」升级为「关闭 C2C，改用户↔官方 B2C 单向道具商城」
 * - 星石 = 游戏点券（只能向官方单向买道具/竞价/兑换广告，不可炒、不可回笼、不可用户间流通）
 * - 水晶系（碎片/源晶）= 京豆化（可换实物，不可在用户间流通）
 *
 * 本迁移做 5 件事（全部基于真实库 restaurant_points_dev 实测，条件式判断、可重复执行）：
 * ① 星石 + 6 碎片 + 6 源晶 去交易化（is_tradable=0），京豆化/点券化
 * ② 历史可交易物品全部去交易化（条件式 WHERE is_tradable=1，不写死历史条数）
 * ③ 储值礼品卡 ID 12/13/14 下线（is_enabled=0 + is_tradable=0，预付卡监管区，律师确认前不复用）
 * ④ 新增 material_asset_types.is_biddable 列（决策13），仅 star_stone=1
 *    —— 解决「去交易化后竞价白名单瞬空」问题，使「不可流通」与「可竞价」解耦
 * ⑤ 新增 feature_flags.c2c_marketplace_enabled（默认关闭），满足 §6.1 C2C 一键下线总开关
 *
 * down 回滚：
 * - ④⑤ 可逆（删列 + 删 flag）
 * - ①②③ 去交易化属合规不可逆操作，不在 down 中恢复（避免误开倒卖通道）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize

    // ① 星石 + 碎片 + 源晶 去交易化（京豆化/点券化）
    const [, meta1] = await sequelize.query(
      `UPDATE material_asset_types SET is_tradable = 0
       WHERE asset_code = 'star_stone' OR form IN ('shard', 'gem')`
    )
    console.log(`  ✅ ① 资产去交易化（星石/碎片/源晶）：影响 ${meta1?.affectedRows ?? 0} 行`)

    // ② 历史可交易物品全部去交易化（条件式，不写死条数）
    const [, meta2] = await sequelize.query(
      `UPDATE item_templates SET is_tradable = 0 WHERE is_tradable = 1`
    )
    console.log(`  ✅ ② 历史可交易物品去交易化：影响 ${meta2?.affectedRows ?? 0} 行`)

    // ③ 储值礼品卡 12/13/14 下线
    const [, meta3] = await sequelize.query(
      `UPDATE item_templates SET is_enabled = 0, is_tradable = 0
       WHERE item_template_id IN (12, 13, 14)`
    )
    console.log(`  ✅ ③ 储值礼品卡 12/13/14 下线：影响 ${meta3?.affectedRows ?? 0} 行`)

    // ④ 新增 is_biddable 列（仅当不存在时），再置 star_stone=1
    const cols = await queryInterface.describeTable('material_asset_types')
    if (!cols.is_biddable) {
      await queryInterface.addColumn('material_asset_types', 'is_biddable', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          '是否可竞价（Is Biddable - 官方竞价计价币开关）：true-可作为官方竞价计价币，false-不可。与 is_tradable（用户间流通）解耦'
      })
      console.log('  ✅ ④ 新增列 material_asset_types.is_biddable')
    } else {
      console.log('  ⚠️ ④ material_asset_types.is_biddable 已存在，跳过加列')
    }
    const [, meta4] = await sequelize.query(
      `UPDATE material_asset_types SET is_biddable = 1 WHERE asset_code = 'star_stone'`
    )
    console.log(`  ✅ ④ star_stone 置可竞价：影响 ${meta4?.affectedRows ?? 0} 行`)

    // ⑤ 新增 C2C 总开关 feature_flag（仅当不存在时）
    const [existing] = await sequelize.query(
      `SELECT flag_key FROM feature_flags WHERE flag_key = 'c2c_marketplace_enabled' LIMIT 1`
    )
    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO feature_flags
           (flag_key, flag_name, description, is_enabled, rollout_strategy, rollout_percentage,
            fallback_behavior, created_at, updated_at)
         VALUES
           ('c2c_marketplace_enabled', 'C2C用户间交易市场总开关',
            '控制 /api/v4/marketplace（C2C 用户间交易）是否挂载。合规整改后默认关闭：关闭即整域返回 410 Gone，前端据此隐藏入口。道具商城走 exchange 域（B2C 单向）。',
            0, 'all', 100.00, 'disabled', NOW(), NOW())`
      )
      console.log('  ✅ ⑤ 新增 feature_flag: c2c_marketplace_enabled（默认关闭）')
    } else {
      console.log('  ⚠️ ⑤ feature_flag c2c_marketplace_enabled 已存在，跳过')
    }

    console.log('\n✅ 阶段一迁移完成（资产去交易化 + is_biddable + 礼品卡下线 + C2C 总开关）')
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize

    // 仅回滚可逆部分：删 is_biddable 列 + 删 C2C 总开关 flag
    const cols = await queryInterface.describeTable('material_asset_types')
    if (cols.is_biddable) {
      await queryInterface.removeColumn('material_asset_types', 'is_biddable')
      console.log('  ✅ 已删除 material_asset_types.is_biddable 列')
    }

    await sequelize.query(
      `DELETE FROM feature_flags WHERE flag_key = 'c2c_marketplace_enabled'`
    )
    console.log('  ✅ 已删除 feature_flag: c2c_marketplace_enabled')

    /*
     * 注意：资产去交易化（①②③）属合规不可逆操作，不在 down 中恢复
     * 如确需恢复历史可交易状态，应另起业务评审 + 专门迁移，避免误开倒卖通道
     */
    console.log('  ⚠️ 资产去交易化（is_tradable=0）为合规不可逆操作，down 不恢复')
  }
}
