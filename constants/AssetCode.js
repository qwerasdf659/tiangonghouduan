/**
 * 虚拟资产代码常量定义
 *
 * 文件路径：constants/AssetCode.js
 *
 * 职责：
 * - 统一定义所有虚拟资产的 asset_code 常量
 * - 消除服务层、模型层对 asset_code 字符串的硬编码
 * - 键名 UPPER_SNAKE_CASE，值 lower_snake_case（符合 Node.js 生态惯例）
 *
 * 命名规则：
 * - 星石（主货币）：star_stone
 * - 源晶（材料）：{颜色}_core_{形态}，如 red_core_shard / red_core_gem
 * - 积分：points / budget_points
 * - 配额：star_stone_quota
 *
 * 行业对标：
 * - 键大写值小写 = Stripe / GitHub API / Node.js 社区惯例
 * - code 不可变 = 美团 / 阿里 / 京东 / 米哈游共识
 *
 * 创建时间：2026-04-01
 * 版本：V4.1.0
 */

'use strict'

/**
 * 虚拟资产代码枚举
 *
 * @readonly
 * @enum {string}
 *
 * @example
 * const { AssetCode } = require('../constants/AssetCode')
 * if (assetCode === AssetCode.STAR_STONE) { ... }
 */
const AssetCode = Object.freeze({
  // ========== 系统货币 ==========

  /** 星石 — 主货币（原 DIAMOND） */
  STAR_STONE: 'star_stone',

  /** 星石配额 — 主货币的受限配额（原 DIAMOND_QUOTA） */
  STAR_STONE_QUOTA: 'star_stone_quota',

  /** 积分 — 系统积分（原 POINTS） */
  POINTS: 'points',

  /** 预算积分 — 商家预算积分（原 BUDGET_POINTS） */
  BUDGET_POINTS: 'budget_points',

  // ========== 红色源晶 ==========

  /** 红源晶碎片（原 red_shard） */
  RED_CORE_SHARD: 'red_core_shard',

  /** 红源晶（原 red_crystal） */
  RED_CORE_GEM: 'red_core_gem',

  // ========== 橙色源晶 ==========

  /** 橙源晶碎片（原 orange_shard） */
  ORANGE_CORE_SHARD: 'orange_core_shard',

  /** 橙源晶（原 orange_crystal） */
  ORANGE_CORE_GEM: 'orange_core_gem',

  // ========== 黄色源晶 ==========

  /** 黄源晶碎片（原 yellow_shard） */
  YELLOW_CORE_SHARD: 'yellow_core_shard',

  /** 黄源晶（原 yellow_crystal） */
  YELLOW_CORE_GEM: 'yellow_core_gem',

  // ========== 绿色源晶 ==========

  /** 绿源晶碎片（原 green_shard） */
  GREEN_CORE_SHARD: 'green_core_shard',

  /** 绿源晶（原 green_crystal） */
  GREEN_CORE_GEM: 'green_core_gem',

  // ========== 蓝色源晶 ==========

  /** 蓝源晶碎片（原 blue_shard） */
  BLUE_CORE_SHARD: 'blue_core_shard',

  /** 蓝源晶（原 blue_crystal） */
  BLUE_CORE_GEM: 'blue_core_gem',

  // ========== 紫色源晶 ==========

  /** 紫源晶碎片（原 purple_shard） */
  PURPLE_CORE_SHARD: 'purple_core_shard',

  /** 紫源晶（原 purple_crystal） */
  PURPLE_CORE_GEM: 'purple_core_gem'
})

/**
 * 旧 asset_code → 新 asset_code 映射表
 *
 * 用途：
 * - 数据库迁移脚本中批量 UPDATE
 * - 验证脚本中检查是否有旧 code 残留
 *
 * @readonly
 * @type {Object<string, string>}
 */
const ASSET_CODE_MIGRATION_MAP = Object.freeze({
  DIAMOND: 'star_stone',
  DIAMOND_QUOTA: 'star_stone_quota',
  POINTS: 'points',
  BUDGET_POINTS: 'budget_points',
  red_shard: 'red_core_shard',
  red_crystal: 'red_core_gem',
  orange_shard: 'orange_core_shard',
  orange_crystal: 'orange_core_gem',
  yellow_shard: 'yellow_core_shard',
  yellow_crystal: 'yellow_core_gem',
  green_shard: 'green_core_shard',
  green_crystal: 'green_core_gem',
  blue_shard: 'blue_core_shard',
  blue_crystal: 'blue_core_gem',
  purple_shard: 'purple_core_shard',
  purple_crystal: 'purple_core_gem'
})

/**
 * 资产形态枚举（form ENUM）
 *
 * @readonly
 * @enum {string}
 */
const AssetForm = Object.freeze({
  /** 碎片形态 */
  SHARD: 'shard',
  /** 完整宝石形态（原 crystal，已改为 gem） */
  GEM: 'gem',
  /** 自由流通货币 */
  CURRENCY: 'currency',
  /** 受限配额 */
  QUOTA: 'quota'
})

module.exports = {
  AssetCode,
  ASSET_CODE_MIGRATION_MAP,
  AssetForm
}
