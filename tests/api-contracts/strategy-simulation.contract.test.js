/**
 * 策略效果模拟分析 API 契约测试（Phase 5-9 完整覆盖）
 *
 * 测试范围：
 * - 核心 API：baseline / run / user-journey（Phase 2-4）
 * - 增强 API：sensitivity / recommend / apply / drift（Phase 5）
 * - 运维 API：schedule / version-history / rollback / budget-pacing / circuit-breaker（Phase 7）
 *
 * API 契约规范：
 * - 所有响应必须包含：success, code, message, data, timestamp, version, request_id
 * - 管理员权限：authenticateToken + requireRoleLevel(100)
 * - 路由前缀：/api/v4/console/lottery-simulation
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 六
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken
let testCampaignId

jest.setTimeout(60000)

const API_PREFIX = '/api/v4/console/lottery-simulation'

describe('API契约测试 - 策略效果模拟分析', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227930', verification_code: '123456' })

    if (loginResponse.body.success) {
      accessToken = loginResponse.body.data.access_token
    }

    const { LotteryCampaign } = require('../../models')
    const campaign = await LotteryCampaign.findOne({ where: { status: 'active' } })
    testCampaignId = campaign?.lottery_campaign_id || 1
  })

  afterAll(async () => {
    await sequelize.close()
  })

  function validateApiResponse(body) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')
  }

  function authHeader() {
    return { Authorization: `Bearer ${accessToken}` }
  }

  // ==================== 核心 API ====================

  describe('GET /baseline/:lottery_campaign_id', () => {
    it('应返回完整的基线数据', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/baseline/${testCampaignId}`)
        .set(authHeader())

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('tier_rules')
      expect(data).toHaveProperty('matrix_config')
      expect(data).toHaveProperty('strategy_config')
      expect(data).toHaveProperty('actual_distribution')

      expect(Array.isArray(data.tier_rules)).toBe(true)
      expect(data.tier_rules.length).toBeGreaterThan(0)
      expect(data.tier_rules[0]).toHaveProperty('segment_key')
      expect(data.tier_rules[0]).toHaveProperty('tier_name')
      expect(data.tier_rules[0]).toHaveProperty('tier_weight')

      expect(Array.isArray(data.matrix_config)).toBe(true)
      expect(data.matrix_config.length).toBeGreaterThan(0)
      expect(data.matrix_config[0]).toHaveProperty('budget_tier')
      expect(data.matrix_config[0]).toHaveProperty('pressure_tier')

      expect(data.actual_distribution).toHaveProperty('total_draws')
      expect(Number(data.actual_distribution.total_draws)).toBeGreaterThan(0)
    })

    it('不存在的活动应返回 404', async () => {
      const res = await request(app).get(`${API_PREFIX}/baseline/99999`).set(authHeader())

      expect(res.status).toBe(404)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(false)
    })

    it('未认证请求应返回 401', async () => {
      const res = await request(app).get(`${API_PREFIX}/baseline/${testCampaignId}`)

      expect(res.status).toBe(401)
    })
  })

  describe('POST /run', () => {
    it('应执行 Monte Carlo 模拟并返回结果', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/run`)
        .set(authHeader())
        .send({
          lottery_campaign_id: testCampaignId,
          simulation_count: 1000,
          simulation_name: '测试模拟',
          scenario: {
            budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
            pressure_distribution: { P0: 0, P1: 80, P2: 20 },
            segment_distribution: { default: 80, new_user: 15, vip_user: 5 }
          }
        })

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('simulation_result')
      expect(data).toHaveProperty('comparison')
      expect(data).toHaveProperty('risk_assessment')
      expect(data).toHaveProperty('lottery_simulation_record_id')

      expect(data.simulation_result).toHaveProperty('tier_distribution')
      expect(data.simulation_result).toHaveProperty('empty_rate')
      expect(data.simulation_result).toHaveProperty('experience_metrics')

      const dist = data.simulation_result.tier_distribution
      expect(dist).toHaveProperty('high')
      expect(dist).toHaveProperty('mid')
      expect(dist).toHaveProperty('low')
      expect(dist).toHaveProperty('fallback')

      expect(data.risk_assessment).toHaveProperty('high_tier_risk')
      expect(data.risk_assessment).toHaveProperty('empty_rate_risk')
    })

    it('缺少 scenario 应返回 400', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/run`)
        .set(authHeader())
        .send({ lottery_campaign_id: testCampaignId })

      expect(res.status).toBe(400)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /user-journey', () => {
    it('应返回逐次抽奖详情', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/user-journey`)
        .set(authHeader())
        .send({
          lottery_campaign_id: testCampaignId,
          user_profile: { budget: 2000, segment_key: 'default', initial_empty_streak: 0 },
          draw_count: 10
        })

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('draws')
      expect(Array.isArray(data.draws)).toBe(true)
      expect(data.draws.length).toBe(10)

      const firstDraw = data.draws[0]
      expect(firstDraw).toHaveProperty('draw_number')
      expect(firstDraw).toHaveProperty('final_tier')
      expect(firstDraw).toHaveProperty('base_weights')
      expect(firstDraw).toHaveProperty('user_state_after')
    })
  })

  // ==================== 增强 API（Phase 5）====================

  describe('POST /sensitivity', () => {
    it('应返回参数扫射的多个数据点', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/sensitivity`)
        .set(authHeader())
        .send({
          lottery_campaign_id: testCampaignId,
          target_param: { group: 'matrix_config', key: 'B3_P1.high_multiplier' },
          range: { min: 0, max: 1.5, steps: 5 },
          simulation_count_per_step: 1000,
          scenario: {
            budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
            pressure_distribution: { P0: 0, P1: 80, P2: 20 },
            segment_distribution: { default: 100, new_user: 0, vip_user: 0 }
          }
        })

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('param_path')
      expect(data).toHaveProperty('data_points')
      expect(Array.isArray(data.data_points)).toBe(true)
      expect(data.data_points.length).toBeGreaterThanOrEqual(5)

      expect(data.data_points[0]).toHaveProperty('param_value')
      expect(data.data_points[0]).toHaveProperty('tier_distribution')
      expect(data.data_points[0]).toHaveProperty('empty_rate')
    })
  })

  describe('POST /recommend', () => {
    it('应返回满足约束的推荐方案', async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/recommend`)
        .set(authHeader())
        .send({
          lottery_campaign_id: testCampaignId,
          constraints: {
            high_rate: { min: 0.01, max: 0.15 },
            empty_rate: { max: 0.6 }
          },
          adjustable_params: ['matrix_config.B3_P1.high_multiplier'],
          scenario: {
            budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
            pressure_distribution: { P0: 0, P1: 80, P2: 20 },
            segment_distribution: { default: 100, new_user: 0, vip_user: 0 }
          }
        })

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('recommendations')
      expect(data).toHaveProperty('search_stats')
      expect(Array.isArray(data.recommendations)).toBe(true)
      expect(data.search_stats).toHaveProperty('combinations_tested')
      expect(data.search_stats).toHaveProperty('elapsed_ms')
    })
  })

  // ==================== 运维闭环 API（Phase 7）====================

  describe('GET /budget-pacing/:lottery_campaign_id', () => {
    it('应返回预算消耗趋势和耗尽预测', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/budget-pacing/${testCampaignId}`)
        .set(authHeader())

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('daily_trend')
      expect(data).toHaveProperty('avg_daily_consumption')
      expect(data).toHaveProperty('remaining_budget')
      expect(Array.isArray(data.daily_trend)).toBe(true)
    })
  })

  describe('GET /version-history/:lottery_campaign_id', () => {
    it('应返回配置变更历史列表', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/version-history/${testCampaignId}`)
        .set(authHeader())

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('records')
      expect(data).toHaveProperty('total')
      expect(Array.isArray(data.records)).toBe(true)
    })
  })

  describe('GET /circuit-breaker-status/:lottery_campaign_id', () => {
    it('应返回熔断监控状态', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/circuit-breaker-status/${testCampaignId}`)
        .set(authHeader())

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('status')
      expect(['no_rules', 'normal', 'breached', 'no_recent_data']).toContain(data.status)
    })
  })

  describe('GET /history/:lottery_campaign_id', () => {
    it('应返回模拟历史列表', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/history/${testCampaignId}`)
        .set(authHeader())

      expect(res.status).toBe(200)
      validateApiResponse(res.body)
      expect(res.body.success).toBe(true)

      const data = res.body.data
      expect(data).toHaveProperty('records')
      expect(data).toHaveProperty('total')
      expect(data.total).toBeGreaterThanOrEqual(0)
    })
  })

  // ==================== 写操作 API ====================

  /**
   * 写操作测试需要先创建模拟记录，再对记录执行写操作。
   * 使用共享的 testRecordId 在各测试间传递。
   */
  describe('写操作 API 完整链路', () => {
    let testRecordId

    beforeAll(async () => {
      const res = await request(app)
        .post(`${API_PREFIX}/run`)
        .set(authHeader())
        .send({
          lottery_campaign_id: testCampaignId,
          simulation_count: 1000,
          simulation_name: '写操作测试用模拟',
          scenario: {
            budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
            pressure_distribution: { P0: 0, P1: 80, P2: 20 },
            segment_distribution: { default: 100, new_user: 0, vip_user: 0 }
          }
        })

      if (res.body.success && res.body.data?.lottery_simulation_record_id) {
        testRecordId = res.body.data.lottery_simulation_record_id
      }
    })

    describe('GET /record/:lottery_simulation_record_id', () => {
      it('应返回单条模拟记录详情', async () => {
        if (!testRecordId) return

        const res = await request(app).get(`${API_PREFIX}/record/${testRecordId}`).set(authHeader())

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)

        const data = res.body.data
        expect(data).toHaveProperty('lottery_simulation_record_id', testRecordId)
        expect(data).toHaveProperty('lottery_campaign_id', testCampaignId)
        expect(data).toHaveProperty('simulation_result')
        expect(data).toHaveProperty('status')
      })

      it('不存在的记录应返回 404', async () => {
        const res = await request(app).get(`${API_PREFIX}/record/99999`).set(authHeader())

        expect(res.status).toBe(404)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(false)
      })
    })

    describe('POST /drift/:lottery_simulation_record_id', () => {
      it('应计算模拟预测与实际数据的偏差', async () => {
        if (!testRecordId) return

        const res = await request(app).post(`${API_PREFIX}/drift/${testRecordId}`).set(authHeader())

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)

        const data = res.body.data
        expect(data).toHaveProperty('predicted')
        expect(data).toHaveProperty('actual')
        expect(data).toHaveProperty('drift')
        expect(data).toHaveProperty('actual_draws_count')
      })

      it('不存在的记录应返回错误', async () => {
        const res = await request(app).post(`${API_PREFIX}/drift/99999`).set(authHeader())

        expect([404, 500]).toContain(res.status)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(false)
      })
    })

    describe('POST /circuit-breaker/:lottery_simulation_record_id', () => {
      it('应创建熔断监控规则', async () => {
        if (!testRecordId) return

        const res = await request(app)
          .post(`${API_PREFIX}/circuit-breaker/${testRecordId}`)
          .set(authHeader())
          .send({ tolerance: 0.05 })

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)

        const data = res.body.data
        expect(data).toHaveProperty('rules_created')
      })
    })

    describe('POST /schedule/:lottery_simulation_record_id', () => {
      it('缺少 scheduled_at 应返回 400', async () => {
        if (!testRecordId) return

        const res = await request(app)
          .post(`${API_PREFIX}/schedule/${testRecordId}`)
          .set(authHeader())
          .send({})

        expect(res.status).toBe(400)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(false)
      })

      it('应设置定时生效时间', async () => {
        if (!testRecordId) return

        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

        const res = await request(app)
          .post(`${API_PREFIX}/schedule/${testRecordId}`)
          .set(authHeader())
          .send({ scheduled_at: futureDate })

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)
      })
    })

    describe('POST /apply/:lottery_simulation_record_id', () => {
      let applyRecordId

      beforeAll(async () => {
        const res = await request(app)
          .post(`${API_PREFIX}/run`)
          .set(authHeader())
          .send({
            lottery_campaign_id: testCampaignId,
            simulation_count: 1000,
            simulation_name: '一键应用测试专用',
            scenario: {
              budget_distribution: { B0: 0, B1: 0, B2: 0, B3: 100 },
              pressure_distribution: { P0: 0, P1: 80, P2: 20 },
              segment_distribution: { default: 100, new_user: 0, vip_user: 0 }
            }
          })

        if (res.body.success && res.body.data?.lottery_simulation_record_id) {
          applyRecordId = res.body.data.lottery_simulation_record_id
        }
      })

      it('应将模拟配置应用到线上并创建审计日志', async () => {
        if (!applyRecordId) return

        const res = await request(app)
          .post(`${API_PREFIX}/apply/${applyRecordId}`)
          .set(authHeader())

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)

        const data = res.body.data
        expect(data).toHaveProperty('applied')
        expect(data.applied).toBe(true)
        expect(data).toHaveProperty('changes')
        expect(Array.isArray(data.changes)).toBe(true)
      })

      it('已应用的记录重复应用应返回错误', async () => {
        if (!applyRecordId) return

        const res = await request(app)
          .post(`${API_PREFIX}/apply/${applyRecordId}`)
          .set(authHeader())

        expect([400, 409, 500]).toContain(res.status)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(false)
      })
    })

    describe('POST /rollback/:log_id', () => {
      it('应回滚到指定版本的配置', async () => {
        const historyRes = await request(app)
          .get(`${API_PREFIX}/version-history/${testCampaignId}`)
          .set(authHeader())

        if (!historyRes.body.success || !historyRes.body.data?.records?.length) {
          return
        }

        const rollbackTarget = historyRes.body.data.records.find(
          r => r.before_data && r.admin_operation_log_id
        )
        if (!rollbackTarget) return

        const res = await request(app)
          .post(`${API_PREFIX}/rollback/${rollbackTarget.admin_operation_log_id}`)
          .set(authHeader())

        expect(res.status).toBe(200)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(true)

        const data = res.body.data
        expect(data).toHaveProperty('rolled_back')
        expect(data.rolled_back).toBe(true)
      })

      it('不存在的日志 ID 应返回错误', async () => {
        const res = await request(app).post(`${API_PREFIX}/rollback/99999`).set(authHeader())

        expect([404, 500]).toContain(res.status)
        validateApiResponse(res.body)
        expect(res.body.success).toBe(false)
      })
    })
  })
})
