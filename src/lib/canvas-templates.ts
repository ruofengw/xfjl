import type { CanvasFlowEdge, CanvasFlowNode } from '@/lib/types';

export interface CanvasTemplate {
  id: string;
  name: string;
  badge: string;
  description: string;
  build: (defaultProductId?: string) => {
    nodes: CanvasFlowNode[];
    edges: CanvasFlowEdge[];
  };
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'short_video_pipeline',
    name: '爆款短视频全链路生产流',
    badge: '最常用',
    description:
      '产品档案注入 → LLM 痛点钩子与口播裂变 → 分镜画面拆解 → 并行生成封面主图与动态视频分镜',
    build: (defaultProductId = '') => ({
      nodes: [
        {
          id: 'node-prod-1',
          type: 'productInput',
          position: { x: 40, y: 180 },
          data: {
            label: '产品档案输入',
            status: 'done',
            productId: defaultProductId,
            customHookNote: '突出夏日通勤凉感体验与直播间闪购99元机制',
          },
        },
        {
          id: 'node-llm-1',
          type: 'llmFission',
          position: { x: 380, y: 160 },
          data: {
            label: 'LLM 文本裂变（钩子+口播）',
            status: 'idle',
            fissionMode: 'short_video',
            instruction: '提炼前 3 秒强反差钩子 + 150 字高节奏短视频带货口播稿',
            outputText: '',
          },
        },
        {
          id: 'node-sb-1',
          type: 'storyboard',
          position: { x: 750, y: 160 },
          data: {
            label: '分镜画面拆解',
            status: 'idle',
            shotCount: 3,
            aspectRatio: '9:16',
            selectedShotIndex: 0,
            shots: [],
          },
        },
        {
          id: 'node-img-1',
          type: 'imageGen',
          position: { x: 1140, y: 40 },
          data: {
            label: 'AI 生图（爆款封面）',
            status: 'idle',
            aspectRatio: '9:16',
            mediaMode: 't2i',
            promptOverride: '',
          },
        },
        {
          id: 'node-vid-1',
          type: 'videoGen',
          position: { x: 1140, y: 340 },
          data: {
            label: 'AI 生视频（首镜分镜）',
            status: 'idle',
            aspectRatio: '9:16',
            mediaMode: 'i2v',
            promptOverride: '',
          },
        },
      ],
      edges: [
        { id: 'e-prod-llm', source: 'node-prod-1', target: 'node-llm-1' },
        { id: 'e-llm-sb', source: 'node-llm-1', target: 'node-sb-1' },
        { id: 'e-sb-img', source: 'node-sb-1', target: 'node-img-1' },
        { id: 'e-sb-vid', source: 'node-sb-1', target: 'node-vid-1' },
        { id: 'e-img-vid', source: 'node-img-1', target: 'node-vid-1' },
      ],
    }),
  },
  {
    id: 'multi_platform_fission',
    name: '多平台种草文案矩阵裂变流',
    badge: '图文+口播',
    description:
      '同一款产品同时扇出小红书种草图文与抖音痛点钩子，并配套生成 3:4 种草封面主图',
    build: (defaultProductId = '') => ({
      nodes: [
        {
          id: 'node-prod-2',
          type: 'productInput',
          position: { x: 40, y: 190 },
          data: {
            label: '产品档案输入',
            status: 'done',
            productId: defaultProductId,
            customHookNote: '强调真实对比测评与高颜值穿搭场景',
          },
        },
        {
          id: 'node-llm-xhs',
          type: 'llmFission',
          position: { x: 420, y: 40 },
          data: {
            label: '小红书种草图文',
            status: 'idle',
            fissionMode: 'seeding_post',
            instruction: '输出 3 个高点击率小红书标题 + 真实闺蜜安利风格种草正文与话题标签',
            outputText: '',
          },
        },
        {
          id: 'node-llm-hooks',
          type: 'llmFission',
          position: { x: 420, y: 330 },
          data: {
            label: '抖音前3秒黄金钩子',
            status: 'idle',
            fissionMode: 'hooks',
            instruction: '批量生成 5 条不同情绪角度的前 3 秒留人黄金开头',
            outputText: '',
          },
        },
        {
          id: 'node-img-cover',
          type: 'imageGen',
          position: { x: 820, y: 120 },
          data: {
            label: 'AI 种草封面主图',
            status: 'idle',
            aspectRatio: '3:4',
            mediaMode: 't2i',
            promptOverride: '',
          },
        },
      ],
      edges: [
        { id: 'e-p2-xhs', source: 'node-prod-2', target: 'node-llm-xhs' },
        { id: 'e-p2-hooks', source: 'node-prod-2', target: 'node-llm-hooks' },
        { id: 'e-xhs-img', source: 'node-llm-xhs', target: 'node-img-cover' },
      ],
    }),
  },
  {
    id: 'live_room_pack',
    name: '直播间话术 + 16:9 背景视觉流',
    badge: '直播必备',
    description:
      '自动根据产品卖点输出直播间逼单全套话术，同步生成 16:9 直播间氛围大屏背景图',
    build: (defaultProductId = '') => ({
      nodes: [
        {
          id: 'node-prod-3',
          type: 'productInput',
          position: { x: 40, y: 170 },
          data: {
            label: '主推品档案',
            status: 'done',
            productId: defaultProductId,
            customHookNote: '限时福利加赠，突出紧迫感与性价比对比',
          },
        },
        {
          id: 'node-llm-live',
          type: 'llmFission',
          position: { x: 420, y: 150 },
          data: {
            label: '直播分段逼单话术',
            status: 'idle',
            fissionMode: 'live_script',
            instruction: '生成留人钩子、卖点演示、限时逼单与弹幕Q&A话术（规避极限词）',
            outputText: '',
          },
        },
        {
          id: 'node-img-bg',
          type: 'imageGen',
          position: { x: 820, y: 150 },
          data: {
            label: '16:9 直播间氛围背景',
            status: 'idle',
            aspectRatio: '16:9',
            mediaMode: 't2i',
            promptOverride: '',
          },
        },
      ],
      edges: [
        { id: 'e-p3-live', source: 'node-prod-3', target: 'node-llm-live' },
        { id: 'e-live-bg', source: 'node-llm-live', target: 'node-img-bg' },
      ],
    }),
  },
];
