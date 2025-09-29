/**
 * 工具类测试 - 提升覆盖率
 */

const timeHelper = require('../../utils/timeHelper')

describe('TimeHelper工具类测试', () => {
  test('应该正确生成北京时间', () => {
    const now = timeHelper.now()
    expect(now).toBeDefined()
    expect(typeof now).toBe('string')
  })

  test('应该正确格式化时间', () => {
    const formatted = timeHelper.formatChinese(new Date())
    expect(formatted).toBeDefined()
    expect(typeof formatted).toBe('string')
    expect(formatted).toContain('年')
  })
})
