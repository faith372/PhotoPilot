# PhotoPilot

PhotoPilot 是一个 AI 照片筛选与修图助手，帮助用户从大量照片中快速挑出好片，并用 AI 根据用户意图完成基础调色、美颜和风格化处理。

## Website

这个仓库根目录包含 PhotoPilot 的静态展示与下载页面，可直接用于 GitHub Pages、Cloudflare Pages、Vercel 或普通静态服务器。

主要文件：

- `index.html`：展示与下载页面
- `styles.css`：响应式样式
- `app.js`：移动端导航与图标初始化
- `downloads/`：安装包或资源包放置目录

仓库已包含 GitHub Pages 自动部署工作流：`.github/workflows/pages.yml`。

## Download Files

页面当前预留这些下载路径：

- `downloads/PhotoPilot-Setup.exe`
- `downloads/PhotoPilot.dmg`
- `downloads/PhotoPilot-Resources.zip`

发布正式版本时，把对应文件放入 `downloads/`，或在 `index.html` 中替换为 GitHub Releases 等外部下载链接。
