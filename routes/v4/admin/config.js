/**
 * 配置管理模块
 *
 * @description 系统配置管理和测试相关路由
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

/**
 * PUT /config - 更新引擎配置
 *
 * @description 更新抽奖引擎的配置参数
 * @route PUT /api/v4/admin/config
 * @access Private (需要管理员权限)
 */
router.put(
  '/config',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { config } = req.body

      if (!config || typeof config !== 'object') {
        return res.apiError('配置参数无效', 'INVALID_CONFIG')
      }

      // 验证配置参数
      const validConfigKeys = ['baseWinRate', 'maxConsecutiveLoses', 'adjustmentFactor', 'strategy']
      const configKeys = Object.keys(config)

      for (const key of configKeys) {
        if (!validConfigKeys.includes(key)) {
          return res.apiError(`无效的配置项: ${key}`, 'INVALID_CONFIG_KEY')
        }
      }

      // 应用配置
      const result = await sharedComponents.lotteryEngine.updateConfig(config)

      if (result.success) {
        sharedComponents.logger.info('引擎配置更新成功', {
          config,
          updated_by: req.user?.user_id,
          updated_at: BeijingTimeHelper.apiTimestamp()
        })

        return res.apiSuccess(
          {
            updated_config: result.config,
            timestamp: BeijingTimeHelper.apiTimestamp()
          },
          '配置更新成功'
        )
      } else {
        return res.apiError(result.error || '配置更新失败', 'CONFIG_UPDATE_FAILED')
      }
    } catch (error) {
      sharedComponents.logger.error('配置更新失败', { error: error.message })
      return res.apiInternalError('配置更新失败', error.message, 'CONFIG_UPDATE_ERROR')
    }
  })
)

/**
 * POST /test/simulate - 抽奖模拟测试
 *
 * @description 模拟抽奖过程，用于测试配置和策略
 * @route POST /api/v4/admin/test/simulate
 * @access Private (需要管理员权限)
 */
router.post(
  '/test/simulate',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id, times = 1, strategy_type = 'basic' } = req.body

      // 参数验证
      if (!user_id) {
        return res.apiError('用户ID不能为空', 'MISSING_USER_ID')
      }

      if (times < 1 || times > 100) {
        return res.apiError('模拟次数必须在1-100之间', 'INVALID_TIMES')
      }

      const validStrategies = ['basic', 'guaranteed', 'management']
      if (!validStrategies.includes(strategy_type)) {
        return res.apiError('无效的策略类型', 'INVALID_STRATEGY')
      }

      // 执行模拟测试
      const simulationResults = []

      for (let i = 0; i < times; i++) {
        try {
          const simulationResult = await sharedComponents.lotteryEngine.simulate({
            user_id: parseInt(user_id),
            strategy: strategy_type,
            simulation: true // 标记为模拟，不实际影响数据
          })

          simulationResults.push({
            round: i + 1,
            result: simulationResult.success ? 'win' : 'lose',
            probability: simulationResult.probability,
            strategy_name: simulationResult.strategy, // ✅ 修复: strategy_used → strategy_name
            timestamp: BeijingTimeHelper.now() // ✅ 修复: getCurrentTime() → now()
          })
        } catch (simError) {
          simulationResults.push({
            round: i + 1,
            result: 'error',
            error: simError.message,
            timestamp: BeijingTimeHelper.now() // ✅ 修复: getCurrentTime() → now()
          })
        }
      }

      // 统计结果
      const wins = simulationResults.filter(r => r.result === 'win').length
      const losses = simulationResults.filter(r => r.result === 'lose').length
      const errors = simulationResults.filter(r => r.result === 'error').length

      const summary = {
        total_simulations: times,
        wins,
        losses,
        errors,
        win_rate: times > 0 ? ((wins / times) * 100).toFixed(2) : 0,
        strategy_type,
        user_id: parseInt(user_id),
        timestamp: BeijingTimeHelper.apiTimestamp()
      }

      sharedComponents.logger.info('抽奖模拟测试完成', summary)

      return res.apiSuccess(
        {
          summary,
          detailed_results: simulationResults
        },
        '模拟测试完成'
      )
    } catch (error) {
      sharedComponents.logger.error('模拟测试失败', { error: error.message })
      return res.apiInternalError('模拟测试失败', error.message, 'SIMULATION_ERROR')
    }
  })
)

module.exports = router
