/**
 * 何马台 —— Host 半侧
 *
 * 为浏览器半侧提供一条插件私有的 HTTP 桥 `POST /dsh-hema/api`：
 *   · status      —— 预设注册状态（declare.json）+ 人设摘要 + 路径
 *   · personaGet  —— 读出当前生效的人设 prefix 文本（落盘副本）
 *   · personaSave —— 把新的人设 prefix 写回【模板 + 落盘】两份 agent.cordis.yml
 *
 * 为什么走 webServer 而不是 typert/@Remote：与 dsh-purge/redteam 同款理由——
 * 零外部依赖、具名路由是最小且稳定的接缝。跨源由回环 + Origin/Host 校验挡住。
 */
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'

/** Cordis 插件名（与 cordis.patch.yml 的 name: dsh-hema/ui 对应）。 */
export const name = 'dsh-hema-ui'

/** 硬依赖只留 HTTP。 */
export const inject = ['webServer']

/** 请求体上限（人设文本不大，512KB 足够）。 */
const MAX_BODY_BYTES = 512 * 1024

/** 插件根目录（lib/ui.js → 上一级）。 */
function pluginRoot() {
  return fileURLToPath(new URL('..', import.meta.url))
}

function dshHomeOf() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return join(homedir(), '.dsh')
}

/** 落盘副本（宿主注册表实际读取的这份）。 */
function deployedPersonaPath() {
  return join(dshHomeOf(), '.agent-presets', 'hema', 'agent.cordis.yml')
}

/** 包内模板（重装 / HEMA_PRESET_REFRESH=1 时的源）。 */
function templatePersonaPath() {
  return join(pluginRoot(), 'presets', 'hema', 'agent.cordis.yml')
}

function declareStatusPath() {
  return join(dshHomeOf(), '.agent-presets', 'hema', 'declare.json')
}

/**
 * 从 agent.cordis.yml 文本里抽出 persona prefix 正文。
 * 结构：`    prefix: |` 之后，所有以 6 空格开头（或空行）的行都属于它，
 * 直到第一行非空且不以 6 空格开头（即 `# ── shell` 注释）为止。
 */
export function extractPersonaPrefix(text) {
  const lines = String(text || '').split(/\r?\n/)
  const at = lines.findIndex((l) => /^ {4}prefix: \|/.test(l))
  if (at === -1) return null
  const body = []
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') { body.push(''); continue }
    if (/^ {6}/.test(line)) body.push(line.slice(6))
    else break
  }
  while (body.length && body[body.length - 1].trim() === '') body.pop()
  return body.join('\n')
}

/**
 * 把 agent.cordis.yml 里的 persona prefix 整块替换成新文本（其余行原样保留）。
 * @returns `{ ok, error? }`
 */
export function replacePersonaPrefix(text, nextPrefix) {
  const lines = String(text || '').split(/\r?\n/)
  const at = lines.findIndex((l) => /^ {4}prefix: \|/.test(l))
  if (at === -1) return { ok: false, error: '文件里找不到 prefix: | 块' }
  let end = at + 1
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim() === '') { end += 1; continue }
    if (/^ {6}/.test(line)) { end += 1; continue }
    break
  }
  const bodyLines = String(nextPrefix || '').replace(/\r\n/g, '\n').replace(/\t/g, '  ').split('\n')
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop()
  if (bodyLines.length === 0) return { ok: false, error: '人设文本不能为空' }
  const block = ['    prefix: |'].concat(bodyLines.map((l) => (l.trim() === '' ? '' : '      ' + l)))
  const head = lines.slice(0, at)
  const tail = lines.slice(end)
  // tail 以 "# ── shell" 等顶格行开始；块与尾之间保留一个空行。
  const out = head.concat(block, ['']).concat(tail).join('\n')
  return { ok: true, text: out }
}

function readJsonSafe(fp) {
  try { return JSON.parse(readFileSync(fp, 'utf8')) } catch { return null }
}

function handleStatus() {
  const deployed = deployedPersonaPath()
  const template = templatePersonaPath()
  const declare = readJsonSafe(declareStatusPath())
  const pkg = readJsonSafe(join(pluginRoot(), 'package.json')) || {}
  let persona = ''
  let personaFile = ''
  for (const fp of [deployed, template]) {
    if (existsSync(fp)) {
      try {
        persona = extractPersonaPrefix(readFileSync(fp, 'utf8')) || ''
        personaFile = fp
        break
      } catch { /* next */ }
    }
  }
  return {
    ok: true,
    plugin: { name: 'dsh-hema', version: pkg.version || null, description: pkg.description || '' },
    preset: {
      id: 'hema',
      declared: Boolean(declare),
      phase: (declare && declare.phase) || null,
      ok: Boolean(declare && declare.ok),
      broken: (declare && declare.broken) || null,
      registeredAt: (declare && declare.at) || null,
      dir: dirname(deployed),
    },
    persona: {
      file: personaFile || null,
      chars: persona.length,
      preview: persona.slice(0, 200),
    },
    note: '预设里「大案组·何马」由 dsh-hema 注册；人设改动重启 dsh web 后对新会话生效。',
  }
}

function handlePersonaGet() {
  const deployed = deployedPersonaPath()
  const fp = existsSync(deployed) ? deployed : templatePersonaPath()
  if (!existsSync(fp)) return { ok: false, error: '找不到 agent.cordis.yml（预设未安装）' }
  try {
    const text = readFileSync(fp, 'utf8')
    const prefix = extractPersonaPrefix(text)
    if (prefix === null) return { ok: false, error: '文件里没有 persona prefix 块' }
    return { ok: true, file: fp, deployed: fp === deployed, prefix }
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) }
  }
}

function handlePersonaSave(request) {
  const prefix = request && typeof request.prefix === 'string' ? request.prefix : ''
  if (!prefix.trim()) return { ok: false, error: '人设文本不能为空' }
  const targets = [deployedPersonaPath(), templatePersonaPath()]
  const written = []
  for (const fp of targets) {
    if (!existsSync(fp)) continue
    try {
      const text = readFileSync(fp, 'utf8')
      const replaced = replacePersonaPrefix(text, prefix)
      if (!replaced.ok) return { ok: false, error: replaced.error }
      writeFileSync(fp, replaced.text, 'utf8')
      written.push(fp)
    } catch (error) {
      return { ok: false, error: (error && error.message ? error.message : String(error)) + '（' + fp + '）' }
    }
  }
  if (written.length === 0) return { ok: false, error: '模板与落盘副本都不存在，预设未安装' }
  return {
    ok: true,
    written,
    chars: prefix.length,
    note: '已写回 ' + written.length + ' 份文件。重启 dsh web 后，新开的「大案组·何马」会话使用新人设。',
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const err = new Error('request body too large')
        done(reject, err)
        try { req.destroy(err) } catch { /* ignore */ }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => done(resolve, Buffer.concat(chunks).toString('utf8')))
    req.on('error', (err) => done(reject, err))
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * 浏览器半侧回传信标：客户端每走一步就打一个点，落盘到 boot-beacon.log。
 * 用途：行动板按钮不显示时，从磁盘直接判断浏览器死在哪个阶段（取不到 bundle /
 * factory 没执行 / apply 没跑 / slots 注入失败），不再依赖用户开 F12。
 */
function handleClientBoot(request) {
  try {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      stage: String(request.stage || '?').slice(0, 120),
      detail: String(request.detail || '').slice(0, 800),
    }) + '\n'
    appendFileSync(join(pluginRoot(), 'boot-beacon.log'), line, 'utf8')
  } catch { /* 落盘失败不影响应答 */ }
  return { ok: true }
}

/**
 * @param ctx - 插件上下文（已保证 webServer 可用）。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-hema/api',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' })
        return
      }
      // 来源校验：本机回环一律放行（与 redteam ui.js 同款）。
      const remote = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : ''
      const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
      const host = typeof req.headers.host === 'string' ? req.headers.host : ''
      const hostLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
      const origin = req.headers.origin
      const originOk = (() => {
        if (loopback) return true
        if (hostLocal) {
          if (origin === undefined || origin === '' || origin === 'null') return true
          if (typeof origin === 'string' && /^app:/i.test(origin)) return true
          try {
            const oh = new URL(origin).host
            if (oh === host || oh === '') return true
          } catch { /* fall through */ }
        }
        if (typeof origin !== 'string' || origin === '') return false
        let originHost = null
        try { originHost = new URL(origin).host } catch { originHost = null }
        return originHost !== null && originHost === host
      })()
      if (!originOk) {
        sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
        return
      }
      try {
        const raw = await readBody(req)
        const request = raw.trim() ? JSON.parse(raw) : {}
        let result
        if (request.op === 'status') result = handleStatus()
        else if (request.op === 'personaGet') result = handlePersonaGet()
        else if (request.op === 'personaSave') result = handlePersonaSave(request)
        else if (request.op === 'clientBoot') result = handleClientBoot(request)
        else result = { ok: false, error: 'unknown op: ' + String(request.op) }
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) })
      }
    },
  }, 'dsh-hema: api'))
}
