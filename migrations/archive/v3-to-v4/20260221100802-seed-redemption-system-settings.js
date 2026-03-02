'use strict'

/**
 * 核销系统设置种子数据 + category ENUM 扩展
 *
 * 业务背景：
 * - 核销码系统需要可运营调整的配置参数
 * - 实物奖品/优惠券的核销码有效期、QR码刷新间隔、核销权限等级
 * - 配置项纳入 system_settings 白名单管理，运营可通过管理后台调整
 *
 * 变更内容：
 * 1. system_settings.category ENUM 新增 'redemption' 值
 * 2. 插入 4 条核销相关的默认配置记录
 *
 * 回滚方案：
 * - down() 删除 4 条核销配置记录并回滚 ENUM
 *
 * @date 2026-02-21
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：核销系统设置种子数据...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 扩展 category ENUM，新增 'redemption'
      const [currentCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'category'",
        { transaction }
      )
      const currentType = currentCols[0]?.COLUMN_TYPE || ''

      if (!currentType.includes('redemption')) {
        await queryInterface.changeColumn(
          'system_settings',
          'category',
          {
            type: Sequelize.ENUM('basic', 'points', 'notification', 'security', 'marketplace', 'redemption'),
            allowNull: false,
            comment: '配置分类：basic-基础设置，points-积分设置，notification-通知设置，security-安全设置，marketplace-市场设置，redemption-核销设置'
          },
          { transaction }
        )
        console.log('  ✅ system_settings.category ENUM 已扩展（新增 redemption）')
      } else {
        console.log('  ⏭️  system_settings.category 已包含 redemption，跳过')
      }

      // 2. 插入核销配置种子数据（幂等：逐条检查是否已存在）
      const settings = [
        {
          category: 'redemption',
          setting_key: 'default_expiry_days_product',
          setting_value: '7',
          value_type: 'number',
          description: '实物奖品核销码默认有效天数（用户兑换后的到店核销期限）',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'redemption',
          setting_key: 'default_expiry_days_voucher',
          setting_value: '30',
          value_type: 'number',
          description: '优惠券核销码默认有效天数（优惠券类奖品的核销期限）',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'redemption',
          setting_key: 'qr_code_expiry_minutes',
          setting_value: '5',
          value_type: 'number',
          description: 'QR码有效期分钟数（动态核销二维码的刷新间隔）',
          is_visible: 1,
          is_readonly: 0
        },
        {
          category: 'redemption',
          setting_key: 'min_role_level_for_fulfill',
          setting_value: '20',
          value_type: 'number',
          description: '允许核销的最低角色等级（控制哪些角色可以执行核销操作）',
          is_visible: 1,
          is_readonly: 0
        }
      ]

      for (const setting of settings) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT system_setting_id FROM system_settings
           WHERE category = '${setting.category}' AND setting_key = '${setting.setting_key}'
           LIMIT 1`,
          { type: queryInterface.sequelize.QueryTypes.SELECT, transaction }
        )

        if (existing) {
          console.log(`  ⏭️  redemption/${setting.setting_key} 已存在，跳过`)
          continue
        }

        await queryInterface.sequelize.query(
          `INSERT INTO system_settings
            (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
           VALUES
            (:category, :setting_key, :setting_value, :value_type, :description, :is_visible, :is_readonly, NOW(), NOW())`,
          {
            replacements: setting,
            transaction
          }
        )
        console.log(`  ✅ 已插入 redemption/${setting.setting_key} = ${setting.setting_value}`)
      }

      await transaction.commit()
      console.log('📦 [迁移] 完成：核销系统设置种子数据插入完毕')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('📦 [回滚] 开始：删除核销系统设置种子数据...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 删除核销配置记录
      await queryInterface.sequelize.query(
        "DELETE FROM system_settings WHERE category = 'redemption'",
        { transaction }
      )
      console.log('  ✅ 已删除所有 redemption 类别配置记录')

      // 2. 回滚 category ENUM（移除 redemption）
      await queryInterface.changeColumn(
        'system_settings',
        'category',
        {
          type: Sequelize.ENUM('basic', 'points', 'notification', 'security', 'marketplace'),
          allowNull: false,
          comment: '配置分类：basic-基础设置，points-积分设置，notification-通知设置，security-安全设置，marketplace-市场设置'
        },
        { transaction }
      )
      console.log('  ✅ system_settings.category ENUM 已回滚（移除 redemption）')

      await transaction.commit()
      console.log('📦 [回滚] 完成：核销系统设置回滚完毕')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
