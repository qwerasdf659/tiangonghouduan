'use strict'

/**
 * Console 域服务统一导出
 *
 * @description 管理后台服务入口
 *
 * 包含服务：
 * - SystemDataQueryService: 系统数据查询服务
 * - SessionQueryService: 会话查询服务
 * - BusinessRecordQueryService: 业务记录查询服务
 * - DashboardQueryService: 仪表盘查询服务
 *
 * @module services/console
 * @version 1.0.0
 * @date 2026-02-01
 */

const SystemDataQueryService = require('./SystemDataQueryService')
const SessionQueryService = require('./SessionQueryService')
const BusinessRecordQueryService = require('./BusinessRecordQueryService')
const DashboardQueryService = require('./DashboardQueryService')

module.exports = {
  SystemDataQueryService,
  SessionQueryService,
  BusinessRecordQueryService,
  DashboardQueryService
}
