import { NextRequest, NextResponse } from 'next/server';
import {
  ensureUserWorkspaces,
  getAuthContext,
  getDecryptedApiConfig,
  getProductById,
} from '@/lib/store/server-store';
import type { Product } from '@/lib/types';

function formatProductContext(product: Product): string {
  return [
    '【已关联产品知识库（请严格围绕以下真实产品卖点与机制创作）】',
    `产品名称：${product.name}`,
    product.selling_points ? `核心卖点：${product.selling_points}` : '',
    product.target_audience ? `目标受众与痛点：${product.target_audience}` : '',
    product.specs_and_price ? `规格与促销机制：${product.specs_and_price}` : '',
    product.banned_words?.length
      ? `产品专属违禁词（生成内容严禁包含）：${product.banned_words.join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDemoFallbackText(
  scene: string,
  product: Product | null,
  userMessage: string
): string {
  const prodName = product?.name || '本款核心主推单品';
  const points =
    product?.selling_points ||
    '轻盈舒适体验、高性价比机制、实测效果明显且售后有保障';
  const price = product?.specs_and_price || '直播间限时惊喜价，加赠超值好礼';

  if (scene === 'live_script') {
    return [
      `[SECTION:hook]`,
      `家人们先别划走！如果你最近也在找${prodName}，今天这波直播间专属机制千万别错过，先花3秒看懂它为什么能解决大家最头疼的问题！`,
      `[SECTION:pain]`,
      `平时买同类产品是不是经常踩坑：要么买回去闲置吃灰，要么用起来黏腻不舒服？针对这些痛点，这款新品在设计上做了全维度升级。`,
      `[SECTION:selling]`,
      `大家把目光聚焦到核心卖点：${points}。我们在直播间直接给大家近距离展示细节和实测对比，看得见的品质才放心！`,
      `[SECTION:closing]`,
      `重点来了！${price}。现在左下角1号链接库存已经不多了，想要的姐妹抓紧拍下锁单，支持7天无理由退换！`,
      `[SECTION:qa]`,
      `Q：什么时候发货？\nA：现在拍下48小时内按订单顺序发出。\nQ：新手/敏感人群能用吗？\nA：可以的，温和友好设计，大家放心入手。`,
    ].join('\n');
  }

  if (scene === 'copywriting') {
    return [
      `---VERSION---`,
      `【版本一 · 痛点直击口播稿】\n姐妹们，千万别再盲目跟风踩坑了！今天实测这款「${prodName}」，真的把核心痛点拿捏住了！\n核心亮点：${points}\n机制也超有诚意：${price}。需要的宝子趁活动还在赶紧冲！`,
      `---VERSION---`,
      `【版本二 · 闺蜜种草图文】\n被闺蜜按头安利的「${prodName}」终于安排上了✨\n✔ 真实体验：${points}\n✔ 入手攻略：${price}\n亲测不踩雷，闭眼入的实用好物清单 +1！`,
    ].join('\n');
  }

  if (scene === 'storyboard') {
    return JSON.stringify(
      [
        {
          shot_number: 1,
          shot_type: '特写推镜 (Close-up Push-in)',
          duration: '3s',
          visual_zh: `清晨自然光下，主播手持「${prodName}」展示材质纹理与冰凉质感，水珠滑落特写`,
          prompt_en: `Cinematic close-up shot of ${prodName}, crisp studio morning sunlight, water droplets, clean minimalist e-commerce aesthetic, 8k photorealistic`,
          negative_prompt: 'blurry, low quality, distorted hands, watermark, text overlay',
          camera_movement: 'Slow Push-in (缓慢推进)',
          lighting_style: '清透自然日光 + 柔和轮廓光',
          aspect_ratio: '9:16',
          suggested_tool: '即梦 / 可灵 / Flux',
        },
        {
          shot_number: 2,
          shot_type: '中景生活场景 (Medium Lifestyle)',
          duration: '4s',
          visual_zh: `模特在户外阳光街景中轻松展示「${prodName}」上身效果与细节设计，氛围感十足`,
          prompt_en: `Medium lifestyle shot of young woman showcasing ${prodName} outdoors in warm sunlight, shallow depth of field, commercial fashion video`,
          negative_prompt: 'oversaturated, stiff pose, artificial lighting, artifacts',
          camera_movement: 'Orbit Left (环绕左移)',
          lighting_style: '高级商业暖调光影',
          aspect_ratio: '9:16',
          suggested_tool: '可灵 / Runway / 即梦',
        },
      ],
      null,
      2
    );
  }

  return [
    `> **当前为演示响应模式**（你尚未在「API 管理中心」启用任何 Kimi / DeepSeek 等真实 API Key，配置后将自动切换为真实大模型实时流式生成）。\n`,
    `我已收到你的请求：**${userMessage.slice(0, 80)}**\n`,
    product
      ? `并已自动读取关联产品 **「${product.name}」** 的卖点档案：\n- **核心卖点**：${product.selling_points}\n- **价格机制**：${product.specs_and_price}\n`
      : '',
    `### 建议创作切入方向：\n1. **前 3 秒强钩子**：直接抛出现实场景痛点，引发用户停留。\n2. **可视化卖点验证**：围绕核心卖点做动作演示或对比测试。\n3. **立即行动指令**：搭配限时机制引导点击购物车或评论区互动。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function createSseStreamFromDemo(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const chunkSize = 8;
      for (let i = 0; i < text.length; i += chunkSize) {
        const piece = text.slice(i, i + chunkSize);
        const payload = JSON.stringify({
          delta: piece,
          isDemoFallback: i === 0,
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        await new Promise((r) => setTimeout(r, 14));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
    }

    const body = await request.json();
    let workspaceId = String(body.workspaceId || '');
    if (!workspaceId) {
      const wsList = await ensureUserWorkspaces(ctx);
      workspaceId = wsList[0]?.id || '';
    }

    const scene = String(body.scene || 'chat');
    const configId = body.configId ? String(body.configId) : null;
    const requestedModel = body.model ? String(body.model) : '';
    const productId = body.productId ? String(body.productId) : null;
    const customSystemPrompt = body.systemPrompt ? String(body.systemPrompt) : '';
    const rawMessages: Array<{ role: string; content: string }> = Array.isArray(body.messages)
      ? body.messages
      : [];

    const product = productId ? await getProductById(ctx, productId) : null;
    const apiConfig = await getDecryptedApiConfig(ctx, configId, workspaceId, 'text');

    // If no active API config exists, stream helpful Demo fallback so user can preview UX end-to-end
    if (!apiConfig) {
      const lastUser = [...rawMessages]
        .reverse()
        .find((m) => m.role === 'user')?.content || '';
      const demoText = buildDemoFallbackText(scene, product, String(lastUser));
      return new Response(createSseStreamFromDemo(demoText), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const systemParts = [
      '你是资深电商内容总监与直播带货金牌策划助手。请输出接地气、结构清晰、具备高转化率的中文内容（除非用户明确要求其他语言）。',
      customSystemPrompt,
      product ? formatProductContext(product) : '',
    ].filter(Boolean);

    const finalMessages = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...rawMessages.filter((m) => m.role !== 'system'),
    ];

    const modelToUse = requestedModel || apiConfig.models[0] || 'deepseek-chat';
    const upstreamUrl = `${apiConfig.base_url}/chat/completions`;

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.api_key}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: finalMessages,
        stream: true,
        temperature: 0.75,
      }),
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      const errText = await upstreamRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: `上游模型 (${apiConfig.display_name}) 返回错误 ${upstreamRes.status}: ${errText.slice(0, 300)}`,
        },
        { status: upstreamRes.status || 502 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const upstreamReader = upstreamRes.body.getReader();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line || !line.startsWith('data:')) continue;
              const dataStr = line.slice(5).trim();
              if (dataStr === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                const choice = parsed.choices?.[0];
                const delta = choice?.delta?.content ?? '';
                const reasoningDelta = choice?.delta?.reasoning_content ?? '';
                if (delta || reasoningDelta) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ delta, reasoningDelta })}\n\n`
                    )
                  );
                }
              } catch {
                // Ignore incomplete SSE chunks
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : '流式转发异常';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI 请求异常' },
      { status: 500 }
    );
  }
}
