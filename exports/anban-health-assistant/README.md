# 安伴健康整理 Skill 分享包

版本：1.1.0。面向已有 DSH / Agent 环境，复用药盒信息整理、逐盒核对、报告原文转译、大字每日用药卡和朗读稿工作流。

## 交给对方什么

发送 `anban-health-assistant.zip`。压缩包内是完整的 `anban-health-assistant/` 文件夹，保留其子目录即可。它包含：

```text
anban-health-assistant/
├── SKILL.md
├── references/
│   ├── medication-register.md
│   ├── report-explain.md
│   ├── report-indicators.json
│   ├── reminder-card.md
│   └── dsh-integration.md
├── scripts/render_card.py
├── examples/confirmed-demo.json
├── examples/medication-card.png
├── requirements.txt
└── README.md
```

## 对方如何安装

1. 准备已启用原生 Skill 功能的 DSH，以及对方自己的模型服务；图片输入还需要视觉模型。
2. 将解压后的文件夹放进项目的 `.dsh/skills/` 或 `.agents/skills/`，形成 `.dsh/skills/anban-health-assistant/SKILL.md`，不要多套目录。
3. 在 DSH 的 Skill 列表确认入口可见，输入：“请使用 anban-health-assistant，帮我把这两盒药整理成大字用药卡。”
4. 按提示逐盒核对已有医嘱。模型识别的内容不会替代人工确认。

其他 Agent 可按其支持的 Skill 安装路径使用此目录；脚本执行、识图、语音、日历等能力以宿主实际提供为准。DSH 自定义 SDK 的接法见 [DSH 接入说明](references/dsh-integration.md)。

## 独立试生成图片

在 Skill 文件夹中，准备 Python 3.10+、Pillow 和中文字体。需要安装 Python 依赖时，可在自己的虚拟环境执行 `python3 -m pip install -r requirements.txt`。

```sh
python3 scripts/render_card.py examples/confirmed-demo.json --out demo-output
```

输出为早、中、晚分组的大字 `medication-card.png` 和 `narration.txt`。示例中的药名是虚构测试数据，不是处方。用真实数据时必须依据用户核对结果填写；脚本只校验输入结构，无法证明确认确实来自用户。

`narration.txt` 是朗读稿；音频合成需要宿主 TTS。提醒需要宿主日历或定时服务，安装此包不会自动创建后台提醒。

## 分享范围

这个包可以帮助对方在其 Agent 中执行同一工作流。原网站的 3D 药盒、账户、数据库、药品目录和常驻提醒服务属于应用代码，不包含在 Skill 包中。

包内只有 Skill、说明、脚本和虚构样例，不包含 `.env`、API Key、真实健康档案、照片或聊天记录。发这个压缩包即可，无需把个人配置和运行数据一起发送。

安装要求依据：[DSH 官方 Skill 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)。
