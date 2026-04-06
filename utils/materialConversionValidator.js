/**
 * 材料转换规则风控校验工具
 *
 * 循环拦截 + 套利闭环检测
 *
 * 业务场景：
 * - 材料转换规则保存/启用时触发风控校验
 * - 循环拦截：不得出现 A→B→...→A 的闭环路径
 * - 套利拦截：不得出现"沿环路换一圈资产数量不减反增"（负环检测）
 *
 * 硬约束（来自文档）：
 * - **循环拦截（必拦截）**：新增/启用规则后，存在从某个 asset_code 出发可回到自身的路径
 * - **套利闭环拦截（必拦截）**：存在任意闭环使得"沿环路换一圈资产数量不减反增"
 *   - 判定方法：将每条规则倍率 r=to_amount/from_amount 对数化为边权 w=-log(r)，做有向图负环检测（Bellman-Ford）
 *   - 范围限定：全局所有已生效（effective_at <= NOW()）+ is_enabled=true 的规则集合内
 * - **终点货币禁止流出（必拦截）**：星石等终点货币禁止作为 from_asset_code
 *
 * 创建时间：2025-12-15
 * 更新时间：2026-01-26（V2.1 支持跨组转换 + 终点货币限制）
 */

'use strict'

// ✅ 使用统一的 AssetConversionRule 模型（2026-04-05 合并后）
const { AssetConversionRule } = require('../models')
const { Op } = require('sequelize')
const { AssetCode } = require('../constants/AssetCode')

/**
 * 材料转换规则风控校验器
 */
class MaterialConversionValidator {
  /**
   * 构建规则有向图（Directed Graph）
   *
   * @param {Array<MaterialConversionRule>} rules - 规则列表
   * @returns {Object} 有向图对象 { nodes: Set, edges: Array }
   */
  static buildRuleGraph(rules) {
    const nodes = new Set()
    const edges = []

    rules.forEach(rule => {
      nodes.add(rule.from_asset_code)
      nodes.add(rule.to_asset_code)

      /* 统一使用 rate_numerator / rate_denominator（AssetConversionRule 字段） */
      const toAmount = Number(rule.rate_numerator)
      const fromAmount = Number(rule.rate_denominator)

      edges.push({
        from: rule.from_asset_code,
        to: rule.to_asset_code,
        from_amount: fromAmount,
        to_amount: toAmount,
        rate: toAmount / fromAmount, // 转换比例
        weight: -Math.log(toAmount / fromAmount), // 边权（用于负环检测）
        rule_id: rule.conversion_rule_id
      })
    })

    return { nodes: Array.from(nodes), edges }
  }

  /**
   * 检测有向图中是否存在环（Cycle Detection - DFS）
   *
   * @param {Object} graph - 有向图对象 { nodes, edges }
   * @returns {Object} { hasCycle: boolean, cycle: Array<string> }
   */
  static detectCycle(graph) {
    const { nodes, edges } = graph

    // 构建邻接表
    const adjList = new Map()
    nodes.forEach(node => adjList.set(node, []))
    edges.forEach(edge => {
      adjList.get(edge.from).push(edge.to)
    })

    // DFS 检测环
    const visited = new Set()
    const recStack = new Set()
    const path = []

    for (const node of nodes) {
      if (!visited.has(node)) {
        const cycleFound = this.dfs(node, adjList, visited, recStack, path)
        if (cycleFound) {
          // 提取环路径
          const cycleStartIndex = path.indexOf(path[path.length - 1])
          const cycle = path.slice(cycleStartIndex)
          return { hasCycle: true, cycle }
        }
      }
    }

    return { hasCycle: false, cycle: [] }
  }

  /**
   * DFS 辅助函数（用于环检测）
   *
   * @param {string} node - 当前节点
   * @param {Map} adjList - 邻接表
   * @param {Set} visited - 已访问节点集合
   * @param {Set} recStack - 递归栈（用于检测回边）
   * @param {Array} path - 路径记录
   * @returns {boolean} 是否找到环
   */
  static dfs(node, adjList, visited, recStack, path) {
    visited.add(node)
    recStack.add(node)
    path.push(node)

    const neighbors = adjList.get(node) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.dfs(neighbor, adjList, visited, recStack, path)) {
          return true
        }
      } else if (recStack.has(neighbor)) {
        // 找到回边，存在环
        path.push(neighbor) // 记录环的终点
        return true
      }
    }

    recStack.delete(node)
    path.pop()
    return false
  }

  /**
   * 检测有向图中是否存在负环（Negative Cycle Detection - Bellman-Ford）
   *
   * 负环定义：沿环路换一圈资产数量不减反增（套利闭环）
   * 边权定义：w = -log(to_amount / from_amount)
   * 负环检测：如果存在负环，说明可以通过多次转换增加资产总量
   *
   * @param {Object} graph - 有向图对象 { nodes, edges }
   * @returns {Object} { hasNegativeCycle: boolean, cycle: Array<string> }
   */
  static detectNegativeCycle(graph) {
    const { nodes, edges } = graph

    // 初始化距离数组
    const distance = new Map()
    const predecessor = new Map()
    nodes.forEach(node => {
      distance.set(node, Infinity)
      predecessor.set(node, null)
    })

    // 选择第一个节点作为起点
    if (nodes.length > 0) {
      distance.set(nodes[0], 0)
    }

    // Bellman-Ford 松弛操作（V-1 次）
    for (let i = 0; i < nodes.length - 1; i++) {
      for (const edge of edges) {
        const u = edge.from
        const v = edge.to
        const w = edge.weight

        if (distance.get(u) !== Infinity && distance.get(u) + w < distance.get(v)) {
          distance.set(v, distance.get(u) + w)
          predecessor.set(v, u)
        }
      }
    }

    // 第 V 次松弛，检测负环
    for (const edge of edges) {
      const u = edge.from
      const v = edge.to
      const w = edge.weight

      if (distance.get(u) !== Infinity && distance.get(u) + w < distance.get(v)) {
        // 找到负环，回溯路径
        const cycle = this.traceNegativeCycle(v, predecessor)
        return { hasNegativeCycle: true, cycle }
      }
    }

    return { hasNegativeCycle: false, cycle: [] }
  }

  /**
   * 回溯负环路径
   *
   * @param {string} node - 负环中的任意节点
   * @param {Map} predecessor - 前驱节点映射
   * @returns {Array<string>} 负环路径
   */
  static traceNegativeCycle(node, predecessor) {
    const visited = new Set()
    let current = node

    // 找到环中的一个节点
    while (!visited.has(current)) {
      visited.add(current)
      current = predecessor.get(current)
    }

    // 从环中的节点开始，回溯完整环路
    const cycle = [current]
    let next = predecessor.get(current)

    while (next !== current) {
      cycle.push(next)
      next = predecessor.get(next)
    }

    cycle.reverse()
    return cycle
  }

  /**
   * 完整风控校验（循环拦截 + 套利闭环检测 + 终点货币限制）
   *
   * 🔴 V2.1 更新：
   * - 移除跨组限制，允许不同 group_code 之间的转换
   * - 新增终点货币（star_stone）禁止流出检查
   * - 套利检测范围从"组内"扩大到"全局"
   *
   * @param {MaterialConversionRule} newRule - 新增的规则（或待启用的规则）
   * @param {Object} options - 选项参数
   * @param {Sequelize.Transaction} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} { valid: boolean, errors: Array<string> }
   */
  static async validate(newRule, options = {}) {
    const errors = []

    try {
      // 🔴 V2.1：获取新规则涉及的材料信息（用于终点货币检查和材料存在性验证）
      const { MaterialAssetType } = require('../models')

      // 查询源材料和目标材料信息（验证存在性 + 终点货币检查）
      const [fromMaterial, toMaterial] = await Promise.all([
        MaterialAssetType.findOne({
          where: { asset_code: newRule.from_asset_code },
          transaction: options.transaction
        }),
        MaterialAssetType.findOne({
          where: { asset_code: newRule.to_asset_code },
          transaction: options.transaction
        })
      ])

      if (!fromMaterial) {
        errors.push(`源材料 ${newRule.from_asset_code} 不存在于 material_asset_types 表中`)
        return { valid: false, errors }
      }

      if (!toMaterial) {
        errors.push(`目标材料 ${newRule.to_asset_code} 不存在于 material_asset_types 表中`)
        return { valid: false, errors }
      }

      /*
       * 🔴 V2.1 硬约束：终点货币（如 星石）禁止作为转换源
       * 业务规则：星石是系统「终点货币」，只进不出
       */
      const TERMINAL_CURRENCIES = [AssetCode.STAR_STONE]
      if (TERMINAL_CURRENCIES.includes(newRule.from_asset_code)) {
        errors.push(
          `转换规则被拒绝：${newRule.from_asset_code} 是终点货币（只进不出），禁止转化为其他资产。` +
            `如需调整此规则，请修改 TERMINAL_CURRENCIES 配置。`
        )
        return { valid: false, errors }
      }

      /*
       * 🔴 V2.1 移除跨组限制：允许不同 group_code 之间的转换
       * 原跨组校验代码已删除，现在依赖全局套利检测进行风控
       */

      /*
       * 🔴 V2.1 核心修改：全局范围查询规则
       * 查询所有已生效且启用的规则（不再按 group_code 过滤）
       * 这样可以检测跨组规则组合形成的闭环和套利路径
       */
      const effectiveRules = await AssetConversionRule.findAll({
        where: {
          status: 'active',
          [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: new Date() } }]
        },
        /* AssetConversionRule 已直接包含 from_asset_code / to_asset_code，无需 include */
        transaction: options.transaction
      })

      // 将新规则加入规则集合（模拟新规则启用后的图结构）
      const allRules = [...effectiveRules, newRule]

      // 构建规则有向图（全局规则）
      const graph = this.buildRuleGraph(allRules)

      // 1. 循环拦截检测（全局范围检测）
      const cycleResult = this.detectCycle(graph)
      if (cycleResult.hasCycle) {
        const cyclePath = cycleResult.cycle.join(' → ')
        errors.push(`检测到循环转换路径（全局）：${cyclePath}。` + '禁止出现可回到自身的转换闭环。')
      }

      // 2. 套利闭环检测（负环检测，全局范围检测）
      const negativeCycleResult = this.detectNegativeCycle(graph)
      if (negativeCycleResult.hasNegativeCycle) {
        const cyclePath = negativeCycleResult.cycle.join(' → ')
        errors.push(
          `检测到套利闭环（全局）：${cyclePath}。` +
            '沿此环路转换一圈可增加资产总量，存在套利风险。'
        )
      }

      return {
        valid: errors.length === 0,
        errors
      }
    } catch (error) {
      console.error('风控校验失败:', error)
      return {
        valid: false,
        errors: [`风控校验失败：${error.message}`]
      }
    }
  }
}

module.exports = MaterialConversionValidator
