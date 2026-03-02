'use strict'

/**
 * P0 迁移：钻石配额体系 + 每人总中奖上限
 *
 * 变更清单（仅 schema + 配置数据）：
 * 1. material_asset_types.form ENUM 扩展 → 增加 'quota'
 * 2. material_asset_types INSERT DIAMOND_QUOTA 资产类型
 * 3. lottery_prizes ADD COLUMN max_user_wins（每人总中奖上限）
 * 4. lottery_strategy_config INSERT 钻石配额三个配置键（各活动）
 *
 * 数据修复（已审核消费记录补发配额）通过服务层脚本执行，
 * 确保正确走 BalanceService 双录记账逻辑。
 *
 * @see docs/广告位定价方案-实施差距分析.md 第三节 3.1 & 3.2
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 扩展 form ENUM 增加 'quota' ==========
      await queryInterface.sequelize.query(
        "ALTER TABLE material_asset_types MODIFY COLUMN form ENUM('shard','crystal','currency','quota') NOT NULL COMMENT '形态：shard-碎片, crystal-水晶, currency-货币, quota-配额'",
        { transaction }
      )

      // ========== 2. 插入 DIAMOND_QUOTA 资产类型（幂等） ==========
      const [existing] = await queryInterface.sequelize.query(
        "SELECT asset_code FROM material_asset_types WHERE asset_code = 'DIAMOND_QUOTA'",
        { transaction }
      )
      if (existing.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO material_asset_types 
            (asset_code, display_name, group_code, form, tier, sort_order, 
             is_enabled, is_tradable, created_at, updated_at)
           VALUES 
            ('DIAMOND_QUOTA', '钻石配额', 'currency', 'quota', 0, 100,
             1, 0, NOW(), NOW())`,
          { transaction }
        )
      }

      // ========== 3. lottery_prizes 新增 max_user_wins 字段（幂等） ==========
      const [prizeColumns] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM lottery_prizes WHERE Field = 'max_user_wins'",
        { transaction }
      )
      if (prizeColumns.length === 0) {
        await queryInterface.addColumn(
          'lottery_prizes',
          'max_user_wins',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
            comment: '每人总中奖上限（跨日累计），NULL表示不限制',
            after: 'max_daily_wins'
          },
          { transaction }
        )
      }

      // ========== 4. 为各活动插入钻石配额配置（幂等） ==========
      const [campaigns] = await queryInterface.sequelize.query(
        'SELECT DISTINCT lottery_campaign_id FROM lottery_strategy_config WHERE is_active = 1',
        { transaction }
      )

      const quotaConfigs = [
        {
          config_group: 'diamond_quota',
          config_key: 'diamond_quota_enabled',
          config_value: 'true',
          value_type: 'boolean',
          description: '是否启用钻石配额控制：抽中钻石奖品时检查配额余量'
        },
        {
          config_group: 'diamond_quota',
          config_key: 'diamond_quota_ratio',
          config_value: '1.0',
          value_type: 'number',
          description: '消费金额→钻石配额的转换比例（1.0 表示消费 100 元获得 100 配额）'
        },
        {
          config_group: 'diamond_quota',
          config_key: 'quota_exhausted_action',
          config_value: '"filter"',
          value_type: 'string',
          description: '配额耗尽行为：filter=过滤掉钻石奖品 / downgrade=降档到最小额钻石'
        }
      ]

      for (const campaign of campaigns) {
        for (const cfg of quotaConfigs) {
          const [existingCfg] = await queryInterface.sequelize.query(
            `SELECT lottery_strategy_config_id FROM lottery_strategy_config 
             WHERE lottery_campaign_id = ? AND config_key = ?`,
            { replacements: [campaign.lottery_campaign_id, cfg.config_key], transaction }
          )
          if (existingCfg.length === 0) {
            await queryInterface.sequelize.query(
              `INSERT INTO lottery_strategy_config 
                (lottery_campaign_id, config_group, config_key, config_value, value_type,
                 description, is_active, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
              {
                replacements: [
                  campaign.lottery_campaign_id,
                  cfg.config_group,
                  cfg.config_key,
                  cfg.config_value,
                  cfg.value_type,
                  cfg.description
                ],
                transaction
              }
            )
          }
        }
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：删除配额配置
      await queryInterface.sequelize.query(
        "DELETE FROM lottery_strategy_config WHERE config_group = 'diamond_quota'",
        { transaction }
      )

      // 回滚：删除 max_user_wins 字段
      const [cols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM lottery_prizes WHERE Field = 'max_user_wins'",
        { transaction }
      )
      if (cols.length > 0) {
        await queryInterface.removeColumn('lottery_prizes', 'max_user_wins', { transaction })
      }

      // 回滚：删除 DIAMOND_QUOTA 资产类型
      await queryInterface.sequelize.query(
        "DELETE FROM material_asset_types WHERE asset_code = 'DIAMOND_QUOTA'",
        { transaction }
      )

      // 回滚：恢复 form ENUM
      await queryInterface.sequelize.query(
        "ALTER TABLE material_asset_types MODIFY COLUMN form ENUM('shard','crystal','currency') NOT NULL",
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
