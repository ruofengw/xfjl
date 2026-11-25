import type { ApiCategory, ApiProtocol, ApiProvider, AssetType } from './types';

export interface ProviderPreset {
  provider: ApiProvider;
  apiType: ApiCategory;
  protocol: ApiProtocol;
  label: string;
  displayName: string;
  baseUrl: string;
  defaultModels: string[];
  defaultImageModels: string[];
  defaultVideoModels: string[];
  imageEndpointPath?: string;
  videoSubmitPath?: string;
  videoStatusPath?: string;
  supportedRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  supportedModes?: string[];
  description: string;
  badgeColor: string;
}

const VIDEO_MODEL_PATTERN =
  /(video|t2v|i2v|v2v|\bwan\b|wan2|wan-ai|kling|cogvideo|hunyuan-video|\bveo\b|sora|luma|hailuo|minimax-video|seedance|vidu|jimeng|mochi|pika|runway|pixverse|skyreels|step-video|gen-3|gen-4|ray-2)/i;

const IMAGE_MODEL_PATTERN =
  /(flux|sdxl|stable-diffusion|dall-e|gpt-image|imagen|kolors|midjourney|recraft|ideogram|janus|cogview|hidream|qwen-image|seedream|jimeng-image|wanx|playground)/i;

export function isVideoModelId(modelId: string): boolean {
  return VIDEO_MODEL_PATTERN.test(modelId.trim());
}

export function isImageModelId(modelId: string): boolean {
  return IMAGE_MODEL_PATTERN.test(modelId.trim()) && !isVideoModelId(modelId);
}

export function classifyFetchedModels(modelIds: string[]): {
  models: string[];
  imageModels: string[];
  videoModels: string[];
} {
  const unique = Array.from(
    new Set(modelIds.map((m) => m.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const models: string[] = [];
  const imageModels: string[] = [];
  const videoModels: string[] = [];
  for (const id of unique) {
    if (isVideoModelId(id)) {
      videoModels.push(id);
    } else if (isImageModelId(id)) {
      imageModels.push(id);
    } else {
      models.push(id);
    }
  }
  return { models, imageModels, videoModels };
}

export const IMAGE_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    provider: 'siliconflow',
    apiType: 'image',
    protocol: 'siliconflow',
    label: '硅基流动图片 (FLUX / Kolors)',
    displayName: '硅基流动图片 API',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: [],
    defaultImageModels: [
      'black-forest-labs/FLUX.1-schnell',
      'black-forest-labs/FLUX.1-dev',
      'Kwai-Kolors/Kolors',
    ],
    defaultVideoModels: [],
    imageEndpointPath: '/images/generations',
    supportedRatios: ['9:16', '16:9', '1:1', '3:4', '4:3'],
    supportedResolutions: ['1024x1024', '720x1280', '1280x720', '768x1024'],
    supportedModes: ['t2i', 'i2i'],
    description: '高性价比 FLUX 与可图生图接口，支持文生图与参考图生图',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    provider: 'image',
    apiType: 'image',
    protocol: 'openai',
    label: 'OpenAI / 兼容生图 (GPT-Image / DALL-E)',
    displayName: 'OpenAI 兼容图片 API',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: [],
    defaultImageModels: ['gpt-image-1', 'dall-e-3'],
    defaultVideoModels: [],
    imageEndpointPath: '/images/generations',
    supportedRatios: ['1:1', '9:16', '16:9'],
    supportedResolutions: ['1024x1024', '1024x1792', '1792x1024'],
    supportedModes: ['t2i', 'i2i'],
    description: '兼容 OpenAI Images 协议的官方接口或 One-API / New-API 中转站',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    provider: 'custom',
    apiType: 'image',
    protocol: 'custom',
    label: '自定义图片供应商 (Seedream / 即梦 / 中转)',
    displayName: '自定义图片生成 API',
    baseUrl: 'https://api.example.com/v1',
    defaultModels: [],
    defaultImageModels: ['seedream-3.0', 'flux-pro'],
    defaultVideoModels: [],
    imageEndpointPath: '/images/generations',
    supportedRatios: ['9:16', '16:9', '1:1', '3:4', '4:3'],
    supportedResolutions: ['1024x1024', '1080x1920', '1920x1080'],
    supportedModes: ['t2i', 'i2i'],
    description: '自定义 Base URL 与图片接口路径，独立管理生图配额与能力参数',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
  },
];

export const VIDEO_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    provider: 'siliconflow',
    apiType: 'video',
    protocol: 'siliconflow',
    label: '硅基流动视频 (Wan2.1 T2V / I2V)',
    displayName: '硅基流动视频 API',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: [],
    defaultImageModels: [],
    defaultVideoModels: [
      'Wan-AI/Wan2.1-I2V-14B-720P',
      'Wan-AI/Wan2.1-T2V-14B',
    ],
    videoSubmitPath: '/video/submit',
    videoStatusPath: '/video/status',
    supportedRatios: ['9:16', '16:9', '1:1'],
    supportedResolutions: ['720p', '1080p'],
    supportedDurations: [5, 10],
    supportedModes: ['t2v', 'i2v'],
    description: '异步提交 + 轮询查询状态，支持文生视频与首帧图生视频',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    provider: 'video',
    apiType: 'video',
    protocol: 'kling',
    label: '可灵 / 即梦 / 兼容异步视频接口',
    displayName: '可灵 / 兼容视频 API',
    baseUrl: 'https://api.example.com/v1',
    defaultModels: [],
    defaultImageModels: [],
    defaultVideoModels: ['kling-v1-6', 'jimeng-video-3.0', 'hailuo-video-01'],
    videoSubmitPath: '/videos/generations',
    videoStatusPath: '/videos/generations/{taskId}',
    supportedRatios: ['9:16', '16:9', '1:1'],
    supportedResolutions: ['720p', '1080p'],
    supportedDurations: [5, 10],
    supportedModes: ['t2v', 'i2v', 'first_last_frame'],
    description: '独立对接可灵、即梦、海螺或中转站异步视频协议，支持首尾帧模式',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    provider: 'custom',
    apiType: 'video',
    protocol: 'custom',
    label: '自定义视频 API (Veo / Sora / 火山方舟)',
    displayName: '自定义视频生成 API',
    baseUrl: 'https://api.example.com/v1',
    defaultModels: [],
    defaultImageModels: [],
    defaultVideoModels: ['seedance-1.0', 'veo-2.0-generate-001'],
    videoSubmitPath: '/video/submit',
    videoStatusPath: '/video/status',
    supportedRatios: ['9:16', '16:9', '1:1'],
    supportedResolutions: ['720p', '1080p'],
    supportedDurations: [5, 8, 10],
    supportedModes: ['t2v', 'i2v', 'first_last_frame'],
    description: '灵活自定义视频创建任务接口路径与状态查询路径',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
  },
];

export const TEXT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    provider: 'deepseek',
    apiType: 'text',
    protocol: 'openai',
    label: 'DeepSeek (深度求索)',
    displayName: 'DeepSeek 文本接口',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
    defaultImageModels: [],
    defaultVideoModels: [],
    description: '主力文本模型：爆款文案拆解、逻辑推理、分镜脚本与高性价比产出',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    provider: 'moonshot',
    apiType: 'text',
    protocol: 'openai',
    label: 'Kimi (Moonshot AI)',
    displayName: 'Kimi 长文本接口',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModels: ['kimi-latest', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultImageModels: [],
    defaultVideoModels: [],
    description: '长文本主力：读取长篇产品卖点文档、直播长脚本润色',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    provider: 'gemini',
    apiType: 'text',
    protocol: 'openai',
    label: 'Google Gemini (OpenAI 兼容)',
    displayName: 'Google Gemini 文本接口',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    defaultImageModels: [],
    defaultVideoModels: [],
    description: '多语言创意、提示词优化与结构化分镜生成',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    provider: 'custom',
    apiType: 'text',
    protocol: 'openai',
    label: '自定义 OpenAI 兼容文本接口',
    displayName: '自定义大语言模型中转',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o-mini'],
    defaultImageModels: [],
    defaultVideoModels: [],
    description: '接入 One-API / New-API 或通义、豆包、智谱等文本大模型',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
  },
];

export const PROVIDER_PRESETS: ProviderPreset[] = [
  ...IMAGE_PROVIDER_PRESETS,
  ...VIDEO_PROVIDER_PRESETS,
  ...TEXT_PROVIDER_PRESETS,
];

export const ASSET_TYPE_META: Record<
  AssetType,
  { label: string; color: string; description: string }
> = {
  copywriting: {
    label: '文案资产',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: '口播稿、种草文案、标题与钩子库',
  },
  script: {
    label: '话术资产',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    description: '直播分段话术、Q&A 应对话术包',
  },
  image: {
    label: '图片资产',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'AI 生成图、产品参考图、封面图',
  },
  video: {
    label: '视频资产',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'AI 生成分镜片段、参考样片',
  },
};

export const LIVE_SCRIPT_SECTION_DEFS = [
  {
    key: 'hook',
    title: '前 3 秒留人钩子',
    badge: '黄金开场 · 强情绪/悬念/利益点',
    placeholder: '点击“AI 生成结构化话术”或直接在此输入开场留人话术...',
  },
  {
    key: 'pain',
    title: '痛点与场景共鸣',
    badge: '痛点切入 · 代入真实消费场景',
    placeholder: '描述目标人群痛点，让观众产生“说的就是我”的共鸣...',
  },
  {
    key: 'selling',
    title: '产品核心卖点与演示话术',
    badge: '价值塑造 · 卖点可视化 + 实测对比',
    placeholder: '结合产品核心卖点与规格，配合直播间实物演示动作讲解...',
  },
  {
    key: 'closing',
    title: '限时逼单与福利促单',
    badge: '转化收口 · 价格对比 + 稀缺机制',
    placeholder: '明确优惠机制、赠品福利、库存倒计时与下单引导口令...',
  },
  {
    key: 'qa',
    title: '高频弹幕 Q&A 应对话术',
    badge: '答疑打消顾虑 · 弹幕互动承接',
    placeholder: '预设常见疑虑（如发货时效、适用人群、售后保障）的口播回答...',
  },
] as const;

export const COPYWRITING_TEMPLATES = [
  {
    id: 'short_video_script',
    label: '短视频带货口播稿',
    description: '黄金开头 + 痛点场景 + 卖点演示 + 评论区/购物车转化引导',
  },
  {
    id: 'seeding_post',
    label: '种草图文文案',
    description: '吸睛标题组 + 真实体验故事 + 清单式卖点 + 互动标签',
  },
  {
    id: 'golden_hooks',
    label: '前 3 秒黄金痛点钩子批量生成',
    description: '一次产出高点击率开场句式，覆盖悬念/反常识/利益点/痛点直击',
  },
  {
    id: 'rewrite_polish',
    label: '多风格改写 / 扩写 / 精简',
    description: '针对已有草稿按不同语气和平台风格进行二次创作优化',
  },
] as const;

export const TARGET_PLATFORMS = [
  '抖音短视频',
  '小红书图文',
  '微信视频号',
  '快手老铁带货',
  'TikTok / 跨境英文',
] as const;

export const TONE_STYLES = [
  '真实闺蜜安利感',
  '犀利痛点直击',
  '专业测评干货',
  '直播间热血激情',
  '高级极简质感',
] as const;

export const ASPECT_RATIOS = [
  { value: '9:16', label: '9:16 竖屏（短视频/小红书）' },
  { value: '16:9', label: '16:9 横屏（横版片/直播背景）' },
  { value: '1:1', label: '1:1 方图（电商主图/封面）' },
  { value: '3:4', label: '3:4 竖版图文（种草封面）' },
  { value: '4:3', label: '4:3 经典横版' },
] as const;

export const IMAGE_RESOLUTIONS = [
  { value: '1024x1024', label: '1024 × 1024（标准高清）' },
  { value: '720x1280', label: '720 × 1280（9:16 竖屏）' },
  { value: '1280x720', label: '1280 × 720（16:9 横屏）' },
  { value: '768x1024', label: '768 × 1024（3:4 竖版）' },
  { value: '1080x1920', label: '1080 × 1920（全高清竖屏）' },
] as const;

export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const;
export const VIDEO_DURATIONS = [5, 8, 10] as const;
export const CAMERA_MOVEMENTS = [
  '智能自动运镜',
  '缓慢推进 (Push-in)',
  '平稳拉远 (Pull-out)',
  '环绕主体 (Orbit)',
  '跟拍移动 (Tracking)',
  '固定机位 (Static)',
] as const;
