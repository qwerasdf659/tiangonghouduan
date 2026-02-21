/**
 * 材料资产图标本地映射表
 *
 * 设计决策（2026-02-21 拍板）：
 * - 材料资产图标 = 游戏道具图标，内嵌前端，通过 asset_code 直接映射本地文件
 * - 优先使用本地映射（零网络请求），后端 icon_url 作为 fallback
 * - 15 个图标总计 ~555KB（暗黑奢华风 256x256 PNG）
 *
 * 使用方式：
 *   import { MATERIAL_ICONS, getMaterialIconUrl } from '@/assets/icons/materials/_mapping.js'
 *   const iconUrl = getMaterialIconUrl(item.asset_code)
 */

/** asset_code → 本地图标路径映射 */
export const MATERIAL_ICONS = {
  DIAMOND: '/assets/icons/materials/diamond.png',
  POINTS: '/assets/icons/materials/points.png',
  BUDGET_POINTS: '/assets/icons/materials/budget-points.png',
  red_shard: '/assets/icons/materials/red-shard.png',
  red_crystal: '/assets/icons/materials/red-crystal.png',
  orange_shard: '/assets/icons/materials/orange-shard.png',
  orange_crystal: '/assets/icons/materials/orange-crystal.png',
  yellow_shard: '/assets/icons/materials/yellow-shard.png',
  yellow_crystal: '/assets/icons/materials/yellow-crystal.png',
  green_shard: '/assets/icons/materials/green-shard.png',
  green_crystal: '/assets/icons/materials/green-crystal.png',
  blue_shard: '/assets/icons/materials/blue-shard.png',
  blue_crystal: '/assets/icons/materials/blue-crystal.png',
  purple_shard: '/assets/icons/materials/purple-shard.png',
  purple_crystal: '/assets/icons/materials/purple-crystal.png'
}

/** 默认降级图标 */
const DEFAULT_ICON = '/assets/icons/materials/diamond.png'

/**
 * 根据 asset_code 获取材料图标 URL
 * 优先本地映射，未匹配时返回默认图标
 *
 * @param {string} assetCode - 材料资产代码（如 red_shard、DIAMOND）
 * @returns {string} 图标路径
 */
export function getMaterialIconUrl(assetCode) {
  return MATERIAL_ICONS[assetCode] || DEFAULT_ICON
}
