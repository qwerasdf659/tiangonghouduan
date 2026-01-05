/**
 * 分页功能通用测试套件
 *
 * **业务场景**: 验证所有列表API的分页参数和逻辑
 * **技术规范**:
 *   - page: 页码,从1开始,默认1
 *   - limit: 每页数量,默认10,最大100
 *   - 返回total总数、totalPages总页数
 *
 * 创建时间: 2025-11-14
 * 适用范围: 所有带分页功能的列表API
 */

const request = require('supertest')

/**
 * 分页功能通用测试工具类
 */
class PaginationTestSuite {
  /**
   * 测试分页参数验证
   *
   * @param {Object} app - Express应用实例
   * @param {string} apiEndpoint - API端点路径
   * @param {string} authToken - 认证Token(可选)
   * @returns {Promise<void>} 无返回值
   *
   * @example
   * await PaginationTestSuite.testPaginationParams(
   *   app,
   *   '/api/v4/points/history',
   *   userToken
   * )
   */
  static async testPaginationParams (app, apiEndpoint, authToken = null) {
    describe(`分页参数验证 - ${apiEndpoint}`, () => {
      /**
       * 测试: 应该拒绝page < 1
       */
      test('应该拒绝page < 1', async () => {
        const req = request(app).get(`${apiEndpoint}?page=0`)
        if (authToken) req.set('Authorization', `Bearer ${authToken}`)

        const res = await req
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.code).toMatch(/INVALID.*PAGE/i)
        console.log('✅ 正确拒绝page < 1')
      })

      /**
       * 测试: 应该拒绝limit > 100
       */
      test('应该拒绝limit > 100', async () => {
        const req = request(app).get(`${apiEndpoint}?limit=101`)
        if (authToken) req.set('Authorization', `Bearer ${authToken}`)

        const res = await req
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.code).toMatch(/LIMIT.*EXCEED/i)
        console.log('✅ 正确拒绝limit > 100')
      })

      /**
       * 测试: 应该拒绝limit < 1
       */
      test('应该拒绝limit < 1', async () => {
        const req = request(app).get(`${apiEndpoint}?limit=0`)
        if (authToken) req.set('Authorization', `Bearer ${authToken}`)

        const res = await req
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        console.log('✅ 正确拒绝limit < 1')
      })

      /**
       * 测试: 应该使用默认值page=1, limit=10
       */
      test('应该使用默认值page=1, limit=10', async () => {
        const req = request(app).get(apiEndpoint)
        if (authToken) req.set('Authorization', `Bearer ${authToken}`)

        const res = await req
        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.pagination.page).toBe(1)
        expect(res.body.data.pagination.limit).toBe(10)
        console.log('✅ 默认值正确: page=1, limit=10')
      })

      /**
       * 测试: 应该正确处理自定义分页参数
       */
      test('应该正确处理自定义分页参数', async () => {
        const req = request(app).get(`${apiEndpoint}?page=2&limit=20`)
        if (authToken) req.set('Authorization', `Bearer ${authToken}`)

        const res = await req
        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.pagination.page).toBe(2)
        expect(res.body.data.pagination.limit).toBe(20)
        console.log('✅ 自定义参数正确: page=2, limit=20')
      })
    })
  }

  /**
   * 测试分页返回数据结构
   *
   * @param {Object} app - Express应用实例
   * @param {string} apiEndpoint - API端点路径
   * @param {string} authToken - 认证Token(可选)
   * @returns {Promise<void>} 无返回值
   */
  static async testPaginationStructure (app, apiEndpoint, authToken = null) {
    const req = request(app).get(apiEndpoint)
    if (authToken) req.set('Authorization', `Bearer ${authToken}`)

    const res = await req
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // 验证分页数据结构
    const pagination = res.body.data.pagination
    expect(pagination).toBeDefined()
    expect(pagination).toHaveProperty('page')
    expect(pagination).toHaveProperty('limit')
    expect(pagination).toHaveProperty('total')
    expect(pagination).toHaveProperty('total_pages')

    // 验证数据类型
    expect(typeof pagination.page).toBe('number')
    expect(typeof pagination.limit).toBe('number')
    expect(typeof pagination.total).toBe('number')
    expect(typeof pagination.total_pages).toBe('number')

    // 验证数据合理性
    expect(pagination.page).toBeGreaterThanOrEqual(1)
    expect(pagination.limit).toBeGreaterThanOrEqual(1)
    expect(pagination.limit).toBeLessThanOrEqual(100)
    expect(pagination.total).toBeGreaterThanOrEqual(0)
    expect(pagination.total_pages).toBeGreaterThanOrEqual(0)

    console.log('✅ 分页数据结构验证通过:', pagination)
  }

  /**
   * 测试分页计算逻辑
   *
   * @param {Object} app - Express应用实例
   * @param {string} apiEndpoint - API端点路径
   * @param {string} authToken - 认证Token(可选)
   * @returns {Promise<void>} 无返回值
   */
  static async testPaginationLogic (app, apiEndpoint, authToken = null) {
    // 1. 获取总数
    const req1 = request(app).get(`${apiEndpoint}?page=1&limit=5`)
    if (authToken) req1.set('Authorization', `Bearer ${authToken}`)
    const res1 = await req1

    const { total, total_pages, limit } = res1.body.data.pagination
    const expectedTotalPages = Math.ceil(total / limit)

    // 2. 验证总页数计算
    expect(total_pages).toBe(expectedTotalPages)
    console.log(`✅ 总页数计算正确: total=${total}, limit=${limit}, total_pages=${total_pages}`)

    // 3. 验证最后一页数据
    if (total_pages > 0) {
      const req2 = request(app).get(`${apiEndpoint}?page=${total_pages}&limit=${limit}`)
      if (authToken) req2.set('Authorization', `Bearer ${authToken}`)
      const res2 = await req2

      const itemsInLastPage = res2.body.data.items?.length || res2.body.data.list?.length || 0

      expect(itemsInLastPage).toBeLessThanOrEqual(limit)
      console.log(`✅ 最后一页数据正确: ${itemsInLastPage}条`)
    }

    // 4. 验证超出范围的页码
    const req3 = request(app).get(`${apiEndpoint}?page=${total_pages + 10}&limit=${limit}`)
    if (authToken) req3.set('Authorization', `Bearer ${authToken}`)
    const res3 = await req3

    expect(res3.status).toBe(200)
    const itemsCount = res3.body.data.items?.length || res3.body.data.list?.length || 0
    expect(itemsCount).toBe(0)
    console.log('✅ 超出范围的页码返回空数据')
  }
}

/**
 * 分页测试辅助函数
 */
class PaginationHelpers {
  /**
   * 计算分页信息
   *
   * @param {number} total - 总记录数
   * @param {number} page - 当前页码
   * @param {number} limit - 每页数量
   * @returns {Object} 分页信息
   */
  static calculatePagination (total, page = 1, limit = 10) {
    const totalPages = Math.ceil(total / limit)
    const offset = (page - 1) * limit
    const hasNextPage = page < totalPages
    const hasPreviousPage = page > 1

    return {
      total,
      page,
      limit,
      total_pages: totalPages,
      offset,
      has_next_page: hasNextPage,
      has_previous_page: hasPreviousPage
    }
  }

  /**
   * 验证分页参数
   *
   * @param {number} page - 页码
   * @param {number} limit - 每页数量
   * @returns {Object} 验证结果
   */
  static validatePaginationParams (page, limit) {
    const errors = []

    if (page < 1) {
      errors.push('page必须大于等于1')
    }
    if (limit < 1) {
      errors.push('limit必须大于等于1')
    }
    if (limit > 100) {
      errors.push('limit不能超过100')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * 生成分页测试数据
   *
   * @param {number} totalCount - 总数据量
   * @param {number} limit - 每页数量
   * @returns {Array} 每页应该有的数据量
   */
  static generatePageSizes (totalCount, limit = 10) {
    const totalPages = Math.ceil(totalCount / limit)
    const pageSizes = []

    for (let page = 1; page <= totalPages; page++) {
      const isLastPage = page === totalPages
      const size = isLastPage ? totalCount % limit || limit : limit
      pageSizes.push({
        page,
        expectedSize: size
      })
    }

    return pageSizes
  }
}

// 导出测试工具类
module.exports = {
  PaginationTestSuite,
  PaginationHelpers
}
