export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type ApiProvider =
  | 'deepseek'
  | 'moonshot'
  | 'siliconflow'
  | 'gemini'
  | 'image'
  | 'video'
  | 'custom';

export type ApiCategory = 'text' | 'image' | 'video';

export type ApiProtocol = 'openai' | 'siliconflow' | 'kling' | 'volcengine' | 'custom';

export interface ApiExtraConfig {
  imageEndpointPath?: string;
  imageEditPath?: string;
  videoSubmitPath?: string;
  videoStatusPath?: string;
  supportedRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  supportedModes?: string[];
  lastTestStatus?: 'ok' | 'error';
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastTestMessage?: string;
}

export type ApiScope = 'workspace' | 'personal';

export type AssetType = 'copywriting' | 'script' | 'image' | 'video';

export type AssetVisibility = 'workspace' | 'private';

export type RoutingScene = 'chat' | 'copywriting' | 'live_script' | 'media' | 'video_gen';

export interface SceneRoutingRule {
  configId?: string;
  model?: string;
}

export type DefaultRouting = Partial<Record<RoutingScene, SceneRoutingRule>>;

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  role: WorkspaceRole;
  default_routing?: DefaultRouting;
  custom_banned_words?: string[];
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  email?: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  invite_code: string;
  role: WorkspaceRole;
  created_by: string;
  expires_at?: string | null;
  created_at: string;
}

export interface ApiConfigPublic {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  scope: ApiScope;
  api_type: ApiCategory;
  protocol: ApiProtocol;
  is_default: boolean;
  provider: ApiProvider;
  display_name: string;
  base_url: string;
  masked_api_key: string;
  models: string[];
  image_models: string[];
  video_models: string[];
  extra_config: ApiExtraConfig;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  workspace_id: string;
  created_by?: string | null;
  name: string;
  selling_points: string;
  target_audience: string;
  specs_and_price: string;
  banned_words: string[];
  reference_images: string[];
  created_at: string;
  updated_at: string;
}

export interface GenerationMeta {
  prompt?: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  model?: string;
  provider?: string;
  mode?: string;
  camera_movement?: string;
  style?: string;
  source_scene?: string;
  [key: string]: unknown;
}

export interface Asset {
  id: string;
  workspace_id: string;
  created_by?: string | null;
  product_id?: string | null;
  asset_type: AssetType;
  visibility: AssetVisibility;
  title: string;
  content?: string | null;
  file_url?: string | null;
  generation_meta: GenerationMeta;
  tags: string[];
  is_starred: boolean;
  created_at: string;
}

export interface ChatSession {
  id: string;
  workspace_id: string;
  user_id: string;
  product_id?: string | null;
  title: string;
  model_config_id?: string | null;
  model_name?: string | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning_content?: string | null;
  created_at: string;
}

export type MediaTaskType = 'image' | 'video';
export type MediaGenerationMode = 't2i' | 'i2i' | 't2v' | 'i2v' | 'first_last_frame';
export type MediaTaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface MediaTask {
  id: string;
  workspace_id: string;
  created_by?: string | null;
  product_id?: string | null;
  api_config_id?: string | null;
  node_id?: string | null;
  provider_name?: string | null;
  task_type: MediaTaskType;
  mode: MediaGenerationMode;
  provider_task_id?: string | null;
  status: MediaTaskStatus;
  progress: number;
  prompt: string;
  negative_prompt?: string | null;
  aspect_ratio: string;
  resolution?: string | null;
  duration_sec?: number | null;
  fps?: number | null;
  camera_movement?: string | null;
  model_name: string;
  batch_count?: number;
  reference_image_url?: string | null;
  input_snapshot?: Record<string, unknown>;
  result_urls: string[];
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryboardPromptCard {
  shot_number: number;
  shot_type: string;
  duration: string;
  visual_zh: string;
  prompt_en: string;
  negative_prompt: string;
  camera_movement: string;
  lighting_style: string;
  aspect_ratio: string;
  suggested_tool: string;
}

// ============================================================================
// Canvas V2.0 (节点画布工作流)
// ============================================================================

export type CanvasNodeKind =
  | 'textNote'
  | 'productInput'
  | 'assetInput'
  | 'llmFission'
  | 'storyboard'
  | 'imageGen'
  | 'videoGen'
  | 'resultDisplay';

export type CanvasNodeStatus = 'idle' | 'running' | 'done' | 'stale' | 'error' | 'paused';

export type LlmFissionMode =
  | 'hooks'
  | 'short_video'
  | 'seeding_post'
  | 'live_script'
  | 'custom';

export interface CanvasNodeData extends Record<string, unknown> {
  label: string;
  status: CanvasNodeStatus;
  errorMessage?: string;
  // textNote
  textContent?: string;
  noteText?: string;
  // productInput
  productId?: string;
  customHookNote?: string;
  // assetInput
  assetId?: string;
  assetType?: AssetType;
  assetTitle?: string;
  assetContent?: string;
  assetFileUrl?: string;
  // llmFission
  fissionMode?: LlmFissionMode;
  configId?: string;
  model?: string;
  instruction?: string;
  outputText?: string;
  // storyboard
  shotCount?: number;
  aspectRatio?: string;
  selectedShotIndex?: number;
  shots?: StoryboardPromptCard[];
  // imageGen & videoGen
  promptOverride?: string;
  negativePrompt?: string;
  mediaMode?: MediaGenerationMode;
  resolution?: string;
  durationSec?: number;
  fps?: number;
  batchCount?: number;
  cameraMovement?: string;
  resultUrl?: string;
  resultUrls?: string[];
  selectedResultIndex?: number;
  taskId?: string;
  progress?: number;
  lastRunSnapshot?: {
    prompt?: string;
    model?: string;
    providerName?: string;
    executedAt?: string;
    [key: string]: unknown;
  };
  // resultDisplay
  previewType?: 'image' | 'video' | 'text';
  previewText?: string;
}

export interface CanvasFlowNode {
  id: string;
  type: CanvasNodeKind;
  position: { x: number; y: number };
  data: CanvasNodeData;
}

export interface CanvasFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasWorkflow {
  id: string;
  workspace_id: string;
  created_by?: string | null;
  name: string;
  description?: string;
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
  viewport?: CanvasViewport;
  created_at: string;
  updated_at: string;
}
