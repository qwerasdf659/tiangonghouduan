'use strict'

/**
 * ProductCodeGenerator 单元测试
 *
 * 覆盖商品编码体系（docs/商品编码体系设计方案.md §3/§5）的核心生成器行为：
 * 1. generate(prefix)：规范形 = 前缀 + 12 位 Base32 随机字符、不含易混淆字符
 * 2. format(code)：规范形 → 展示形（前缀 + 4+4+4 分组）
 * 3. normalize(input)：大小写/横线/空格容错归一化
 * 4. validate(code, prefix)：格式校验
 * 5. detect(input)：搜索入口分流（是否命中 SP/SK 编码格式）
 * 6. generateUnique(prefix, checkUnique)：撞码重试与显式失败
 *
 * @module tests/unit/utils/ProductCodeGenerator.test
 */

const ProductCodeGenerator = require('../../../utils/ProductCodeGenerator')

describe('ProductCodeGenerator', () => {
  const BASE32 = ProductCodeGenerator.BASE32_CHARS

  describe('generate(prefix)', () => {
    test('生成规范形：前缀 + 12 位字符，总长 14', () => {
      const code = ProductCodeGenerator.generate('SP')
      expect(code).toMatch(new RegExp(`^SP[${BASE32}]{12}$`))
      expect(code.length).toBe(14)
    })

    test('SKU 前缀 SK 生成正确', () => {
      const code = ProductCodeGenerator.generate('SK')
      expect(code.startsWith('SK')).toBe(true)
      expect(code.length).toBe(14)
    })

    test('不含易混淆字符 0/O/I/L/1', () => {
      for (let i = 0; i < 200; i++) {
        const body = ProductCodeGenerator.generate('SP').slice(2)
        expect(body).not.toMatch(/[0OIL1]/)
      }
    })

    test('随机性：批量生成基本不重复', () => {
      const set = new Set()
      for (let i = 0; i < 1000; i++) set.add(ProductCodeGenerator.generate('SP'))
      expect(set.size).toBe(1000)
    })

    test('prefix 缺失时抛错', () => {
      expect(() => ProductCodeGenerator.generate()).toThrow()
    })
  })

  describe('format(code)', () => {
    test('规范形 → 展示形（4+4+4 分组）', () => {
      expect(ProductCodeGenerator.format('SP7K9MQ3RWX2NV')).toBe('SP-7K9M-Q3RW-X2NV')
    })

    test('已带连字符输入也能正确重排', () => {
      expect(ProductCodeGenerator.format('sp-7k9m-q3rw-x2nv')).toBe('SP-7K9M-Q3RW-X2NV')
    })
  })

  describe('normalize(input)', () => {
    test('大小写 + 横线 + 空格容错归一', () => {
      expect(ProductCodeGenerator.normalize('sp-7k9m q3rw-x2nv')).toBe('SP7K9MQ3RWX2NV')
    })

    test('空输入返回空串', () => {
      expect(ProductCodeGenerator.normalize(null)).toBe('')
      expect(ProductCodeGenerator.normalize(undefined)).toBe('')
    })
  })

  describe('validate(code, prefix)', () => {
    test('合法规范形通过', () => {
      const code = ProductCodeGenerator.generate('SP')
      expect(ProductCodeGenerator.validate(code, 'SP')).toBe(true)
    })

    test('展示形（带横线）先归一化后通过', () => {
      expect(ProductCodeGenerator.validate('SP-7K9M-Q3RW-X2NV', 'SP')).toBe(true)
    })

    test('前缀不符时失败', () => {
      expect(ProductCodeGenerator.validate('SK7K9MQ3RWX2NV', 'SP')).toBe(false)
    })

    test('包含易混淆字符 0 时失败', () => {
      expect(ProductCodeGenerator.validate('SP7K9MQ3RWX20V', 'SP')).toBe(false)
    })
  })

  describe('detect(input)', () => {
    test('命中 SP 编码', () => {
      const r = ProductCodeGenerator.detect('sp-7k9m-q3rw-x2nv')
      expect(r).toEqual({ matched: true, prefix: 'SP', normalized: 'SP7K9MQ3RWX2NV' })
    })

    test('命中 SK 编码', () => {
      const r = ProductCodeGenerator.detect('SK4N8PTX2H9QYR')
      expect(r.matched).toBe(true)
      expect(r.prefix).toBe('SK')
    })

    test('普通中文关键词不命中', () => {
      const r = ProductCodeGenerator.detect('玫瑰石英手串')
      expect(r.matched).toBe(false)
      expect(r.prefix).toBe(null)
    })
  })

  describe('generateUnique(prefix, checkUnique, maxRetries)', () => {
    test('首次即唯一时直接返回', async () => {
      const code = await ProductCodeGenerator.generateUnique('SP', async () => true)
      expect(ProductCodeGenerator.validate(code, 'SP')).toBe(true)
    })

    test('撞码后重试直至唯一', async () => {
      let calls = 0
      const code = await ProductCodeGenerator.generateUnique('SK', async () => {
        calls++
        return calls >= 3 // 前两次视为撞码
      })
      expect(calls).toBe(3)
      expect(ProductCodeGenerator.validate(code, 'SK')).toBe(true)
    })

    test('超过重试上限显式抛错', async () => {
      await expect(ProductCodeGenerator.generateUnique('SP', async () => false, 5)).rejects.toThrow(
        /重试 5 次仍有碰撞/
      )
    })
  })
})
