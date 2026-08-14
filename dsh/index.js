// DeepSeek Harness (dsh) plugin: GitHub (gh) + Gitea (tea) forge tools.
//
// Registers model tools to detect/install gh and tea, manage their auth tokens
// (env import, browser OAuth device flow, manual), and operate issues (list,
// view, create, comment, close, reopen) on GitHub and Gitea. Also registers a
// companion `git-clis` skill that documents the issue workflow and defers to
// each CLI's own `--help` for the exact command surface.
//
// Loaded via cordis.patch.yml (see package.json `dsh.bundle` manifest). It runs
// in the real Cordis runtime, so it uses `ctx.tools.register` / `ctx.skills`
// directly and spawns the CLIs with node:child_process — no harness sandbox.
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

export const name = 'git-clis'
export const inject = ['tools', 'skills']

export function apply(ctx, config = {}) {
  const flows = {}
  let flowSeq = 0

  function buildEnv(extra) {
    const home = homedir()
    const local = `${home}/.local/bin`
    const env = { ...process.env, ...(extra || {}) }
    if (env.PATH && !env.PATH.split(':').includes(local)) {
      env.PATH = `${local}:${env.PATH}`
    } else if (!env.PATH) {
      env.PATH = local
    }
    return env
  }

  function run(cmd, opts = {}) {
    return new Promise((resolve) => {
      let child
      try {
        child = spawn('/bin/sh', ['-c', cmd], {
          env: buildEnv(opts.env),
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: opts.timeoutMs,
          signal: opts.signal,
        })
      } catch (error) {
        resolve({ code: null, signal: null, stdout: '', stderr: String((error && error.message) || error), timedOut: false })
        return
      }
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c) => { stdout += c })
      child.stderr.on('data', (c) => { stderr += c })
      child.on('error', (error) => {
        resolve({ code: null, signal: null, stdout, stderr: stderr || String((error && error.message) || error), timedOut: false })
      })
      child.on('close', (code, signal) => {
        resolve({ code, signal, stdout, stderr, timedOut: signal === 'SIGTERM' })
      })
      if (opts.stdin != null) child.stdin.write(opts.stdin)
      child.stdin.end()
    })
  }

  function trim(s) { return String(s == null ? '' : s).trim() }
  function q(s) { return "'" + String(s == null ? '' : s).replace(/'/g, "'\\''") + "'" }

  async function detect(bin) {
    const found = await run(`command -v ${bin} >/dev/null 2>&1 || test -x "$HOME/.local/bin/${bin}"`, { timeoutMs: 15000 })
    if (found.code !== 0) return { installed: false, version: '' }
    const v = await run(`${bin} --version 2>&1 | head -3`, { timeoutMs: 15000 })
    return { installed: true, version: trim(v.stdout || v.stderr) }
  }

  const stringOut = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value == null ? '' : value) }],
  }

  function registerTool(def) {
    ctx.tools.register({ ...def, output: stringOut })
  }

  function binFor(p) { return p === 'github' ? 'gh' : 'tea' }
  function repoFlag(repo) { return repo ? ` --repo ${q(repo)}` : '' }

  async function execCmd(cmd, opts = {}, exec) {
    const merged = { ...opts }
    merged.signal = (exec && exec.signal) || merged.signal
    const r = await run(cmd, merged)
    let out = trim(r.stdout)
    const err = trim(r.stderr)
    if (err) out = out ? `${out}\n[stderr]\n${err}` : `[stderr]\n${err}`
    if (r.code === 0) return out || '(no output)'
    return `[exit ${r.code}]${out ? ' ' + out : ''}`
  }

  function ghInstallScript() {
    return [
      'set -e',
      'if command -v brew >/dev/null 2>&1; then brew install gh && gh --version && exit 0; fi',
      'curl -sS https://webi.sh/gh | sh',
      'export PATH="$HOME/.local/bin:$PATH"',
      'gh --version',
      'echo "installed gh -> $HOME/.local/bin/gh (add ~/.local/bin to PATH)"',
    ].join('\n')
  }

  function teaInstallScript() {
    return [
      'set -e',
      'if command -v brew >/dev/null 2>&1; then brew tap gitea/tea && brew install tea && tea --version && exit 0; fi',
      'os=linux',
      'case "$(uname -s)" in Darwin*) os=darwin;; esac',
      'arch=amd64',
      'case "$(uname -m)" in aarch64|arm64) arch=arm64;; esac',
      'mkdir -p "$HOME/.local/bin"',
      'curl -fsSL "https://dl.gitea.com/tea/tea-$os-$arch" -o "$HOME/.local/bin/tea"',
      'chmod +x "$HOME/.local/bin/tea"',
      'export PATH="$HOME/.local/bin:$PATH"',
      'tea --version',
      'echo "installed tea -> $HOME/.local/bin/tea (add ~/.local/bin to PATH)"',
    ].join('\n')
  }

  async function installOne(bin, exec) {
    const script = bin === 'gh' ? ghInstallScript() : teaInstallScript()
    const r = await run(script, { timeoutMs: 300000, signal: (exec && exec.signal) || undefined })
    let out = trim(r.stdout)
    if (trim(r.stderr)) out = out ? `${out}\n${trim(r.stderr)}` : trim(r.stderr)
    if (r.code === 0) {
      const d = await detect(bin)
      return `${d.installed ? 'OK: ' + d.version : 'OK (verify with gitclis_status)'}\n${out}`
    }
    return `FAILED (exit ${r.code})${out ? '\n' + out : ''}`
  }

  function envToken(names) {
    for (const n of names) {
      const v = process.env[n]
      if (v && v.trim()) return v.trim()
    }
    return ''
  }

  async function importEnvToken(prov, url, sig) {
    const out = []
    if (prov === 'github' || prov === 'both') {
      const tok = envToken(['GH_TOKEN', 'GITHUB_TOKEN'])
      if (!tok) out.push('github: 环境变量 GH_TOKEN/GITHUB_TOKEN 未设置，请改用 method=web 或 method=manual')
      else {
        const r = await run('gh auth login --with-token', { stdin: `${tok}\n`, timeoutMs: 30000, signal: sig })
        out.push(r.code === 0 ? 'github: 已从环境导入 token ✓' : `github: 导入失败: ${trim(r.stderr || r.stdout)}`)
      }
    }
    if (prov === 'gitea' || prov === 'both') {
      const tok = envToken(['GITEA_TOKEN', 'TEA_TOKEN'])
      if (!tok) out.push('gitea: 环境变量 GITEA_TOKEN/TEA_TOKEN 未设置，请改用 gitclis_set_token')
      else {
        const r = await run(`tea login add --name default --url ${q(url || 'https://gitea.com')} --token ${q(tok)} --no-version-check`, { timeoutMs: 30000, signal: sig })
        out.push(r.code === 0 ? 'gitea: 已从环境导入 token ✓' : `gitea: 导入失败: ${trim(r.stderr || r.stdout)}`)
      }
    }
    return out.join('\n')
  }

  function startGhWebFlow() {
    const child = spawn('/bin/sh', ['-c', 'gh auth login --hostname github.com --git-protocol https --web'], {
      env: buildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    flowSeq += 1
    const flowId = `flow-${flowSeq}`
    const f = { child, buf: '', closed: false, exitCode: null }
    flows[flowId] = f
    child.stdout.on('data', (c) => { f.buf += c })
    child.stderr.on('data', (c) => { f.buf += c })
    child.on('close', (code) => { f.closed = true; f.exitCode = code })
    return new Promise((resolve) => {
      const t0 = Date.now()
      const poll = () => {
        const m = f.buf.match(/one-time code:\s*([A-Z0-9-]+)/)
        const u = f.buf.match(/https:\/\/github\.com\/login\/device/)
        if (m && u) return resolve(`请在浏览器打开 ${u[0]} 并输入一次性设备码 ${m[1]}。授权完成后调用 gitclis_configure method=poll flow_id=${flowId} 验证。`)
        if (f.closed) return resolve(`未能获取设备码。输出:\n${f.buf}`)
        if (Date.now() - t0 > 15000) return resolve(`未能获取设备码（超时）。输出:\n${f.buf}`)
        setTimeout(poll, 400)
      }
      poll()
    })
  }

  async function pollGhWebFlow(flowId, exec) {
    const f = flows[flowId]
    if (!f) return '未找到该配置流程（可能已过期或已清理），请重新调用 method=web。'
    if (f.closed) {
      delete flows[flowId]
      if (f.exitCode === 0) {
        const a = await run('gh auth status 2>&1', { timeoutMs: 20000, signal: (exec && exec.signal) || undefined })
        return `配置完成 ✓\n${trim(a.stdout || a.stderr)}`
      }
      return `登录未完成或已取消 (exit ${f.exitCode})\n${f.buf}`
    }
    return `仍在等待浏览器授权（设备码有效期内）...\n${f.buf}`
  }

  async function authSummary(bin, exec) {
    const sig = (exec && exec.signal) || undefined
    if (bin === 'gh') {
      const r = await run('gh auth status 2>&1', { timeoutMs: 20000, signal: sig })
      return trim(r.stdout || r.stderr)
    }
    const r = await run('tea login list 2>&1', { timeoutMs: 20000, signal: sig })
    return trim(r.stdout)
  }

  const ENV_TOKEN_NAMES = ['GH_TOKEN', 'GITHUB_TOKEN', 'GITEA_TOKEN', 'TEA_TOKEN']

  // ---- status ----
  registerTool({
    name: 'gitclis_status',
    description: 'Detect the GitHub (gh) and Gitea (tea) CLIs: installation, version, auth status, and token environment variables (values masked).',
    parameters: { type: 'object', properties: {} },
    async execute(_args, exec) {
      const out = []
      const gh = await detect('gh')
      const tea = await detect('tea')
      out.push('== gh (GitHub CLI) ==')
      out.push(gh.installed ? `installed: ${gh.version}` : 'NOT installed')
      out.push('== tea (Gitea CLI) ==')
      out.push(tea.installed ? `installed: ${tea.version}` : 'NOT installed')
      if (gh.installed) { out.push('== gh auth =='); out.push(await execCmd('gh auth status 2>&1', { timeoutMs: 20000 }, exec)) }
      if (tea.installed) { out.push('== tea logins =='); out.push(await execCmd('tea login list 2>&1', { timeoutMs: 20000 }, exec)) }
      out.push('== token env vars (presence only) ==')
      for (const n of ENV_TOKEN_NAMES) out.push(`${n}: ${process.env[n] && process.env[n].trim() ? 'SET' : 'unset'}`)
      return out.join('\n')
    },
  })

  // ---- configure (guide) ----
  registerTool({
    name: 'gitclis_configure',
    description: 'Interactive configuration guide for gh/tea: detect state and walk the user through install + auth with explicit choices. method=web starts the GitHub OAuth device flow and returns a one-time code; method=poll checks that flow; method=env imports env tokens; method=auto returns the guided plan.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea', 'both'], description: 'Which forge to configure. Default: both.' },
        method: { type: 'string', enum: ['auto', 'env', 'web', 'manual', 'poll'], description: 'auto = guided plan; env = import env token; web = start GitHub OAuth device flow; manual = prompt user for a token; poll = check a web flow.' },
        flow_id: { type: 'string', description: 'Flow id from a previous method=web call, used with method=poll.' },
        gitea_url: { type: 'string', description: 'Gitea server URL (provider=gitea). Default https://gitea.com' },
      },
    },
    async execute(args, exec) {
      const sig = (exec && exec.signal) || undefined
      const prov = args.provider || 'both'
      const method = args.method || 'auto'

      if (method === 'web') {
        const d = await detect('gh')
        if (!d.installed) return 'gh 未安装，请先调用 gitclis_install cli=gh'
        return await startGhWebFlow()
      }
      if (method === 'poll') {
        if (!args.flow_id) return 'method=poll 需要 flow_id 参数（来自 method=web 的返回）'
        return await pollGhWebFlow(args.flow_id, exec)
      }
      if (method === 'env') return await importEnvToken(prov, args.gitea_url, sig)
      if (method === 'manual') return '请用 ask_user_question 引导用户提供 personal access token，然后用 gitclis_set_token 写入（provider 和 token 由用户给出）。注意：手动粘贴会让 token 出现在聊天记录，优先推荐 method=env 或 method=web。'

      const out = []
      const gh = await detect('gh')
      const tea = await detect('tea')
      out.push('# 配置引导')
      out.push('')
      out.push('## 当前状态')
      out.push(`- gh: ${gh.installed ? '已安装 ' + gh.version : '未安装'}`)
      out.push(`- tea: ${tea.installed ? '已安装 ' + tea.version : '未安装'}`)
      if (gh.installed) out.push(`- gh 登录: ${(await authSummary('gh', exec)) || '(未登录)'}`)
      if (tea.installed) out.push(`- tea 登录: ${(await authSummary('tea', exec)) || '(无 login)'}`)
      out.push('')
      out.push('## 下一步（用 ask_user_question 给用户呈现选项，一次一步）')
      if ((prov === 'github' || prov === 'both') && !gh.installed) out.push('1. gh 未安装 → 选「安装 gh」→ 调 gitclis_install cli=gh')
      if ((prov === 'gitea' || prov === 'both') && !tea.installed) out.push('2. tea 未安装 → 选「安装 tea」→ 调 gitclis_install cli=tea')
      out.push('3. 已安装但未登录 → 选 token 来源:')
      out.push(`   a. 「从环境变量导入」→ 调 gitclis_configure method=env provider=${prov}`)
      out.push('   b. 「浏览器登录(GitHub)」→ 调 gitclis_configure method=web，拿到设备码后引导用户在浏览器授权，再调 method=poll 验证')
      out.push('   c. 「手动粘贴」→ 调 gitclis_configure method=manual，再用 gitclis_set_token 写入')
      out.push('4. 已登录 → 配置完成，可用 gitclis_issue_* 操作 issue')
      return out.join('\n')
    },
  })

  // ---- install ----
  registerTool({
    name: 'gitclis_install',
    description: 'Install the GitHub CLI (gh) and/or the Gitea CLI (tea) if missing. Prefers Homebrew, falls back to an official no-sudo installer into ~/.local/bin.',
    parameters: {
      type: 'object',
      properties: { cli: { type: 'string', enum: ['gh', 'tea', 'both'], description: 'Which CLI to install.' } },
      required: ['cli'],
    },
    async execute(args, exec) {
      const targets = args.cli === 'both' ? ['gh', 'tea'] : [args.cli]
      const out = []
      for (const bin of targets) {
        const d = await detect(bin)
        if (d.installed) out.push(`${bin}: 已安装 (${d.version})，跳过`)
        else { out.push(`${bin}: 安装中...`); out.push(await installOne(bin, exec)) }
      }
      return out.join('\n\n')
    },
  })

  // ---- set token ----
  registerTool({
    name: 'gitclis_set_token',
    description: 'Store an auth token for GitHub (gh) or Gitea (tea). The token is written to the CLI config and never echoed back.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'], description: 'Which forge to store the token for.' },
        token: { type: 'string', description: 'The personal access token.' },
        gitea_url: { type: 'string', description: 'Gitea server URL (provider=gitea). Default: https://gitea.com' },
        gitea_login: { type: 'string', description: 'tea login name (provider=gitea). Default: default' },
      },
      required: ['provider', 'token'],
    },
    async execute(args, exec) {
      const sig = (exec && exec.signal) || undefined
      if (args.provider === 'github') {
        const r = await run('gh auth login --with-token', { stdin: `${String(args.token)}\n`, timeoutMs: 30000, signal: sig })
        if (r.code !== 0) return `gh login FAILED (exit ${r.code}): ${trim(r.stderr || r.stdout)}`
        const a = await run('gh auth status 2>&1', { timeoutMs: 20000, signal: sig })
        return `OK. ${trim(a.stdout || a.stderr)}`
      }
      const url = args.gitea_url || 'https://gitea.com'
      const nm = args.gitea_login || 'default'
      const r = await run(`tea login add --name ${q(nm)} --url ${q(url)} --token ${q(args.token)} --no-version-check`, { timeoutMs: 30000, signal: sig })
      if (r.code !== 0) return `tea login add FAILED (exit ${r.code}): ${trim(r.stderr || r.stdout)}`
      const a = await run('tea login list 2>&1', { timeoutMs: 20000, signal: sig })
      return `OK. ${trim(a.stdout || a.stderr)}`
    },
  })

  // ---- env token ----
  registerTool({
    name: 'gitclis_token_env',
    description: 'Read token environment variables (presence only, values masked) or import an env token into the CLI auth config.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'import'], description: 'read = report presence; import = store an env token into CLI config.' },
        provider: { type: 'string', enum: ['github', 'gitea', 'both'], description: 'Which forge. Default: both.' },
        gitea_url: { type: 'string', description: 'Gitea server URL for import into tea. Default: https://gitea.com' },
      },
      required: ['action'],
    },
    async execute(args, exec) {
      const sig = (exec && exec.signal) || undefined
      const prov = args.provider || 'both'
      if (args.action === 'read' || !args.action) {
        const out = []
        for (const n of ENV_TOKEN_NAMES) out.push(`${n}: ${process.env[n] && process.env[n].trim() ? 'SET' : 'unset'}`)
        out.push('Note: values are masked. Use gitclis_configure method=env to import them into the CLI config.')
        return out.join('\n')
      }
      return await importEnvToken(prov, args.gitea_url, sig)
    },
  })

  // ---- issue list ----
  registerTool({
    name: 'gitclis_issue_list',
    description: 'List issues on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'], description: 'github uses gh; gitea uses tea.' },
        repo: { type: 'string', description: 'owner/repo slug. Optional: gh uses the current repo, tea uses the local repo or default login.' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default: open.' },
        limit: { type: 'integer', description: 'Max items. Default: 30.' },
        labels: { type: 'string', description: 'Comma-separated label filter.' },
        keyword: { type: 'string', description: 'Free-text search keyword.' },
        assignee: { type: 'string', description: 'Filter by assignee username.' },
      },
      required: ['provider'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const state = args.state || 'open'
      const limit = args.limit ? ` --limit ${q(String(args.limit))}` : ''
      let cmd
      if (bin === 'gh') {
        cmd = `gh issue list${repo} --state ${q(state)}${limit}`
        if (args.labels) cmd += ` --label ${q(args.labels)}`
        if (args.keyword) cmd += ` --search ${q(args.keyword)}`
        if (args.assignee) cmd += ` --assignee ${q(args.assignee)}`
        cmd += ' --json number,title,state,labels,author,updatedAt'
      } else {
        cmd = `tea issues list${repo} --state ${q(state)}${limit}`
        if (args.labels) cmd += ` --labels ${q(args.labels)}`
        if (args.keyword) cmd += ` --keyword ${q(args.keyword)}`
        if (args.assignee) cmd += ` --assignee ${q(args.assignee)}`
        cmd += ' --output json'
      }
      return await execCmd(cmd, { timeoutMs: 60000 }, exec)
    },
  })

  // ---- issue view ----
  registerTool({
    name: 'gitclis_issue_view',
    description: 'View one issue (optionally with comments) on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'] },
        number: { type: 'integer', description: 'Issue number.' },
        repo: { type: 'string', description: 'owner/repo slug.' },
        with_comments: { type: 'boolean', description: 'Include comments. Default false.' },
      },
      required: ['provider', 'number'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const n = String(args.number)
      const comments = args.with_comments ? ' --comments' : ''
      const cmd = bin === 'gh'
        ? `gh issue view ${n}${repo}${comments}`
        : `tea issues ${n}${repo}${comments} --output json`
      return await execCmd(cmd, { timeoutMs: 60000 }, exec)
    },
  })

  // ---- issue create ----
  registerTool({
    name: 'gitclis_issue_create',
    description: 'Create an issue on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'] },
        title: { type: 'string', description: 'Issue title.' },
        body: { type: 'string', description: 'Issue body (markdown).' },
        repo: { type: 'string', description: 'owner/repo slug.' },
        labels: { type: 'string', description: 'Comma-separated labels.' },
      },
      required: ['provider', 'title'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const title = q(args.title)
      if (bin === 'gh') {
        let cmd = `gh issue create${repo} --title ${title}`
        if (args.labels) cmd += ` --label ${q(args.labels)}`
        if (args.body) { cmd += ' --body-file -'; return await execCmd(cmd, { timeoutMs: 60000, stdin: String(args.body) }, exec) }
        return await execCmd(cmd, { timeoutMs: 60000 }, exec)
      }
      let cmd = `tea issues create${repo} --title ${title}`
      if (args.body) cmd += ` --description ${q(args.body)}`
      if (args.labels) cmd += ` --labels ${q(args.labels)}`
      return await execCmd(cmd, { timeoutMs: 60000 }, exec)
    },
  })

  // ---- issue comment ----
  registerTool({
    name: 'gitclis_issue_comment',
    description: 'Add a comment to an issue on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'] },
        number: { type: 'integer', description: 'Issue number.' },
        body: { type: 'string', description: 'Comment text.' },
        repo: { type: 'string', description: 'owner/repo slug.' },
      },
      required: ['provider', 'number', 'body'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const n = String(args.number)
      if (bin === 'gh') return await execCmd(`gh issue comment ${n}${repo} --body-file -`, { timeoutMs: 60000, stdin: String(args.body) }, exec)
      return await execCmd(`tea comments add ${n}${repo} --description ${q(args.body)}`, { timeoutMs: 60000 }, exec)
    },
  })

  // ---- issue close ----
  registerTool({
    name: 'gitclis_issue_close',
    description: 'Close an issue (optionally with a comment) on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'] },
        number: { type: 'integer', description: 'Issue number.' },
        comment: { type: 'string', description: 'Optional closing comment.' },
        repo: { type: 'string', description: 'owner/repo slug.' },
      },
      required: ['provider', 'number'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const n = String(args.number)
      if (bin === 'gh') {
        let cmd = `gh issue close ${n}${repo}`
        if (args.comment) cmd += ` --comment ${q(args.comment)}`
        return await execCmd(cmd, { timeoutMs: 60000 }, exec)
      }
      const parts = []
      if (args.comment) parts.push(await execCmd(`tea comments add ${n}${repo} --description ${q(args.comment)}`, { timeoutMs: 60000 }, exec))
      parts.push(await execCmd(`tea issues close ${n}${repo}`, { timeoutMs: 60000 }, exec))
      return parts.join('\n')
    },
  })

  // ---- issue reopen ----
  registerTool({
    name: 'gitclis_issue_reopen',
    description: 'Reopen an issue (optionally with a comment) on GitHub (gh) or Gitea (tea).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'gitea'] },
        number: { type: 'integer', description: 'Issue number.' },
        comment: { type: 'string', description: 'Optional comment.' },
        repo: { type: 'string', description: 'owner/repo slug.' },
      },
      required: ['provider', 'number'],
    },
    async execute(args, exec) {
      const bin = binFor(args.provider)
      const repo = repoFlag(args.repo)
      const n = String(args.number)
      if (bin === 'gh') {
        let cmd = `gh issue reopen ${n}${repo}`
        if (args.comment) cmd += ` --comment ${q(args.comment)}`
        return await execCmd(cmd, { timeoutMs: 60000 }, exec)
      }
      const parts = []
      if (args.comment) parts.push(await execCmd(`tea comments add ${n}${repo} --description ${q(args.comment)}`, { timeoutMs: 60000 }, exec))
      parts.push(await execCmd(`tea issues reopen ${n}${repo}`, { timeoutMs: 60000 }, exec))
      return parts.join('\n')
    },
  })

  // ---- companion skill ----
  ctx.skills.register({
    name: 'git-clis',
    description: 'Operate issues and forge entities on GitHub (gh) and Gitea (tea) via the git-clis plugin tools, with a guided configure flow.',
    whenToUse: 'When the user asks to list, view, create, comment on, close, or reopen issues on GitHub or Gitea, or to install/authenticate gh or tea.',
    source: 'runtime',
    content: SKILL_CONTENT,
  })
}

const SKILL_CONTENT = [
  '# GitHub (gh) & Gitea (tea) CLI',
  '',
  'Companion skill for the git-clis DSH plugin (TommyFang2077). Operates issues',
  '(and other forge entities) on GitHub via gh and on Gitea via tea.',
  '',
  'The CLIs are the source of truth for their exact command surface. Prefer their own',
  'help over anything here: commands and flags change between releases.',
  '',
  '    gh help issue            # GitHub issue commands',
  '    gh issue list --help     # exact flags for one subcommand',
  '    tea help issues          # Gitea issue commands',
  '    tea issues list --help',
  '',
  '## When to use',
  '',
  'Use this skill and the git-clis plugin tools whenever the user asks to read, create,',
  'comment on, close, or reopen issues on GitHub or Gitea, or to set up / check forge auth.',
  '',
  '## Guided configuration (gitclis_configure)',
  '',
  'Configure a CLI step by step with explicit choices. Never ask open-ended questions;',
  'always present options via ask_user_question and advance one step at a time.',
  '',
  '1. Call gitclis_configure method=auto to get the current state and the next-step menu.',
  '2. Present the menu as options. On the chosen branch, call the matching action:',
  '   - install a missing CLI: gitclis_install cli=gh|tea|both',
  '   - env token:   gitclis_configure method=env provider=...',
  '   - browser OAuth (GitHub): gitclis_configure method=web -> show code+URL to the',
  '     user -> after they authorize, gitclis_configure method=poll flow_id=...',
  '   - manual token: gitclis_set_token provider=... token=... (token then appears in chat;',
  '     prefer env or web)',
  '3. After auth, verify with gitclis_status.',
  '',
  '## Plugin tools',
  '',
  '    gitclis_status        detect gh/tea, versions, auth, env tokens (masked)',
  '    gitclis_configure     guided install + auth flow (auto/env/web/manual/poll)',
  '    gitclis_install       one-click install of gh and/or tea',
  '    gitclis_set_token     store an auth token for gh and/or tea',
  '    gitclis_token_env     read/import tokens from the environment',
  '',
  '## Authentication',
  '',
  'GitHub (gh):',
  '',
  '- token env vars: GH_TOKEN (preferred) or GITHUB_TOKEN; gh reads them automatically.',
  '- or store it:  gh auth login --with-token   (reads the token from stdin)',
  '- or OAuth:     gh auth login --web          (device flow, no token in chat)',
  '- check status: gh auth status',
  '',
  'Gitea (tea):',
  '',
  '- store a token:  tea login add --name default --url <server> --token <token>',
  '- list logins:    tea login list',
  '- tea keeps tokens in ~/.config/tea/config.yml; there is no first-class token env',
  '  var, so store it with tea login add, or set GITEA_TOKEN / TEA_TOKEN and import it',
  '  with gitclis_token_env.',
  '',
  '## Issue workflow recipes',
  '',
  'Confirm every flag against --help before relying on it. These are the shapes, not a',
  'frozen reference. owner/repo is the repository slug.',
  '',
  'List open issues:',
  '    gh   issue list --repo owner/repo --state open --limit 50',
  '    tea  issues list --repo owner/repo --state open --limit 50',
  '',
  'List with filters:',
  '    gh   issue list --repo owner/repo --label bug --search "memory leak"',
  '    tea  issues list --repo owner/repo --labels bug --keyword "memory leak"',
  '',
  'View one issue with comments:',
  '    gh   issue view 42 --repo owner/repo --comments',
  '    tea  issues 42 --repo owner/repo --comments',
  '',
  'Create an issue:',
  '    gh   issue create --repo owner/repo --title "Title" --body "Body text"',
  '    tea  issues create --repo owner/repo --title "Title" --description "Body text"',
  '',
  'Comment on an issue:',
  '    gh   issue comment 42 --repo owner/repo --body "Comment text"',
  '    tea  comments add 42 --repo owner/repo --description "Comment text"',
  '',
  'Close an issue:',
  '    gh   issue close 42 --repo owner/repo --comment "Closing because fixed"',
  '    tea  issues close 42 --repo owner/repo',
  '',
  'Reopen an issue:',
  '    gh   issue reopen 42 --repo owner/repo',
  '    tea  issues reopen 42 --repo owner/repo',
  '',
  '## Provider mapping in plugin tools',
  '',
  'The issue tools take a provider argument: github maps to gh, gitea maps to tea.',
  '',
  '## Safety notes',
  '',
  '- Read first: prefer list / view to understand state before mutating.',
  '- close / reopen / comment mutate state; confirm the target issue number first.',
  '- Never print a token back into the conversation; the plugin masks env token values.',
  '- Flags can drift between releases; when a command fails with an unknown flag, read',
  '  gh <cmd> --help or tea <cmd> --help and adapt.',
].join('\n')
