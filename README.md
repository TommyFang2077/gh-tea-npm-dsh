# git-clis-dsh

DeepSeek Harness (dsh) 插件：用 `gh`（GitHub）和 `tea`（Gitea）操作 issue 与仓库实体，带**引导式配置**。

[`dsh-plugin`](https://github.com/topics/dsh-plugin) · GitHub · Gitea · gh · tea

## 功能

- **检测** `gh` / `tea` 是否安装、版本、鉴权状态、环境 token（值打码）
- **一键安装**（优先 Homebrew，回退到免 sudo 二进制安装到 `~/.local/bin`）
- **引导式配置 token**：环境变量导入 / GitHub 浏览器 OAuth 设备流 / 手动，一步一步带选项推进
- **操作 issue**：`list` / `view` / `create` / `comment` / `close` / `reopen`
- **配套技能** `git-clis`：记录 issue 工作流配方，并指向各 CLI 自带的 `--help` 作为版本匹配的命令源

## 工具

| 工具 | 说明 |
| --- | --- |
| `gitclis_status` | 检测 gh/tea、版本、鉴权、环境 token（打码） |
| `gitclis_configure` | 引导式配置：`auto` / `env` / `web` / `manual` / `poll` |
| `gitclis_install` | 一键安装 gh/tea |
| `gitclis_set_token` | 写入 token 到 CLI 配置（不回显） |
| `gitclis_token_env` | 读取/导入环境变量 token |
| `gitclis_issue_list` | 列 issue |
| `gitclis_issue_view` | 查看单个 issue |
| `gitclis_issue_create` | 创建 issue |
| `gitclis_issue_comment` | 添加评论 |
| `gitclis_issue_close` | 关闭 issue |
| `gitclis_issue_reopen` | 重新打开 issue |

## 安装

作为 dsh 插件包（发布到 npm 后）：

```bash
npx -y @deepseek-ai/dsh plugin add @tommyfang/git-clis-dsh
```

或作为临时动态插件：把 `dsh/index.js` 的插件体通过 `cordis_define` 注入当前会话。

## 配置引导流程

1. `gitclis_configure method=auto` → 获取当前状态和「下一步选项菜单」
2. 用 `ask_user_question` 把菜单呈现为选项，一次一步
3. 按所选分支执行：
   - 缺 CLI → `gitclis_install cli=gh|tea|both`
   - 环境 token → `gitclis_configure method=env`
   - 浏览器 OAuth（GitHub）→ `gitclis_configure method=web` 拿设备码 → 用户授权 → `method=poll` 验证
   - 手动 → `gitclis_set_token`
4. 用 `gitclis_status` 验证

## 鉴权

- **GitHub**：`GH_TOKEN` / `GITHUB_TOKEN` 环境变量，或 `gh auth login --with-token`，或 `gh auth login --web`（设备流，token 不进聊天）。
- **Gitea**：`tea login add --name default --url <server> --token <token>`（token 存 `~/.config/tea/config.yml`）。

## 目录结构

```text
dsh/index.js        Host 插件（Cordis）：注册工具 + 注册 git-clis 技能
cordis.patch.yml    dsh bundle 层：insert 本包
skills/git-clis/    配套技能文档
package.json        dsh 字段 + exports 指向 dsh/index.js
```

## License

[MIT](./LICENSE)
