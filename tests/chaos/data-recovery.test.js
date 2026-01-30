/**
 * 🔄 数据不一致恢复测试 - P2-5.3
 *
 * 测试范围：
 * - 异常数据检测机制验证
 * - 数据修复流程验证
 * - 数据一致性校验验证
 * - 增量恢复机制验证
 *
 * 审计标准：
 * - C-3：数据不一致恢复测试
 * - C-3-1：异常数据检测
 * - C-3-2：数据修复流程
 * - C-3-3：一致性校验
 * - C-3-4：增量恢复
 *
 * 业务场景：
 * - 事务部分成功导致的数据不一致
 * - 缓存与数据库数据不同步
 * - 主从延迟导致的数据不一致
 * - 并发更新导致的数据冲突
 *
 * 验收标准：
 * - npm test -- tests/chaos/data-recovery.test.js 全部通过
 * - 能正确检测数据不一致问题
 * - 能正确执行数据修复流程
 * - 修复后数据一致性验证通过
 *
 * @module tests/chaos/data-recovery
 * @since 2026-01-30
 */

'use strict'

const { delay, executeConcurrent } = require('../helpers/test-concurrent-utils')

// 数据恢复测试需要较长超时
jest.setTimeout(180000)

describe('🔄 数据不一致恢复测试（P2-5.3）', () => {
  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('🔄 ===== 数据不一致恢复测试启动 =====')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('='.repeat(70))
  })

  afterAll(async () => {
    console.log('🏁 ===== 数据不一致恢复测试完成 =====')
    console.log(`📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  })

  // ==================== C-3-1: 异常数据检测 ====================

  describe('C-3-1 异常数据检测', () => {
    /**
     * 业务场景：检测事务部分成功导致的数据不一致
     * 验证目标：能检测出订单与库存不一致的情况
     *
     * 业务规则：
     * - 订单状态为"已完成"时，库存必须已扣减
     * - 库存扣减记录必须与订单对应
     */
    test('事务部分成功 - 订单与库存不一致检测', async () => {
      console.log('')
      console.log('📋 C-3-1-1 事务部分成功检测:')
      console.log('   模拟场景: 订单创建成功但库存未扣减')
      console.log('')

      // 模拟数据库表
      const mockDatabase = {
        orders: [
          {
            order_id: 'ORD-001',
            user_id: 1,
            status: 'completed',
            amount: 100,
            product_id: 'P001',
            quantity: 2
          },
          {
            order_id: 'ORD-002',
            user_id: 2,
            status: 'completed',
            amount: 200,
            product_id: 'P002',
            quantity: 1
          },
          {
            order_id: 'ORD-003',
            user_id: 3,
            status: 'completed',
            amount: 150,
            product_id: 'P001',
            quantity: 3
          } // 异常：库存未扣减
        ],
        inventory_transactions: [
          {
            transaction_id: 'INV-001',
            order_id: 'ORD-001',
            product_id: 'P001',
            quantity_change: -2,
            type: 'deduct'
          },
          {
            transaction_id: 'INV-002',
            order_id: 'ORD-002',
            product_id: 'P002',
            quantity_change: -1,
            type: 'deduct'
          }
          // ORD-003 缺失对应的库存扣减记录
        ],
        inventory: [
          { product_id: 'P001', quantity: 100 },
          { product_id: 'P002', quantity: 50 }
        ]
      }

      // 数据一致性检测器
      const consistencyChecker = {
        async checkOrderInventoryConsistency(db) {
          const inconsistencies = []

          // 检查每个已完成订单是否有对应的库存扣减记录
          const completedOrders = db.orders.filter(o => o.status === 'completed')

          for (const order of completedOrders) {
            const inventoryTx = db.inventory_transactions.find(
              t => t.order_id === order.order_id && t.product_id === order.product_id
            )

            if (!inventoryTx) {
              inconsistencies.push({
                type: 'MISSING_INVENTORY_TRANSACTION',
                severity: 'critical',
                order_id: order.order_id,
                product_id: order.product_id,
                expected_quantity: -order.quantity,
                actual_quantity: 0,
                message: `订单${order.order_id}已完成但缺失库存扣减记录`
              })
            } else if (inventoryTx.quantity_change !== -order.quantity) {
              inconsistencies.push({
                type: 'QUANTITY_MISMATCH',
                severity: 'critical',
                order_id: order.order_id,
                product_id: order.product_id,
                expected_quantity: -order.quantity,
                actual_quantity: inventoryTx.quantity_change,
                message: `订单${order.order_id}库存扣减数量不匹配`
              })
            }
          }

          return {
            checked: completedOrders.length,
            inconsistencies,
            isConsistent: inconsistencies.length === 0
          }
        }
      }

      // 执行检测
      console.log('   📊 执行订单-库存一致性检测...')
      const result = await consistencyChecker.checkOrderInventoryConsistency(mockDatabase)

      console.log(`   📊 检查订单数: ${result.checked}`)
      console.log(`   📊 发现不一致: ${result.inconsistencies.length}`)

      expect(result.isConsistent).toBe(false)
      expect(result.inconsistencies.length).toBe(1)

      const inconsistency = result.inconsistencies[0]
      expect(inconsistency.type).toBe('MISSING_INVENTORY_TRANSACTION')
      expect(inconsistency.order_id).toBe('ORD-003')
      expect(inconsistency.severity).toBe('critical')

      console.log('')
      console.log('   📋 发现的不一致问题:')
      result.inconsistencies.forEach(inc => {
        console.log(`      🔴 ${inc.type}: ${inc.message}`)
        console.log(`         订单: ${inc.order_id}, 产品: ${inc.product_id}`)
        console.log(`         预期: ${inc.expected_quantity}, 实际: ${inc.actual_quantity}`)
      })

      console.log('')
      console.log('   ✅ 事务部分成功检测验证通过')
    })

    /**
     * 业务场景：检测缓存与数据库数据不同步
     * 验证目标：能检测出缓存中的数据与数据库不一致
     */
    test('缓存与数据库不同步检测', async () => {
      console.log('')
      console.log('📋 C-3-1-2 缓存数据库同步检测:')
      console.log('   模拟场景: 缓存中的用户余额与数据库不一致')
      console.log('')

      // 模拟数据库
      const mockDatabase = {
        users: [
          { user_id: 1, balance: 1000 },
          { user_id: 2, balance: 2000 },
          { user_id: 3, balance: 500 }
        ]
      }

      // 模拟缓存（部分数据过期或不一致）
      const mockCache = {
        'user:1:balance': 1000, // 一致
        'user:2:balance': 2500, // 不一致（数据库已更新但缓存未同步）
        'user:3:balance': 500 // 一致
      }

      // 缓存一致性检测器
      const cacheSyncChecker = {
        async checkCacheDatabaseSync(db, cache, config = {}) {
          const { tolerance = 0 } = config // 允许的误差范围
          const inconsistencies = []
          const checkedItems = []

          for (const user of db.users) {
            const cacheKey = `user:${user.user_id}:balance`
            const cachedValue = cache[cacheKey]

            const checkResult = {
              user_id: user.user_id,
              cache_key: cacheKey,
              db_value: user.balance,
              cache_value: cachedValue
            }

            if (cachedValue === undefined) {
              // 缓存缺失（可能是正常的缓存未命中）
              checkResult.status = 'cache_miss'
            } else if (Math.abs(cachedValue - user.balance) <= tolerance) {
              checkResult.status = 'consistent'
            } else {
              checkResult.status = 'inconsistent'
              inconsistencies.push({
                type: 'CACHE_DATABASE_MISMATCH',
                severity: 'high',
                user_id: user.user_id,
                cache_key: cacheKey,
                db_value: user.balance,
                cache_value: cachedValue,
                difference: cachedValue - user.balance,
                message: `用户${user.user_id}缓存余额${cachedValue}与数据库${user.balance}不一致`
              })
            }

            checkedItems.push(checkResult)
          }

          return {
            checked: checkedItems.length,
            checkedItems,
            inconsistencies,
            isConsistent: inconsistencies.length === 0,
            stats: {
              consistent: checkedItems.filter(i => i.status === 'consistent').length,
              inconsistent: checkedItems.filter(i => i.status === 'inconsistent').length,
              cacheMiss: checkedItems.filter(i => i.status === 'cache_miss').length
            }
          }
        }
      }

      // 执行检测
      console.log('   📊 执行缓存-数据库同步检测...')
      const result = await cacheSyncChecker.checkCacheDatabaseSync(mockDatabase, mockCache)

      console.log(`   📊 检查用户数: ${result.checked}`)
      console.log(`   📊 一致: ${result.stats.consistent}`)
      console.log(`   📊 不一致: ${result.stats.inconsistent}`)
      console.log(`   📊 缓存缺失: ${result.stats.cacheMiss}`)

      expect(result.isConsistent).toBe(false)
      expect(result.inconsistencies.length).toBe(1)

      const inconsistency = result.inconsistencies[0]
      expect(inconsistency.user_id).toBe(2)
      expect(inconsistency.difference).toBe(500) // 缓存比数据库多500

      console.log('')
      console.log('   📋 发现的不一致:')
      result.inconsistencies.forEach(inc => {
        console.log(
          `      🔴 用户${inc.user_id}: 缓存=${inc.cache_value}, 数据库=${inc.db_value}, 差异=${inc.difference}`
        )
      })

      console.log('')
      console.log('   ✅ 缓存数据库同步检测验证通过')
    })

    /**
     * 业务场景：检测账户余额负数异常
     * 验证目标：能检测出不应该出现的负数余额
     */
    test('业务规则违规检测 - 负数余额', async () => {
      console.log('')
      console.log('📋 C-3-1-3 业务规则违规检测:')
      console.log('   模拟场景: 检测账户余额为负数的异常情况')
      console.log('')

      // 模拟账户数据
      const mockAccounts = [
        { account_id: 1, user_id: 101, balance: 1000, frozen: 0 },
        { account_id: 2, user_id: 102, balance: -50, frozen: 0 }, // 异常：负数余额
        { account_id: 3, user_id: 103, balance: 500, frozen: 600 }, // 异常：冻结金额超过余额
        { account_id: 4, user_id: 104, balance: 2000, frozen: 500 } // 正常
      ]

      // 业务规则检测器
      const businessRuleChecker = {
        rules: {
          // 余额不能为负
          POSITIVE_BALANCE: {
            name: '余额非负规则',
            severity: 'critical',
            check: account => account.balance >= 0,
            getMessage: account => `账户${account.account_id}余额为负: ${account.balance}`
          },
          // 冻结金额不能超过余额
          FROZEN_WITHIN_BALANCE: {
            name: '冻结金额规则',
            severity: 'high',
            check: account => account.frozen <= account.balance,
            getMessage: account =>
              `账户${account.account_id}冻结金额${account.frozen}超过余额${account.balance}`
          },
          // 可用余额不能为负
          AVAILABLE_NON_NEGATIVE: {
            name: '可用余额规则',
            severity: 'high',
            check: account => account.balance - account.frozen >= 0,
            getMessage: account =>
              `账户${account.account_id}可用余额为负: ${account.balance - account.frozen}`
          }
        },

        async checkAccounts(accounts) {
          const violations = []
          const checkResults = []

          for (const account of accounts) {
            const accountViolations = []

            for (const [ruleKey, rule] of Object.entries(this.rules)) {
              if (!rule.check(account)) {
                accountViolations.push({
                  rule: ruleKey,
                  ruleName: rule.name,
                  severity: rule.severity,
                  account_id: account.account_id,
                  user_id: account.user_id,
                  message: rule.getMessage(account),
                  data: { balance: account.balance, frozen: account.frozen }
                })
              }
            }

            checkResults.push({
              account_id: account.account_id,
              passed: accountViolations.length === 0,
              violations: accountViolations
            })

            violations.push(...accountViolations)
          }

          return {
            checked: accounts.length,
            violations,
            checkResults,
            isValid: violations.length === 0,
            stats: {
              passed: checkResults.filter(r => r.passed).length,
              failed: checkResults.filter(r => !r.passed).length,
              criticalViolations: violations.filter(v => v.severity === 'critical').length,
              highViolations: violations.filter(v => v.severity === 'high').length
            }
          }
        }
      }

      // 执行检测
      console.log('   📊 执行业务规则检测...')
      const result = await businessRuleChecker.checkAccounts(mockAccounts)

      console.log(`   📊 检查账户数: ${result.checked}`)
      console.log(`   📊 通过: ${result.stats.passed}`)
      console.log(`   📊 失败: ${result.stats.failed}`)
      console.log(`   📊 严重违规: ${result.stats.criticalViolations}`)
      console.log(`   📊 高危违规: ${result.stats.highViolations}`)

      expect(result.isValid).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
      expect(result.stats.criticalViolations).toBe(1) // 负数余额
      expect(result.stats.highViolations).toBeGreaterThanOrEqual(1) // 冻结超额

      console.log('')
      console.log('   📋 发现的违规:')
      result.violations.forEach(v => {
        const icon = v.severity === 'critical' ? '🔴' : '🟡'
        console.log(`      ${icon} [${v.severity.toUpperCase()}] ${v.ruleName}: ${v.message}`)
      })

      console.log('')
      console.log('   ✅ 业务规则违规检测验证通过')
    })
  })

  // ==================== C-3-2: 数据修复流程 ====================

  describe('C-3-2 数据修复流程', () => {
    /**
     * 业务场景：自动修复库存扣减缺失
     * 验证目标：能正确创建缺失的库存扣减记录
     */
    test('自动修复 - 创建缺失的库存扣减记录', async () => {
      console.log('')
      console.log('📋 C-3-2-1 自动修复库存记录:')
      console.log('   模拟场景: 补充缺失的库存扣减记录')
      console.log('')

      // 模拟数据库（可变）
      const mockDatabase = {
        orders: [
          { order_id: 'ORD-001', status: 'completed', product_id: 'P001', quantity: 2 },
          { order_id: 'ORD-002', status: 'completed', product_id: 'P002', quantity: 1 },
          { order_id: 'ORD-003', status: 'completed', product_id: 'P001', quantity: 3 } // 缺失记录
        ],
        inventory_transactions: [
          {
            transaction_id: 'INV-001',
            order_id: 'ORD-001',
            product_id: 'P001',
            quantity_change: -2
          },
          {
            transaction_id: 'INV-002',
            order_id: 'ORD-002',
            product_id: 'P002',
            quantity_change: -1
          }
        ],
        inventory: [
          { product_id: 'P001', quantity: 100 },
          { product_id: 'P002', quantity: 50 }
        ],
        repair_logs: []
      }

      // 数据修复器
      const dataRepairer = {
        generateTransactionId() {
          return `INV-REPAIR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
        },

        async repairMissingInventoryTransactions(db, dryRun = false) {
          const repairs = []

          // 找出所有已完成订单
          const completedOrders = db.orders.filter(o => o.status === 'completed')

          for (const order of completedOrders) {
            const existingTx = db.inventory_transactions.find(
              t => t.order_id === order.order_id && t.product_id === order.product_id
            )

            if (!existingTx) {
              const repairRecord = {
                transaction_id: this.generateTransactionId(),
                order_id: order.order_id,
                product_id: order.product_id,
                quantity_change: -order.quantity,
                type: 'deduct',
                is_repair: true,
                repaired_at: new Date().toISOString(),
                repair_reason: '事务部分成功修复'
              }

              repairs.push(repairRecord)

              if (!dryRun) {
                // 创建库存扣减记录
                db.inventory_transactions.push(repairRecord)

                // 更新库存
                const inventory = db.inventory.find(i => i.product_id === order.product_id)
                if (inventory) {
                  inventory.quantity += repairRecord.quantity_change
                }

                // 记录修复日志
                db.repair_logs.push({
                  repair_id: repairRecord.transaction_id,
                  repair_type: 'MISSING_INVENTORY_TRANSACTION',
                  target_order_id: order.order_id,
                  action: 'CREATE_TRANSACTION',
                  timestamp: new Date().toISOString(),
                  details: repairRecord
                })
              }
            }
          }

          return {
            dryRun,
            repairsNeeded: repairs.length,
            repairs,
            success: true
          }
        }
      }

      // 修复前状态
      console.log('   📊 修复前状态:')
      console.log(`      库存记录数: ${mockDatabase.inventory_transactions.length}`)
      console.log(
        `      P001库存: ${mockDatabase.inventory.find(i => i.product_id === 'P001').quantity}`
      )

      // 先执行干运行
      console.log('')
      console.log('   📊 执行干运行（预览）...')
      const dryRunResult = await dataRepairer.repairMissingInventoryTransactions(mockDatabase, true)

      console.log(`      需要修复: ${dryRunResult.repairsNeeded}条记录`)
      expect(dryRunResult.repairsNeeded).toBe(1)

      // 执行实际修复
      console.log('')
      console.log('   📊 执行实际修复...')
      const repairResult = await dataRepairer.repairMissingInventoryTransactions(
        mockDatabase,
        false
      )

      console.log(`      修复完成: ${repairResult.repairs.length}条记录`)

      // 验证修复结果
      const repairedTx = mockDatabase.inventory_transactions.find(
        t => t.order_id === 'ORD-003' && t.is_repair
      )
      expect(repairedTx).toBeDefined()
      expect(repairedTx.quantity_change).toBe(-3)

      // 验证库存已更新
      const p001Inventory = mockDatabase.inventory.find(i => i.product_id === 'P001')
      expect(p001Inventory.quantity).toBe(97) // 100 - 3

      // 验证修复日志
      expect(mockDatabase.repair_logs.length).toBe(1)

      console.log('')
      console.log('   📊 修复后状态:')
      console.log(`      库存记录数: ${mockDatabase.inventory_transactions.length}`)
      console.log(`      P001库存: ${p001Inventory.quantity}`)
      console.log(`      修复日志: ${mockDatabase.repair_logs.length}条`)

      console.log('')
      console.log('   ✅ 自动修复库存记录验证通过')
    })

    /**
     * 业务场景：缓存同步修复
     * 验证目标：能正确同步缓存与数据库数据
     */
    test('缓存同步修复 - 更新过期缓存', async () => {
      console.log('')
      console.log('📋 C-3-2-2 缓存同步修复:')
      console.log('   模拟场景: 将缓存数据同步为数据库最新值')
      console.log('')

      // 模拟数据库
      const mockDatabase = {
        users: [
          { user_id: 1, balance: 1000 },
          { user_id: 2, balance: 2000 },
          { user_id: 3, balance: 500 }
        ]
      }

      // 模拟缓存（可变）
      const mockCache = {
        data: {
          'user:1:balance': 1000, // 一致
          'user:2:balance': 2500, // 不一致
          'user:3:balance': 500 // 一致
        },

        get(key) {
          return this.data[key]
        },

        set(key, value, _ttl) {
          this.data[key] = value
        },

        delete(key) {
          delete this.data[key]
        }
      }

      // 缓存修复器
      const cacheRepairer = {
        repairLogs: [],

        async syncCacheWithDatabase(db, cache, config = {}) {
          const { strategy = 'update' } = config // update: 更新缓存, invalidate: 失效缓存
          const repairs = []

          for (const user of db.users) {
            const cacheKey = `user:${user.user_id}:balance`
            const cachedValue = cache.get(cacheKey)

            if (cachedValue !== undefined && cachedValue !== user.balance) {
              const repair = {
                cache_key: cacheKey,
                old_value: cachedValue,
                new_value: user.balance,
                strategy,
                user_id: user.user_id,
                timestamp: new Date().toISOString()
              }

              if (strategy === 'update') {
                cache.set(cacheKey, user.balance, 3600)
                repair.action = 'UPDATED'
              } else if (strategy === 'invalidate') {
                cache.delete(cacheKey)
                repair.action = 'INVALIDATED'
              }

              repairs.push(repair)
              this.repairLogs.push(repair)
            }
          }

          return {
            strategy,
            repairsCount: repairs.length,
            repairs,
            success: true
          }
        },

        getRepairLogs() {
          return this.repairLogs
        }
      }

      // 修复前检查
      console.log('   📊 修复前缓存状态:')
      mockDatabase.users.forEach(user => {
        const cacheKey = `user:${user.user_id}:balance`
        const cachedValue = mockCache.get(cacheKey)
        const match = cachedValue === user.balance ? '✅' : '❌'
        console.log(
          `      ${match} 用户${user.user_id}: 缓存=${cachedValue}, 数据库=${user.balance}`
        )
      })

      // 执行修复
      console.log('')
      console.log('   📊 执行缓存同步修复...')
      const repairResult = await cacheRepairer.syncCacheWithDatabase(mockDatabase, mockCache, {
        strategy: 'update'
      })

      console.log(`      修复数量: ${repairResult.repairsCount}`)

      // 验证修复结果
      expect(repairResult.repairsCount).toBe(1)
      expect(mockCache.get('user:2:balance')).toBe(2000)

      // 修复后检查
      console.log('')
      console.log('   📊 修复后缓存状态:')
      let allConsistent = true
      mockDatabase.users.forEach(user => {
        const cacheKey = `user:${user.user_id}:balance`
        const cachedValue = mockCache.get(cacheKey)
        const match = cachedValue === user.balance
        if (!match) allConsistent = false
        console.log(
          `      ${match ? '✅' : '❌'} 用户${user.user_id}: 缓存=${cachedValue}, 数据库=${user.balance}`
        )
      })

      expect(allConsistent).toBe(true)

      // 查看修复日志
      console.log('')
      console.log('   📊 修复日志:')
      repairResult.repairs.forEach(r => {
        console.log(`      用户${r.user_id}: ${r.old_value} → ${r.new_value} (${r.action})`)
      })

      console.log('')
      console.log('   ✅ 缓存同步修复验证通过')
    })

    /**
     * 业务场景：负数余额修复
     * 验证目标：能安全处理负数余额问题
     */
    test('业务数据修复 - 负数余额处理', async () => {
      console.log('')
      console.log('📋 C-3-2-3 负数余额修复:')
      console.log('   模拟场景: 处理异常的负数余额')
      console.log('')

      // 模拟账户数据（可变）
      const mockAccounts = [
        { account_id: 1, user_id: 101, balance: 1000, frozen: 0 },
        { account_id: 2, user_id: 102, balance: -50, frozen: 0 }, // 需要修复
        { account_id: 3, user_id: 103, balance: -200, frozen: 100 } // 需要修复（更复杂）
      ]

      // 修复日志
      const repairLogs = []

      // 负数余额修复器
      const balanceRepairer = {
        strategies: {
          // 策略1：归零（最保守）
          ZERO_OUT: {
            name: '归零策略',
            repair: account => {
              const adjustment = -account.balance
              account.balance = 0
              account.frozen = 0 // 同时清除冻结
              return { adjustment, newBalance: 0, newFrozen: 0 }
            }
          },
          // 策略2：调整为最小正数
          MINIMUM_POSITIVE: {
            name: '最小正数策略',
            repair: account => {
              const adjustment = -account.balance + 1
              account.balance = 1
              if (account.frozen > 1) {
                account.frozen = 1
              }
              return { adjustment, newBalance: 1, newFrozen: Math.min(account.frozen, 1) }
            }
          }
        },

        async repairNegativeBalances(accounts, options = {}) {
          const { strategy = 'ZERO_OUT', createAuditLog = true } = options
          const repairs = []
          const repairStrategy = this.strategies[strategy]

          if (!repairStrategy) {
            throw new Error(`未知修复策略: ${strategy}`)
          }

          for (const account of accounts) {
            if (account.balance < 0) {
              const beforeState = {
                balance: account.balance,
                frozen: account.frozen
              }

              const repairResult = repairStrategy.repair(account)

              const repair = {
                account_id: account.account_id,
                user_id: account.user_id,
                strategy,
                strategyName: repairStrategy.name,
                before: beforeState,
                after: {
                  balance: account.balance,
                  frozen: account.frozen
                },
                adjustment: repairResult.adjustment,
                timestamp: new Date().toISOString()
              }

              repairs.push(repair)

              if (createAuditLog) {
                repairLogs.push({
                  log_id: `REPAIR-${Date.now()}-${repairs.length}`,
                  repair_type: 'NEGATIVE_BALANCE',
                  target_account_id: account.account_id,
                  details: repair
                })
              }
            }
          }

          return {
            strategy,
            strategyName: repairStrategy.name,
            repairsCount: repairs.length,
            repairs,
            success: true
          }
        }
      }

      // 修复前检查
      console.log('   📊 修复前账户状态:')
      mockAccounts.forEach(acc => {
        const status = acc.balance < 0 ? '❌' : '✅'
        console.log(
          `      ${status} 账户${acc.account_id}: 余额=${acc.balance}, 冻结=${acc.frozen}`
        )
      })

      // 执行修复
      console.log('')
      console.log('   📊 执行负数余额修复（归零策略）...')
      const repairResult = await balanceRepairer.repairNegativeBalances(mockAccounts, {
        strategy: 'ZERO_OUT',
        createAuditLog: true
      })

      console.log(`      修复数量: ${repairResult.repairsCount}`)

      // 验证修复结果
      expect(repairResult.repairsCount).toBe(2)

      // 验证所有余额非负
      const hasNegative = mockAccounts.some(acc => acc.balance < 0)
      expect(hasNegative).toBe(false)

      // 修复后检查
      console.log('')
      console.log('   📊 修复后账户状态:')
      mockAccounts.forEach(acc => {
        const status = acc.balance >= 0 ? '✅' : '❌'
        console.log(
          `      ${status} 账户${acc.account_id}: 余额=${acc.balance}, 冻结=${acc.frozen}`
        )
      })

      // 查看修复详情
      console.log('')
      console.log('   📊 修复详情:')
      repairResult.repairs.forEach(r => {
        console.log(
          `      账户${r.account_id}: ${r.before.balance} → ${r.after.balance} (调整: +${r.adjustment})`
        )
      })

      // 验证审计日志
      expect(repairLogs.length).toBe(2)

      console.log('')
      console.log('   ✅ 负数余额修复验证通过')
    })
  })

  // ==================== C-3-3: 一致性校验 ====================

  describe('C-3-3 一致性校验', () => {
    /**
     * 业务场景：修复后的完整性校验
     * 验证目标：确保修复后数据满足所有业务规则
     */
    test('修复后完整性校验', async () => {
      console.log('')
      console.log('📋 C-3-3-1 修复后完整性校验:')
      console.log('   模拟场景: 验证修复后数据满足所有规则')
      console.log('')

      // 模拟修复后的数据
      const repairedData = {
        orders: [
          {
            order_id: 'ORD-001',
            status: 'completed',
            product_id: 'P001',
            quantity: 2,
            amount: 200
          },
          {
            order_id: 'ORD-002',
            status: 'completed',
            product_id: 'P002',
            quantity: 1,
            amount: 100
          },
          { order_id: 'ORD-003', status: 'completed', product_id: 'P001', quantity: 3, amount: 300 }
        ],
        inventory_transactions: [
          {
            transaction_id: 'INV-001',
            order_id: 'ORD-001',
            product_id: 'P001',
            quantity_change: -2
          },
          {
            transaction_id: 'INV-002',
            order_id: 'ORD-002',
            product_id: 'P002',
            quantity_change: -1
          },
          {
            transaction_id: 'INV-003',
            order_id: 'ORD-003',
            product_id: 'P001',
            quantity_change: -3
          } // 已修复
        ],
        accounts: [
          { account_id: 1, balance: 1000, frozen: 200 },
          { account_id: 2, balance: 500, frozen: 0 },
          { account_id: 3, balance: 0, frozen: 0 } // 已修复
        ]
      }

      // 完整性校验器
      const integrityValidator = {
        validators: {
          // 订单-库存一致性
          orderInventoryConsistency: {
            name: '订单-库存一致性',
            validate: data => {
              const violations = []
              for (const order of data.orders.filter(o => o.status === 'completed')) {
                const tx = data.inventory_transactions.find(
                  t => t.order_id === order.order_id && t.product_id === order.product_id
                )
                if (!tx || tx.quantity_change !== -order.quantity) {
                  violations.push(`订单${order.order_id}库存记录异常`)
                }
              }
              return { valid: violations.length === 0, violations }
            }
          },

          // 账户余额非负
          accountBalancePositive: {
            name: '账户余额非负',
            validate: data => {
              const violations = []
              for (const account of data.accounts) {
                if (account.balance < 0) {
                  violations.push(`账户${account.account_id}余额为负: ${account.balance}`)
                }
              }
              return { valid: violations.length === 0, violations }
            }
          },

          // 冻结金额合理
          frozenWithinBalance: {
            name: '冻结金额合理',
            validate: data => {
              const violations = []
              for (const account of data.accounts) {
                if (account.frozen > account.balance) {
                  violations.push(
                    `账户${account.account_id}冻结${account.frozen}超过余额${account.balance}`
                  )
                }
              }
              return { valid: violations.length === 0, violations }
            }
          },

          // 订单金额合理
          orderAmountPositive: {
            name: '订单金额正数',
            validate: data => {
              const violations = []
              for (const order of data.orders) {
                if (order.amount <= 0) {
                  violations.push(`订单${order.order_id}金额非正: ${order.amount}`)
                }
              }
              return { valid: violations.length === 0, violations }
            }
          }
        },

        async runAllValidations(data) {
          const results = {}
          let allPassed = true

          for (const [key, validator] of Object.entries(this.validators)) {
            const result = validator.validate(data)
            results[key] = {
              name: validator.name,
              passed: result.valid,
              violations: result.violations
            }

            if (!result.valid) {
              allPassed = false
            }
          }

          return {
            allPassed,
            validatorCount: Object.keys(this.validators).length,
            passedCount: Object.values(results).filter(r => r.passed).length,
            failedCount: Object.values(results).filter(r => !r.passed).length,
            results
          }
        }
      }

      // 执行完整性校验
      console.log('   📊 执行完整性校验...')
      const validationResult = await integrityValidator.runAllValidations(repairedData)

      console.log(`   📊 校验器数量: ${validationResult.validatorCount}`)
      console.log(`   📊 通过: ${validationResult.passedCount}`)
      console.log(`   📊 失败: ${validationResult.failedCount}`)

      // 输出每个校验器结果
      console.log('')
      console.log('   📊 校验详情:')
      for (const [_key, result] of Object.entries(validationResult.results)) {
        const icon = result.passed ? '✅' : '❌'
        console.log(`      ${icon} ${result.name}: ${result.passed ? '通过' : '失败'}`)
        if (!result.passed) {
          result.violations.forEach(v => console.log(`         - ${v}`))
        }
      }

      // 验证所有校验都通过
      expect(validationResult.allPassed).toBe(true)
      expect(validationResult.failedCount).toBe(0)

      console.log('')
      console.log('   ✅ 修复后完整性校验验证通过')
    })

    /**
     * 业务场景：跨表关联一致性校验
     * 验证目标：确保相关表之间的数据一致
     */
    test('跨表关联一致性校验', async () => {
      console.log('')
      console.log('📋 C-3-3-2 跨表关联校验:')
      console.log('   模拟场景: 验证订单、用户、交易记录的关联完整性')
      console.log('')

      // 模拟关联数据
      const relatedData = {
        users: [
          { user_id: 1, status: 'active' },
          { user_id: 2, status: 'active' },
          { user_id: 3, status: 'deleted' } // 已删除用户
        ],
        orders: [
          { order_id: 'ORD-001', user_id: 1, status: 'completed' },
          { order_id: 'ORD-002', user_id: 2, status: 'pending' },
          { order_id: 'ORD-003', user_id: 999, status: 'completed' } // 引用不存在用户
        ],
        transactions: [
          { transaction_id: 'TXN-001', order_id: 'ORD-001', type: 'payment' },
          { transaction_id: 'TXN-002', order_id: 'ORD-999', type: 'payment' } // 引用不存在订单
        ]
      }

      // 关联校验器
      const relationValidator = {
        async validateRelations(data) {
          const issues = []

          // 检查订单引用的用户
          for (const order of data.orders) {
            const user = data.users.find(u => u.user_id === order.user_id)

            if (!user) {
              issues.push({
                type: 'ORPHAN_ORDER',
                severity: 'critical',
                table: 'orders',
                record_id: order.order_id,
                foreign_key: 'user_id',
                foreign_value: order.user_id,
                message: `订单${order.order_id}引用不存在的用户${order.user_id}`
              })
            } else if (user.status === 'deleted' && order.status !== 'cancelled') {
              issues.push({
                type: 'DELETED_USER_ORDER',
                severity: 'high',
                table: 'orders',
                record_id: order.order_id,
                foreign_key: 'user_id',
                foreign_value: order.user_id,
                message: `订单${order.order_id}属于已删除用户${order.user_id}`
              })
            }
          }

          // 检查交易引用的订单
          for (const tx of data.transactions) {
            const order = data.orders.find(o => o.order_id === tx.order_id)

            if (!order) {
              issues.push({
                type: 'ORPHAN_TRANSACTION',
                severity: 'critical',
                table: 'transactions',
                record_id: tx.transaction_id,
                foreign_key: 'order_id',
                foreign_value: tx.order_id,
                message: `交易${tx.transaction_id}引用不存在的订单${tx.order_id}`
              })
            }
          }

          return {
            checked: {
              orders: data.orders.length,
              transactions: data.transactions.length
            },
            issues,
            isValid: issues.length === 0,
            stats: {
              orphanOrders: issues.filter(i => i.type === 'ORPHAN_ORDER').length,
              orphanTransactions: issues.filter(i => i.type === 'ORPHAN_TRANSACTION').length,
              criticalIssues: issues.filter(i => i.severity === 'critical').length,
              highIssues: issues.filter(i => i.severity === 'high').length
            }
          }
        }
      }

      // 执行关联校验
      console.log('   📊 执行跨表关联校验...')
      const result = await relationValidator.validateRelations(relatedData)

      console.log(`   📊 检查订单: ${result.checked.orders}`)
      console.log(`   📊 检查交易: ${result.checked.transactions}`)
      console.log(`   📊 发现问题: ${result.issues.length}`)
      console.log(`      - 孤儿订单: ${result.stats.orphanOrders}`)
      console.log(`      - 孤儿交易: ${result.stats.orphanTransactions}`)
      console.log(`      - 严重问题: ${result.stats.criticalIssues}`)

      // 验证发现了问题
      expect(result.isValid).toBe(false)
      expect(result.stats.orphanOrders).toBe(1)
      expect(result.stats.orphanTransactions).toBe(1)

      console.log('')
      console.log('   📋 发现的关联问题:')
      result.issues.forEach(issue => {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡'
        console.log(`      ${icon} [${issue.type}] ${issue.message}`)
      })

      console.log('')
      console.log('   ✅ 跨表关联校验验证通过')
    })
  })

  // ==================== C-3-4: 增量恢复 ====================

  describe('C-3-4 增量恢复', () => {
    /**
     * 业务场景：增量数据同步恢复
     * 验证目标：能基于时间戳进行增量恢复
     */
    test('基于时间戳的增量恢复', async () => {
      console.log('')
      console.log('📋 C-3-4-1 时间戳增量恢复:')
      console.log('   模拟场景: 只恢复指定时间点之后的数据')
      console.log('')

      // 模拟源数据（主库）
      const sourceDatabase = {
        records: [
          { id: 1, data: 'record_1', updated_at: '2026-01-30T00:00:00.000Z' },
          { id: 2, data: 'record_2', updated_at: '2026-01-30T06:00:00.000Z' },
          { id: 3, data: 'record_3', updated_at: '2026-01-30T12:00:00.000Z' },
          { id: 4, data: 'record_4_updated', updated_at: '2026-01-30T18:00:00.000Z' }, // 已更新
          { id: 5, data: 'record_5_new', updated_at: '2026-01-30T20:00:00.000Z' } // 新增
        ]
      }

      // 模拟目标数据（从库/缓存，数据滞后）
      const targetDatabase = {
        records: [
          { id: 1, data: 'record_1', updated_at: '2026-01-30T00:00:00.000Z' },
          { id: 2, data: 'record_2', updated_at: '2026-01-30T06:00:00.000Z' },
          { id: 3, data: 'record_3', updated_at: '2026-01-30T12:00:00.000Z' },
          { id: 4, data: 'record_4', updated_at: '2026-01-30T08:00:00.000Z' } // 未同步最新更新
          // id: 5 缺失
        ],
        lastSyncTime: '2026-01-30T12:00:00.000Z'
      }

      // 增量恢复器
      const incrementalRecoverer = {
        async recover(source, target, options = {}) {
          const { sincetime = target.lastSyncTime } = options
          const sinceTimestamp = new Date(sincetime).getTime()

          const changes = {
            inserts: [],
            updates: [],
            unchanged: []
          }

          // 找出需要同步的记录
          for (const sourceRecord of source.records) {
            const sourceTime = new Date(sourceRecord.updated_at).getTime()

            if (sourceTime <= sinceTimestamp) {
              changes.unchanged.push(sourceRecord)
              continue
            }

            const targetRecord = target.records.find(r => r.id === sourceRecord.id)

            if (!targetRecord) {
              // 新记录
              changes.inserts.push(sourceRecord)
              target.records.push({ ...sourceRecord })
            } else {
              const targetTime = new Date(targetRecord.updated_at).getTime()

              if (sourceTime > targetTime) {
                // 更新记录
                changes.updates.push({
                  before: { ...targetRecord },
                  after: { ...sourceRecord }
                })

                // 应用更新
                Object.assign(targetRecord, sourceRecord)
              } else {
                changes.unchanged.push(sourceRecord)
              }
            }
          }

          // 更新同步时间
          target.lastSyncTime = new Date().toISOString()

          return {
            sincetime,
            inserts: changes.inserts.length,
            updates: changes.updates.length,
            unchanged: changes.unchanged.length,
            changes,
            success: true
          }
        }
      }

      // 恢复前状态
      console.log('   📊 恢复前状态:')
      console.log(`      源数据记录: ${sourceDatabase.records.length}`)
      console.log(`      目标数据记录: ${targetDatabase.records.length}`)
      console.log(`      上次同步: ${targetDatabase.lastSyncTime}`)

      // 执行增量恢复
      console.log('')
      console.log('   📊 执行增量恢复...')
      const recoveryResult = await incrementalRecoverer.recover(sourceDatabase, targetDatabase)

      console.log(`      新增: ${recoveryResult.inserts}`)
      console.log(`      更新: ${recoveryResult.updates}`)
      console.log(`      未变: ${recoveryResult.unchanged}`)

      // 验证恢复结果
      expect(recoveryResult.inserts).toBe(1) // record_5_new
      expect(recoveryResult.updates).toBe(1) // record_4_updated
      expect(targetDatabase.records.length).toBe(5)

      // 验证数据一致性
      const record4 = targetDatabase.records.find(r => r.id === 4)
      expect(record4.data).toBe('record_4_updated')

      const record5 = targetDatabase.records.find(r => r.id === 5)
      expect(record5).toBeDefined()
      expect(record5.data).toBe('record_5_new')

      console.log('')
      console.log('   📊 恢复后状态:')
      console.log(`      目标数据记录: ${targetDatabase.records.length}`)
      console.log(`      最新同步: ${targetDatabase.lastSyncTime}`)

      console.log('')
      console.log('   📊 变更详情:')
      if (recoveryResult.changes.inserts.length > 0) {
        console.log('      新增记录:')
        recoveryResult.changes.inserts.forEach(r => {
          console.log(`         + id=${r.id}, data=${r.data}`)
        })
      }
      if (recoveryResult.changes.updates.length > 0) {
        console.log('      更新记录:')
        recoveryResult.changes.updates.forEach(u => {
          console.log(`         ~ id=${u.before.id}: ${u.before.data} → ${u.after.data}`)
        })
      }

      console.log('')
      console.log('   ✅ 时间戳增量恢复验证通过')
    })

    /**
     * 业务场景：断点续传恢复
     * 验证目标：能从上次失败的位置继续恢复
     */
    test('断点续传恢复', async () => {
      console.log('')
      console.log('📋 C-3-4-2 断点续传恢复:')
      console.log('   模拟场景: 恢复过程中断后能继续')
      console.log('')

      // 模拟需要恢复的记录
      const recordsToRecover = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        data: `record_${i + 1}`,
        status: 'pending'
      }))

      // 恢复进度跟踪
      const recoveryProgress = {
        totalRecords: recordsToRecover.length,
        processedRecords: 0,
        lastProcessedId: 0,
        checkpoint: null,
        errors: []
      }

      // 断点续传恢复器
      const checkpointRecoverer = {
        batchSize: 3,
        simulateFailure: true,
        failAtRecord: 5,

        async recoverBatch(records, progress, options = {}) {
          const { startFromId = 0 } = options
          const batch = []
          let lastProcessedId = startFromId

          // 找出需要处理的记录
          const pendingRecords = records.filter(r => r.id > startFromId && r.status === 'pending')

          for (const record of pendingRecords.slice(0, this.batchSize)) {
            // 模拟处理失败
            if (this.simulateFailure && record.id === this.failAtRecord) {
              progress.errors.push({
                record_id: record.id,
                error: '模拟处理失败',
                timestamp: new Date().toISOString()
              })
              throw new Error(`处理记录${record.id}失败`)
            }

            // 模拟处理
            await delay(50)
            record.status = 'recovered'
            batch.push(record)
            lastProcessedId = record.id
            progress.processedRecords++
          }

          // 保存检查点
          progress.lastProcessedId = lastProcessedId
          progress.checkpoint = {
            savedAt: new Date().toISOString(),
            lastProcessedId
          }

          return {
            processed: batch.length,
            lastProcessedId,
            hasMore: pendingRecords.length > this.batchSize
          }
        },

        async runRecoveryWithRetry(records, progress, maxRetries = 3) {
          let retries = 0
          let completed = false

          while (!completed && retries <= maxRetries) {
            try {
              // 记录开始位置（用于日志）
              const _startFrom = progress.lastProcessedId

              while (true) {
                const result = await this.recoverBatch(records, progress, {
                  startFromId: progress.lastProcessedId
                })

                console.log(
                  `      批次完成: 处理${result.processed}条, 最后ID=${result.lastProcessedId}`
                )

                if (!result.hasMore) {
                  completed = true
                  break
                }
              }
            } catch (error) {
              retries++
              console.log(`      ⚠️ 恢复中断: ${error.message}`)

              if (retries <= maxRetries) {
                console.log(`      🔄 从检查点恢复 (重试 ${retries}/${maxRetries})...`)
                // 禁用后续失败模拟，允许重试成功
                this.simulateFailure = false
                await delay(100)
              } else {
                throw new Error(`恢复失败，已重试${maxRetries}次`)
              }
            }
          }

          return {
            completed,
            retries,
            totalProcessed: progress.processedRecords,
            errors: progress.errors
          }
        }
      }

      // 执行断点续传恢复
      console.log('   📊 开始断点续传恢复...')
      console.log(`      总记录: ${recoveryProgress.totalRecords}`)
      console.log(`      批次大小: ${checkpointRecoverer.batchSize}`)

      const result = await checkpointRecoverer.runRecoveryWithRetry(
        recordsToRecover,
        recoveryProgress,
        3
      )

      console.log('')
      console.log('   📊 恢复完成:')
      console.log(`      已处理: ${result.totalProcessed}`)
      console.log(`      重试次数: ${result.retries}`)
      console.log(`      错误数: ${result.errors.length}`)

      // 验证所有记录都已恢复
      const allRecovered = recordsToRecover.every(r => r.status === 'recovered')
      expect(allRecovered).toBe(true)
      expect(result.completed).toBe(true)
      expect(result.retries).toBe(1) // 失败一次后重试成功

      // 验证进度跟踪
      expect(recoveryProgress.lastProcessedId).toBe(10)
      expect(recoveryProgress.checkpoint).toBeDefined()

      console.log('')
      console.log('   📊 最终检查点:')
      console.log(`      最后处理ID: ${recoveryProgress.lastProcessedId}`)
      console.log(`      检查点时间: ${recoveryProgress.checkpoint.savedAt}`)

      console.log('')
      console.log('   ✅ 断点续传恢复验证通过')
    })

    /**
     * 业务场景：并行增量恢复
     * 验证目标：能并行处理多个独立的恢复任务
     */
    test('并行增量恢复', async () => {
      console.log('')
      console.log('📋 C-3-4-3 并行增量恢复:')
      console.log('   模拟场景: 并行恢复多个独立的数据分区')
      console.log('')

      // 模拟分区数据
      const partitions = {
        partition_a: {
          records: Array.from({ length: 5 }, (_, i) => ({
            id: `A-${i + 1}`,
            status: 'pending'
          }))
        },
        partition_b: {
          records: Array.from({ length: 5 }, (_, i) => ({
            id: `B-${i + 1}`,
            status: 'pending'
          }))
        },
        partition_c: {
          records: Array.from({ length: 5 }, (_, i) => ({
            id: `C-${i + 1}`,
            status: 'pending'
          }))
        }
      }

      // 分区恢复器
      const partitionRecoverer = {
        async recoverPartition(partitionName, partition) {
          const startTime = Date.now()
          const recovered = []

          for (const record of partition.records) {
            await delay(20 + Math.random() * 30) // 随机延迟
            record.status = 'recovered'
            recovered.push(record.id)
          }

          return {
            partition: partitionName,
            recoveredCount: recovered.length,
            recoveredIds: recovered,
            duration: Date.now() - startTime
          }
        }
      }

      // 并行恢复所有分区
      console.log('   📊 并行恢复3个分区...')
      const startTime = Date.now()

      const recoveryTasks = Object.entries(partitions).map(
        ([name, partition]) =>
          async () =>
            partitionRecoverer.recoverPartition(name, partition)
      )

      const { results } = await executeConcurrent(recoveryTasks, {
        concurrency: 3 // 并行度
      })

      const totalDuration = Date.now() - startTime

      console.log('')
      console.log('   📊 各分区恢复结果:')
      let totalRecovered = 0
      results.forEach(r => {
        const result = r.result
        console.log(
          `      ${result.partition}: ${result.recoveredCount}条, 耗时${result.duration}ms`
        )
        totalRecovered += result.recoveredCount
      })

      console.log('')
      console.log(`   📊 总计: ${totalRecovered}条记录`)
      console.log(`   📊 总耗时: ${totalDuration}ms`)

      // 验证所有记录都已恢复
      const allRecovered = Object.values(partitions).every(p =>
        p.records.every(r => r.status === 'recovered')
      )
      expect(allRecovered).toBe(true)
      expect(totalRecovered).toBe(15)

      // 验证并行效率（并行应该比串行快）
      const estimatedSerialTime = 15 * 35 // 假设平均35ms/记录
      expect(totalDuration).toBeLessThan(estimatedSerialTime)

      console.log(`   📊 并行加速比: ${(estimatedSerialTime / totalDuration).toFixed(2)}x`)

      console.log('')
      console.log('   ✅ 并行增量恢复验证通过')
    })
  })

  // ==================== 综合场景测试 ====================

  describe('综合场景测试', () => {
    /**
     * 业务场景：完整的数据恢复流程
     * 验证目标：检测→分析→修复→验证的完整流程
     */
    test('完整数据恢复流程', async () => {
      console.log('')
      console.log('📋 综合场景：完整数据恢复流程')
      console.log('')

      // 模拟有问题的数据库
      const problematicDatabase = {
        accounts: [
          { account_id: 1, user_id: 101, balance: 1000, frozen: 200 },
          { account_id: 2, user_id: 102, balance: -100, frozen: 0 }, // 问题：负数余额
          { account_id: 3, user_id: 103, balance: 500, frozen: 600 } // 问题：冻结超额
        ],
        orders: [
          {
            order_id: 'ORD-001',
            user_id: 101,
            status: 'completed',
            product_id: 'P001',
            quantity: 2
          },
          {
            order_id: 'ORD-002',
            user_id: 102,
            status: 'completed',
            product_id: 'P002',
            quantity: 1
          }
        ],
        inventory_transactions: [
          {
            transaction_id: 'INV-001',
            order_id: 'ORD-001',
            product_id: 'P001',
            quantity_change: -2
          }
          // 缺失ORD-002的库存记录
        ],
        repair_logs: []
      }

      // 统一数据恢复管理器
      const dataRecoveryManager = {
        async runFullRecovery(db) {
          const report = {
            startTime: new Date().toISOString(),
            phases: [],
            totalIssuesFound: 0,
            totalIssuesFixed: 0,
            success: true
          }

          // 阶段1：检测
          console.log('   📊 阶段1：数据检测...')
          const detectionPhase = {
            name: '数据检测',
            issues: []
          }

          // 检测账户问题
          for (const account of db.accounts) {
            if (account.balance < 0) {
              detectionPhase.issues.push({
                type: 'NEGATIVE_BALANCE',
                account_id: account.account_id,
                value: account.balance
              })
            }
            if (account.frozen > account.balance) {
              detectionPhase.issues.push({
                type: 'FROZEN_EXCEEDS_BALANCE',
                account_id: account.account_id,
                balance: account.balance,
                frozen: account.frozen
              })
            }
          }

          // 检测订单-库存不一致
          for (const order of db.orders.filter(o => o.status === 'completed')) {
            const tx = db.inventory_transactions.find(t => t.order_id === order.order_id)
            if (!tx) {
              detectionPhase.issues.push({
                type: 'MISSING_INVENTORY_TX',
                order_id: order.order_id,
                product_id: order.product_id,
                quantity: order.quantity
              })
            }
          }

          report.phases.push(detectionPhase)
          report.totalIssuesFound = detectionPhase.issues.length
          console.log(`      发现问题: ${detectionPhase.issues.length}`)

          // 阶段2：修复
          console.log('   📊 阶段2：数据修复...')
          const repairPhase = {
            name: '数据修复',
            repairs: []
          }

          for (const issue of detectionPhase.issues) {
            let repaired = false

            switch (issue.type) {
              case 'NEGATIVE_BALANCE': {
                const account = db.accounts.find(a => a.account_id === issue.account_id)
                if (account) {
                  const adjustment = -account.balance
                  account.balance = 0
                  repairPhase.repairs.push({
                    type: issue.type,
                    account_id: issue.account_id,
                    action: 'ZERO_OUT',
                    adjustment
                  })
                  repaired = true
                }
                break
              }

              case 'FROZEN_EXCEEDS_BALANCE': {
                const account = db.accounts.find(a => a.account_id === issue.account_id)
                if (account) {
                  const oldFrozen = account.frozen
                  account.frozen = Math.min(account.frozen, account.balance)
                  repairPhase.repairs.push({
                    type: issue.type,
                    account_id: issue.account_id,
                    action: 'ADJUST_FROZEN',
                    oldFrozen,
                    newFrozen: account.frozen
                  })
                  repaired = true
                }
                break
              }

              case 'MISSING_INVENTORY_TX': {
                db.inventory_transactions.push({
                  transaction_id: `INV-REPAIR-${Date.now()}`,
                  order_id: issue.order_id,
                  product_id: issue.product_id,
                  quantity_change: -issue.quantity,
                  is_repair: true
                })
                repairPhase.repairs.push({
                  type: issue.type,
                  order_id: issue.order_id,
                  action: 'CREATE_TX'
                })
                repaired = true
                break
              }
            }

            if (repaired) {
              report.totalIssuesFixed++
            }
          }

          report.phases.push(repairPhase)
          console.log(`      修复数量: ${repairPhase.repairs.length}`)

          // 阶段3：验证
          console.log('   📊 阶段3：修复验证...')
          const verificationPhase = {
            name: '修复验证',
            checks: []
          }

          // 重新检查
          let remainingIssues = 0

          for (const account of db.accounts) {
            const balanceOk = account.balance >= 0
            const frozenOk = account.frozen <= account.balance
            verificationPhase.checks.push({
              account_id: account.account_id,
              balanceOk,
              frozenOk
            })
            if (!balanceOk || !frozenOk) remainingIssues++
          }

          for (const order of db.orders.filter(o => o.status === 'completed')) {
            const tx = db.inventory_transactions.find(t => t.order_id === order.order_id)
            verificationPhase.checks.push({
              order_id: order.order_id,
              hasInventoryTx: !!tx
            })
            if (!tx) remainingIssues++
          }

          verificationPhase.remainingIssues = remainingIssues
          report.phases.push(verificationPhase)
          report.success = remainingIssues === 0

          console.log(`      剩余问题: ${remainingIssues}`)

          report.endTime = new Date().toISOString()
          return report
        }
      }

      // 执行完整恢复流程
      const report = await dataRecoveryManager.runFullRecovery(problematicDatabase)

      // 输出报告
      console.log('')
      console.log('   📊 ===== 恢复报告 =====')
      console.log(`   开始时间: ${report.startTime}`)
      console.log(`   结束时间: ${report.endTime}`)
      console.log(`   发现问题: ${report.totalIssuesFound}`)
      console.log(`   修复问题: ${report.totalIssuesFixed}`)
      console.log(`   恢复状态: ${report.success ? '✅ 成功' : '❌ 失败'}`)

      console.log('')
      console.log('   📊 各阶段详情:')
      report.phases.forEach(phase => {
        console.log(`      ${phase.name}:`)
        if (phase.issues) {
          console.log(`         问题数: ${phase.issues.length}`)
        }
        if (phase.repairs) {
          console.log(`         修复数: ${phase.repairs.length}`)
        }
        if (phase.remainingIssues !== undefined) {
          console.log(`         剩余问题: ${phase.remainingIssues}`)
        }
      })

      // 验证恢复成功
      expect(report.success).toBe(true)
      expect(report.totalIssuesFixed).toBe(report.totalIssuesFound)

      console.log('')
      console.log('   ✅ 完整数据恢复流程验证通过')
    })
  })
})
