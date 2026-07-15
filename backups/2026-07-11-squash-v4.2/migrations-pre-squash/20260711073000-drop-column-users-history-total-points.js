'use strict'

/**
 * 删除冗余列: users.history_total_points（技术债务方案 拍板 4，2026-07-11）
 *
 * 背景:
 * - history_total_points 与资产账本（asset_transactions 正向 POINTS 流水 SUM）构成双真相，
 *   全库 14 用户核对仅 user_id=32 存在漂移（存量 3,153,691 / 账本派生 2,996,320），账本为唯一权威；
 * - 代码侧已全部改为账本实时派生（AssetQueryService.getHistoryTotalPoints + BusinessCacheHelper 缓存），
 *   对外 API 响应字段名 history_total_points 保持不变（auth/profile、抽奖用户信息、臻选空间解锁），两端前端无感；
 * - 全库 grep 复核：无任何代码写入该列，仅剩模型定义（本迁移同 commit 移除）。
 *
 * 变更内容:
 * 1. 删除 users 表索引 users_history_total_points
 * 2. 删除 users.history_total_points 列
 *
 * 回滚: 重建列与索引（存量值不可恢复，需用账本派生脚本回填）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('users')
    if (tableDefinition.history_total_points) {
      // 先删索引再删列（MySQL 删列会自动清理单列索引，显式删除保证幂等与可读性）
      const [indexes] = await queryInterface.sequelize.query('SHOW INDEX FROM users')
      if (indexes.some(i => i.Key_name === 'users_history_total_points')) {
        await queryInterface.removeIndex('users', 'users_history_total_points')
        console.log('✅ 索引 users_history_total_points 已删除')
      }
      await queryInterface.removeColumn('users', 'history_total_points')
      console.log('✅ users.history_total_points 冗余列已删除（累计积分改为账本实时派生）')
    } else {
      console.log('⏭️ users.history_total_points 列不存在，跳过')
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'history_total_points', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: '历史累计总积分（已废弃：由资产账本实时派生）'
    })
    await queryInterface.addIndex('users', ['history_total_points'], {
      name: 'users_history_total_points'
    })
    console.log('⏪ users.history_total_points 列已重建（值需账本派生脚本回填）')
  }
}
