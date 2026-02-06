'use strict'

/**
 * 修复 DIAMOND 资产 BIGINT 溢出导致的余额数据损坏
 *
 * 问题描述：
 * - account_asset_balance_id=81 (account_id=7, user_id=32) 的 DIAMOND 余额
 *   available_amount 被设为 9223372036854775807（BIGINT 最大值）
 *
 * 根因分析：
 * - BalanceService.unfreeze() 方法中 `available_after = available_before + amount`
 *   当 amount 参数为字符串时（MySQL BIGINT → JS String），JavaScript + 运算符
 *   做了字符串拼接而非数字加法（如 9350 + "500" = "9350500"）
 * - 持续拼接后数值超过 BIGINT 上限，MySQL 自动截断为 9223372036854775807
 *
 * 修复策略：
 * - 将溢出的 available_amount 重置为 0（重放全部交易后正确值为负数，
 *   说明测试操作已过度消耗，不应为负，故重置为 0）
 * - 代码层面 BalanceService 已同步修复，所有算术运算强制 Number() 转换
 *
 * 影响范围：仅 1 条记录（测试用户 user_id=32，mobile=13612227910）
 *
 * @date 2026-02-06 北京时间
 */
module.exports = {
  async up(queryInterface) {
    // 1. 验证确实是异常数据（available_amount = BIGINT 最大值）
    const [rows] = await queryInterface.sequelize.query(`
      SELECT account_asset_balance_id, account_id, 
             CAST(available_amount AS CHAR) as available_amount
      FROM account_asset_balances
      WHERE account_asset_balance_id = 81
        AND asset_code = 'DIAMOND'
        AND available_amount = 9223372036854775807
    `)

    if (rows.length === 0) {
      console.log('⚠️ 未找到需要修复的异常记录（balance_id=81），跳过迁移')
      return
    }

    console.log(`🔧 修复 DIAMOND 余额溢出：balance_id=81, 当前值=${rows[0].available_amount}`)

    // 2. 重置溢出的 available_amount 为 0
    await queryInterface.sequelize.query(`
      UPDATE account_asset_balances
      SET available_amount = 0
      WHERE account_asset_balance_id = 81
        AND asset_code = 'DIAMOND'
        AND available_amount = 9223372036854775807
    `)

    console.log('✅ 已将 balance_id=81 的 available_amount 重置为 0')

    // 3. 记录修复操作到资产交易流水（审计留痕）
    await queryInterface.sequelize.query(`
      INSERT INTO asset_transactions 
        (account_id, asset_code, delta_amount, balance_before, balance_after, 
         business_type, idempotency_key, meta, created_at)
      VALUES 
        (7, 'DIAMOND', -9223372036854775807, 9223372036854775807, 0,
         'admin_data_fix', 'migration_fix_bigint_overflow_20260206',
         '{"reason":"BIGINT溢出修复","migration":"20260205203432"}',
         NOW())
    `)

    console.log('✅ 已记录修复流水（审计留痕）')
  },

  async down(queryInterface) {
    // 回滚：删除修复流水记录（余额不恢复到错误值）
    await queryInterface.sequelize.query(`
      DELETE FROM asset_transactions
      WHERE idempotency_key = 'migration_fix_bigint_overflow_20260206'
    `)

    console.log('⚠️ 已回滚修复流水记录（注意：余额未恢复到溢出值，需手动处理）')
  }
}
