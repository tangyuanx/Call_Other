# Compact Call Graph · 函数调用关系

右键一个函数名，选择 **展示调用关系**，在 VS Code 底部面板查看可点击的函数调用图。

## 安装与使用

1. 首次上架后，在 VS Code 扩展页搜索 `@id:tangyuanx.compact-call-graph` 安装。上架之前，可从 [GitHub Releases](https://github.com/tangyuanx/Call_Other/releases) 下载 VSIX，并在扩展页 `…` → **从 VSIX 安装…** 中选择。
2. C/C++ 推荐使用 [clangd 扩展](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd)，并使用 **clangd 20 或更新版本**。其他语言也可以使用，只要其语言扩展实现了 VS Code 调用层级接口。
3. 打开真实工程，等待语言服务完成索引，把光标放在函数名上，右键选择 **展示调用关系**。也可在命令面板运行 **调用关系: 展示调用关系**。
4. 点击函数节点跳转源码；面板保留当前函数图，不随源码跳转自动更换中心。

如果右键菜单没有该项，表示当前编辑器尚未声明调用层级支持；可从命令面板运行命令查看提示。

## 安装后的更新

市场版的固定标识为 `tangyuanx.compact-call-graph`。新版本发布到 Marketplace 且完成处理后，VS Code 可以检测更新；在扩展详情页点击 **更新** 即可，也可开启该扩展的自动更新。只上传 GitHub Release 不会触发 VS Code 原生更新。

此前 `local-tools.compact-call-graph` 是本地测试标识。请先卸载该测试版，再安装正式市场版；两个标识不会互相更新。通过 VSIX 安装的扩展默认关闭自动更新，正式上架后建议从市场安装一次，并检查该扩展的自动更新设置。离线环境仍可手动安装新版 VSIX。

发布者的一次性配置和以后发版步骤见 [PUBLISHING.md](PUBLISHING.md)。当前仓库具备发布流程，但首次上架需要发布者账号和授权，不能把 GitHub CI 成功视为已经上架。

## 图上的操作

- 默认同时展示当前函数的一层调用者和被调用者：左侧是调用者，右侧是被调用者。继续追踪时使用各节点两侧的圆形按钮。
- 节点左侧圆形 `+ / −` 控制调用者，右侧控制被调用者。已显示的上一级关系不会重复生成反向按钮；只有其他关系时才提供反向展开入口。任意普通节点均可操作；普通未展开控件在悬停或键盘聚焦时显示。没有该方向关系的按钮会移除。
- 按钮位于节点外部的连接线上。展开后，按钮位于这一侧的公共分支交汇点，统一控制该方向的分支。
- 点击圆形按钮仅展开／收起，不触发源码跳转。展开和收起均为当前图的展示操作。
- 普通细边框和函数图标常驻。选中仅改变浅底色，不新增鼠标选中的外层描边；键盘操作保留可见焦点提示。
- **分支独立：**同一个函数在不同路径中分别显示，不合并可视节点，各自展开、收起和选中互不影响。每个子图拥有独立布局空间，不把线连到另一个分支中。
- 同一路径再次遇到已出现的函数时，显示带引用图标的独立引用节点，可点击跳转；该引用节点不继续展开，避免无限递归和回环连线。
- 再次展开使用当前图缓存；**刷新**重新读取语言服务并重置展开状态。语言服务查询数据可以复用，但界面状态不会共享。
- 拖动画布平移，滚轮缩放，工具栏可放大、缩小、适应视图。悬停函数名查看完整名称、语言服务的详情及文件位置。
- 底部面板支持 VS Code 原生拖动调高、最大化、关闭。本扩展不会改写用户的全局面板尺寸。

## C/C++ 工程配置

调用关系来自语言服务，不使用正则表达式猜测代码。clangd 的工程级分析通常需要正确的编译参数：建议使用 `compile_commands.json`，简单项目也可使用 `compile_flags.txt`。例如 CMake 工程可在支持的生成器下启用 `CMAKE_EXPORT_COMPILE_COMMANDS`，并让 clangd 找到生成的编译数据库。

clangd 20 开始支持 outgoing calls，旧版可能仅能查询调用者。微软 C/C++ 或其他扩展是否可用，取决于它实际提供的调用层级能力；本扩展不强制安装或切换语言服务。clangd 与其他 C/C++ 语言服务的冲突应按其官方说明处理。

**限制：**这是语言服务返回的静态调用关系，函数指针、回调、虚派发、宏、模板以及尚未索引的文件可能不完整。跨文件调用者尤其依赖项目索引。空结果不代表运行时不存在调用，旧版服务不支持某个方向时也可能返回空结果。

VS Code Remote SSH、WSL、容器环境中，应把扩展和 C/C++ 语言服务安装在对应的远程工作区端；扩展使用 URI 跳转，不依赖本机文件路径。

## 可配置项

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `compactCallGraph.maxNodes` | `300` | 每张图最多载入多少个函数节点，不同路径的重复函数分别计数 |
| `compactCallGraph.maxRelationsPerNode` | `40` | 单节点单方向最多载入多少个直接关系 |
| `compactCallGraph.requestTimeout` | `15000` | 查询超时，单位毫秒 |

达到上限会提示实际载入数；提高配置后刷新即可。仅对可见节点探测两侧直接关系，以确认是否需要按钮，最多并发探测四项；不会递归扫描未展开的节点。工程修改后请刷新图。

## 从源码运行

在此目录运行 `npm install`、`npm run prepare-assets`，然后用 VS Code 打开该目录并按 F5。新开的扩展开发窗口中打开 `examples/main.cpp`，配好语言服务即可试用。

```sh
npm test              # 关系图、并发和布局行为测试
npm run check         # JavaScript 语法检查
npm run package       # 输出 dist/compact-call-graph-<version>.vsix
```

运行时无第三方 JavaScript 依赖。图标使用 [VS Code Codicons](https://github.com/microsoft/vscode-codicons)，相应许可包含在 `media/codicons/LICENSE` 中。

## 实现结构

- `src/extension.js`：右键命令、底部 Webview、语言服务桥接、源码跳转。
- `src/graph.js`：独立节点实例、按方向展开、查询缓存、异步结果隔离。
- `media/layout.js`：独立分支区域、避免交叉的圆角折线路由。
- `media/graph.js` / `graph.css`：实际扩展界面，节点和圆形按钮交互。
- `test/`：单元测试及 VS Code 扩展宿主集成测试。
- `.github/workflows/`：源码检查、GitHub Release 和 Marketplace 发布。
- `scripts/package.js` / `release.js`：按当前版本打包，校验版本标签、固定插件标识与变更日志。

## 依据

- [VS Code 调用层级命令](https://code.visualstudio.com/api/references/commands)
- [VS Code Webview](https://code.visualstudio.com/api/extension-guides/webview)
- [clangd 20 发布说明](https://releases.llvm.org/20.1.0/tools/clang/tools/extra/docs/ReleaseNotes.html)
- [clangd 编译参数说明](https://clangd.llvm.org/design/compile-commands)
