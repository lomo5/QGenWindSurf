# AI智能题库开发工具

基于 Electron + Vue3 开发的智能题库生成工具，使用 AnythingLLM 的 RAG 技术来生成高质量的题目。

## 功能特点

- 支持导入 TXT 文件作为知识库
- 支持多种题型生成（选择题、判断题、填空题）
- 支持多个专业分类管理
- 支持自定义 prompt
- 支持多种大语言模型选择
- 支持题目导出为 CSV 格式
- 支持查看题目对应的原文内容

## 技术栈

- Electron
- Vue 3
- Element Plus
- SQLite3
- AnythingLLM API

## 开发环境要求

- Node.js >= 16
- npm >= 8
- AnythingLLM 服务运行在本地 3001 端口

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm run dev
```

3. 启动 Electron：
```bash
npm start
```

## 打包

```bash
npm run build
```

## 数据存储

- 题库数据存储在 SQLite 数据库中
- 数据库文件位置：`%APPDATA%/.qgen-windsurf/database.db`（Windows）或 `~/.qgen-windsurf/database.db`（macOS/Linux）
- 导出的 CSV 文件命名格式：`[时间]-[专业]-[题型].csv`

## 注意事项

1. 使用前请确保 AnythingLLM 服务已经启动
2. 文件上传大小限制为 10MB
3. 建议每次生成题目数量不超过 50 道
4. 请确保系统中已安装所需的 Ollama 模型
