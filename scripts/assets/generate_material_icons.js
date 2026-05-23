#!/usr/bin/env node
/**
 * 材料图标生成脚本
 *
 * 使用 AI 图像生成 API 批量生成游戏风格材料图标
 * 支持: OpenAI DALL-E 3 / Stability AI SDXL
 *
 * 用法:
 *   # 设置环境变量
 *   export IMAGE_GEN_PROVIDER=openai          # 或 stability
 *   export IMAGE_GEN_API_KEY=sk-xxx
 *
 *   # 生成全部图标
 *   node scripts/assets/generate_material_icons.js
 *
 *   # 生成指定图标
 *   node scripts/assets/generate_material_icons.js --only star_stone,red_core_gem
 *
 *   # 预览 prompt（不实际调用 API）
 *   node scripts/assets/generate_material_icons.js --dry-run
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const sharp = require('sharp')

const OUTPUT_DIR = path.resolve(__dirname, '../../admin/dist/assets/icons/materials')
const OUTPUT_SIZE = 256

const PROVIDER = process.env.IMAGE_GEN_PROVIDER || 'openai'
const API_KEY = process.env.IMAGE_GEN_API_KEY

const STYLE_PREFIX = [
  'Dark luxury RPG game icon, 256x256 pixel art style,',
  'black background with subtle golden glow,',
  'high detail gemstone/crystal material,',
  'centered single item, no text, no border,'
].join(' ')

const MATERIAL_PROMPTS = {
  star_stone: {
    prompt: 'a radiant star-shaped gemstone glowing with warm golden-white light, faceted crystal surface reflecting starlight',
    color: 'golden-white'
  },
  star_stone_quota: {
    prompt: 'a star-shaped gemstone with a small quota/limit badge, glowing amber and silver, slightly dimmer than pure star stone',
    color: 'amber-silver'
  },
  points: {
    prompt: 'a luxurious golden coin with an embedded diamond center, radiating warm golden particles',
    color: 'gold'
  },
  budget_points: {
    prompt: 'a silver-gold hybrid coin with budget/savings motif, subtle green accent glow indicating value',
    color: 'silver-gold-green'
  },
  red_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with intense crimson red energy, jagged edges with inner fire',
    color: 'crimson-red'
  },
  red_core_gem: {
    prompt: 'a perfectly cut large ruby gemstone radiating deep red power, polished facets with inner flame',
    color: 'deep-red'
  },
  orange_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with warm orange energy, like captured sunset fire',
    color: 'orange'
  },
  orange_core_gem: {
    prompt: 'a perfectly cut large orange topaz gemstone, warm amber glow with molten core visible inside',
    color: 'orange-amber'
  },
  yellow_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with bright yellow lightning energy, electric sparks',
    color: 'yellow-electric'
  },
  yellow_core_gem: {
    prompt: 'a perfectly cut large yellow citrine gemstone, brilliant sunshine glow with golden facets',
    color: 'yellow-gold'
  },
  green_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with emerald green nature energy, organic vine patterns',
    color: 'emerald-green'
  },
  green_core_gem: {
    prompt: 'a perfectly cut large emerald gemstone, deep forest green with inner life force swirling',
    color: 'emerald'
  },
  blue_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with icy blue energy, frost crystals forming on edges',
    color: 'ice-blue'
  },
  blue_core_gem: {
    prompt: 'a perfectly cut large sapphire gemstone, deep ocean blue with swirling arcane energy inside',
    color: 'sapphire-blue'
  },
  purple_core_shard: {
    prompt: 'a sharp angular crystal shard glowing with mystical purple energy, arcane runes floating nearby',
    color: 'purple-arcane'
  },
  purple_core_gem: {
    prompt: 'a perfectly cut large amethyst gemstone, deep violet with cosmic nebula patterns inside',
    color: 'deep-purple'
  }
}

function parseArgs () {
  const args = process.argv.slice(2)
  const options = { dryRun: false, only: null }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true
    } else if (args[i] === '--only' && args[i + 1]) {
      options.only = args[++i].split(',').map(s => s.trim())
    }
  }
  return options
}

async function generateWithOpenAI (prompt, outputPath) {
  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: 'dall-e-3',
      prompt: `${STYLE_PREFIX} ${prompt}`,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      response_format: 'b64_json'
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  )

  const imageData = Buffer.from(response.data.data[0].b64_json, 'base64')
  await sharp(imageData)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 90 })
    .toFile(outputPath)
}

async function generateWithStability (prompt, outputPath) {
  const response = await axios.post(
    'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
    {
      text_prompts: [
        { text: `${STYLE_PREFIX} ${prompt}`, weight: 1 },
        { text: 'text, watermark, blurry, low quality, border, frame', weight: -1 }
      ],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      samples: 1,
      steps: 40
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 60000
    }
  )

  const imageData = Buffer.from(response.data.artifacts[0].base64, 'base64')
  await sharp(imageData)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 90 })
    .toFile(outputPath)
}

async function generateIcon (assetCode, config) {
  const filename = assetCode.replace(/_/g, '-') + '.png'
  const outputPath = path.join(OUTPUT_DIR, filename)

  const generator = PROVIDER === 'stability' ? generateWithStability : generateWithOpenAI
  await generator(config.prompt, outputPath)

  const stats = fs.statSync(outputPath)
  return { assetCode, filename, size: stats.size }
}

async function main () {
  const options = parseArgs()

  console.log('=== 材料图标生成器 ===')
  console.log(`提供商: ${PROVIDER}`)
  console.log(`输出目录: ${OUTPUT_DIR}`)
  console.log(`输出尺寸: ${OUTPUT_SIZE}x${OUTPUT_SIZE}`)
  console.log('')

  if (!options.dryRun && !API_KEY) {
    console.error('错误: 未设置 IMAGE_GEN_API_KEY 环境变量')
    console.error('用法: export IMAGE_GEN_API_KEY=your-api-key')
    process.exit(1)
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const entries = Object.entries(MATERIAL_PROMPTS)
    .filter(([code]) => !options.only || options.only.includes(code))

  if (entries.length === 0) {
    console.error('错误: 没有匹配的图标可生成')
    process.exit(1)
  }

  console.log(`待生成: ${entries.length} 个图标\n`)

  if (options.dryRun) {
    for (const [code, config] of entries) {
      const filename = code.replace(/_/g, '-') + '.png'
      console.log(`[预览] ${filename}`)
      console.log(`  Prompt: ${STYLE_PREFIX} ${config.prompt}`)
      console.log(`  Color: ${config.color}\n`)
    }
    console.log('(--dry-run 模式，未实际调用 API)')
    return
  }

  const results = []
  const errors = []

  for (const [code, config] of entries) {
    const filename = code.replace(/_/g, '-') + '.png'
    process.stdout.write(`生成中: ${filename} ...`)

    try {
      const result = await generateIcon(code, config)
      results.push(result)
      console.log(` 完成 (${(result.size / 1024).toFixed(1)}KB)`)
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message
      errors.push({ code, error: msg })
      console.log(` 失败: ${msg}`)
    }

    // 避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log('\n=== 生成结果 ===')
  console.log(`成功: ${results.length}/${entries.length}`)
  if (errors.length > 0) {
    console.log(`失败: ${errors.length}`)
    errors.forEach(e => console.log(`  - ${e.code}: ${e.error}`))
  }

  const totalSize = results.reduce((sum, r) => sum + r.size, 0)
  console.log(`总大小: ${(totalSize / 1024).toFixed(1)}KB`)
}

main().catch(err => {
  console.error('脚本执行失败:', err.message)
  process.exit(1)
})
