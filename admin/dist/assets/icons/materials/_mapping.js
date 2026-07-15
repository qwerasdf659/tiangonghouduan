/**
 * 材料资产图标本地映射表
 *
 * 设计决策（2026-02-21 拍板）：
 * - 材料资产图标 = 游戏道具图标，内嵌前端，通过 asset_code 直接映射本地文件
 * - 优先使用本地映射（零网络请求），后端 media_attachments 作为 fallback
 * - 16 个图标总计 ~555KB（暗黑奢华风 256x256 PNG）
 *
 * 使用方式：
 *   import { MATERIAL_ICONS, getMaterialIconUrl } from '@/assets/icons/materials/_mapping.js'
 *   const iconUrl = getMaterialIconUrl(item.asset_code)
 */

/** asset_code → 本地图标路径映射 */
export const MATERIAL_ICONS = {
  star_stone: '/assets/icons/materials/star-stone.png',
  star_stone_quota: '/assets/icons/materials/star-stone-quota.png',
  points: '/assets/icons/materials/points.png',
  budget_points: '/assets/icons/materials/budget-points.png',
  red_core_shard: '/assets/icons/materials/red-core-shard.png',
  red_core_gem: '/assets/icons/materials/red-core-gem.png',
  orange_core_shard: '/assets/icons/materials/orange-core-shard.png',
  orange_core_gem: '/assets/icons/materials/orange-core-gem.png',
  yellow_core_shard: '/assets/icons/materials/yellow-core-shard.png',
  yellow_core_gem: '/assets/icons/materials/yellow-core-gem.png',
  green_core_shard: '/assets/icons/materials/green-core-shard.png',
  green_core_gem: '/assets/icons/materials/green-core-gem.png',
  blue_core_shard: '/assets/icons/materials/blue-core-shard.png',
  blue_core_gem: '/assets/icons/materials/blue-core-gem.png',
  purple_core_shard: '/assets/icons/materials/purple-core-shard.png',
  purple_core_gem: '/assets/icons/materials/purple-core-gem.png'
}

/** 默认降级图标 */
const DEFAULT_ICON = '/assets/icons/materials/star-stone.png'

/**
 * 根据 asset_code 获取材料图标 URL
 * 优先本地映射，未匹配时返回默认图标
 *
 * @param {string} assetCode - 材料资产代码（如 red_core_shard、star_stone）
 * @returns {string} 图标路径
 */
export function getMaterialIconUrl(assetCode) {
  return MATERIAL_ICONS[assetCode] || DEFAULT_ICON
}
