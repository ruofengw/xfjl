import fs from 'fs';
import path from 'path';
import { CANVAS_TEMPLATES } from '@/lib/canvas-templates';
import type {
  ApiCategory,
  ApiConfigPublic,
  ApiExtraConfig,
  ApiProtocol,
  ApiProvider,
  ApiScope,
  Asset,
  AssetType,
  AssetVisibility,
  CanvasWorkflow,
  ChatMessage,
  ChatSession,
  DefaultRouting,
  GenerationMeta,
  MediaGenerationMode,
  MediaTask,
  MediaTaskStatus,
  MediaTaskType,
  Product,
  Workspace,
  WorkspaceInvite,
  WorkspaceRole,
} from '@/lib/types';

export interface StoredApiConfigRecord {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  scope: ApiScope;
  api_type?: ApiCategory;
  protocol?: ApiProtocol;
  is_default?: boolean;
  provider: ApiProvider;
  display_name: string;
  base_url: string;
  encrypted_api_key: string;
  models: string[];
  image_models?: string[];
  video_models?: string[];
  extra_config?: ApiExtraConfig;
  is_active: boolean;
  created_at: string;
}

export interface LocalStoreData {
  workspaces: Array<{
    id: string;
    name: string;
    owner_id: string;
    default_routing: DefaultRouting;
    custom_banned_words: string[];
    created_at: string;
  }>;
  workspace_members: Array<{
    workspace_id: string;
    user_id: string;
    role: WorkspaceRole;
    joined_at: string;
  }>;
  workspace_invites: WorkspaceInvite[];
  api_configs: StoredApiConfigRecord[];
  products: Product[];
  assets: Asset[];
  chat_sessions: ChatSession[];
  chat_messages: ChatMessage[];
  media_tasks: MediaTask[];
  canvas_workflows: CanvasWorkflow[];
}

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_USER_EMAIL = 'demo@local.workspace';
export const DEFAULT_WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';

const STORE_DIR = path.join(process.cwd(), '.local-data');
const STORE_PATH = path.join(STORE_DIR, 'store.json');

function createInitialStore(): LocalStoreData {
  const now = new Date().toISOString();
  const sampleProductId = '20000000-0000-4000-8000-000000000001';
  const sampleSessionId = '30000000-0000-4000-8000-000000000001';

  return {
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: '个人工作空间',
        owner_id: DEMO_USER_ID,
        default_routing: {},
        custom_banned_words: [],
        created_at: now,
      },
    ],
    workspace_members: [
      {
        workspace_id: DEFAULT_WORKSPACE_ID,
        user_id: DEMO_USER_ID,
        role: 'owner',
        joined_at: now,
      },
    ],
    workspace_invites: [],
    api_configs: [],
    products: [
      {
        id: sampleProductId,
        workspace_id: DEFAULT_WORKSPACE_ID,
        created_by: DEMO_USER_ID,
        name: '云朵冰感防晒冰丝防晒衣 UPF50+',
        selling_points:
          '1. 凉感冰丝科技面料，接触瞬间降温约3℃；2. 原纱防晒 UPF50+，有效阻隔99%紫外线，水洗50次不掉防晒力；3. 立体裁剪显瘦收腰，带可拆卸加宽帽檐与护手拇指洞，通勤骑行全覆盖。',
        target_audience:
          '22-38岁都市通勤女性、户外露营及骑行人群，痛点：普通防晒衣闷热出汗黏皮肤、版型臃肿像劳保服、洗几次就不防晒。',
        specs_and_price:
          '颜色：冰川白 / 雾霾蓝 / 樱花粉 / 曜石黑；尺码：S-XL（80-145斤可穿）；日常价 169元，直播间闪购价 99元，拍2件立减20元并加赠冰袖1副。',
        banned_words: ['全网最低', '永久防晒', '百分百有效', '根治晒黑'],
        reference_images: [],
        created_at: now,
        updated_at: now,
      },
    ],
    assets: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        workspace_id: DEFAULT_WORKSPACE_ID,
        created_by: DEMO_USER_ID,
        product_id: sampleProductId,
        asset_type: 'copywriting',
        visibility: 'workspace',
        title: '夏季冰丝防晒衣前3秒痛点口播示例',
        content:
          '姐妹们，大太阳一晒胳膊火辣辣的，穿普通防晒衣又像裹了层塑料布一样闷汗黏身？今天给你们实测这件凉感冰丝防晒衣，刚上身就感觉自带小空调，UPF50+原纱防晒还不怕水洗！',
        file_url: null,
        generation_meta: {
          source_scene: 'copywriting',
          model: 'deepseek-chat',
        },
        tags: ['防晒衣', '口播开头', '夏季爆款'],
        is_starred: true,
        created_at: now,
      },
    ],
    chat_sessions: [
      {
        id: sampleSessionId,
        workspace_id: DEFAULT_WORKSPACE_ID,
        user_id: DEMO_USER_ID,
        product_id: sampleProductId,
        title: '防晒衣短视频爆款选题头脑风暴',
        model_config_id: null,
        model_name: 'deepseek-chat',
        is_pinned: true,
        created_at: now,
        updated_at: now,
      },
    ],
    chat_messages: [
      {
        id: '50000000-0000-4000-8000-000000000001',
        session_id: sampleSessionId,
        role: 'assistant',
        content:
          '你好！我是你的直播电商 AI 创作助手。\n\n你可以先去左侧 **「API 管理中心」** 配置 Kimi 或 DeepSeek 的 API Key，然后在顶部关联 **「产品库」** 中的商品，即可开始流式对话、生成多版本爆款文案与结构化直播话术！',
        created_at: now,
      },
    ],
    media_tasks: [],
    canvas_workflows: [
      {
        id: '60000000-0000-4000-8000-000000000001',
        workspace_id: DEFAULT_WORKSPACE_ID,
        created_by: DEMO_USER_ID,
        name: '爆款短视频全链路生产流（默认示例）',
        description: CANVAS_TEMPLATES[0].description,
        ...CANVAS_TEMPLATES[0].build(sampleProductId),
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

export function readLocalStore(): LocalStoreData {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = createInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
    const fallback = createInitialStore();
    return {
      workspaces: parsed.workspaces?.length ? parsed.workspaces : fallback.workspaces,
      workspace_members: parsed.workspace_members?.length
        ? parsed.workspace_members
        : fallback.workspace_members,
      workspace_invites: parsed.workspace_invites || [],
      api_configs: parsed.api_configs || [],
      products: parsed.products || [],
      assets: parsed.assets || [],
      chat_sessions: parsed.chat_sessions || [],
      chat_messages: parsed.chat_messages || [],
      media_tasks: parsed.media_tasks || [],
      canvas_workflows: parsed.canvas_workflows?.length
        ? parsed.canvas_workflows
        : fallback.canvas_workflows,
    };
  } catch {
    return createInitialStore();
  }
}

export function writeLocalStore(data: LocalStoreData): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export type {
  ApiConfigPublic,
  ApiProvider,
  ApiScope,
  Asset,
  AssetType,
  AssetVisibility,
  ChatMessage,
  ChatSession,
  DefaultRouting,
  GenerationMeta,
  MediaGenerationMode,
  MediaTask,
  MediaTaskStatus,
  MediaTaskType,
  Product,
  Workspace,
  WorkspaceInvite,
  WorkspaceRole,
};
