# 安伴 · DeepSeek Harness Web 插件

在 Harness 侧栏添加「安伴」，点击后在主面板打开现有安伴网页。3D 药盒、报告上传、制卡及语音继续由安伴应用提供。

## 本机安装

已在 Harness `0.2.2-rc.5` 的 Web 配置上验证。安装需要 `dsh` 和 `pnpm` 已在终端 PATH 中。

1. 在安伴项目目录启动后端：`python -m backend --port 8794`。
2. 将插件的 `.tgz` 下载到当前目录，然后在终端执行：

   ```powershell
   dsh plugin --profile web add ./anban-harness-web-1.0.0.tgz
   dsh --profile web
   ```

3. 打开 Harness Web，点击侧栏里的「安伴」。也可通过侧栏的「更多」找到该入口。
4. 如修改过安伴端口，在面板顶部选择「服务地址」。填写后点击「保存地址」。

面板默认使用与 Harness 相同的本机主机名和安伴端口 8794。请让两个服务都用 `127.0.0.1`，或都用 `localhost`，以便浏览器在同站点的内嵌页面中发送安伴会话 Cookie。地址只保存在浏览器，插件包没有密钥或用户数据。

## 部署边界

Harness Web 与安伴后端各自运行，可以使用同一台电脑。安伴的报告识别与云端语音仍使用安伴后端自身的配置。此包提供 Harness 页面入口；需要 Agent 在对话里执行安伴操作时，可另接 Skill 或工具。

其他电脑访问时，安伴地址必须从访问者的浏览器可达。建议同站点的不同 HTTPS 来源，并允许目标 Harness 来源嵌入安伴页面。若浏览器拦截内嵌会话或组织禁止嵌入，使用面板的「在新标签页打开」。

## 官方文档

- [Harness 插件安装](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.html)
- [Harness 客户端模块](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules)
