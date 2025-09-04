#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises'
import path from 'node:path'

function normKey(type, name) {
  return `${(type || '').toLowerCase().trim()}|${(name || '').toLowerCase().trim()}`
}

async function loadJSON(filePath) {
  const raw = await readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${e.message}`)
  }
}

async function main() {
  const cwd = process.cwd()
  const nodesDataPath = path.resolve(cwd, 'public', 'nodesData.json')

  // Resolve source path (CLI override: --source <path> or --source=<path>)
  let cliSource = null
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a === '--source' && i + 1 < process.argv.length) {
      cliSource = process.argv[i + 1]
      break
    } else if (a.startsWith('--source=')) {
      cliSource = a.slice('--source='.length)
      break
    }
  }

  const candidates = cliSource
    ? [path.resolve(cwd, cliSource)]
    : [
        path.resolve(cwd, 'dist', 'OLDdata.js'),
        path.resolve(cwd, 'dist', 'data.js'),
        path.resolve(cwd, 'public', 'data.json'),
        path.resolve(cwd, 'public', 'data.js'),
      ]

  // Load source data (object with { nodes: [...] })
  let dataObj = null
  let usedSourcePath = null
  for (const p of candidates) {
    try {
      dataObj = await loadJSON(p)
      usedSourcePath = p
      break
    } catch (e) {
      // If file not found or parse failed, try next candidate
      if (e && (e.code === 'ENOENT' || String(e.message || '').startsWith('Failed to parse JSON'))) {
        continue
      }
      throw e
    }
  }

  if (!dataObj) {
    throw new Error(
      'Unable to load a source dataset. Tried: ' + candidates.join(', ')
    )
  }

  console.log(`Using source dataset: ${usedSourcePath}`)
  const sourceNodes = Array.isArray(dataObj?.nodes) ? dataObj.nodes : []

  // Build a lookup map by (type,name) for tag_ids from source
  const sourceTagMap = new Map()
  for (const n of sourceNodes) {
    if (!n || !n.type || !n.name) continue
    const key = normKey(n.type, n.name)
    const tagIds = Array.isArray(n.tag_ids)
      ? n.tag_ids
      : Array.isArray(n.tags)
      ? n.tags
      : []
    sourceTagMap.set(key, tagIds)
  }

  // Load destination nodes (nodesData.json is an array of nodes)
  const destNodes = await loadJSON(nodesDataPath)
  if (!Array.isArray(destNodes)) {
    throw new Error('public/nodesData.json must be an array of nodes')
  }

  let updated = 0
  let convertedLegacy = 0
  let matchedByName = 0

  for (const node of destNodes) {
    if (!node || !node.type || !node.name) continue

    // Prefer copying from data.js by (type,name)
    const key = normKey(node.type, node.name)
    const incoming = sourceTagMap.get(key)

    // Start with existing tag_ids if present
    let tagIds = Array.isArray(node.tag_ids) ? [...node.tag_ids] : undefined

    // If data.js has tags for this node, use them (even if empty to normalize)
    if (incoming !== undefined) {
      tagIds = Array.isArray(incoming) ? [...incoming] : []
      matchedByName++
    }

    // If still undefined, fall back to legacy 'tags' on this node
    if (tagIds === undefined && Array.isArray(node.tags)) {
      tagIds = [...node.tags]
      convertedLegacy++
    }

    // Ensure tag_ids exists at least as []
    if (tagIds === undefined) tagIds = []

    // Apply changes if different or if legacy field exists
    const hadLegacy = Object.prototype.hasOwnProperty.call(node, 'tags')
    const before = JSON.stringify(node.tag_ids ?? null)
    const after = JSON.stringify(tagIds)

    if (before !== after || hadLegacy) {
      node.tag_ids = tagIds
      if (hadLegacy) delete node.tags
      updated++
    }
  }

  // Write back formatted JSON
  await writeFile(nodesDataPath, JSON.stringify(destNodes, null, 2) + '\n', 'utf8')

  console.log('Tag migration by name complete.')
  console.log(`Nodes processed: ${destNodes.length}`)
  console.log(`Updated nodes: ${updated}`)
  console.log(`Matched by (type,name): ${matchedByName}`)
  console.log(`Converted legacy 'tags' -> 'tag_ids': ${convertedLegacy}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
