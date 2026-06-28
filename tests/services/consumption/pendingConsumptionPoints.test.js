'use strict'

/**
 * 「待审核消费积分」聚合引擎单元测试（QueryService.getPendingConsumptionPoints）
 *
 * 业务背景：
 * - 用户提交消费后记录为 consumption_records.status='pending'，审核通过才发放积分到可用余额。
 * - 「待审核消费积分」= 该用户 pending（未删除）消费记录的 points_to_award 之和，是首页对外展示口径，
 *   单一事实源 = consumption_records，不动资产账本 frozen_amount。
 *
 * 验证方式（连真实库 restaurant_points_dev，不硬编码期望值）：
 * - 期望值由独立的原生 SUM 查询实时算出，与引擎方法结果交叉比对，杜绝数据造假。
 *
 * 测试模型：Claude Opus 4.8
 * 创建时间：2026-06-28 北京时间
 */

const QueryService = require('../../../services/consumption/QueryService')
const { ConsumptionRecord, sequelize } = require('../../../models')
const { QueryTypes } = require('sequelize')

describe('待审核消费积分聚合引擎 getPendingConsumptionPoints', () => {
  afterAll(async () => {
    await sequelize.close()
  })

  test('无 userId 入参时返回 0（防御）', async () => {
    expect(await QueryService.getPendingConsumptionPoints(null)).toBe(0)
    expect(await QueryService.getPendingConsumptionPoints(undefined)).toBe(0)
  })

  test('引擎结果与真实库原生 SUM 交叉一致（取一个真实有 pending 记录的用户）', async () => {
    // 动态找一个真实存在 pending 消费记录的 user_id（不硬编码账号）
    const [pendingUser] = await sequelize.query(
      `SELECT user_id, COALESCE(SUM(points_to_award),0) AS sum_points
       FROM consumption_records
       WHERE status='pending' AND is_deleted=0
       GROUP BY user_id
       ORDER BY sum_points DESC
       LIMIT 1`,
      { type: QueryTypes.SELECT }
    )

    if (!pendingUser) {
      console.warn('⚠️ 真实库当前无任何 pending 消费记录，跳过交叉校验（非失败）')
      return
    }

    const expected = Number(pendingUser.sum_points)
    const actual = await QueryService.getPendingConsumptionPoints(pendingUser.user_id)

    expect(actual).toBe(expected)
    console.log(
      `✅ user_id=${pendingUser.user_id} 待审核消费积分：引擎=${actual}，原生SUM=${expected}`
    )
  })

  test('只统计 pending 且 is_deleted=0（已删除/已审核记录不计入）', async () => {
    // 取一个真实用户，分别用引擎与「显式排除非 pending」原生查询比对
    const [anyUser] = await sequelize.query(
      `SELECT DISTINCT user_id FROM consumption_records LIMIT 1`,
      { type: QueryTypes.SELECT }
    )
    if (!anyUser) {
      console.warn('⚠️ 真实库无消费记录，跳过')
      return
    }

    const engineResult = await QueryService.getPendingConsumptionPoints(anyUser.user_id)

    // 用模型 defaultScope（is_deleted=0）+ status=pending 复算
    const modelSum = await ConsumptionRecord.sum('points_to_award', {
      where: { user_id: anyUser.user_id, status: 'pending' }
    })

    expect(engineResult).toBe(Number(modelSum) || 0)
  })
})
