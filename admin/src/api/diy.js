/**
 * DIY 饰品设计引擎 — 管理端 API 模块
 *
 * @module api/diy
 * @description DIY 款式模板 CRUD 接口封装
 *
 * 后端路由映射：
 * - 管理端模板: /api/v4/console/diy/templates/*
 * - 用户端模板: /api/v4/diy/templates/*
 *
 * 后端返回字段（管理端列表）：
 * - data.rows[]: diy_template_id, template_code, display_name, category_id,
 *   layout, bead_rules, sizing_rules, capacity_rules, material_group_codes,
 *   preview_media_id, base_image_media_id, status, is_enabled, sort_order,
 *   meta, created_at, updated_at, category{}, preview_media{}, base_image_media{}
 * - data.count: number
 *
 * @version 2.0.0
 * @since 2026-03-31
 */

import { API_PREFIX, request, buildURL } from './base.js'

export const DIY_ENDPOINTS = {
  TEMPLATES: `${API_PREFIX}/console/diy/templates`,
  TEMPLATE_DETAIL: `${API_PREFIX}/console/diy/templates/:id`,
  TEMPLATE_STATUS: `${API_PREFIX}/console/diy/templates/:id/status`,
  WORKS: `${API_PREFIX}/console/diy/works`,
  WORK_DETAIL: `${API_PREFIX}/console/diy/works/:id`,
  MATERIALS: `${API_PREFIX}/console/diy/materials`,
  MATERIAL_DETAIL: `${API_PREFIX}/console/diy/materials/:id`,
  STATS: `${API_PREFIX}/console/diy/stats`,
  CATEGORIES_TREE: `${API_PREFIX}/console/dictionaries/categories/tree`
}

/**
 * 获取管理端模板列表（分页/筛选）
 * @param {Object} params - { page, page_size, status, is_enabled, category_id, keyword }
 * @returns {Promise<{success, data: {rows, count}}>}
 */
export async function getTemplateList(params = {}) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATES, {}, params)
  return request({ url })
}

/**
 * 获取模板详情
 * @param {number|string} id - diy_template_id
 * @returns {Promise<{success, data: DiyTemplate}>}
 */
export async function getTemplateDetail(id) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATE_DETAIL, { id })
  return request({ url })
}

/**
 * 创建模板
 * @param {Object} data - 模板数据
 * @returns {Promise<{success, data: DiyTemplate}>}
 */
export async function createTemplate(data) {
  return request({
    url: DIY_ENDPOINTS.TEMPLATES,
    method: 'POST',
    data
  })
}

/**
 * 更新模板
 * @param {number|string} id - diy_template_id
 * @param {Object} data - 更新数据
 * @returns {Promise<{success, data: DiyTemplate}>}
 */
export async function updateTemplate(id, data) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATE_DETAIL, { id })
  return request({ url, method: 'PUT', data })
}

/**
 * 删除模板
 * @param {number|string} id - diy_template_id
 * @returns {Promise<{success}>}
 */
export async function deleteTemplate(id) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATE_DETAIL, { id })
  return request({ url, method: 'DELETE' })
}

/**
 * 变更模板状态（发布/下线/归档）
 * @param {number|string} id - diy_template_id
 * @param {string} status - 目标状态（published / archived）
 * @returns {Promise<{success, data: DiyTemplate}>}
 */
export async function updateTemplateStatus(id, status) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATE_STATUS, { id })
  return request({ url, method: 'PUT', data: { status } })
}

/**
 * 更新模板槽位定义（Konva 编辑器保存）
 * @param {number|string} id - diy_template_id
 * @param {Object} data - { slot_definitions: Array }
 * @returns {Promise<{success, data: DiyTemplate}>}
 */
export async function updateSlotDefinitions(id, data) {
  const url = buildURL(DIY_ENDPOINTS.TEMPLATE_DETAIL, { id })
  return request({ url, method: 'PUT', data: { layout: data } })
}

/**
 * 获取分类树（用于模板分类选择）
 * @returns {Promise<{success, data: {tree: Category[]}}>}
 */
export async function getCategoriesTree() {
  return request({ url: DIY_ENDPOINTS.CATEGORIES_TREE })
}

/**
 * 管理端获取所有用户作品列表
 * @param {Object} params - { page, page_size, status, template_id, keyword }
 * @returns {Promise<{success, data: {rows, count}}>}
 */
export async function getAdminWorkList(params = {}) {
  const url = buildURL(DIY_ENDPOINTS.WORKS, {}, params)
  return request({ url })
}

/**
 * 管理端获取作品详情
 * @param {number|string} id - diy_work_id
 * @returns {Promise<{success, data: DiyWork}>}
 */
export async function getAdminWorkDetail(id) {
  const url = buildURL(DIY_ENDPOINTS.WORK_DETAIL, { id })
  return request({ url })
}

/**
 * 获取 DIY 统计数据
 * @returns {Promise<{success, data: {templates, works, template_ranking}}>}
 */
export async function getDiyStats() {
  return request({ url: DIY_ENDPOINTS.STATS })
}

// ==================== 材料（珠子/宝石素材）管理 ====================

/**
 * 管理端获取材料列表
 * @param {Object} params - { page, page_size, group_code, diameter, keyword }
 * @returns {Promise<{success, data: {rows, count}}>}
 */
export async function getMaterialList(params = {}) {
  const url = buildURL(DIY_ENDPOINTS.MATERIALS, {}, params)
  return request({ url })
}

// 别名，供管理端页面使用
export const getAdminMaterialList = getMaterialList

/**
 * 管理端获取材料详情
 * @param {number|string} id - diy_material_id
 * @returns {Promise<{success, data: DiyMaterial}>}
 */
export async function getMaterialDetail(id) {
  const url = buildURL(DIY_ENDPOINTS.MATERIAL_DETAIL, { id })
  return request({ url })
}

/**
 * 创建材料
 * @param {Object} data - 材料数据
 * @returns {Promise<{success, data: DiyMaterial}>}
 */
export async function createMaterial(data) {
  return request({ url: DIY_ENDPOINTS.MATERIALS, method: 'POST', data })
}

/**
 * 更新材料
 * @param {number|string} id - diy_material_id
 * @param {Object} data - 更新数据
 * @returns {Promise<{success, data: DiyMaterial}>}
 */
export async function updateMaterial(id, data) {
  const url = buildURL(DIY_ENDPOINTS.MATERIAL_DETAIL, { id })
  return request({ url, method: 'PUT', data })
}

/**
 * 删除材料
 * @param {number|string} id - diy_material_id
 * @returns {Promise<{success}>}
 */
export async function deleteMaterial(id) {
  const url = buildURL(DIY_ENDPOINTS.MATERIAL_DETAIL, { id })
  return request({ url, method: 'DELETE' })
}
