'use strict'

const express = require('express')
const router = express.Router()

router.use('/templates', require('./templates'))
router.use('/works', require('./works'))
router.use('/materials', require('./materials'))
router.use('/stats', require('./stats'))

module.exports = router
