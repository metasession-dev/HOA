import { LlmProvider, LlmMessage, LlmResponse, LlmCallOpts } from './provider';

/**
 * OpenAI provider with tool-calling support.
 *
 * - Maps our LlmMessage variants to OpenAI's chat.completions message shape:
 *     • 'system'|'user'|'assistant' pass through verbatim.
 *     • 'tool' becomes `{role:'tool', tool_call_id, content}` — used to feed
 *       a tool's result back into the conversation.
 * - When `opts.tools` is supplied, we pass them through and parse the model's
 *   `tool_calls` back into our `LlmToolCall[]` shape so the assistant loop
 *   can execute them server-side.
 *
 * Model defaults to `gpt-4o-mini` for cost efficiency; override via OPENAI_MODEL.
 */
export class OpenAILlmProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private client: any = null;
  private apiKey: string;
  private model: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.apiKey = key;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async generate(messages: LlmMessage[], opts: LlmCallOpts = {}): Promise<LlmResponse> {
    if (!this.client) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const OpenAI = require('openai');
        this.client = new OpenAI.default
          ? new OpenAI.default({ apiKey: this.apiKey })
          : new OpenAI({ apiKey: this.apiKey });
      } catch {
        throw new Error(
          'OpenAI SDK not installed. Run `npm i openai` in HOA-API to enable real LLM calls.',
        );
      }
    }

    // Translate our LlmMessage variants → OpenAI's shape.
    //
    // CRITICAL: when an assistant message has tool_calls, OpenAI requires
    // them on the message itself so the subsequent `role: tool` messages
    // resolve their tool_call_id. Without this, the second-turn request is
    // rejected with "tool_call_id missing on preceding assistant message"
    // and we never get a real summary back from the model.
    const convo: any[] = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        convo.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      } else if (m.role === 'assistant') {
        const msg: any = { role: 'assistant', content: m.content || null };
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          }));
        }
        convo.push(msg);
      } else if (m.role === 'system' || m.role === 'user') {
        convo.push({ role: m.role, content: m.content });
      }
    }

    const requestBody: any = {
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
      messages: convo,
    };
    if (opts.jsonSchema) {
      requestBody.response_format = { type: 'json_object' as const };
    }
    if (opts.tools && opts.tools.length > 0) {
      requestBody.tools = opts.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      requestBody.tool_choice = 'auto';
    }

    const res = await this.client.chat.completions.create(requestBody);
    const choice = res.choices?.[0]?.message;
    const content = choice?.content?.trim() ?? '';

    // Parse tool_calls back into our shape. OpenAI streams the args as a
    // JSON string — guard against malformed JSON so we don't crash the chat.
    const toolCalls = Array.isArray(choice?.tool_calls)
      ? choice.tool_calls
          .filter((c: any) => c.type === 'function' && c.function?.name)
          .map((c: any) => {
            let args: Record<string, any> = {};
            try {
              args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
              args = { _raw: c.function.arguments };
            }
            return { id: c.id, name: c.function.name, args };
          })
      : undefined;

    return {
      content,
      provider: 'openai' as any,
      tokensIn: res.usage?.prompt_tokens,
      tokensOut: res.usage?.completion_tokens,
      toolCalls,
    };
  }
}
