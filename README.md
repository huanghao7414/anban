# Anban · 安伴

面向长辈的本地健康助手：用 3D 药盒查看未来七天的安排，通过对话登记药品、核对吃法，并生成大字用药卡和语音叮嘱。

## 已实现

- **对话、功能、个人**三个入口，手机与电脑使用同一套网页。3D 药盒支持旋转、开盖和日期选择。
- **药盒登记**：上传照片 → 模型提取候选信息 → 逐盒人工核对 → 生成用药卡。用量、时间和饭前饭后关系须由用户确认。
- **报告与 PDF**：识别报告图片；PDF 在本地生成预览，选择页面后识别，可重试失败页。
- **大字卡片与语音**：生成可保存的 PNG；macOS 可合成语音，其他环境使用浏览器朗读。
- **每日提醒**：未来七天用药安排、网页内到点提醒和 ICS 日历导出。
- **本地账户与画像**：维护年龄、健康状况、过敏及忌口；SQLite 保存会话、核对进度和卡片。
- **DSH 与模型接入**：通过官方 DeepSeek Harness 调用 GLM 或 DeepSeek，对话模型与视觉模型可以分别配置。

## 本地启动

当前开发环境使用 Python 3.14；DSH 需要 Node.js 24.9 或更新版本。

在仓库根目录执行：

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
npm ci --prefix backend/dsh --ignore-scripts
```

首次使用时复制 `.env.example` 为 `.env`。已有 `.env` 时保留原文件。默认示例使用智谱 GLM：在 `.env` 中填写自己的 `GLM_API_KEY`，再启动服务。

```sh
python3 -m backend --port 8794
```

打开 [安伴网页](http://127.0.0.1:8794/)；接口文档在 [本地 /docs](http://127.0.0.1:8794/docs)。修改模型配置后重启服务。没有 API Key 时可以人工登记和生成卡片，模型对话与图片识别会显示未配置状态。

模型厂商、角色模型、语音、字体、接口和 PDF 限制见 [后端说明](backend/README.md)。Linux 生成中文卡片时需要安装中文字体，或通过 `ANBAN_FONT_PATH` 指定字体文件。

## 项目结构

```text
anban-health/dist/          3D 药盒网页、对话界面及本地静态资源
anban-health/tests/         七天用药安排测试
backend/                   FastAPI 接口、SQLite、PDF、卡片和提醒
backend/skills/            对话、药品登记、报告解读、提醒卡片 Skill
backend/dsh/               官方 DSH Node 运行时配置及固定版本 Python SDK
backend/tests/             API、模型适配、DSH 与 PDF 测试
exports/anban-health-assistant/  可分享的独立 Skill 包
knowledge.py + data/        有出处的药品知识库与初始目录
app.py + static/           独立药品目录查询工具
用药助手原型/               早期交互原型与设计资料
```

网页通过同源 `/api/v1` 调用 FastAPI。场景 Skill 提供提示与约束，DSH 负责模型调用，业务代码负责核对、保存和生成卡片。PDF 通过独立的 `pypdfium2` 子进程渲染，只有选中页面的图片和文本层参与模型识别。

数据库和用户上传资料存放在本地 `.run/`；密钥存放在 `.env`。这些文件以及安装依赖、本地验收资料均被 Git 忽略，克隆仓库后会使用自己的配置和新建数据。

## 验证

```sh
python3 -m unittest discover -s tests -v
python3 -m unittest discover -s backend/tests -v
node --test anban-health/tests/schedule.test.cjs

# 使用实际 DSH 运行时和本机模拟模型服务，不调用付费模型
ANBAN_TEST_DSH=1 python3 -m unittest backend.tests.test_dsh_runtime backend.tests.test_glm_runtime -v
```

真实模型联调命令见后端说明，需要自行配置 API Key，会产生 API 用量。

## 使用范围

本项目用于健康信息的通俗转译与已确认用药安排的整理，不替代执业医师诊断与处方调整，不自动开药或修改剂量。当前每盒药记录一个每日服药时间；复杂多时段、按需或非每日医嘱尚需扩展。

默认仅监听本机地址。当前账户为本地账户，尚未提供公网部署、跨设备同步、找回密码、微信或短信推送；网页关闭后可依赖已导入的手机日历提醒。

## 知识库与 Skill

- [药品目录、来源、版本及核查范围](docs/drug-catalog.md)
- [独立 Skill 包说明](exports/anban-health-assistant/README.md)
- [后端四个运行时 Skill](backend/skills/)

独立 Skill 包用于分享提示、模板和参考资料；完整网页、PDF 解析与 DSH 服务需要本仓库的运行环境。第三方资源的许可证随相应目录保留。
