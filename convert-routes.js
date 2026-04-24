#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = __dirname

const FILES = [
  'routes/v4/activities.js',
  'routes/v4/assets/conversion.js',
  'routes/v4/auth/login.js',
  'routes/v4/auth/permissions.js',
  'routes/v4/backpack/index.js',
  'routes/v4/console/ad/ad-campaigns.js',
  'routes/v4/console/ad/ad-reports.js',
  'routes/v4/console/ad/ad-slots.js',
  'routes/v4/console/analytics/analytics.js',
  'routes/v4/console/analytics/business-records.js',
  'routes/v4/console/analytics/campaign-budget.js',
  'routes/v4/console/analytics/dashboard.js',
  'routes/v4/console/analytics/multi-dimension-stats.js',
  'routes/v4/console/analytics/pending.js',
  'routes/v4/console/analytics/report-templates.js',
  'routes/v4/console/analytics/system-data.js',
  'routes/v4/console/assets/conversion-rules.js',
  'routes/v4/console/assets/index.js',
  'routes/v4/console/assets/portfolio.js',
  'routes/v4/console/bids/management.js'
]

function skipString(src, i) {
  const q = src[i]
  i++
  if (q === '`') {
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue }
      if (src[i] === '`') return i + 1
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; let d = 1
        while (i < src.length && d > 0) {
          if (src[i] === '{') d++
          else if (src[i] === '}') d--
          else if (src[i] === '`' || src[i] === "'" || src[i] === '"') { i = skipString(src, i); continue }
          i++
        }
        continue
      }
      i++
    }
  } else {
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue }
      if (src[i] === q) return i + 1
      i++
    }
  }
  return i
}

function findMatchingBrace(src, open) {
  if (src[open] !== '{') return -1
  let d = 1, i = open + 1
  while (i < src.length && d > 0) {
    const c = src[i]
    if (c === '{') d++
    else if (c === '}') d--
    else if (c === "'" || c === '"' || c === '`') { i = skipString(src, i); continue }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    else if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    i++
  }
  return d === 0 ? i - 1 : -1
}

function findMatchingParen(src, open) {
  if (src[open] !== '(') return -1
  let d = 1, i = open + 1
  while (i < src.length && d > 0) {
    const c = src[i]
    if (c === '(') d++
    else if (c === ')') d--
    else if (c === '{') { const e = findMatchingBrace(src, i); if (e !== -1) { i = e + 1; continue } }
    else if (c === "'" || c === '"' || c === '`') { i = skipString(src, i); continue }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    else if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    i++
  }
  return d === 0 ? i - 1 : -1
}

/**
 * Find all try/catch blocks in the source and return their positions.
 * Each entry: { tryKeyword, tryBraceOpen, tryBraceClose, catchKeyword, catchBraceOpen, catchBraceClose }
 */
function findTryCatchBlocks(src) {
  const blocks = []
  const re = /\btry\s*\{/g
  let m
  while ((m = re.exec(src)) !== null) {
    const tryKeyword = m.index
    const tryBraceOpen = src.indexOf('{', tryKeyword + 3)
    const tryBraceClose = findMatchingBrace(src, tryBraceOpen)
    if (tryBraceClose === -1) continue

    const afterTry = src.substring(tryBraceClose + 1)
    const catchM = afterTry.match(/^\s*catch\s*\(\s*\w+\s*\)\s*\{/)
    if (!catchM) continue

    const catchKeyword = tryBraceClose + 1 + afterTry.indexOf('catch')
    const catchBraceOpen = src.indexOf('{', catchKeyword + 5)
    const catchBraceClose = findMatchingBrace(src, catchBraceOpen)
    if (catchBraceClose === -1) continue

    const catchBody = src.substring(catchBraceOpen + 1, catchBraceClose)

    blocks.push({
      tryKeyword,
      tryBraceOpen,
      tryBraceClose,
      catchKeyword,
      catchBraceOpen,
      catchBraceClose,
      catchBody
    })
  }
  return blocks
}

/**
 * Check if a try/catch is the outermost one in a route handler
 * (i.e., its catch body contains handleServiceError)
 */
function isRouteHandlerTryCatch(block) {
  return block.catchBody.includes('handleServiceError')
}

/**
 * Remove the outermost try/catch, keeping only the try body.
 * Dedent the try body by one level (2 spaces).
 */
function removeTryCatch(src, block) {
  const tryBody = src.substring(block.tryBraceOpen + 1, block.tryBraceClose)

  // Determine indentation of the try keyword
  let lineStart = block.tryKeyword
  while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--
  const tryLineIndent = src.substring(lineStart, block.tryKeyword)

  // Dedent try body by 2 spaces
  const lines = tryBody.split('\n')
  // Remove leading/trailing empty lines
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()

  const dedented = lines.map(line => {
    if (line.trim() === '') return ''
    if (line.startsWith('  ')) return line.substring(2)
    return line
  }).join('\n')

  // Replace from tryKeyword to catchBraceClose
  const before = src.substring(0, block.tryKeyword)
  const after = src.substring(block.catchBraceClose + 1)

  return before + dedented + '\n' + after
}

/**
 * For a route handler that is NOT wrapped in asyncHandler, wrap it.
 * Pattern: router.METHOD('path', ..., async (req, res) => { ... })
 * becomes: router.METHOD('path', ..., asyncHandler(async (req, res) => { ... }))
 */
function wrapWithAsyncHandler(src) {
  // Find all router.METHOD( calls
  const routerRe = /router\.(get|post|put|patch|delete)\s*\(/g
  let m
  const wraps = []

  while ((m = routerRe.exec(src)) !== null) {
    const routerCallStart = m.index
    const openParen = src.indexOf('(', routerCallStart + m[1].length + 7)
    const closeParen = findMatchingParen(src, openParen)
    if (closeParen === -1) continue

    // Find the last `async` keyword before the route handler body
    const routeContent = src.substring(openParen + 1, closeParen)

    // Find all `async (req, res` or `async(req, res` in the route content
    const asyncRe = /async\s*\(\s*req\s*,\s*res/g
    let asyncM
    let lastAsyncPos = -1
    while ((asyncM = asyncRe.exec(routeContent)) !== null) {
      lastAsyncPos = asyncM.index
    }
    if (lastAsyncPos === -1) continue

    const absAsyncPos = openParen + 1 + lastAsyncPos

    // Check if already wrapped in asyncHandler
    const before30 = src.substring(Math.max(0, absAsyncPos - 30), absAsyncPos)
    if (before30.includes('asyncHandler(')) continue

    wraps.push({ absAsyncPos, closeParen })
  }

  // Apply in reverse order
  wraps.sort((a, b) => b.absAsyncPos - a.absAsyncPos)
  for (const w of wraps) {
    // Insert `asyncHandler(` before `async`
    src = src.substring(0, w.absAsyncPos) + 'asyncHandler(' + src.substring(w.absAsyncPos)
    const shift = 'asyncHandler('.length
    const newClose = w.closeParen + shift

    // Find the `}` just before the closing `)` of the route
    let j = newClose - 1
    while (j >= 0 && /\s/.test(src[j])) j--
    if (src[j] === '}') {
      src = src.substring(0, j + 1) + ')' + src.substring(j + 1)
    }
  }

  return { src, count: wraps.length }
}

function computeRelativePath(filePath) {
  const parts = filePath.split('/')
  const depth = parts.length - 1
  return '../'.repeat(depth) + 'middleware/validation'
}

function fixImports(src, filePath) {
  const usesAsyncHandler = /asyncHandler\s*\(/.test(src)

  // Check if asyncHandler is already imported
  const lines = src.split('\n')
  let hasAsyncHandlerImport = false
  for (const line of lines) {
    if (line.includes('require') && line.includes('asyncHandler')) {
      hasAsyncHandlerImport = true
      break
    }
  }

  if (usesAsyncHandler && !hasAsyncHandlerImport) {
    // Try to add to existing validation require
    const valReq = /const\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]([^'"]*validation[^'"]*)['"]\s*\)/
    const valMatch = src.match(valReq)
    if (valMatch) {
      const newImports = valMatch[1].trimEnd() + ', asyncHandler'
      src = src.replace(valMatch[0], valMatch[0].replace(valMatch[1], newImports))
    } else {
      // Try shared/middleware require
      const sharedReq = /const\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]([^'"]*shared\/middleware[^'"]*)['"]\s*\)/
      const sharedMatch = src.match(sharedReq)
      if (sharedMatch) {
        if (!sharedMatch[1].includes('asyncHandler')) {
          const newImports = sharedMatch[1].trimEnd() + ', asyncHandler'
          src = src.replace(sharedMatch[0], sharedMatch[0].replace(sharedMatch[1], newImports))
        }
      } else {
        // Add new require line
        const relPath = computeRelativePath(filePath)
        const newLines = src.split('\n')
        let lastReqIdx = -1
        for (let i = 0; i < Math.min(newLines.length, 40); i++) {
          if (newLines[i].includes('require(')) lastReqIdx = i
        }
        if (lastReqIdx >= 0) {
          newLines.splice(lastReqIdx + 1, 0, `const { asyncHandler } = require('${relPath}')`)
          src = newLines.join('\n')
        }
      }
    }
  }

  // Check if handleServiceError is still called (not just imported)
  const importLines = []
  const codeLines = []
  for (const line of src.split('\n')) {
    if (line.includes('require') && line.includes('handleServiceError')) {
      importLines.push(line)
    } else if (/handleServiceError\s*\(/.test(line)) {
      codeLines.push(line)
    }
  }

  // Also check for local function definition of handleServiceError
  const hasLocalDef = /^function handleServiceError/m.test(src)

  if (codeLines.length === 0 && !hasLocalDef) {
    // Remove handleServiceError from imports
    src = removeFromImport(src, 'handleServiceError')
  }

  // Check if logger is still used (not just imported)
  const loggerCallCount = countLoggerCalls(src)
  if (loggerCallCount === 0) {
    src = removeLoggerImport(src)
  }

  return src
}

function removeFromImport(src, name) {
  const lines = src.split('\n')
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('require') && line.includes(name)) {
      // Check if it's the only import
      const singleRe = new RegExp(`const\\s*\\{\\s*${name}\\s*\\}\\s*=\\s*require`)
      if (singleRe.test(line)) {
        // Remove entire line
        continue
      }
      // Remove from destructured list
      let cleaned = line
        .replace(new RegExp(`,\\s*${name}`), '')
        .replace(new RegExp(`${name}\\s*,\\s*`), '')
      result.push(cleaned)
    } else {
      result.push(line)
    }
  }
  return result.join('\n')
}

function countLoggerCalls(src) {
  const lines = src.split('\n')
  let count = 0
  for (const line of lines) {
    if (line.includes('require') && (line.includes("'logger'") || line.includes("logger'") || line.includes('logger"') || line.includes('logger)'))) continue
    // Skip function definitions that reference logger parameter
    if (/function\s+\w+.*logger/.test(line)) continue
    // Count actual logger method calls
    if (/(?:logger|sharedComponents\.logger)\.(info|warn|error|debug)\s*\(/.test(line)) count++
    // Also count logger references like `logger,` in object literals
  }
  return count
}

function removeLoggerImport(src) {
  const lines = src.split('\n')
  const result = []
  for (const line of lines) {
    // Match: const logger = require('...logger...')
    if (/const\s+logger\s*=\s*require\s*\(/.test(line)) {
      continue
    }
    // Match: const { logger, sanitize } = require('...logger...')
    if (/const\s*\{[^}]*logger[^}]*\}\s*=\s*require\s*\(.*logger/.test(line)) {
      // Check if there are other imports
      const match = line.match(/const\s*\{([^}]*)\}\s*=/)
      if (match) {
        const imports = match[1].split(',').map(s => s.trim()).filter(s => s && s !== 'logger')
        if (imports.length === 0) {
          continue // Remove entire line
        }
        // Keep other imports
        const newLine = line.replace(match[1], ' ' + imports.join(', ') + ' ')
        result.push(newLine)
        continue
      }
    }
    // Match: const { logger } = require('...') where logger is the only import
    if (/const\s*\{\s*logger\s*\}\s*=\s*require/.test(line)) {
      continue
    }
    result.push(line)
  }
  return result.join('\n')
}

// ── Main ──
const report = {}
let totalRoutes = 0

for (const file of FILES) {
  const absPath = path.join(ROOT, file)
  let src = fs.readFileSync(absPath, 'utf8')
  let routeCount = 0

  // Phase 1: Remove all try/catch blocks that contain handleServiceError
  let changed = true
  while (changed) {
    changed = false
    const blocks = findTryCatchBlocks(src)
    // Process from last to first to preserve indices
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (isRouteHandlerTryCatch(blocks[i])) {
        src = removeTryCatch(src, blocks[i])
        routeCount++
        changed = true
        break // Re-scan after each removal
      }
    }
  }

  // Phase 2: Wrap unwrapped async route handlers with asyncHandler
  const wrapResult = wrapWithAsyncHandler(src)
  src = wrapResult.src
  // Don't double-count: routes that already had asyncHandler but had try/catch removed
  // were counted in phase 1. Only count newly wrapped routes if they weren't counted.
  if (wrapResult.count > 0 && routeCount === 0) {
    routeCount = wrapResult.count
  }

  // Phase 3: Fix imports
  src = fixImports(src, file)

  // Clean up: remove consecutive blank lines (more than 2)
  src = src.replace(/\n{3,}/g, '\n\n')

  fs.writeFileSync(absPath, src, 'utf8')
  report[file] = routeCount
  totalRoutes += routeCount
  console.log(`✅ ${file}: ${routeCount} route(s) converted`)
}

console.log(`\n📊 Total: ${FILES.length} files, ${totalRoutes} routes converted`)
for (const [f, c] of Object.entries(report)) {
  console.log(`  ${f}: ${c}`)
}
