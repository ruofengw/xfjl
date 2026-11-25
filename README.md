# AI 内容创作与直播电商协同工作台 (V1.0)

零服务器运维成本、支持多端云同步、面向个人及小型创作团队的一站式 AI 内容生产工作台。

## 核心模块总览

1. **主工作台与多空间协同**：左侧功能导航 + 顶部工作空间切换（支持新建空间、生成/输入团队邀请码加入协作）。
2. **API 管理中心 (`/settings/api`)**：预置 DeepSeek、Kimi (Moonshot AI)、硅基流动、Google Gemini 与自定义 OpenAI 兼容接口；支持团队公共 Key / 个人私有 Key 作用域划分、服务端 `AES-256-GCM` 加密存储、首字延迟（TTFB）连通性测试与分场景默认模型路由。
3. **产品库底座 (`/products`)**：管理核心卖点、受众痛点、规格价格、专属违禁词与参考素材图，并在全站各 AI 模块顶部一键关联自动注入 System Prompt。
4. **云端素材库 (`/assets`)**：统一管理文案、话术、图片、视频 4 类资产；支持类型/产品/标签/星标/权限多维筛选，图片/视频对接 Cloudflare R2 预签名直传与详情抽屉复用参数。
5. **AI 对话工作台 (`/chat`)**：SSE 流式输出、Markdown 渲染、DeepSeek-R1 深度思考折叠、会话置顶检索、对话中实时切模型，支持回复一键存入素材库或转为文案/话术草稿。
6. **爆款文案写作工坊 (`/copywriting`)**：内置 4 类带货文案模板，支持多版本流式卡片输出、单卡局部改写与直接归档。
7. **主播话术工坊 & 提词器 (`/live-script`)**：自动生成 5 段式直播结构化话术，集成广告法极限词与自定义词库实时标红替换引擎，支持一键进入黑底白字全屏滚动提词器（支持字号/滚速/镜像翻转/快捷键）。
8. **AI 图片与视频生成 (`/studio`)**：双轨并行——API 异步轮询直连（每 3s 查询任务进度，完成后一键转存 Cloudflare R2）+ 零成本结构化分镜提示词卡片（适配即梦/可灵网页端）。
9. **节点画布 V2.0 (`/canvas`)**：预留第二期 React Flow 可视化工作流入口。

## 快速启用云端模式（Supabase + Cloudflare R2）

> 未配置云端密钥时，系统自动启用**本地持久化演示模式**（数据保存在 `.local-data/store.json`，上传文件保存在 `public/uploads/`），可直接完整体验所有功能。

1. 在 Supabase Dashboard -> **SQL Editor** 中执行 [supabase/schema.sql](supabase/schema.sql) 建表脚本（包含全套表结构、多用户协作 RLS 安全策略以及注册自动初始化个人工作空间触发器）。
2. 复制 `.env.example` 为 `.env.local` 并填入以下环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `API_KEY_ENCRYPTION_SECRET`（64 位十六进制随机密钥，已自动预生成在 `.env.local`）
   - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_DOMAIN`
3. 安装依赖并启动开发服务器：
   ```bash
   npm install
   npm run dev
   ```
