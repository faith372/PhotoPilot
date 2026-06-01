# 摄影图像评分机制调研

日期：2026-06-01

## 调研结论

GitHub 上存在可用的开源图像审美/质量评分项目，但主流方案大多依赖 Python、PyTorch、TensorFlow、CLIP embedding 或预训练模型文件，不适合直接塞进当前无依赖的浏览器原型和单文件 Node 打包版本。

因此当前版本采用两层评分架构：

1. 本地评分：基于 Canvas 像素分析，计算清晰度、曝光、动态范围、对比、色彩、构图和重复风险，保证离线可用。
2. AI 评分：通过本地 Node 服务代理调用 OpenAI、DeepSeek、Claude、Kimi 或自定义 OpenAI-compatible API，以本地指标和可选缩略图作为输入，得到更接近摄影语义的复核评分。

## 已调研开源项目

| 项目 | 方向 | 特点 | 当前引入策略 |
| --- | --- | --- | --- |
| LAION-AI/aesthetic-predictor | 审美评分 | 基于 CLIP embedding 的线性审美预测器，MIT 许可 | 不直接内嵌；适合作为后端 Provider |
| idealo/image-quality-assessment | NIMA 图像质量评估 | 使用 CNN 预测图像审美质量和技术质量，项目已归档 | 不直接内嵌；可作为 Python/模型服务参考 |
| ImScore | 图像奖励/审美评分聚合 | 面向图像生成奖励模型与审美 scorer 的聚合工具 | 不直接内嵌；可作为后续模型比较参考 |

## 本地评分指标

| 指标 | 含义 | 实现方式 |
| --- | --- | --- |
| sharpness | 清晰度/虚焦风险 | 灰度梯度和边缘能量 |
| exposure | 曝光稳定性 | 平均亮度、暗部/高光裁切 |
| dynamicRange | 动态范围 | 亮度 P95 - P5 |
| contrast | 对比度 | 亮度标准差 |
| color | 色彩质量 | 平均饱和度、色偏、色彩稳定性 |
| composition | 构图审美 | 边缘权重中心、三分法、主体居中程度 |
| duplicate | 重复风险 | 简化 perceptual hash 与同批照片对比 |

## 后续可接入路径

1. 增加 Python/ONNX 后端，加载 LAION aesthetic predictor 或 NIMA 模型。
2. 将当前 `VisionScoringProvider` 扩展为 `LocalPixelProvider`、`CloudLLMProvider`、`AestheticModelProvider`。
3. 对同一批照片保留多来源评分，允许用户在“技术质量优先”和“审美优先”之间切换权重。
4. 使用真实用户选择结果反向校准本地评分权重。

