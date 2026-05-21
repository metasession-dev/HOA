import { LlmProvider, LlmMessage, LlmResponse, LlmCallOpts } from './provider';

/**
 * Anthropic Claude provider. Dormant until ANTHROPIC_API_KEY is set.
 *
 * We deliberately do NOT depend on @anthropic-ai/sdk at compile time — that
 * would add ~3MB to the bundle even when MockProvider is active. The SDK is
 * loaded lazily on the first call. If the SDK isn't installed, the provider
 * throws a clear "package missing" error rather than a cryptic module error.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private client: any = null;
  private apiKey: string;
  private model: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    this.apiKey = key;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  }

  async generate(messages: LlmMessage[], opts: LlmCallOpts = {}): Promise<LlmResponse> {
    if (!this.client) {
      try {
        // Lazy dynamic import — only fails when this provider is actually used
        // without the SDK installed. The wrapping module then falls back to
        // MockProvider.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Anthropic = require('@anthropic-ai/sdk');
        this.client = new Anthropic({ apiKey: this.apiKey });
      } catch (err: any) {
        throw new Error(
          'Anthropic SDK not installed. Run `npm i @anthropic-ai/sdk` in HOA-API to enable real LLM calls.',
        );
      }
    }

    // System messages must be a top-level field for Anthropic's Messages API;
    // assistant/user alternate in the messages array.
    const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');

    // Translate our LlmMessage variants → Anthropic's message shape.
    // - `tool` results become user-role messages with `tool_result` content blocks.
    // - `assistant` with toolCalls becomes content blocks: [text, tool_use, ...].
    //   Anthropic requires the tool_use blocks on the assistant turn so the
    //   subsequent tool_result blocks can resolve their tool_use_id.
    const convo: any[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        convo.push({
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content },
          ],
        });
      } else if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          const blocks: any[] = [];
          if (m.content && m.content.trim().length > 0) {
            blocks.push({ type: 'text', text: m.content });
          }
          for (const tc of m.toolCalls) {
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} });
          }
          convo.push({ role: 'assistant', content: blocks });
        } else {
          convo.push({ role: 'assistant', content: m.content });
        }
      } else {
        convo.push({ role: m.role, content: m.content });
      }
    }

    const requestBody: any = {
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
      system: systemMsgs || undefined,
      messages: convo,
    };

    if (opts.tools && opts.tools.length > 0) {
      // Anthropic uses `input_schema` rather than `parameters`.
      requestBody.tools = opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await this.client.messages.create(requestBody);

    // Anthropic returns a list of content blocks: text + tool_use. Split.
    const textBlocks: string[] = [];
    const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];
    for (const block of res.content ?? []) {
      if (block.type === 'text') textBlocks.push(block.text);
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as Record<string, any> });
      }
    }
    const content = textBlocks.join('').trim();

    return {
      content,
      provider: 'anthropic',
      tokensIn: res.usage?.input_tokens,
      tokensOut: res.usage?.output_tokens,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
