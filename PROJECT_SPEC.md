# AI 内容创作与直播电商协同工作台 — 产品需求与技术架构文档 (v1.0)

## 1. 项目概述与核心目标

### 1.1 项目定位
打造一款**零服务器运维成本、支持多端云同步、面向个人及小型创作团队**的一站式 AI 内容生产工作台。覆盖从“产品卖点沉淀 -> AI 对话灵感 -> 爆款文案/主播话术撰写 -> 多模态图/视频生成 -> 云端素材库归档”的完整业务闭环，并在第二期扩展可视化节点画布工作流。

### 1.2 核心设计原则
* **极致免费与低成本**：全栈采用 Serverless 与 BaaS 免费套餐组合（Vercel / Cloudflare Pages + Supabase + Cloudflare R2），实现基础架构 **$0/月** 运营。
* **国产模型深度适配与全协议兼容**：原生预置 **Kimi (Moonshot AI)** 与 **DeepSeek** 接入配置，同时兼容所有 OpenAI 标准协议接口及主流异步多模态（图/视频）接口。
* **平滑演进的团队协作架构**：底层数据库从 V1.0 起即引入 `Workspace（工作空间）` 模型。初期个人独立使用，后期邀请同事注册加入同一空间即可共享产品库、素材库与公共 API 额度。

### 1.3 版本迭代路线图
* **第一期（V1.0 核心闭环版）**：用户鉴权与团队空间、API 管理中心（含 Kimi/DeepSeek 预设）、产品库底座、AI 对话、文案写作、主播话术（含违禁词检测与提词器）、图片/视频生成、**云端素材库**。
* **第二期（V2.0 工业化进阶版）**：**画布模式（Canvas 可视化节点工作流）**、工作流模板市场、团队用量统计与细粒度角色权限控制。

---

## 2. 技术栈与免费架构选型（方案二）

| 架构层级 | 推荐技术选型 | 免费额度说明 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **前端框架** | **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui** | 开源免费 | 响应式工作台界面、状态管理、提词器、富文本/Markdown 渲染 |
| **应用托管** | **Vercel** 或 **Cloudflare Pages** | 免费版足够个人及小团队日常高频访问 | 托管前端页面与 Next.js API Routes（服务端代理转发） |
| **数据库与鉴权** | **Supabase (PostgreSQL + Auth)** | 免费版含 500MB 数据库、5万月活用户、行级安全策略 (RLS) | 用户登录注册、团队空间关系、对话记录、文案/话术、加密 API Key 存储 |
| **媒体文件存储** | **Cloudflare R2**（兼容 S3 协议） | 免费版含 **10GB/月 存储 + 零流量费 (Egress Free)** | 持久化保存素材库中的图片、视频成片，防止第三方生成链接过期失效 |
| **第二期画布引擎** | **React Flow (`@xyflow/react`)** | 开源免费 | V2.0 节点式可视化内容生产工作流 |

> **安全架构说明**：所有第三方 AI 平台的 `API Key` 均采用 `AES-256-GCM` 加密后存入 Supabase 数据库；前端不直接请求外部 AI 接口，而是统一请求本地 `/api/ai/*` 路由，由服务端解密 Key 后转发请求，彻底杜绝 Key 泄露与浏览器跨域（CORS）问题。

---

## 3. 多模型 API 接入与路由规范

### 3.1 文本模型统一适配层（OpenAI 兼容规范）
所有对话、文案、话术模块统一调用抽象后的 `ChatCompletion` 服务，支持按“厂商预设 + 自定义 Base URL”灵活扩展：

| 厂商名称 | 默认 Base URL | 推荐预置模型 ID | 适用业务场景定位 |
| :--- | :--- | :--- | :--- |
| **DeepSeek（深度求索）** | `https://api.deepseek.com/v1` | `deepseek-chat` (V3)<br>`deepseek-reasoner` (R1) | **主力默认模型**：爆款文案拆解、逻辑推理、高性价比批量产出 |
| **Kimi (Moonshot AI)** | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` / `32k` / `128k`<br>`kimi-latest` | **长文本主力**：读取长篇产品资料/卖点文档、长脚本润色 |
| **硅基流动 (SiliconFlow)** | `https://api.siliconflow.cn/v1` | 各类开源免费/低价模型 | 补充免费算力池、低成本日常对话与草稿测试 |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` / `pro` | 多模态图文理解、跨语言创意 |
| **自定义 OpenAI 兼容** | 用户自定义填写 | 自定义 Model Name | 支持接入任何中转站（One-API/New-API）或其余国产模型（通义、豆包、智谱等） |

### 3.2 多模态（图片 / 视频）双模式接入设计
鉴于部分生图/生视频平台 API 异步耗时较长，且部分平台网页端提供每日免费积分，系统采用**双轨并行设计**：
1. **API 异步轮询直连模式**：
   * 前端提交生成参数 -> 后端调用对应厂商生成接口获取 `task_id` -> 写入任务队列 -> 前端每 `3s` 轮询 `/api/ai/task/[id]` 获取状态（`pending` / `processing` / `succeeded` / `failed`） -> 完成后自动转存至 Cloudflare R2 并展示。
2. **结构化提示词卡片模式（零 API 成本辅助）**：
   * 当未配置付费视频/生图 API 时，调用 Kimi/DeepSeek 自动将文案转化为标准化的**分镜画面提示词 + 运镜参数 + 比例参数卡片**，支持一键复制直接粘贴至即梦、可灵等网页端生成。

---

## 4. V1.0 核心功能模块详细规格

### 模块 1：API 管理中心（支持团队共享与个人隔离）
* **配置管理**：支持新增、编辑、启停、删除 API 渠道配置（名称、厂商类型、Base URL、API Key、可用模型列表）。
* **作用域划分（面向团队协作）**：
  * **团队公共 Key**：由空间管理员配置，团队内所有同事可直接使用（前端掩码隐藏明文，仅管理员可修改）。
  * **个人私有 Key**：成员可绑定自己的账号额度，优先或独立使用。
* **健康检查与场景路由**：
  * 提供【测试连通性】按钮，实时检测接口状态与首字延迟（TTFB）。
  * 支持设置默认路由规则（如：AI 对话默认用 Kimi，文案/话术默认用 DeepSeek）。

### 模块 2：产品库 / 知识库底座（全局上下文）
* **产品档案字段**：产品名称、核心卖点、规格参数、目标受众痛点、价格与促销机制、参考素材图、专属违禁词/注意事项。
* **全局调用**：在**文案写作、主播话术、图片/视频提示词生成**顶部，均提供【关联产品】下拉选择器。选中后自动将产品档案注入 System Prompt，无需反复粘贴背景资料。

### 模块 3：AI 对话工作台
* **基础体验**：流式输出（SSE）、Markdown 渲染、代码高亮、多轮上下文管理、历史会话检索与置顶。
* **快捷联动**：
  * 对话过程中可随时切换当前会话使用的模型（如从 Kimi 一键切到 DeepSeek-R1 深度思考）。
  * 每条 AI 回复底部提供【一键存入素材库】与【转为文案/话术草稿】快捷按钮。

### 模块 4：爆款文案写作工坊
* **场景化模板**：内置短视频带货口播稿、种草图文文案、痛点钩子（前 3 秒黄金开头）批量生成、多风格改写/扩写/精简。
* **交互布局**：左侧为【参数配置区】（关联产品 + 文案类型 + 目标平台 + 语气风格 + 生成数量），右侧为【多版本结果卡片区】，支持局部重写与直接保存至素材库。

### 模块 5：主播话术工坊（含违禁词检测与提词器）
* **结构化话术输出**：按直播节奏自动拆分为结构化模块卡片，而非整段纯文本：
  1. `前 3 秒留人钩子`（强情绪/悬念/利益点）
  2. `痛点与场景共鸣`
  3. `产品核心卖点与演示话术`
  4. `限时逼单与福利促单`
  5. `高频弹幕 Q&A 应对话术`
* **合规违禁词实时检测**：内置本地常见广告法极限词与平台敏感词库（支持自定义补充词库），编辑器内实时标红提示并提供替换建议。
* **全屏提词器模式**：点击【开启提词器】进入沉浸式黑底白字全屏界面，支持调节字号、滚动速度、镜像翻转与暂停/继续快捷键，方便直接上播或口播录制使用。

### 模块 6：AI 图片与视频生成
* **图片生成**：支持文生图、图生图（可从素材库选取参考图），支持选择画面比例（`9:16` 竖屏、`16:9` 横屏、`1:1` 方图）与批量出图数量。
* **视频生成**：支持文生视频、图生视频（支持首帧参考图上传/从素材库选择），展示实时任务进度条。
* **防过期一键归档**：生成结果预览满意后，点击【保存到素材库】，后台自动将文件持久化转存至 Cloudflare R2，并完整记录生成该作品所用的 Prompt 与模型参数。

### 模块 7：云端素材库（Asset Library）
* **全类型统一管理**：支持存储和管理 **4 类核心资产**：
  1. `文案资产`（口播稿、种草文案、标题库）
  2. `话术资产`（直播分段话术、Q&A 话术包）
  3. `图片资产`（AI 生成图、产品参考图、封面图）
  4. `视频资产`（AI 生成分镜片段、参考样片）
* **检索与组织能力**：
  * 支持按**素材类型、关联产品、自定义标签（Tags）、创建人、收藏星标**进行多维筛选与关键词全文检索。
  * 支持详情抽屉查看：图片/视频素材可查看当时生成的 **完整 Prompt、负面词、比例及所用模型**，支持点击【一键复用同款参数继续生成】。
* **团队共享权限**：每条素材支持标记为【团队共享】（同事可见可复用）或【仅自己可见】。

---

## 5. 第二期规划：画布模式（Canvas V2.0）

* **技术实现**：基于 `React Flow` 构建无限缩放二维白板。
* **核心节点类型**：
  * `输入节点`：产品档案卡片、参考图片/文案素材卡片（可直接从素材库拖入）。
  * `处理节点`：LLM 文本裂变节点（接入 Kimi/DeepSeek）、分镜拆解节点。
  * `生成节点`：AI 生图节点、AI 生视频节点。
* **工作流联动**：支持节点连线传递上下文，修改上游产品卖点或钩子后，可一键触发下游关联节点重新生成，最终成片批量归档至素材库。

---

## 6. 核心数据库表结构设计（Supabase PostgreSQL）

```sql
-- 1. 工作空间表（支持个人独立使用与未来团队协作）
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- 2. 空间成员表
create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner', 'admin', 'member')) default 'member',
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- 3. API 密钥与模型配置表
create table api_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id), -- scope='personal' 时有效
  scope text check (scope in ('workspace', 'personal')) default 'workspace',
  provider text not null, -- 'deepseek' | 'moonshot' | 'siliconflow' | 'gemini' | 'custom'
  display_name text not null,
  base_url text not null,
  encrypted_api_key text not null,
  models jsonb not null default '[]', -- 可用模型列表
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 4. 产品库表
create table products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  selling_points text,
  target_audience text,
  specs_and_price text,
  banned_words text[],
  reference_images jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. 云端素材库表（文案、话术、图片、视频统一存储）
create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  product_id uuid references products(id) on delete set null,
  asset_type text check (asset_type in ('copywriting', 'script', 'image', 'video')) not null,
  visibility text check (visibility in ('workspace', 'private')) default 'workspace',
  title text not null,
  content text, -- 文案/话术正文
  file_url text, -- Cloudflare R2 存储地址（图片/视频）
  generation_meta jsonb default '{}', -- 记录 prompt、model、aspect_ratio 等参数
  tags text[] default '{}',
  is_starred boolean default false,
  created_at timestamptz default now()
);

-- 6. AI 对话会话与消息表
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  model_config_id uuid references api_configs(id) on delete set null,
  model_name text,
  created_at timestamptz default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text check (role in ('system', 'user', 'assistant')) not null,
  content text not null,
  created_at timestamptz default now()
);
```

---

## 7. 推荐项目目录结构（Next.js App Router）

```text
src/
├── app/
│   ├── (auth)/                 # 登录 / 注册 / 邀请加入团队页面
│   ├── (dashboard)/            # 主工作台布局（侧边栏 + 顶部工作空间切换）
│   │   ├── chat/               # AI 对话
│   │   ├── copywriting/        # 爆款文案写作
│   │   ├── live-script/        # 主播话术 + 违禁词检测 + 全屏提词器
│   │   ├── studio/             # 图片生成 & 视频生成
│   │   ├── assets/             # 云端素材库
│   │   ├── products/           # 产品库管理
│   │   ├── canvas/             # [V2.0 预留] 节点画布工作流
│   │   └── settings/api/       # API 管理中心（Kimi/DeepSeek/自定义配置）
│   └── api/
│       ├── ai/
│       │   ├── chat/route.ts   # 统一流式对话代理（兼容 Kimi/DeepSeek/OpenAI）
│       │   ├── media/route.ts  # 生图/生视频异步任务提交与轮询
│       │   └── test/route.ts   # API Key 连通性测试
│       └── upload/route.ts     # Cloudflare R2 预签名上传与转存
├── components/
│   ├── teleprompter/           # 全屏提词器组件
│   ├── product-selector/       # 全局产品关联下拉组件
│   └── asset-save-dialog/      # 一键保存至素材库弹窗组件
└── lib/
    ├── supabase/               # Supabase 客户端与服务端鉴权工具
    ├── crypto.ts               # API Key 服务端 AES 加密/解密工具
    ├── r2.ts                   # Cloudflare R2 S3 客户端封装
    └── banned-words.ts         # 本地敏感词/违禁词检测引擎
```

---

## 8. 免费额度部署与防超限建议

1. **Vercel 免费版防超时**：Vercel Hobby 套餐 Serverless 函数默认最长执行时间为 `10s~60s`。
   * 文本生成务必使用 **Streaming（流式输出）**，首字响应通常在 `1~2s` 内，不会触发超时。
   * 视频生成务必采用**异步提交 + 前端轮询**，切勿在单个 API 请求中死等视频渲染完成。
2. **Supabase 数据库容量维护**：500MB 纯文本存储容量极高（可存数十万条文案与对话），但**切勿将图片/视频 Base64 字符串直接存入 PostgreSQL 字段**，媒体文件一律上传至 **Cloudflare R2（10GB 免费）**，数据库仅存 `file_url` 链接。
3. **环境变量清单 (`.env.local`)**：
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   API_KEY_ENCRYPTION_SECRET=32_byte_random_hex_string
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret_key
   R2_BUCKET_NAME=ai-workbench-assets
   R2_PUBLIC_DOMAIN=[https://assets.yourdomain.com](https://assets.yourdomain.com)
   ```