'use strict'

/**
 * SeriesSeqAllocator 单元测试（仅覆盖纯函数 format）
 *
 * allocate() 依赖数据库行锁事务，属集成范畴，不在单测覆盖（避免连库）。
 * 本测试聚焦展示形系列号拼装逻辑（docs/商品编码体系设计方案.md §3.6）。
 *
 * @module tests/unit/utils/SeriesSeqAllocator.test
 */

const SeriesSeqAllocator = require('../../../utils/SeriesSeqAllocator')

describe('SeriesSeqAllocator.format', () => {
  test('默认补零 3 位', () => {
    expect(SeriesSeqAllocator.format('SLNB', 1)).toBe('SLNB-001')
    expect(SeriesSeqAllocator.format('SLNB', 42)).toBe('SLNB-042')
    expect(SeriesSeqAllocator.format('SLNB', 999)).toBe('SLNB-999')
  })

  test('超出补零位数时按原值展示（不截断）', () => {
    expect(SeriesSeqAllocator.format('SLNB', 1000)).toBe('SLNB-1000')
  })

  test('自定义补零位数', () => {
    expect(SeriesSeqAllocator.format('SLNB', 7, 4)).toBe('SLNB-0007')
  })

  test('系列码统一大写', () => {
    expect(SeriesSeqAllocator.format('slnb', 3)).toBe('SLNB-003')
  })

  test('缺参返回空串', () => {
    expect(SeriesSeqAllocator.format('', 1)).toBe('')
    expect(SeriesSeqAllocator.format('SLNB', null)).toBe('')
  })
})
