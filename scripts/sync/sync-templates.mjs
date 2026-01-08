#!/usr/bin/env node
/**
 * sync-templates.mjs
 * Fetch the latest complete_email_templates.json from the repository (preferring main,
 * then falling back to gh-pages) and write it into the repository root + public/
 * before build. This keeps local copy aligned with remote source-of-truth.
 * 
 * For private repos, uses GitHub API with token from environment variable GH_TOKEN
 * or reads from local git credential helper (gh CLI).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const log = (msg) => process.stdout.write(`[sync-templates] ${msg}\n`)

function getRepoSlug() {
  // Try environment first (useful in CI)
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY
  }
  try {
    const remote = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    // remote can be https://github.com/owner/repo.git or git@github.com:owner/repo.git
    let m = remote.match(/github.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (m) return `${m[1]}/${m[2]}`
  } catch (e) {
    log('Could not determine git remote origin; will try package.json repository.url')
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const url = pkg?.repository?.url || ''
    const m = url.match(/github.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (m) return `${m[1]}/${m[2]}`
  } catch {}
  return null
}

function getGitHubToken() {
  // Try environment variables
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  
  // Try gh CLI auth (for local development)
  try {
    const token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (token) return token
  } catch {}
  
  return null
}

async function fetchFromGitHubAPI(slug, branch, token) {
  const [owner, repo] = slug.split('/')
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/complete_email_templates.json?ref=${branch}`
  
  log(`Attempt fetch via GitHub API (${branch})...`)
  
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'sync-templates-script'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  try {
    const resp = await fetch(apiUrl, { headers })
    if (!resp.ok) {
      log(` -> HTTP ${resp.status}`)
      return null
    }
    const data = await resp.json()
    // GitHub API returns base64 encoded content
    const content = Buffer.from(data.content, 'base64').toString('utf8')
    JSON.parse(content) // validate JSON
    return content
  } catch (e) {
    log(` -> Error: ${e.message}`)
    return null
  }
}

async function fetchFromRawURL(url) {
  log(`Attempt fetch ${url}`)
  try {
    const resp = await fetch(url, { cache: 'no-store' })
    if (!resp.ok) {
      log(` -> HTTP ${resp.status}`)
      return null
    }
    const body = await resp.text()
    JSON.parse(body) // validate
    return body
  } catch (e) {
    log(` -> Error: ${e.message}`)
    return null
  }
}

async function main() {
  // Skip in CI when templates are already up-to-date
  if (process.env.SKIP_TEMPLATE_SYNC === 'true' || process.env.SKIP_TEMPLATE_SYNC === '1') {
    log('SKIP_TEMPLATE_SYNC is set, skipping sync.')
    return
  }
  
  const slug = getRepoSlug()
  if (!slug) {
    log('Repo slug not found; aborting sync.')
    return
  }
  
  const token = getGitHubToken()
  if (token) {
    log('GitHub token found, will use API for private repo support.')
  }
  
  let text = null
  let source = null
  
  // Try GitHub API first (works for private repos)
  if (token) {
    text = await fetchFromGitHubAPI(slug, 'main', token)
    if (text) source = 'GitHub API (main)'
    
    if (!text) {
      text = await fetchFromGitHubAPI(slug, 'gh-pages', token)
      if (text) source = 'GitHub API (gh-pages)'
    }
  }
  
  // Fallback to raw URLs (for public repos)
  if (!text) {
    const candidates = [
      `https://raw.githubusercontent.com/${slug}/main/complete_email_templates.json`,
      `https://raw.githubusercontent.com/${slug}/gh-pages/complete_email_templates.json`
    ]
    for (const url of candidates) {
      text = await fetchFromRawURL(url)
      if (text) {
        source = url
        break
      }
    }
  }
  
  if (!text) {
    log('No remote JSON fetched; keeping existing local file.')
    return
  }
  
  try {
    JSON.parse(text) // final validation
  } catch (e) {
    log(`Validation failed unexpectedly: ${e.message}`)
    return
  }
  
  const rootFile = path.resolve('complete_email_templates.json')
  const publicFile = path.resolve('public', 'complete_email_templates.json')
  try {
    fs.writeFileSync(rootFile, text)
    fs.mkdirSync(path.dirname(publicFile), { recursive: true })
    fs.writeFileSync(publicFile, text)
    log(`Updated local complete_email_templates.json from ${source}.`)
  } catch (e) {
    log(`Write failed: ${e.message}`)
  }
}

main().catch(e => { log(`Unexpected error: ${e.message}`); process.exitCode = 1 })
