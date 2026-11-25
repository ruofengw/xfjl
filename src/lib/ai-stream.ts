export interface StreamChatOptions {
  workspaceId: string;
  configId?: string;
  model?: string;
  productId?: string;
  scene?: 'chat' | 'copywriting' | 'live_script' | 'storyboard';
  systemPrompt?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onDelta: (chunk: string, fullText: string) => void;
  onReasoningDelta?: (chunk: string, fullReasoning: string) => void;
  onDemoNotice?: () => void;
}

export async function streamAiChat(options: StreamChatOptions): Promise<{
  content: string;
  reasoning: string;
  isDemoFallback: boolean;
}> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: options.workspaceId,
      configId: options.configId,
      model: options.model,
      productId: options.productId,
      scene: options.scene || 'chat',
      systemPrompt: options.systemPrompt,
      messages: options.messages,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `请求失败 (${res.status})`);
  }

  if (!res.body) {
    throw new Error('服务端未返回流式响应');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let isDemoFallback = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.isDemoFallback && !isDemoFallback) {
          isDemoFallback = true;
          options.onDemoNotice?.();
        }
        if (typeof parsed.reasoningDelta === 'string' && parsed.reasoningDelta) {
          reasoning += parsed.reasoningDelta;
          options.onReasoningDelta?.(parsed.reasoningDelta, reasoning);
        }
        if (typeof parsed.delta === 'string' && parsed.delta) {
          content += parsed.delta;
          options.onDelta(parsed.delta, content);
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
          if (parseErr.message && !parseErr.message.includes('JSON')) {
            throw parseErr;
          }
        }
      }
    }
  }

  return { content, reasoning, isDemoFallback };
}
