'use strict'

/**
 * 10策略活动级开关 - 数据迁移
 *
 * 改动内容：
 * 1. lottery_management_settings 表新增 lottery_campaign_id 列（活动级干预隔离）
 * 2. 取消 4 条 active force_win 测试记录（未上线阶段直接 cancel）
 * 3. 修复活动 26 的 config_group='pressure' → 'pressure_tier'
 * 4. 为所有活动补充缺失的策略配置默认记录（management + grayscale）
 *
 * @see docs/10策略活动级开关-需求方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* ========== 1. lottery_management_settings 新增 lottery_campaign_id 列 ========== */
      const tableDesc = await queryInterface.describeTable('lottery_management_settings')
      if (!tableDesc.lottery_campaign_id) {
        await queryInterface.addColumn(
          'lottery_management_settings',
          'lottery_campaign_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'lottery_campaigns',
              key: 'lottery_campaign_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '关联的抽奖活动ID（NULL=全局干预，非NULL=仅对指定活动生效）'
          },
          { transaction }
        )

        /* 新增联合索引（活动+用户+状态） */
        await queryInterface.addIndex(
          'lottery_management_settings',
          ['lottery_campaign_id', 'user_id', 'status'],
          { name: 'idx_campaign_user_status', transaction }
        )
      }

      /* ========== 2. Cancel 4 条 active force_win 测试记录 ========== */
      await queryInterface.sequelize.query(
        `UPDATE lottery_management_settings
         SET status = 'cancelled', updated_at = NOW()
         WHERE status = 'active'`,
        { transaction }
      )

      /* ========== 3. 修复活动 26 的 config_group ========== */
      await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_group = 'pressure_tier'
         WHERE config_group = 'pressure'
           AND lottery_campaign_id = 26`,
        { transaction }
      )

      /* ========== 4. 为所有活动补充 management + grayscale 默认配置 ========== */

      /** 策略配置默认值（management 总开关 + grayscale 灰度百分比） */
      const NEW_CONFIG_DEFAULTS = [
        { config_group: 'management', config_key: 'enabled', config_value: 'true', value_type: 'boolean', description: '管理干预总开关（关闭后该活动的所有干预不生效）' },
        { config_group: 'grayscale', config_key: 'pity_percentage', config_value: '100', value_type: 'number', description: 'Pity 灰度放量百分比（0-100）' },
        { config_group: 'grayscale', config_key: 'luck_debt_percentage', config_value: '100', value_type: 'number', description: '运气债务灰度放量百分比（0-100）' },
        { config_group: 'grayscale', config_key: 'anti_empty_percentage', config_value: '100', value_type: 'number', description: '防连空灰度放量百分比（0-100）' },
        { config_group: 'grayscale', config_key: 'anti_high_percentage', config_value: '100', value_type: 'number', description: '防连高灰度放量百分比（0-100）' }
      ]

      /* 查询所有活动ID */
      const [campaigns] = await queryInterface.sequelize.query(
        'SELECT lottery_campaign_id FROM lottery_campaigns',
        { transaction }
      )

      for (const campaign of campaigns) {
        const campaign_id = campaign.lottery_campaign_id

        for (const cfg of NEW_CONFIG_DEFAULTS) {
          /* 幂等插入：唯一索引 (lottery_campaign_id, config_group, config_key, priority) 保证不重复 */
          const [existing] = await queryInterface.sequelize.query(
            `SELECT lottery_strategy_config_id FROM lottery_strategy_config
             WHERE lottery_campaign_id = ? AND config_group = ? AND config_key = ? AND priority = 0`,
            { replacements: [campaign_id, cfg.config_group, cfg.config_key], transaction }
          )

          if (existing.length === 0) {
            await queryInterface.sequelize.query(
              `INSERT INTO lottery_strategy_config
                (lottery_campaign_id, config_group, config_key, config_value, value_type, description, is_active, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
              {
                replacements: [
                  campaign_id, cfg.config_group, cfg.config_key,
                  cfg.config_value, cfg.value_type, cfg.description
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

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 删除新增的 management/grayscale 配置 */
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_strategy_config
         WHERE config_group IN ('management', 'grayscale')`,
        { transaction }
      )

      /* 恢复活动 26 的 config_group */
      await queryInterface.sequelize.query(
        `UPDATE lottery_strategy_config
         SET config_group = 'pressure'
         WHERE config_group = 'pressure_tier'
           AND lottery_campaign_id = 26`,
        { transaction }
      )

      /* 移除索引和列 */
      try {
        await queryInterface.removeIndex(
          'lottery_management_settings',
          'idx_campaign_user_status',
          { transaction }
        )
      } catch (_e) { /* 索引可能不存在 */ }

      await queryInterface.removeColumn(
        'lottery_management_settings',
        'lottery_campaign_id',
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
