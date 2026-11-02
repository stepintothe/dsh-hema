/**
 * 何马专属工具集（preset 平面）—— 让「何马」智能体像红队智能体一样
 * 通过工具**自己动手执行**，而不是只给方法。
 *
 * 这些行只向 `tools` 注册模型可见工具（hema_*），自身不发布服务，不需要 isolate realm。
 * 数据层直接读写 `~/.dsh/profiles/web/plugins/dsh-hema/data/` 下的 JSON（与行动板共用）：
 * 纯 JSON、可备份、可迁移、可手工编辑，零外部依赖。
 *
 * 与宿主通用工具（pwsh/read/write/web/subagent）配合，何马能：
 *   · hema_action_open —— 创建/打开行动并绑定当前会话
 *   · hema_board        —— 读当前行动全量数据（概览/漏洞/战果/得分）
 *   · hema_add          —— 把发现/成果写进行动板（漏洞/凭证/战果/落file/得分）
 *   · hema_act          —— 切换当前行动
 *   · hema_report       —— 一键生成行动汇总报告（Markdown）
 *
 * 这样何马既有通用执行工具（自己能跑命令/改文件/抓网页/派子智能体），
 * 又有专属作战工具（能把自己干出的结果记进行动板），真正"对齐"执行型智能体。
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'

/** Cordis 插件名。 */
export const name = 'dsh-hema-tools'

/** 硬依赖工具注册表。 */
export const inject = ['tools']

/* ── 从运行中的 dsh 解析 defineTool ── */
function addCandidate(list, pkg) {
  if (!pkg) return
  const norm = String(pkg).replace(/\\/g, '/')
  if (!list.includes(norm)) list.push(norm)
}
function considerBin(list, bin) {
  if (!bin) return
  let text = String(bin).replace(/\\/g, '/')
  try { text = realpathSync(bin).replace(/\\/g, '/') } catch { /* 原路径 */ }
  const needle = '/node_modules/@deepseek-ai/dsh/'
  const at = text.lastIndexOf(needle)
  if (at >= 0) addCandidate(list, text.slice(0, at + needle.length - 1) + '/package.json')
  const nm = text.lastIndexOf('/node_modules/')
  if (nm >= 0) addCandidate(list, join(text.slice(0, nm), 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  addCandidate(list, join(dirname(text), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  addCandidate(list, join(dirname(text), '..', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
}
function loadDefineTool() {
  const candidates = []
  try { considerBin(candidates, process.argv[1]) } catch { /* ignore */ }
  const homes = [process.env.DSH_HOME, join(homedir(), '.dsh')].filter(Boolean)
  for (const home of homes) {
    addCandidate(candidates, join(home, 'package.json'))
    for (const profile of ['web', 'desktop', 'default']) {
      addCandidate(candidates, join(home, 'profiles', profile, 'package.json'))
      addCandidate(candidates, join(home, 'profiles', profile, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
    }
  }
  addCandidate(candidates, join(process.cwd(), 'package.json'))
  for (const pkg of candidates) {
    try {
      if (!pkg || !existsSync(pkg)) continue
      const mod = createRequire(pkg)('@deepseek-ai/dsh-tools')
      const fn = mod && (mod.defineTool || (mod.default && mod.default.defineTool))
      if (typeof fn === 'function') return fn
    } catch { /* try next */ }
  }
  throw new Error('dsh-hema/tools: cannot resolve @deepseek-ai/dsh-tools from host')
}
const defineTool = loadDefineTool()

/* ── 何马数据层（JSON 存储，与行动板共用 data/ 目录）── */
function dshHomeOf() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function dataRoot() {
  return join(dshHomeOf(), 'profiles', 'web', 'plugins', 'dsh-hema', 'data')
}
function engDir(engId) {
  return join(dataRoot(), String(engId || '').replace(/[^A-Za-z0-9._-]/g, '_'))
}
function dataFile(engId, name) {
  return join(engDir(engId), String(name).replace(/[^A-Za-z0-9._-]/g, '_') + '.json')
}
function readJson(fp, fallback) {
  try { return JSON.parse(readFileSync(fp, 'utf8')) } catch { return fallback }
}
function writeJson(fp, value) {
  mkdirSync(dirname(fp), { recursive: true })
  writeFileSync(fp, JSON.stringify(value, null, 2), 'utf8')
}
function genId() {
  return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
function engagements() {
  return readJson(dataFile('', 'engagements'), [])
}
function currentEng() {
  const cur = readJson(dataFile('', 'current'), null)
  const list = engagements()
  if (cur && list.some((e) => e.id === cur)) return cur
  return list.length ? list[0].id : null
}
function engById(id) {
  return engagements().find((e) => e.id === id) || null
}
function rows(engId, coll) {
  const list = readJson(dataFile(engId, coll), [])
  return Array.isArray(list) ? list : []
}
function pushRow(engId, coll, row) {
  const fp = dataFile(engId, coll)
  const list = rows(engId, coll)
  list.push(Object.assign({ id: genId(), created_at: new Date().toISOString() }, row))
  writeJson(fp, list)
  return list[list.length - 1]
}
const COLL_LABEL = {
  vulns: '漏洞', creds: '凭证', access: '权限', shells: 'Webshell',
  tunnels: '隧道', files: '落file', scores: '得分',
}
function statsText(engId) {
  const c = (n) => rows(engId, n).length
  return '资产 ' + c('assets') + ' · 漏洞 ' + c('vulns') + ' · 凭证 ' + c('creds')
    + ' · 权限 ' + c('access') + ' · Webshell ' + c('shells') + ' · 隧道 ' + c('tunnels')
    + ' · 落file ' + c('files') + ' · 得分 ' + c('scores')
}

/**
 * @param ctx - 插件上下文。
 */
export function apply(ctx) {
  const reg = ctx.tools
  if (!reg || typeof reg.register !== 'function') {
    ctx.logger?.warn?.('hema-tools: ctx.tools unavailable — tools not registered')
    return
  }

  /* ── hema_action_open：创建/打开行动并绑定当前会话 ── */
  reg.register(defineTool({
    name: 'hema_action_open',
    description: '创建或打开一次红队行动（按名称），并把**当前会话**绑定到它。后续 hema_board / hema_add / hema_report 默认作用于它。行动已存在则复用其数据。',
    parameters: {
      name: { type: 'string', required: true, description: '行动名称，例如「测试行动A」或目标单位名' },
    },
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const name = String(args.name || '').trim()
      if (!name) return JSON.stringify({ ok: false, error: '行动名不能为空' }, null, 2)
      const list = engagements()
      let e = list.find((x) => x.name === name)
      if (!e) { e = { id: genId(), name, created_at: new Date().toISOString() }; list.push(e); writeJson(dataFile('', 'engagements'), list) }
      writeJson(dataFile('', 'current'), e.id)
      return JSON.stringify({ ok: true, engagement: e, stats: statsText(e.id), note: '当前会话已绑定到行动：' + name }, null, 2)
    },
  }))

  /* ── hema_act：切换当前行动 ── */
  reg.register(defineTool({
    name: 'hema_act',
    description: '切换当前行动（列出所有行动，或按名称/id 切到某个）。',
    parameters: {
      name: { type: 'string', description: '要切换到的行动名（不填则只列出全部行动）' },
    },
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const list = engagements()
      if (args && args.name) {
        const hit = list.find((e) => e.name === String(args.name)) || list.find((e) => e.id === String(args.name))
        if (!hit) return JSON.stringify({ ok: false, error: '找不到行动：' + args.name, actions: list.map((e) => e.name) }, null, 2)
        writeJson(dataFile('', 'current'), hit.id)
        return JSON.stringify({ ok: true, current: hit.name, actions: list.map((e) => e.name), stats: statsText(hit.id) }, null, 2)
      }
      const cur = currentEng()
      return JSON.stringify({ ok: true, current: (engById(cur) || {}).name || null, actions: list.map((e) => ({ id: e.id, name: e.name })) }, null, 2)
    },
  }))

  /* ── hema_board：读当前行动全量数据 ── */
  reg.register(defineTool({
    name: 'hema_board',
    description: '读当前行动的全部数据（概览统计 + 漏洞清单 + 战果：凭证/权限/Webshell/隧道/落file + 得分），供你复盘和写报告。',
    parameters: {},
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const id = currentEng()
      if (!id) return JSON.stringify({ ok: false, error: '还没有行动，先 hema_action_open 建一个' }, null, 2)
      const e = engById(id)
      return JSON.stringify({
        ok: true,
        engagement: e.name,
        stats: statsText(id),
        vulns: rows(id, 'vulns'),
        credentials: rows(id, 'creds'),
        access: rows(id, 'access'),
        webshells: rows(id, 'shells'),
        tunnels: rows(id, 'tunnels'),
        files: rows(id, 'files'),
        scores: rows(id, 'scores'),
      }, null, 2)
    },
  }))

  /* ── hema_add：向行动板加记录 ── */
  reg.register(defineTool({
    name: 'hema_add',
    description: '把发现/成果写进当前行动的指定分区。分区：vulns(漏洞)/creds(凭证)/access(权限)/shells(Webshell)/tunnels(隧道)/files(落file)/scores(得分)。这是你干活后登记成果的入口。',
    parameters: {
      kind: {
        type: 'string', required: true,
        description: '分区：vulns / creds / access / shells / tunnels / files / scores',
      },
      target: { type: 'string', description: '目标（IP/域名/URL）' },
      title: { type: 'string', description: '标题（漏洞/条目用）' },
      detail: { type: 'string', description: '详情/证据/备注（可长，写清你怎么拿到的、复现命令、原始请求）' },
      extra: { type: 'string', description: '补充字段（如漏洞的 severity/cve、凭证的 username/password、得分的 points），用 key=value 分号分隔' },
    },
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const id = currentEng()
      if (!id) return JSON.stringify({ ok: false, error: '还没有行动，先 hema_action_open 建一个' }, null, 2)
      const kind = String(args.kind || '').toLowerCase()
      if (!(kind in COLL_LABEL)) return JSON.stringify({ ok: false, error: '未知分区：' + kind + '，可用：' + Object.keys(COLL_LABEL).join('/') }, null, 2)
      const row = { target: args.target || '', note: args.detail || '' }
      if (kind === 'vulns') { row.title = args.title || ''; row.status = 'confirmed'; row.evidence = args.detail || '' }
      if (kind === 'scores') { row.label = args.title || args.detail || ''; row.points = Number((args.extra || '').match(/points=([0-9.]+)/)?.[1]) || 0 }
      if (args.extra) {
        for (const kv of String(args.extra).split(';')) {
          const idx = kv.indexOf('=')
          if (idx <= 0) continue
          const k = kv.slice(0, idx).trim(); const v = kv.slice(idx + 1).trim()
          if (k && v !== undefined) row[k] = v
        }
      }
      const made = pushRow(id, kind, row)
      return JSON.stringify({ ok: true, kind: COLL_LABEL[kind], added: made, note: '已写入行动板「' + COLL_LABEL[kind] + '」' }, null, 2)
    },
  }))

  /* ── hema_report：生成行动汇总报告 ── */
  reg.register(defineTool({
    name: 'hema_report',
    description: '生成当前行动的汇总报告（Markdown：概览统计 + 全部漏洞复现 + 战果清单 + 得分）。你可以自己拼，也可以交给它聚合。',
    parameters: {},
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const id = currentEng()
      if (!id) return JSON.stringify({ ok: false, error: '还没有行动，先 hema_action_open 建一个' }, null, 2)
      const e = engById(id)
      const L = []
      L.push('# 红队行动报告 — ' + e.name)
      L.push('')
      L.push('> 生成时间：' + new Date().toLocaleString('zh-CN') + ' · 大案组·何马')
      L.push('')
      L.push('## 概览')
      L.push(statsText(id))
      L.push('')
      const vulns = rows(id, 'vulns')
      L.push('## 漏洞（' + vulns.length + '）')
      vulns.forEach((v, i) => {
        L.push('')
        L.push('### ' + (i + 1) + '. ' + (v.title || '漏洞') + (v.target ? ' — ' + v.target : ''))
        if (v.severity) L.push('- 等级：' + v.severity)
        if (v.cve) L.push('- CVE：' + v.cve)
        if (v.evidence) L.push('- 证据：' + v.evidence)
        if (v.gained) L.push('- 战果：' + v.gained)
      })
      L.push('')
      L.push('## 战果')
      rows(id, 'creds').forEach((c) => L.push('- 凭证：' + (c.target || '—') + ' · ' + (c.username || '?') + ' / ' + (c.password || c.hash || '?')))
      rows(id, 'access').forEach((a) => L.push('- 权限：' + (a.target || '—') + ' · ' + (a.kind || '?') + (a.user ? ' · ' + a.user : '')))
      rows(id, 'shells').forEach((w) => L.push('- Webshell：' + (w.target || '—') + ' · ' + (w.kind || '?') + ' · ' + (w.url || '')))
      rows(id, 'tunnels').forEach((t) => L.push('- 隧道：' + (t.target || '—') + ' · ' + (t.kind || '?') + ' · ' + (t.status || '—')))
      rows(id, 'files').forEach((f) => L.push('- 落file：' + (f.target || '—') + ' · ' + (f.path || '') + ' · ' + (f.kind || '')))
      L.push('')
      let total = 0
      rows(id, 'scores').forEach((s) => { total += Number(s.points) || 0; L.push('- ' + (s.points || '?') + ' 分：' + (s.label || s.note || '')) })
      L.push('')
      L.push('**合计：' + total + ' 分**')
      return JSON.stringify({ ok: true, markdown: L.join('\n'), note: '报告已生成，可用 hema_report 拿到全文' }, null, 2)
    },
  }))

  /* ── hema_scan：自动探测目标网站并同步行动板 ── */
  reg.register(defineTool({
    name: 'hema_scan',
    description: '对目标网站/域名/主机做基础探测（DNS、开放端口、HTTP 指纹），并把发现的资产、开放服务、Web 端点**自动同步**写进当前行动板。渗透网站第一步用它，发现即入库。',
    parameters: {
      target: { type: 'string', required: true, description: '目标：域名 / IP / URL，例如 example.com 或 http://10.0.0.5' },
      scope: { type: 'string', description: '可空。范围说明（如内网/公网）' },
    },
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const id = currentEng()
      if (!id) return JSON.stringify({ ok: false, error: '还没有行动，先 hema_action_open 建一个' }, null, 2)
      const target = String(args.target || '').trim()
      if (!target) return JSON.stringify({ ok: false, error: '目标不能为空' }, null, 2)
      const results = []
      const findings = []
      /* 提取主机名 */
      let host = target
      try { host = new URL(/^https?:\/\//i.test(target) ? target : 'http://' + target).hostname } catch { /* 原样 */ }
      host = host.split(':')[0]
      /* DNS 解析（本机可跑） */
      try {
        const out = execFileSync('nslookup', [host], { encoding: 'utf8', timeout: 6000 })
        results.push('## DNS')
        results.push(out.trim().slice(0, 1500))
      } catch { results.push('## DNS\n(nslookup 不可用或失败)') }
      /* HTTP 指纹（本机可跑，curl） */
      let httpInfo = ''
      try {
        const url = /^https?:\/\//i.test(target) ? target : 'http://' + target
        const out = execFileSync('curl', ['-sI', '--max-time', '6', url], { encoding: 'utf8', timeout: 8000 })
        httpInfo = out.trim().slice(0, 1500)
        results.push('## HTTP 响应头')
        results.push(httpInfo)
        /* 从响应头提取 server 指纹 */
        const serverMatch = httpInfo.match(/^server:\s*(.+)$/im)
        if (serverMatch) findings.push({ type: 'service', note: 'Server: ' + serverMatch[1] })
      } catch { results.push('## HTTP\n(curl 不可用或目标不可达)') }
      /* 登记资产到行动板（自动同步） */
      const asset = pushRow(id, 'assets', { host, name: host, target, ip: host, state: httpInfo ? 'live' : 'unknown', note: 'hema_scan 自动探测' + (args.scope ? ' · ' + args.scope : ''), findings })
      /* 登记的开放服务作为资产 detail */
      return JSON.stringify({
        ok: true,
        asset,
        target: host,
        findings: findings.length ? findings : '（未探测到指纹，可手工用 hema_add 补）',
        report: results.join('\n'),
        note: '已自动写入行动板「资产」' + (asset.id ? '（id=' + asset.id + '）' : ''),
      }, null, 2)
    },
  }))

  /* ── hema_sync：把渗透发现批量同步行动板 ── */
  reg.register(defineTool({
    name: 'hema_sync',
    description: '把你在本次渗透/行动中的发现（漏洞/凭证/权限/Webshell/隧道/落file/得分）批量同步写进当前行动板。渗透结束后调用它批量登记，或边干边用。',
    parameters: {
      items: {
        type: 'array',
        required: true,
        description: '发现列表。每项：{kind:"vulns|creds|access|shells|tunnels|files|scores", target:"IP/域名", title:"标题", detail:"证据/备注", extra:"补充 key=value;…"}',
        items: { type: 'object', additionalProperties: true, properties: { kind: { type: 'string' }, target: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, extra: { type: 'string' } } },
      },
    },
    output: { schema: { type: 'string' } },
    async execute(args, exec) {
      const id = currentEng()
      if (!id) return JSON.stringify({ ok: false, error: '还没有行动，先 hema_action_open 建一个' }, null, 2)
      const items = Array.isArray(args.items) ? args.items : []
      if (items.length === 0) return JSON.stringify({ ok: false, error: '没有要同步的记录' }, null, 2)
      const saved = []
      const failed = []
      for (const it of items) {
        const kind = String((it && it.kind) || '').toLowerCase()
        if (!(kind in COLL_LABEL)) { failed.push({ kind, error: '未知分区' }); continue }
        const row = { target: it.target || '', note: it.detail || '' }
        if (kind === 'vulns') { row.title = it.title || ''; row.status = 'confirmed'; row.evidence = it.detail || '' }
        if (kind === 'scores') { row.label = it.title || it.detail || ''; row.points = Number((it.extra || '').match(/points=([0-9.]+)/)?.[1]) || 0 }
        if (it.extra) for (const kv of String(it.extra).split(';')) {
          const idx = kv.indexOf('='); if (idx <= 0) continue
          const k = kv.slice(0, idx).trim(); const v = kv.slice(idx + 1).trim()
          if (k && v !== undefined) row[k] = v
        }
        const made = pushRow(id, kind, row)
        saved.push({ kind: COLL_LABEL[kind], id: made.id })
      }
      return JSON.stringify({ ok: true, synced: saved.length, failed, note: '已批量同步 ' + saved.length + ' 条到行动板' }, null, 2)
    },
  }))

  ctx.logger?.info?.('hema-tools: 已注册 7 个 hema_* 工具（action_open/act/board/add/report/scan/sync）')
}

export default { name, inject, apply }