#!/usr/bin/env node
'use strict'

/**
 * Route transformer v3: works on the full string, not line-by-line.
 * Removes only outer try/catch (containing handleServiceError in catch body).
 * Preserves inner try/catch blocks.
 * Wraps async handlers with asyncHandler.
 */

const fs = require('fs')

const files = process.argv.slice(2)
if (!files.length) { console.error('Usage: node script.js <file...>'); process.exit(1) }

function findMatchingBrace(code, openIdx) {
  let d = 0
  for (let i = openIdx; i < code.length; i++) {
    if (code[i] === '{') d++
    if (code[i] === '}') { d--; if (d === 0) return i }
  }
  return -1
}

function processFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8')
  const orig = code

  // Determine middleware path
  let relPath = filePath.includes('routes/v4/shop/')
    ? '../../../../middleware/validation'
    : '../../../middleware/validation'

  // --- Step 1: Remove outer try/catch blocks (ones with handleServiceError) ---
  // Strategy: find each "try {" and check if its catch contains handleServiceError
  let safety = 0
  while (safety++ < 50) {
    // Find next try {
    const tryRe = /(\n)([ \t]*)try\s*\{/g
    let tryMatch = null
    let found = false

    while ((tryMatch = tryRe.exec(code)) !== null) {
      const tryStart = tryMatch.index + tryMatch[1].length // start of "  try {"
      const indent = tryMatch[2]
      const openBrace = code.indexOf('{', tryStart)
      const closeBrace = findMatchingBrace(code, openBrace)
      if (closeBrace === -1) continue

      // Check for catch after the closing brace
      const afterTry = code.substring(closeBrace + 1)
      const catchRe = /^\s*catch\s*\([^)]*\)\s*\{/
      const catchMatch = afterTry.match(catchRe)
      if (!catchMatch) continue

      const catchOpenBrace = closeBrace + 1 + afterTry.indexOf('{')
      const catchCloseBrace = findMatchingBrace(code, catchOpenBrace)
      if (catchCloseBrace === -1) continue

      const catchBody = code.substring(catchOpenBrace + 1, catchCloseBrace)

      // Only remove if this is the OUTER catch (contains handleServiceError)
      if (!catchBody.includes('handleServiceError')) continue

      // Extract try body
      const tryBody = code.substring(openBrace + 1, closeBrace)

      // Dedent try body by 2 spaces
      const dedented = tryBody.split('\n').map(line => {
        if (line.startsWith(indent + '  ')) return indent + line.substring(indent.length + 2)
        if (line.match(/^\s*$/)) return line
        return line
      }).join('\n')

      // Replace entire try { ... } catch { ... } with dedented try body
      code = code.substring(0, tryStart) + dedented + code.substring(catchCloseBrace + 1)
      found = true
      break
    }

    if (!found) break
  }

  // --- Step 2: Wrap async (req, res) => { with asyncHandler ---
  // Match patterns like: , async (req, res) => {
  // But NOT already inside asyncHandler(
  code = code.replace(
    /,(\s*)async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/g,
    (match, ws, offset) => {
      // Check if already wrapped
      const before = code.substring(Math.max(0, code.indexOf(match) - 50), code.indexOf(match))
      if (before.includes('asyncHandler(')) return match
      return `,${ws}asyncHandler(async (req, res) => {`
    }
  )

  // --- Step 3: Fix closing parens for asyncHandler ---
  let pos = 0
  safety = 0
  while (safety++ < 200) {
    const ahIdx = code.indexOf('asyncHandler(async', pos)
    if (ahIdx === -1) break

    const openBrace = code.indexOf('{', ahIdx + 18)
    if (openBrace === -1) { pos = ahIdx + 1; continue }

    const closeBrace = findMatchingBrace(code, openBrace)
    if (closeBrace === -1) { pos = ahIdx + 1; continue }

    // After }, find next non-whitespace
    const rest = code.substring(closeBrace + 1)
    const nws = rest.search(/\S/)
    if (nws < 0) { pos = closeBrace + 1; continue }

    const nextTwo = rest.substring(nws, nws + 2)
    if (nextTwo === '))') {
      pos = closeBrace + 1 + nws + 2
    } else if (nextTwo[0] === ')') {
      // Need to add one more )
      const insertAt = closeBrace + 1 + nws
      code = code.substring(0, insertAt) + ')' + code.substring(insertAt)
      pos = insertAt + 2
    } else {
      pos = closeBrace + 1
    }
  }

  // --- Step 4: Update imports ---
  const esc = relPath.replace(/\//g, '\\/')
  const impRe = new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*require\\(['"]${esc}['"]\\)`)
  const impMatch = code.match(impRe)

  if (impMatch) {
    const parts = impMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    const hasAH = parts.includes('asyncHandler')
    const newParts = parts.filter(s => s !== 'handleServiceError')
    if (!hasAH) newParts.push('asyncHandler')
    if (newParts.length > 0) {
      code = code.replace(impMatch[0], `const { ${newParts.join(', ')} } = require('${relPath}')`)
    }
  } else if (!code.includes('asyncHandler')) {
    // Add import
    const lines = code.split('\n')
    let lastReq = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("require('") || lines[i].includes('require("')) lastReq = i
    }
    if (lastReq >= 0) {
      lines.splice(lastReq + 1, 0, `const { asyncHandler } = require('${relPath}')`)
      code = lines.join('\n')
    }
  }

  // Also remove handleServiceError from any remaining import
  if (code.includes('handleServiceError')) {
    // Check if it's only in imports
    const lines = code.split('\n')
    const usedOutsideImport = lines.some(l => 
      l.includes('handleServiceError') && !l.includes('require(')
    )
    if (!usedOutsideImport) {
      code = code.replace(/,\s*handleServiceError/g, '')
      code = code.replace(/handleServiceError\s*,\s*/g, '')
    }
  }

  // --- Step 5: Remove unused logger import ---
  const logImp = code.match(/const\s+logger\s*=\s*require\([^)]+\)\.logger\n/)
  if (logImp) {
    const without = code.replace(logImp[0], '')
    if (!without.includes('logger.') && !without.includes('logger,') && !without.includes('logger)')) {
      code = code.replace(logImp[0], '')
    }
  }

  // --- Step 6: Clean up blank lines ---
  code = code.replace(/\n{3,}/g, '\n\n')

  if (code !== orig) {
    fs.writeFileSync(filePath, code)
    return true
  }
  return false
}

for (const f of files) {
  const ok = processFile(f)
  console.log(`${ok ? 'OK' : 'SKIP'}: ${f}`)
}
