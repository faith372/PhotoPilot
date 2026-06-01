# PhotoPilot AI

PhotoPilot AI 是一个 AI 照片筛选与修图助手，帮助用户从大量照片中快速挑出好片，并用 AI 根据用户意图完成基础调色、美颜和风格化处理。

当前版本是浏览器 + 本地 Node 服务原型：默认不上传照片，先使用本地 Canvas 像素指标评分；用户授权后，可通过本机服务代理调用主流大模型进行复核评分。

## 当前能力

- 导入本地多张照片并生成预览。
- 内置示例照片，便于快速体验完整流程。
- 本地 Canvas 像素评分，分析清晰度、曝光、动态范围、对比、色彩、构图和重复风险。
- 可选云端大模型复核评分，支持 ChatGPT/OpenAI、DeepSeek、Claude、Kimi 和自定义 OpenAI 兼容接口。
- 展示评分理由和指标明细，包括清晰度、曝光、构图、色彩、动态范围、表情和重复照片提示。
- 支持按状态、最低分、人像、已编辑、分数和文件名筛选排序。
- 支持曝光、对比、色温、饱和、美颜参数调节。
- 支持清透自然、胶片暖调、干净棚拍、夜景增强四种预设。
- 支持自然语言生成调色方案。
- 支持将当前照片参数同步到可见照片或精选照片。
- 支持 Canvas 导出当前效果图，不覆盖原图。
- 支持导出项目方案 JSON，保存评分、状态和非破坏式编辑参数。
- 提供 AI Provider 设置弹窗，明确缩略图上传授权边界。

## 运行

直接打开：

```text
index.html
```

或启动本地预览服务：

```bash
node server.mjs
```

如果使用 npm 脚本：

```bash
npm start
```

Windows PowerShell 如果拦截 `npm.ps1`，可以使用：

```powershell
npm.cmd start
```

然后访问：

```text
http://127.0.0.1:5173
```

Windows 也可以双击：

```text
启动预览.bat
```

## 检查

```bash
npm run check
```

Windows PowerShell 如果拦截 `npm.ps1`，可以使用：

```powershell
npm.cmd run check
```

检查内容包括：

- `app.js` 语法检查。
- `server.mjs` 语法检查。
- HTML 与脚本中的 DOM id 一致性检查。
- 前端核心文件是否存在 Unicode 替换字符。

## 打包

生成发布目录：

```bash
npm run package
```

Windows PowerShell 如果拦截 `npm.ps1`，可以使用：

```powershell
npm.cmd run package
```

输出目录：

```text
dist/PhotoPilot
```

打包脚本会生成可运行发布目录，并尝试使用 Node SEA 生成 `PhotoPilot.exe`。如果本机未安装 `postject`，会保留 `launcher.cjs` 与 `启动 PhotoPilot.bat`，发布目录仍然可通过 Node 运行。

## 大模型 API

PhotoPilot 默认不上传照片。选择云端复核评分后，前端会把压缩缩略图和本地评分指标发送到本机 Node 服务，再由本机服务调用模型 API。

支持 Provider：

| Provider | 默认接口 | 默认模型 | 环境变量覆盖 |
| --- | --- | --- | --- |
| ChatGPT / OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` | `OPENAI_BASE_URL` / `OPENAI_MODEL` |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` | `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` |
| Claude | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet-latest` | `CLAUDE_BASE_URL` / `CLAUDE_MODEL` |
| Kimi | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k-vision-preview` | `KIMI_BASE_URL` / `KIMI_MODEL` |
| 自定义兼容接口 | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` | `COMPATIBLE_BASE_URL` / `COMPATIBLE_MODEL` |

API Key 从设置弹窗输入，仅用于当前浏览器会话；不会写入源码或项目文件。

## 开源评分机制调研

已调研 GitHub 上的 LAION aesthetic predictor、NIMA 图像质量评估、ImScore 等项目。它们适合作为后端模型服务，但大多依赖 Python、PyTorch、TensorFlow、CLIP embedding 或预训练模型文件，不适合直接内嵌到当前无依赖浏览器原型中。

当前版本采用：

- 本地 Canvas 像素评分，保证离线可用。
- 云端大模型 Provider 复核，提升摄影语义判断。
- 后续预留 LAION/NIMA/ONNX Provider 接入位。

详细说明见：

```text
docs/scoring-research.md
```

## 项目文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 应用界面结构 |
| `styles.css` | UI 样式、响应式布局和弹窗样式 |
| `app.js` | 照片状态、本地像素评分、AI 复核、编辑、批量同步和导出逻辑 |
| `server.mjs` | 本地静态预览服务和大模型评分代理 |
| `tools/validate-ui.mjs` | 无依赖 UI 一致性检查脚本 |
| `tools/package-app.mjs` | 发布目录和 Windows 启动文件打包脚本 |
| `docs/scoring-research.md` | 开源摄影评分机制调研 |
| `项目开发文档.md` | 产品与技术开发文档 |
| `项目计划表.md` | 迭代计划 |

## AI Provider 设计方向

```ts
interface VisionScoringProvider {
  scoreBatch(inputs: PhotoInput[]): Promise<PhotoScore[]>;
}

interface RetouchPlanProvider {
  createPlan(input: RetouchPrompt): Promise<EditRecipe>;
}
```

UI 不直接绑定具体 AI 厂商。真实视觉评分、修图方案生成或生成式编辑都应通过 Provider 层接入。

## 隐私原则

- 默认本地运行，不上传照片。
- 云端 AI 接入前必须展示明确授权。
- API Key 不应写入源码。
- 前端只上传压缩缩略图和本地评分指标，不上传原始大图。
- 编辑采用非破坏式参数，不覆盖原图。
- 导出效果图时生成新文件。

## 下一步

1. 将 LAION aesthetic predictor 或 NIMA 模型封装为后端 Provider。
2. 增加真实 RetouchPlanProvider，让提示词由 AI 生成结构化参数。
3. 增加批量导出精选照片。
4. 增加项目保存和重新打开能力。
5. 评估 Electron 或 Tauri 桌面端封装。
