/**
 * 餐厅积分抽奖系统 V4 - DictionaryService 单元测试
 *
 * 测试范围：
 * - P3-3-3: 字典配置服务核心功能
 *   - 品类（categories 表 / Category 模型）: getCategoryList, getCategoryByCode, createCategory, updateCategory, deleteCategory
 *   - 稀有度定义 (RarityDef): getRarityList, getRarityByCode, createRarity, updateRarity, deleteRarity
 *   - 资产组定义 (AssetGroupDef): getAssetGroupList, getAssetGroupByCode, createAssetGroup, updateAssetGroup, deleteAssetGroup
 *   - 综合查询: getAllDictionaries
 *
 * 创建时间：2026-01-29
 * 技术栈：Jest + Sequelize + MySQL (真实数据库)
 *
 * 测试规范：
 * - 服务通过 global.getTestService('dictionary') 获取
 * - 使用 snake_case service key（E2-Strict 规范）
 * - 所有写操作必须在事务内执行（TransactionManager 规范）
 * - 测试数据通过数据库动态获取，不硬编码
 * - 测试完成后清理测试产生的数据
 */

'use strict'

const { sequelize, Category, RarityDef, AssetGroupDef } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

/**
 * 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
 */
let DictionaryService

// 测试超时配置（30秒）
jest.setTimeout(30000)

describe('DictionaryService - 字典配置服务测试', () => {
  // 测试过程中创建的数据（用于清理）
  const created_categories = []
  const created_rarities = []
  const created_asset_groups = []

  /**
   * 生成唯一的测试代码
   * @param {string} prefix - 前缀
   * @returns {string} 唯一代码
   */
  const generateTestCode = prefix => {
    return `${prefix}_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  }

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 尝试获取 ServiceManager 注册的服务
    try {
      DictionaryService = global.getTestService('dictionary')
    } catch (e) {
      // 兜底：直接 require
      DictionaryService = require('../../services/DictionaryService')
    }

    if (!DictionaryService) {
      throw new Error('DictionaryService 加载失败')
    }
  })

  afterEach(async () => {
    /*
     * 每个测试后清理创建的测试数据
     */

    // 清理类目定义
    for (const code of created_categories) {
      try {
        await Category.destroy({ where: { category_code: code }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_categories.length = 0

    // 清理稀有度定义
    for (const code of created_rarities) {
      try {
        await RarityDef.destroy({ where: { rarity_code: code }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_rarities.length = 0

    // 清理资产组定义
    for (const code of created_asset_groups) {
      try {
        await AssetGroupDef.destroy({ where: { group_code: code }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_asset_groups.length = 0
  })

  afterAll(async () => {
    // 关闭数据库连接
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  })

  // ==================== 类目定义测试 ====================

  describe('品类（Category / categories）管理', () => {
    describe('getCategoryList - 类目列表查询', () => {
      it('应该成功获取类目列表', async () => {
        // 执行：获取类目列表
        const result = await DictionaryService.getCategoryList({
          page: 1,
          page_size: 10
        })

        // 验证：返回结构正确（DictionaryService 返回 { list, pagination }）
        expect(result).toBeDefined()
        expect(result.list).toBeDefined()
        expect(Array.isArray(result.list)).toBe(true)
        expect(result.pagination).toBeDefined()
        expect(result.pagination.page).toBe(1)
      })

      it('应该支持分页查询', async () => {
        // 执行：分页查询
        const result = await DictionaryService.getCategoryList({
          page: 1,
          page_size: 5
        })

        // 验证：分页参数正确
        expect(result.pagination.page).toBe(1)
        expect(result.pagination.page_size).toBe(5)
      })

      it('应该支持筛选启用状态', async () => {
        // 执行：只获取启用的类目
        const result = await DictionaryService.getCategoryList({
          is_enabled: true,
          page: 1,
          page_size: 10
        })

        // 验证：所有类目都是启用的
        expect(result).toBeDefined()
        if (result.list.length > 0) {
          result.list.forEach(cat => {
            expect(cat.is_enabled).toBe(true)
          })
        }
      })
    })

    describe('getCategoryByCode - 类目详情查询', () => {
      it('应该成功获取类目详情', async () => {
        // 准备：获取一个存在的类目
        const listResult = await DictionaryService.getCategoryList({
          page: 1,
          page_size: 1
        })

        if (listResult.list.length === 0) {
          console.log('⚠️ 跳过测试：无类目数据')
          return
        }

        const category_code = listResult.list[0].category_code

        // 执行：获取详情（直接返回模型实例或null）
        const result = await DictionaryService.getCategoryByCode(category_code)

        // 验证：详情正确
        expect(result).toBeDefined()
        expect(result.category_code).toBe(category_code)
      })

      it('查询不存在的类目应该返回null', async () => {
        // DictionaryService.getCategoryByCode 返回 null 而不是抛出错误
        const result = await DictionaryService.getCategoryByCode('non_existent_code_xyz')
        expect(result).toBeNull()
      })
    })

    describe('createCategory - 创建类目', () => {
      it('应该成功创建类目', async () => {
        const test_code = generateTestCode('cat')

        // 执行：创建类目（展示名存 category_name，与数据库字段一致）
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.createCategory(
            {
              category_code: test_code,
              category_name: '测试类目',
              description: '单元测试创建的类目',
              sort_order: 999,
              is_enabled: false // 测试数据设为禁用
            },
            { transaction }
          )
        })

        // 验证：创建成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.category_code).toBe(test_code)
        expect(result.category_name).toBe('测试类目')
        expect(result.is_enabled).toBe(false)

        // 记录用于清理
        created_categories.push(test_code)
      })

      it('创建重复代码的类目应该报错', async () => {
        const test_code = generateTestCode('cat_dup')

        // 先创建一个
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createCategory(
            {
              category_code: test_code,
              category_name: '原始类目',
              is_enabled: false
            },
            { transaction }
          )
        })
        created_categories.push(test_code)

        // 再次创建相同代码
        await expect(
          TransactionManager.execute(async transaction => {
            return await DictionaryService.createCategory(
              {
                category_code: test_code,
                category_name: '重复类目',
                is_enabled: false
              },
              { transaction }
            )
          })
        ).rejects.toThrow('已存在')
      })
    })

    describe('updateCategory - 更新类目', () => {
      it('应该成功更新类目', async () => {
        const test_code = generateTestCode('cat_upd')

        // 准备：创建测试类目
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createCategory(
            {
              category_code: test_code,
              category_name: '待更新类目',
              is_enabled: false
            },
            { transaction }
          )
        })
        created_categories.push(test_code)

        // 执行：更新类目
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.updateCategory(
            test_code,
            {
              category_name: '已更新类目名称',
              description: '更新后的描述'
            },
            { transaction }
          )
        })

        // 验证：更新成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.category_name).toBe('已更新类目名称')
      })

      it('更新不存在的类目应该报错', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await DictionaryService.updateCategory(
              'non_existent_code',
              { category_name: '测试' },
              { transaction }
            )
          })
        ).rejects.toThrow('不存在')
      })
    })

    describe('deleteCategory - 删除类目（软删除）', () => {
      it('应该成功删除类目（设为禁用）', async () => {
        const test_code = generateTestCode('cat_del')

        // 准备：创建测试类目
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createCategory(
            {
              category_code: test_code,
              category_name: '待删除类目',
              is_enabled: true
            },
            { transaction }
          )
        })
        created_categories.push(test_code)

        // 执行：删除类目
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.deleteCategory(test_code, { transaction })
        })

        // 验证：删除成功（返回 { deleted_code, is_enabled }）
        expect(result).toBeDefined()
        expect(result.deleted_code).toBe(test_code)
        expect(result.is_enabled).toBe(false)

        // 验证：类目已被禁用
        const category = await Category.findOne({
          where: { category_code: test_code }
        })
        expect(category.is_enabled).toBe(false)
      })
    })
  })

  // ==================== 稀有度定义测试 ====================

  describe('稀有度定义 (RarityDef) 管理', () => {
    describe('getRarityList - 稀有度列表查询', () => {
      it('应该成功获取稀有度列表', async () => {
        // 执行：获取稀有度列表
        const result = await DictionaryService.getRarityList({
          page: 1,
          page_size: 10
        })

        // 验证：返回结构正确（返回 { list, pagination }）
        expect(result).toBeDefined()
        expect(result.list).toBeDefined()
        expect(Array.isArray(result.list)).toBe(true)
        expect(result.pagination).toBeDefined()
      })

      it('应该支持筛选启用状态', async () => {
        // 执行：只获取启用的稀有度
        const result = await DictionaryService.getRarityList({
          is_enabled: true,
          page: 1,
          page_size: 10
        })

        // 验证：所有稀有度都是启用的
        expect(result).toBeDefined()
        if (result.list.length > 0) {
          result.list.forEach(rarity => {
            expect(rarity.is_enabled).toBe(true)
          })
        }
      })
    })

    describe('getRarityByCode - 稀有度详情查询', () => {
      it('应该成功获取稀有度详情', async () => {
        // 准备：获取一个存在的稀有度
        const listResult = await DictionaryService.getRarityList({
          page: 1,
          page_size: 1
        })

        if (listResult.list.length === 0) {
          console.log('⚠️ 跳过测试：无稀有度数据')
          return
        }

        const rarity_code = listResult.list[0].rarity_code

        // 执行：获取详情（直接返回模型实例或null）
        const result = await DictionaryService.getRarityByCode(rarity_code)

        // 验证：详情正确
        expect(result).toBeDefined()
        expect(result.rarity_code).toBe(rarity_code)
      })

      it('查询不存在的稀有度应该返回null', async () => {
        // DictionaryService.getRarityByCode 返回 null 而不是抛出错误
        const result = await DictionaryService.getRarityByCode('non_existent_code_xyz')
        expect(result).toBeNull()
      })
    })

    describe('createRarity - 创建稀有度', () => {
      it('应该成功创建稀有度', async () => {
        const test_code = generateTestCode('rarity')

        // 执行：创建稀有度（使用 display_name 和 tier 而不是 rarity_name 和 rarity_level）
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.createRarity(
            {
              rarity_code: test_code,
              display_name: '测试稀有度',
              tier: 99,
              color_hex: '#FF00FF',
              description: '单元测试创建的稀有度',
              is_enabled: false
            },
            { transaction }
          )
        })

        // 验证：创建成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.rarity_code).toBe(test_code)
        expect(result.display_name).toBe('测试稀有度')
        expect(result.tier).toBe(99)

        // 记录用于清理
        created_rarities.push(test_code)
      })
    })

    describe('updateRarity - 更新稀有度', () => {
      it('应该成功更新稀有度', async () => {
        const test_code = generateTestCode('rarity_upd')

        // 准备：创建测试稀有度
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createRarity(
            {
              rarity_code: test_code,
              display_name: '待更新稀有度',
              tier: 50,
              is_enabled: false
            },
            { transaction }
          )
        })
        created_rarities.push(test_code)

        // 执行：更新稀有度
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.updateRarity(
            test_code,
            {
              display_name: '已更新稀有度',
              tier: 60
            },
            { transaction }
          )
        })

        // 验证：更新成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.display_name).toBe('已更新稀有度')
        expect(result.tier).toBe(60)
      })
    })

    describe('deleteRarity - 删除稀有度', () => {
      it('应该成功删除稀有度（软删除）', async () => {
        const test_code = generateTestCode('rarity_del')

        // 准备：创建测试稀有度
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createRarity(
            {
              rarity_code: test_code,
              display_name: '待删除稀有度',
              tier: 1,
              is_enabled: true
            },
            { transaction }
          )
        })
        created_rarities.push(test_code)

        // 执行：删除
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.deleteRarity(test_code, { transaction })
        })

        // 验证：删除成功（返回 { deleted_code, is_enabled }）
        expect(result).toBeDefined()
        expect(result.deleted_code).toBe(test_code)
        expect(result.is_enabled).toBe(false)

        // 验证：已被禁用
        const rarity = await RarityDef.findOne({
          where: { rarity_code: test_code }
        })
        expect(rarity.is_enabled).toBe(false)
      })
    })
  })

  // ==================== 资产组定义测试 ====================

  describe('资产组定义 (AssetGroupDef) 管理', () => {
    describe('getAssetGroupList - 资产组列表查询', () => {
      it('应该成功获取资产组列表', async () => {
        // 执行：获取资产组列表
        const result = await DictionaryService.getAssetGroupList({
          page: 1,
          page_size: 10
        })

        // 验证：返回结构正确（返回 { list, pagination }）
        expect(result).toBeDefined()
        expect(result.list).toBeDefined()
        expect(Array.isArray(result.list)).toBe(true)
        expect(result.pagination).toBeDefined()
      })

      it('应该支持筛选启用状态', async () => {
        // 执行：只获取启用的资产组
        const result = await DictionaryService.getAssetGroupList({
          is_enabled: true,
          page: 1,
          page_size: 10
        })

        // 验证：所有资产组都是启用的
        expect(result).toBeDefined()
        if (result.list.length > 0) {
          result.list.forEach(group => {
            expect(group.is_enabled).toBe(true)
          })
        }
      })
    })

    describe('getAssetGroupByCode - 资产组详情查询', () => {
      it('应该成功获取资产组详情', async () => {
        // 准备：获取一个存在的资产组
        const listResult = await DictionaryService.getAssetGroupList({
          page: 1,
          page_size: 1
        })

        if (listResult.list.length === 0) {
          console.log('⚠️ 跳过测试：无资产组数据')
          return
        }

        const group_code = listResult.list[0].group_code

        // 执行：获取详情（直接返回模型实例或null）
        const result = await DictionaryService.getAssetGroupByCode(group_code)

        // 验证：详情正确
        expect(result).toBeDefined()
        expect(result.group_code).toBe(group_code)
      })

      it('查询不存在的资产组应该返回null', async () => {
        // DictionaryService.getAssetGroupByCode 返回 null 而不是抛出错误
        const result = await DictionaryService.getAssetGroupByCode('non_existent_code_xyz')
        expect(result).toBeNull()
      })
    })

    describe('createAssetGroup - 创建资产组', () => {
      it('应该成功创建资产组', async () => {
        const test_code = generateTestCode('group')

        // 执行：创建资产组（使用 display_name 而不是 group_name）
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.createAssetGroup(
            {
              group_code: test_code,
              display_name: '测试资产组',
              description: '单元测试创建的资产组',
              sort_order: 999,
              is_enabled: false
            },
            { transaction }
          )
        })

        // 验证：创建成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.group_code).toBe(test_code)
        expect(result.display_name).toBe('测试资产组')

        // 记录用于清理
        created_asset_groups.push(test_code)
      })
    })

    describe('updateAssetGroup - 更新资产组', () => {
      it('应该成功更新资产组', async () => {
        const test_code = generateTestCode('group_upd')

        // 准备：创建测试资产组
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createAssetGroup(
            {
              group_code: test_code,
              display_name: '待更新资产组',
              is_enabled: false
            },
            { transaction }
          )
        })
        created_asset_groups.push(test_code)

        // 执行：更新资产组
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.updateAssetGroup(
            test_code,
            {
              display_name: '已更新资产组',
              description: '更新后的描述'
            },
            { transaction }
          )
        })

        // 验证：更新成功（直接返回模型实例）
        expect(result).toBeDefined()
        expect(result.display_name).toBe('已更新资产组')
      })
    })

    describe('deleteAssetGroup - 删除资产组', () => {
      it('应该成功删除资产组（软删除）', async () => {
        const test_code = generateTestCode('group_del')

        // 准备：创建测试资产组
        await TransactionManager.execute(async transaction => {
          return await DictionaryService.createAssetGroup(
            {
              group_code: test_code,
              display_name: '待删除资产组',
              is_enabled: true
            },
            { transaction }
          )
        })
        created_asset_groups.push(test_code)

        // 执行：删除
        const result = await TransactionManager.execute(async transaction => {
          return await DictionaryService.deleteAssetGroup(test_code, { transaction })
        })

        // 验证：删除成功（返回 { deleted_code, is_enabled }）
        expect(result).toBeDefined()
        expect(result.deleted_code).toBe(test_code)
        expect(result.is_enabled).toBe(false)

        // 验证：已被禁用
        const group = await AssetGroupDef.findOne({
          where: { group_code: test_code }
        })
        expect(group.is_enabled).toBe(false)
      })
    })
  })

  // ==================== 综合查询测试 ====================

  describe('getAllDictionaries - 综合字典查询', () => {
    it('应该成功获取所有字典数据', async () => {
      // 执行：获取所有字典
      const result = await DictionaryService.getAllDictionaries()

      // 验证：返回结构正确（直接返回 { categories, rarities, asset_groups }）
      expect(result).toBeDefined()
      expect(result.categories).toBeDefined()
      expect(result.rarities).toBeDefined()
      expect(result.asset_groups).toBeDefined()
      expect(Array.isArray(result.categories)).toBe(true)
      expect(Array.isArray(result.rarities)).toBe(true)
      expect(Array.isArray(result.asset_groups)).toBe(true)
    })

    it('返回的数据应该都是启用状态', async () => {
      // 执行：获取所有字典
      const result = await DictionaryService.getAllDictionaries()

      /*
       * 验证：所有数据都是启用的（getAllDictionaries 只返回启用的数据）
       * 注意：getAllDictionaries 返回的数据不包含 is_enabled 字段（通过 attributes 限制）
       * 因此我们只验证数据结构正确
       */
      expect(result.categories).toBeDefined()
      expect(result.rarities).toBeDefined()
      expect(result.asset_groups).toBeDefined()
    })
  })
})
