# 发布与 VS Code 更新

## 当前状态与固定标识

源码仓库是 [tangyuanx/Call_Other](https://github.com/tangyuanx/Call_Other)，正式插件标识固定为 **`tangyuanx.compact-call-graph`**。仓库内已准备检查、打包和发布流程；发布者账号与市场授权尚需仓库所有者配置。GitHub Release 成功不代表 Marketplace 已上架。

VS Code 的原生“更新”读取 Marketplace。只把 VSIX 放到 GitHub Releases，不能让该按钮获取新版本。插件自身无需增加下载、替换文件或重启的更新逻辑。

## 第一次上架：最少步骤

1. 用自己的 Microsoft 账号打开 [Marketplace 发布者管理页](https://marketplace.visualstudio.com/manage)。创建发布者，Publisher ID 填 `tangyuanx`。如果该 ID 不可用，请在首次发布前调整工程中的发布者及发布校验；正式上架后保持标识不变。
2. 从 GitHub CI 的 Artifacts、GitHub Release 或本地 `npm run package` 获取 `compact-call-graph-0.1.2.vsix`。
3. 在发布者管理页选择新建 **Visual Studio Code** 扩展并上传该 VSIX。账号登录、条款确认和首次发布由账号所有者完成。
4. 等待市场处理完成后，在 VS Code 搜索 `@id:tangyuanx.compact-call-graph` 安装。预期页面为 `https://marketplace.visualstudio.com/items?itemName=tangyuanx.compact-call-graph`；只有上架完成后该页面才可用。

手动上传市场同样能让用户通过 VS Code 更新。如果希望发 Git 标签后自动上架，再完成下面的一次性授权。

## 自动发布：推荐 Entra OIDC

此方式使用短期身份凭据，不需要在仓库保存长期发布令牌。配置依据：[VS Code 发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)、[GitHub 到 Azure 的 OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)、[Marketplace 服务主体授权](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line?view=azure-devops#publish-with-a-microsoft-entra-token)。

1. 在 Microsoft Entra 中准备一个专用应用／服务主体，记录 Client ID、Tenant ID。为它添加 GitHub Actions 联合身份凭据：

   | 字段 | 值 |
   | --- | --- |
   | Issuer | `https://token.actions.githubusercontent.com` |
   | Subject | `repo:tangyuanx/Call_Other:environment:marketplace` |
   | Audience | `api://AzureADTokenExchange` |

   仓库名大小写和 `marketplace` 环境名必须与上表一致。这里使用租户级认证，工作流允许没有 Azure 订阅，不创建云端付费资源。

2. 打开仓库 **Settings → Environments**，创建 `marketplace` 环境。在该环境的 Secrets 添加 `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`，值分别为刚才记录的 ID。
3. 在 **Actions → Marketplace authentication check → Run workflow** 运行一次身份检查。该流程不发布扩展；登录成功后会显示 Marketplace profile identity ID。按官方服务主体授权说明，把这个身份加入 `tangyuanx` 发布者，授予发布需要的 Contributor 权限。若 profile 查询失败，先按官方说明完成该身份的 Azure DevOps 注册／访问条件。
4. 再运行一次身份检查，确认 `vsce verify-pat --azure-credential` 成功。命令虽然名为 `verify-pat`，此处实际使用 Entra 身份，不使用 PAT。
5. 在仓库 **Settings → Secrets and variables → Actions → Variables** 添加：

   | Repository variable | 值 |
   | --- | --- |
   | `MARKETPLACE_PUBLISH_ENABLED` | `true` |
   | `MARKETPLACE_AUTH_MODE` | `oidc` |

完成后，新版本标签触发的 Release 流程会把同一个已测试 VSIX 上传到 GitHub Release 和 Marketplace。首次配置完成前，市场发布任务会跳过，构建摘要会明确说明只发布到了 GitHub。

## 短期兼容：PAT

如果当前没有 Entra 环境，也可以暂时使用官方支持的 PAT 方式。按照 [官方 PAT 步骤](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) 创建有 Marketplace Manage 权限的 Azure DevOps PAT，把它保存为 `marketplace` 环境的 Secret `VSCE_PAT`，并将仓库变量 `MARKETPLACE_AUTH_MODE` 设为 `pat`、`MARKETPLACE_PUBLISH_ENABLED` 设为 `true`。不要把令牌写入代码、命令示例、Issue 或聊天。

官方文档目前公告 **2026-12-01 停用 global PAT**，因此该方式仅作为过渡，持续发布应迁移到 OIDC；以官方届时政策为准。GitHub 的 `GITHUB_TOKEN` 不能替代 Marketplace 发布授权。

## 每次发布新版本

第一次可发布当前的 `v0.1.2`；以后以 `0.1.3` 为例：

```sh
git switch main
git pull --ff-only
npm ci
npm version 0.1.3 --no-git-tag-version
# 编辑 CHANGELOG.md，在最上面加入 # 0.1.3 及本次变更
npm run release:check -- v0.1.3
npm run check
npm test
npm run package
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release 0.1.3"
git push origin main
git tag v0.1.3
git push origin v0.1.3
```

功能修改应事先提交并通过 main 的 CI，再执行发版步骤。Release 会校验标签、工程和锁文件版本、变更日志首项及正式标识，并确认标签提交在 main 历史中。然后重新检查、测试、打包，再创建 GitHub Release，最后在启用授权后发布市场。

发布失败时可在 Actions 重跑失败任务；也可通过 Release 的 Run workflow 指定已经存在的版本标签。重复市场上传会跳过已经存在的版本。不要移动已发布的标签或复用市场版本号；修复后递增版本再发。

## 用户如何更新

- 首次从 Marketplace 安装正式版。VS Code 检查到更高的兼容版本后，扩展详情页会出现 **更新** 按钮；点击后按提示完成扩展重启。已启用自动更新时也可自动升级。
- 如果列表没更新，可运行 **Extensions: Check for Extension Updates**，再查看 `@updates`。结果受网络、VS Code 版本兼容性和用户更新设置影响。
- 已安装的 `local-tools.compact-call-graph` 是测试版。先卸载它，再安装 `tangyuanx.compact-call-graph`；不同发布者的插件不会互相覆盖更新。
- 通过 VSIX 安装时，VS Code 默认关闭该扩展自动更新。市场上架后建议从市场安装一次，并按需启用该扩展自动更新。离线用户仍可从 Releases 手动安装新 VSIX。

参考：[VS Code 扩展管理与更新](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#extension-auto-update)。

## 本地检查范围

`npm test` 检查关系模型、布局和发布版本一致性；CI 在 Windows、Linux 上检查语法、运行测试并实际生成 VSIX。这些检查不冒充真实语言服务测试。真实 clangd 的宿主验证记录见 [VALIDATION.md](VALIDATION.md)。市场授权校验与首次发布结果需要在账号配置完成后确认。
