# gh-tea-npm-dsh

DeepSeek Harness (dsh) 插件：用 `gh`（GitHub）、`tea`（Gitea）、`npm` 管理 issue、仓库与 npm 包，带**引导式配置**。

[`dsh-plugin`](https://github.com/topics/dsh-plugin) · GitHub · Gitea · npm · gh · tea · issues

> **GitHub (`gh`) + Gitea (`tea`) + npm CLIs for DeepSeek Harness (dsh)** — guided auth/config and issue & package tools.

## 功能

- **gh / tea**：检测安装、一键安装、引导式 token 配置（环境变量 / 浏览器 OAuth 设备流 / 手动）、issue 操作
- **npm**：检测登录状态、引导式登录（浏览器 OAuth 设备流 / Automation token）、发布包、**90 天 token 轮换提醒**
- 配套技能 `gh-tea-npm`

## 工具

| 工具 | 说明 |
| --- | --- |
| `gitclis_status` | 检测 gh/tea、版本、鉴权、环境 token（打码） |
| `gitclis_configure` | gh/tea 引导式配置：`auto`/`env`/`web`/`manual`/`poll` |
| `gitclis_install` | 一键安装 gh/tea |
| `gitclis_set_token` | 写入 token 到 gh/tea 配置（不回显） |
| `gitclis_token_env` | 读取/导入环境变量 token |
| `gitclis_issue_list` / `_view` / `_create` / `_comment` / `_close` / `_reopen` | 操作 GitHub / Gitea issue |
| `npm_status` | 检测 node/npm、登录状态、registry |
| `npm_configure` | npm 引导式认证：`auto`/`web`/`token`/`poll` |
| `npm_publish` | 发布包（`npm publish --access public`） |

## npm token 政策（90 天）

npm 现在强制 access token 最长 **90 天**有效（含 Automation token），过期会中断发布。需在到期前轮换：

- 生成新 Automation token：`https://www.npmjs.com/settings/<user>/tokens/new`，再用 `npm_configure method=token`
- 或重新 `npm_configure method=web` 浏览器登录

`npm_status` 会提示该政策；`npm_configure` 引导轮换。

## 安装

作为 dsh 插件包（npm 发布后）：

```bash
npx -y @deepseek-ai/dsh plugin add @tommyfang/gh-tea-npm-dsh
```

或作为临时动态插件：把 `dsh/index.js` 的插件体通过 `cordis_define` 注入当前会话。

## 目录结构

```text
dsh/index.js        Host 插件（Cordis）：注册 gh/tea/npm 工具 + 注册 gh-tea-npm 技能
cordis.patch.yml    dsh bundle 层：insert 本包
skills/gh-tea-npm/  配套技能文档
package.json        dsh 字段 + exports 指向 dsh/index.js
```

## License

[MIT](./LICENSE)
