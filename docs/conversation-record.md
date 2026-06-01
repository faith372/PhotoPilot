# 对话记录摘要

日期：2026-06-01

## 用户需求

用户要求继续开发 PhotoPilot：

1. 优化评分机制。
2. 在 GitHub 中查询是否有开源摄影图像评分机制，如有可直接引入，如没有则优化现有机制，可结合 AI 评分。
3. 引入主流大语言模型 API，例如 DeepSeek、ChatGPT、Claude、Kimi 等。
4. 将项目打包成一个可运行文件。
5. 将项目和本次对话记录上传到 `faith372/PhotoPilot` 仓库。

## 实现摘要

1. 调研 GitHub 上的图像审美与质量评分方案：
   - `LAION-AI/aesthetic-predictor`
   - `idealo/image-quality-assessment`
   - `ImScore`
2. 结论：这些方案适合作为后端 Provider，但多依赖 Python、PyTorch、TensorFlow、CLIP embedding 或模型文件，不适合直接内嵌当前轻量浏览器原型。
3. 实现本地 Canvas 像素评分：
   - 清晰度
   - 曝光
   - 动态范围
   - 对比
   - 色彩
   - 构图
   - 重复风险
4. 增加云端大模型复核评分：
   - ChatGPT / OpenAI
   - DeepSeek
   - Claude
   - Kimi
   - 自定义 OpenAI-compatible 接口
5. 服务端新增 `/api/score`，由本机 Node 服务代理模型 API 请求，避免 API Key 写入前端源码。
6. 前端设置弹窗更新为多 Provider 选择，并明确上传的是压缩缩略图和本地评分指标。
7. 增加 `docs/scoring-research.md` 记录评分机制调研。
8. 增加 `tools/package-app.mjs` 和 `tools/windows-launcher.cjs`，生成 `dist/PhotoPilot` 发布目录和 `PhotoPilot.exe`。
9. 更新 README，补充运行、检查、打包、大模型 API 和隐私说明。

## 验证

已运行：

```text
npm.cmd run check
npm.cmd run package
```

检查通过：

```text
UI validation passed.
```

打包输出：

```text
dist/PhotoPilot/PhotoPilot.exe
```

