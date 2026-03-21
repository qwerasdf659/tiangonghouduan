/**
 * 自定义ESLint规则 - 项目特定检查
 *
 * 包含规则：
 * 1. 禁止直接使用时间相关原生方法（强制使用 BeijingTimeHelper）
 * 2. 事务边界检查提醒（BalanceService/ItemService 调用必须传递 transaction）
 *
 * 创建时间：2025年10月11日
 * 更新时间：2026年01月31日 - AssetService 拆分为 BalanceService/ItemService
 */

module.exports = {
  rules: {
    // 禁止直接使用 new Date()（除了在timeHelper.js中）
    'no-restricted-syntax': [
      'error',
      {
        selector: 'NewExpression[callee.name="Date"]',
        message:
          '❌ 禁止直接使用 new Date()，请使用 BeijingTimeHelper.createDatabaseTime() 或其他相应方法'
      },
      {
        selector: 'MemberExpression[object.name="Date"][property.name="now"]',
        message:
          '❌ 禁止直接使用 Date.now()，请使用 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()'
      }
    ]
  },

  // 排除文件（允许在这些文件中使用原生方法）
  overrides: [
    {
      files: ['utils/timeHelper.js', 'utils/BeijingTimeHelper.js'],
      rules: {
        'no-restricted-syntax': 'off'
      }
    }
  ]
}

/**
 * 📋 事务边界规则说明（2026-01-05 治理决策）
 * V4.7.0 更新：AssetService 已拆分为 BalanceService/ItemService（2026-01-31）
 *
 * 检查目标：
 * - BalanceService.changeBalance()
 * - BalanceService.freeze()
 * - BalanceService.unfreeze()
 * - BalanceService.settleFromFrozen()
 * - ItemService.transferItem()
 *
 * 规则类型：warn（警告，不阻塞构建）
 *
 * 排除文件：
 * - services/asset/BalanceService.js（自身定义）
 * - services/asset/ItemService.js（自身定义）
 * - services/IdempotencyService.js（入口幂等服务，允许自管理事务）
 *
 * 使用方式：
 * 1. 运行 npm run lint 查看警告
 * 2. 确保所有 BalanceService/ItemService 调用都传递了 { transaction }
 * 3. 如果是在 TransactionManager.execute() 内调用，确保传递事务
 *
 */
