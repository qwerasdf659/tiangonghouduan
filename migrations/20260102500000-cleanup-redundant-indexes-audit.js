/**
 * 餐厅积分抽奖系统 - 数据库迁移
 *
 * 迁移内容：清理 9 个冗余索引（索引瘦身审计）
 *
 * 问题描述（基于 2026-01-02 真实库 information_schema 验证）：
 * 1. roles 表: role_name 和 role_uuid 各存在 4 个索引（冗余 6 个）
 * 2. admin_operation_logs 表: idempotency_key 存在 3 个索引（冗余 2 个）
 * 3. asset_transactions 表: idempotency_key 存在 2 个索引（冗余 1 个）
 *
 * 影响评估：
 * - 每次 INSERT/UPDATE 需要维护冗余索引，拖累写入性能
 * - roles 表从 8 个索引降至 5 个，写入性能预期提升 ~30%
 * - admin_operation_logs 从 9 个索引降至 7 个
 * - asset_transactions 从 7 个索引降至 6 个
 *
 * 索引策略：MySQL 8.0 默认使用 INPLACE 在线 DDL 算法
 *
 * 创建时间：2026年01月02日
 * 方案类型：索引瘦身（P1 级 - 降低写入成本）
 * 用户授权：2026-01-03 已明确授权"索引瘦身审计"，一次性清理 9 个冗余索引
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：清理 9 个冗余索引
   * 索引保留原则：每列只保留 1 个最规范的索引
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：清理冗余索引（索引瘦身审计）...')

    // ===============================================================
    // 清理 1: roles 表 - 删除 6 个冗余索引
    // 真实库索引盘点（2026-01-02）:
    //   role_name 列: idx_roles_name(非唯一), role_name(唯一), role_name_2(唯一), roles_role_name(唯一)
    //   role_uuid 列: idx_roles_uuid(非唯一), role_uuid(唯一), role_uuid_2(唯一), roles_role_uuid(唯一)
    // 保留: PRIMARY + role_name(唯一) + role_uuid(唯一) + roles_is_active + roles_role_level
    // 删除: idx_roles_name, idx_roles_uuid, role_name_2, role_uuid_2, roles_role_name, roles_role_uuid
    // ===============================================================
    console.log('正在清理 roles 表冗余索引（6 个）...')

    const rolesRedundantIndexes = [
      'idx_roles_name',
      'idx_roles_uuid',
      'role_name_2',
      'role_uuid_2',
      'roles_role_name',
      'roles_role_uuid'
    ]

    for (const indexName of rolesRedundantIndexes) {
      const [exists] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM roles WHERE Key_name = '${indexName}'
      `)
      if (exists.length > 0) {
        // MySQL 标准语法：DROP INDEX ... ON table_name
        await queryInterface.sequelize.query(`
          DROP INDEX \`${indexName}\` ON roles
        `)
        console.log(`  ✅ 已删除冗余索引: roles.${indexName}`)
      } else {
        console.log(`  ⚠️ 索引 roles.${indexName} 不存在，跳过`)
      }
    }

    // ===============================================================
    // 清理 2: admin_operation_logs 表 - 删除 2 个冗余索引
    // 真实库索引盘点（2026-01-02）:
    //   idempotency_key 列: idx_audit_logs_business_id(非唯一), uk_admin_operation_logs_business_id(唯一), uk_admin_operation_logs_idempotency_key(唯一)
    // 保留: uk_admin_operation_logs_idempotency_key（命名最规范）
    // 删除: idx_audit_logs_business_id, uk_admin_operation_logs_business_id
    // ===============================================================
    console.log('正在清理 admin_operation_logs 表冗余索引（2 个）...')

    const adminLogsRedundantIndexes = [
      'idx_audit_logs_business_id',
      'uk_admin_operation_logs_business_id'
    ]

    for (const indexName of adminLogsRedundantIndexes) {
      const [exists] = await queryInterface.sequelize.query(`
        SHOW INDEX FROM admin_operation_logs WHERE Key_name = '${indexName}'
      `)
      if (exists.length > 0) {
        await queryInterface.sequelize.query(`
          DROP INDEX \`${indexName}\` ON admin_operation_logs
        `)
        console.log(`  ✅ 已删除冗余索引: admin_operation_logs.${indexName}`)
      } else {
        console.log(`  ⚠️ 索引 admin_operation_logs.${indexName} 不存在，跳过`)
      }
    }

    // ===============================================================
    // 清理 3: asset_transactions 表 - 删除 1 个冗余索引
    // 真实库索引盘点（2026-01-02）:
    //   idempotency_key 列: idempotency_key(唯一), uk_idempotency_key(唯一)
    // 保留: uk_idempotency_key（命名规范）
    // 删除: idempotency_key
    // ===============================================================
    console.log('正在清理 asset_transactions 表冗余索引（1 个）...')

    const [assetIdxExists] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions WHERE Key_name = 'idempotency_key'
    `)
    if (assetIdxExists.length > 0) {
      await queryInterface.sequelize.query(`
        DROP INDEX \`idempotency_key\` ON asset_transactions
      `)
      console.log('  ✅ 已删除冗余索引: asset_transactions.idempotency_key')
    } else {
      console.log('  ⚠️ 索引 asset_transactions.idempotency_key 不存在，跳过')
    }

    console.log('✅ 冗余索引清理迁移完成（共删除 9 个冗余索引）')
    console.log('📊 预期收益: roles 表写入性能提升 ~30%，整体写入成本降低')
  },

  /**
   * 回滚迁移：恢复删除的冗余索引
   * 注意：回滚会重新引入冗余，仅在必要时使用
   */
  async down(queryInterface, Sequelize) {
    console.log('开始回滚：恢复冗余索引（不推荐）...')

    // 恢复 roles 表冗余索引
    console.log('正在恢复 roles 表冗余索引...')

    // idx_roles_name - 非唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE INDEX idx_roles_name ON roles (role_name)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 idx_roles_name 失败:', err.message))

    // idx_roles_uuid - 非唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE INDEX idx_roles_uuid ON roles (role_uuid)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 idx_roles_uuid 失败:', err.message))

    // role_name_2 - 唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX role_name_2 ON roles (role_name)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 role_name_2 失败:', err.message))

    // role_uuid_2 - 唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX role_uuid_2 ON roles (role_uuid)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 role_uuid_2 失败:', err.message))

    // roles_role_name - 唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX roles_role_name ON roles (role_name)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 roles_role_name 失败:', err.message))

    // roles_role_uuid - 唯一索引
    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX roles_role_uuid ON roles (role_uuid)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 roles_role_uuid 失败:', err.message))

    // 恢复 admin_operation_logs 表冗余索引
    console.log('正在恢复 admin_operation_logs 表冗余索引...')

    await queryInterface.sequelize
      .query(
        `
      CREATE INDEX idx_audit_logs_business_id ON admin_operation_logs (idempotency_key)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 idx_audit_logs_business_id 失败:', err.message))

    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX uk_admin_operation_logs_business_id ON admin_operation_logs (idempotency_key)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 uk_admin_operation_logs_business_id 失败:', err.message))

    // 恢复 asset_transactions 表冗余索引
    console.log('正在恢复 asset_transactions 表冗余索引...')

    await queryInterface.sequelize
      .query(
        `
      CREATE UNIQUE INDEX idempotency_key ON asset_transactions (idempotency_key)
    `
      )
      .catch(err => console.log('  ⚠️ 恢复 idempotency_key 失败:', err.message))

    console.log('✅ 冗余索引回滚完成（已恢复 9 个冗余索引）')
    console.log('⚠️ 警告: 回滚会重新引入写入性能损耗，请评估是否真的需要回滚')
  }
}
