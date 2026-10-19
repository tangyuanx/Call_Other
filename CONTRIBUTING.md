# 开发说明

使用 Node.js 24：

```sh
npm ci
npm run prepare-assets
npm run check
npm test
npm run package
```

在 VS Code 打开工程，按 F5 启动扩展开发宿主。在宿主中打开 `examples/main.cpp`，配合 clangd 20+ 验证右键入口、两侧关系、任意节点展开收起和源码跳转。

`npm run package` 根据 package.json 当前版本输出到 `dist/`，不需要手动修改输出文件名。运行时不依赖 node_modules；打包工具和图标来源是开发依赖。

请保留独立分支语义：同一函数在不同路径中有独立界面实例，查询缓存可以共享，展开状态不能共享。空方向没有按钮；递归祖先用引用节点终止，不能画回环线。左右两侧分别表示调用者和被调用者。

提交修改前运行检查和测试，涉及界面时验证实际 Webview。发版流程与首次市场授权见 [PUBLISHING.md](PUBLISHING.md)。不把本地配置、凭据、node_modules 或构建产物提交到源码仓库。
