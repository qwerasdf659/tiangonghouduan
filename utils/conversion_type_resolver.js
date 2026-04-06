/**
 * 资产转换类型推导工具
 *
 * 从资产元数据（material_asset_types.tier）自动推导转换类型。
 * 支持 display_category 运营覆盖（优先级最高）。
 *
 * 推导规则（基于 tier 比较）：
 * - fromTier < toTier → compose（合成：低阶→高阶）
 * - fromTier > toTier → decompose（分解：高阶→低阶）
 * - fromTier === toTier → exchange（兑换：同阶互换）
 *
 * 优先级：display_category > tier 推导
 *
 * @module utils/conversion_type_resolver
 * @version 1.0.0
 * @date 2026-04-05
 * @see docs/资产转换类型展示方案-前端功能区分设计.md
 */

'use strict'

/** 转换类型常量 */
const CONVERSION_TYPES = {
  COMPOSE: 'compose',
  DECOMPOSE: 'decompose',
  EXCHANGE: 'exchange'
}

/** 转换类型中文标签 */
const CONVERSION_LABELS = {
  compose: '合成',
  decompose: '分解',
  exchange: '兑换'
}

/**
 * 从资产元数据自动推导转换类型
 *
 * @param {Object|null} from_asset_type - 源资产类型（含 tier）
 * @param {number} from_asset_type.tier - 源资产阶级
 * @param {Object|null} to_asset_type - 目标资产类型（含 tier）
 * @param {number} to_asset_type.tier - 目标资产阶级
 * @returns {{ type: string, label: string }} 推导结果
 */
function resolve_conversion_type(from_asset_type, to_asset_type) {
  const from_tier = from_asset_type?.tier ?? 0
  const to_tier = to_asset_type?.tier ?? 0

  if (from_tier < to_tier) {
    return { type: CONVERSION_TYPES.COMPOSE, label: CONVERSION_LABELS.compose }
  }
  if (from_tier > to_tier) {
    return { type: CONVERSION_TYPES.DECOMPOSE, label: CONVERSION_LABELS.decompose }
  }
  return { type: CONVERSION_TYPES.EXCHANGE, label: CONVERSION_LABELS.exchange }
}

/**
 * 获取最终展示分类（display_category 优先，否则 tier 推导）
 *
 * @param {Object} rule - 转换规则（含 display_category + fromAssetType + toAssetType）
 * @param {string|null} rule.display_category - 运营手动设置的分类
 * @param {Object|null} rule.fromAssetType - 源资产类型关联
 * @param {Object|null} rule.toAssetType - 目标资产类型关联
 * @returns {{ conversion_type: string, conversion_label: string, type_source: string }} 展示分类结果
 */
function resolve_display_category(rule) {
  /* 运营覆盖优先 */
  if (rule.display_category) {
    return {
      conversion_type: rule.display_category,
      conversion_label: CONVERSION_LABELS[rule.display_category] || rule.display_category,
      type_source: 'manual'
    }
  }

  /* 自动推导 */
  const inferred = resolve_conversion_type(rule.fromAssetType, rule.toAssetType)
  return {
    conversion_type: inferred.type,
    conversion_label: inferred.label,
    type_source: 'auto'
  }
}

module.exports = {
  CONVERSION_TYPES,
  CONVERSION_LABELS,
  resolve_conversion_type,
  resolve_display_category
}
