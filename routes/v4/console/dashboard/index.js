/**
 * 跨域平台概览 — Dashboard 路由聚合入口
 *
 * @route /api/v4/console/dashboard/*
 * @module routes/v4/console/dashboard
 */

'use strict'

const express = require('express')
const router = express.Router()

router.use('/stats', require('./stats'))

module.exports = router
