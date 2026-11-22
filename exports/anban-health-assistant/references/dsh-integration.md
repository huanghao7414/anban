# DSH 与安伴 Skill 的接入方式

## 当前网页中的实际结构

```text
FastAPI 场景路由
  → providers.py 选择场景提示与模型
  → harness.py 创建隔离请求、超时和并发控制
  → dsh_worker.py 组装 SDK 配置和输入
  → 官方 Python SDK
  → Node.js DSH（sdk-minimal profile）
  → GLM 适配器（@deepseek-ai/dsh-llm-pi-ai）
  → GLM API
```

`health.patch.yml` 关闭了当前模型请求中的文件、终端等工具；worker 生成临时的连接 patch，指定服务地址和模型。业务进程通过管道传递请求和凭据，worker 为模型建立输入。普通对话将健康画像、最近 16 条消息和本轮问题加入上下文。聊天历史存入业务 SQLite，每次调用的 DSH 环境会清理。

现有 `backend/skills/*/SKILL.md` 由 Python 直接读取正文并注入系统提示，不依赖 DSH 原生目录发现。原文件的 `name`、`version` 是内部约定，未提供原生目录所需的 `description`。这个分享包增加了标准入口及可发现的说明。

## 在另一个 DSH 中使用

完整复制 `anban-health-assistant` 文件夹到以下任一目录的直属下一层：

```text
<项目根目录>/.dsh/skills/anban-health-assistant/SKILL.md
<项目根目录>/.agents/skills/anban-health-assistant/SKILL.md
<DSH_HOME>/skills/anban-health-assistant/SKILL.md
```

DSH 的原生 Skill 能力由注册表 `dsh-skill`、文件发现 `dsh-skill-filesystem` 和加载工具 `dsh-tool-skill` 配合完成。使用已启用这套能力的运行配置；自定义精简 SDK profile 需要检查是否包含这些组件。项目根以最近的 `.git` 祖先目录确定，没有 `.git` 时使用工作目录。

目录只发现一层，不要再套一层压缩包名称。`name` 使用小写英文连字符，`description` 说明何时使用。安装后检查 Skill 列表能否看到 `anban-health-assistant`，再输入“请使用 anban-health-assistant，帮我整理这两盒药”。

宿主仍需自己的模型配置；读图使用支持图像输入的模型，PNG 脚本需要文件与脚本工具。定时提醒和账户保存由宿主提供，本包不包含相应常驻服务。

## 在自己的网页后端中使用

可以沿用显式路由：加载 `SKILL.md` 正文及当前场景 reference，作为模型提示；图片提取使用 reference 中的 JSON 结构，服务端验证后仅写入候选记录。人工确认、保存卡片、TTS 和定时任务继续由业务接口执行。

共享的是提示、工作流与本地制卡脚本。这个包不携带 DSH 本体、GLM 密钥、安伴的网页、登录系统、用户数据或药品知识库，也不启动原网站后端。要复用完整网站，需要另行交付应用代码和部署配置。

## 官方依据

本包安装结构已对照本项目安装的 DSH `0.2.2-rc.5` 文档和发现实现核对。

- [DSH Skills 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)：发现路径、目录层级和注册/加载机制。
- [DSH 文件系统 Skill 提供方](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)：frontmatter 和本地发现要求。

不同版本或自定义 profile 的组件组合可能不同，以接收方运行配置的实际 Skill 列表为准。
