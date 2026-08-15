# gh-tea-npm-dsh

[![npm](https://img.shields.io/npm/v/@tommyfang/gh-tea-npm-dsh)](https://www.npmjs.com/package/@tommyfang/gh-tea-npm-dsh)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-4b32c3)](https://github.com/topics/dsh-plugin)

[简体中文](./README.zh-CN.md) · [English](./README.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai)（dsh）插件，把 **GitHub（`gh`）**、**Gitea（`tea`）** 和 **npm** 带进 agent。它检测并安装 CLI，用明确的选项引导用户完成认证，并操作 issue、发布包。

## 功能

**gh / tea**

- 检测安装、版本、鉴权状态、token 环境变量（值打码）
- 一键安装：有 Homebrew 用 Homebrew，否则免 sudo 安装二进制到 `~/.local/bin`
- 引导式认证：环境变量导入 / 浏览器 OAuth 设备流 / 手动 token
- issue 操作：`list` · `view` · `create` · `comment` · `close` · `reopen`

**npm**

- 检测 node/npm、登录状态（`npm whoami`）、registry
- 引导式登录：浏览器 OAuth 设备流（`npm login --auth-type=web`）或 Automation token
- 发布包（`npm publish --access public`）
- **90 天 token 过期提醒与轮换**引导

**技能**

- 注册配套 `gh-tea-npm` 技能，记录工作流，并把各 CLI 自带的 `--help` 作为权威命令源

## 环境要求

- Node.js ≥ 18 和 npm（用于 npm 工具）
- `gh` 和 `tea` 可选——缺失时插件可自动安装

## 安装

```bash
npx -y @deepseek-ai/dsh plugin add @tommyfang/gh-tea-npm-dsh
```

这是一个纯 Host 插件包：`cordis.patch.yml`（由包的 `dsh.bundle` 清单引用）插入插件行，`dsh/index.js` 注册工具和技能。

## 引导式配置

插件从不提出开放式问题：它返回一个菜单，agent 把它呈现为选项，用户一次推进一步。

**gh / tea** —— `gitclis_configure`：

1. `gitclis_configure method=auto` → 当前状态 + 下一步菜单
2. 用 `gitclis_install` 安装缺失的 CLI，或选择 token 来源：
   - 环境变量导入 → `method=env`
   - 浏览器 OAuth（GitHub）→ `method=web`（返回设备码）→ `method=poll` 验证
   - 手动 → `gitclis_set_token`
3. 用 `gitclis_status` 验证

**npm** —— `npm_configure`：

1. `npm_configure method=auto` → 当前状态 + 下一步菜单
2. 浏览器 OAuth → `method=web`（返回登录链接）→ `method=poll` 验证，或 Automation token → `method=token`
3. 用 `npm_publish` 发布（或 `npm_publish dry_run=true`）

## npm token 政策（90 天）

npm 现在把 access token（包括 Automation token）的最长有效期限制为 **90 天**。过期会中断 `npm publish`，请在到期前轮换：

- 在 `https://www.npmjs.com/settings/<user>/tokens/new` 生成新的 Automation token，再用 `npm_configure method=token`；或
- 重新运行 `npm_configure method=web`。

`npm_status` 会提示该政策，`npm_configure` 引导轮换。

## 工具

| 工具 | 说明 |
| --- | --- |
| `gitclis_status` | 检测 gh/tea 安装、版本、鉴权、环境 token（打码） |
| `gitclis_configure` | gh/tea 引导式配置 —— `auto`/`env`/`web`/`manual`/`poll` |
| `gitclis_install` | 一键安装 gh 和/或 tea |
| `gitclis_set_token` | 写入 gh/tea token（不回显） |
| `gitclis_token_env` | 读取/导入 token 环境变量 |
| `gitclis_issue_list` | 列出 issue |
| `gitclis_issue_view` | 查看单个 issue（可带评论） |
| `gitclis_issue_create` | 创建 issue |
| `gitclis_issue_comment` | 评论 issue |
| `gitclis_issue_close` | 关闭 issue |
| `gitclis_issue_reopen` | 重新打开 issue |
| `npm_status` | 检测 node/npm、登录状态、registry |
| `npm_configure` | npm 引导式认证 —— `auto`/`web`/`token`/`poll` |
| `npm_publish` | 发布到 npm |

issue 工具接受 `provider` 参数：`github` → `gh`，`gitea` → `tea`。

## 技能

配套技能在运行时注册，也以文件形式随包发布在 `skills/gh-tea-npm/SKILL.md`。它记录了 issue 工作流配方、认证流程和 npm token 政策，并指向 `gh <cmd> --help`、`tea <cmd> --help`、`npm <cmd> --help` 获取精确的命令标志。

## 目录结构

```text
dsh/index.js        Host Cordis 插件 —— 注册工具 + 注册 gh-tea-npm 技能
cordis.patch.yml    dsh bundle 层 —— 插入本包
skills/gh-tea-npm/  配套技能 markdown
package.json        dsh + exports 清单
```

## License

[MIT](./LICENSE)
