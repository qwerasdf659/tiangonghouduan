'use strict'

/**
 * 数据库迁移：修复 user_risk_profiles 表错误的唯一约束
 *
 * 业务背景：
 * - 当前存在 uk_user_risk_profiles_level_default 约束仅在 user_level 上
 * - 此约束导致整张表只能有1条 user_level='normal' 的记录
 * - 但业务需要同时存在：
 *   1. 等级默认配置（config_type='level', user_id=NULL, user_level='normal'）
 *   2. 用户个人配置（config_type='user', user_id=31, user_level='normal'）
 * - 该约束阻止了用户个人风控配置的创建，前端报 PUT /risk-profiles/user/:user_id 404
 *
 * 变更内容：
 * - 删除错误的 uk_user_risk_profiles_level_default (仅 user_level)
 * - 添加正确的 uk_user_risk_profiles_user_config (user_id, config_type)
 *   确保每个用户只有一条个人配置
 *
 * 唯一性保证：
 * - 等级配置唯一性：由 Service.createLevelConfig() 应用层保证（findOne 检查）
 * - 用户配置唯一性：由数据库 UNIQUE (user_id, config_type) + Service.upsertUserConfig() 双重保证
 *
 * 回滚方案：
 * - down() 恢复原有的 uk_user_risk_profiles_level_default 约束
 *
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('📦 [迁移] 开始：修复 user_risk_profiles 唯一约束...')

    // 1. 检查并删除错误的唯一约束
    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM user_risk_profiles WHERE Key_name = 'uk_user_risk_profiles_level_default'"
    )

    if (indexes.length > 0) {
      await queryInterface.removeIndex('user_risk_profiles', 'uk_user_risk_profiles_level_default')
      console.log('  ✅ 已删除错误的唯一约束 uk_user_risk_profiles_level_default (仅 user_level)')
    } else {
      console.log('  ⚠️ uk_user_risk_profiles_level_default 不存在，跳过删除')
    }

    // 2. 检查是否已存在正确的用户配置唯一约束
    const [existingIdx] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM user_risk_profiles WHERE Key_name = 'uk_user_risk_profiles_user_config'"
    )

    if (existingIdx.length === 0) {
      // 添加正确的唯一约束：每个用户只能有一条指定类型的配置
      // MySQL 对 NULL 值不强制唯一（NULL ≠ NULL），所以等级配置（user_id=NULL）不受此约束影响
      // 即：多条 (NULL, 'level') 不会冲突，但 (31, 'user') + (31, 'user') 会冲突
      await queryInterface.addIndex('user_risk_profiles', ['user_id', 'config_type'], {
        unique: true,
        name: 'uk_user_risk_profiles_user_config'
      })
      console.log('  ✅ 已添加正确的唯一约束 uk_user_risk_profiles_user_config (user_id, config_type)')
    } else {
      console.log('  ⚠️ uk_user_risk_profiles_user_config 已存在，跳过添加')
    }

    console.log('📦 [迁移] 完成：user_risk_profiles 唯一约束已修复')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：恢复 user_risk_profiles 原有唯一约束...')

    // 1. 删除新添加的约束
    const [newIdx] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM user_risk_profiles WHERE Key_name = 'uk_user_risk_profiles_user_config'"
    )
    if (newIdx.length > 0) {
      await queryInterface.removeIndex('user_risk_profiles', 'uk_user_risk_profiles_user_config')
      console.log('  ✅ 已删除 uk_user_risk_profiles_user_config')
    }

    // 2. 恢复原有约束（仅在没有重复数据时可以恢复）
    const [existingOld] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM user_risk_profiles WHERE Key_name = 'uk_user_risk_profiles_level_default'"
    )
    if (existingOld.length === 0) {
      await queryInterface.addIndex('user_risk_profiles', ['user_level'], {
        unique: true,
        name: 'uk_user_risk_profiles_level_default'
      })
      console.log('  ✅ 已恢复 uk_user_risk_profiles_level_default')
    }

    console.log('📦 [回滚] 完成')
  }
}

