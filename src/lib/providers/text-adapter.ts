import type { ProviderConnectionContext, ProviderTestResult } from './image-adapter';

export async function testTextProvider(
  ctx: ProviderConnectionContext,
  model: string
): Promise<ProviderTestResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const endpoint = `${ctx.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 8,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      clearTimeout(timer);
      return {
        ok: false,
        status: upstream.status,
        ttfbMs: Date.now() - startedAt,
        error: `文本 API 返回 ${upstream.status}: ${errText.slice(0, 200) || upstream.statusText}`,
      };
    }

    const reader = upstream.body?.getReader();
    let ttfbMs = Date.now() - startedAt;
    if (reader) {
      try {
        const first = await reader.read();
        if (!first.done) ttfbMs = Date.now() - startedAt;
        await reader.cancel();
      } catch {
        // Ignore stream cancel errors
      }
    }

    clearTimeout(timer);
    return {
      ok: true,
      status: upstream.status,
      ttfbMs,
      message: `文本 API 连通成功！首字延迟 ${ttfbMs} ms`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      ttfbMs: Date.now() - startedAt,
      error: err instanceof Error ? `文本 API 连接失败: ${err.message}` : '连接超时',
    };
  }
}

export async function fetchProviderModelsList(
  ctx: ProviderConnectionContext
): Promise<{ ok: boolean; modelIds?: string[]; error?: string }> {
  const endpoint = `${ctx.baseUrl.replace(/\/+$/, '')}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      clearTimeout(timer);
      return {
        ok: false,
        error: `获取模型列表失败 (${upstream.status}): ${errText.slice(0, 200) || upstream.statusText}`,
      };
    }

    const json = await upstream.json();
    clearTimeout(timer);

    const rawList: string[] = [];
    if (Array.isArray(json?.data)) {
      for (const item of json.data) {
        if (typeof item === 'string') rawList.push(item);
        else if (item?.id) rawList.push(String(item.id));
        else if (item?.name) rawList.push(String(item.name));
      }
    } else if (Array.isArray(json?.models)) {
      for (const item of json.models) {
        if (typeof item === 'string') rawList.push(item);
        else if (item?.id) rawList.push(String(item.id));
        else if (item?.name) rawList.push(String(item.name));
      }
    }

    const cleaned = Array.from(
      new Set(rawList.map((id) => id.replace(/^models\//, '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    if (cleaned.length === 0) {
      return { ok: false, error: '上游接口未返回模型列表，请手动输入模型 ID' };
    }
    return { ok: true, modelIds: cleaned };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? `请求 ${endpoint} 失败: ${err.message}` : '获取模型超时',
    };
  }
}
