/**
 * LLM provider abstraction. Phase 7 ships with three providers:
 *   - 'mock' — deterministic, no external calls. Used in dev/test and as
 *     fallback when no API key is configured.
 *   - 'anthropic' — real Anthropic Claude calls when ANTHROPIC_API_KEY is set.
 *   - 'openai' — real OpenAI Chat Completions when OPENAI_API_KEY is set.
 *
 * Selection precedence (in `createLlmProvider()`):
 *   1. LLM_PROVIDER env explicitly set ('anthropic'|'openai'|'mock').
 *   2. OPENAI_API_KEY present → openai.
 *   3. ANTHROPIC_API_KEY present → anthropic.
 *   4. Fallback → mock.
 */

/**
 * `tool` messages carry the *result* of a tool call back into the conversation
 * for the next LLM turn. The shape mirrors OpenAI's chat.completions tool
 * messages — Anthropic provider transforms internally.
 *
 * The `assistant` variant optionally carries `toolCalls` — when the previous
 * LLM turn produced tool calls, the next request MUST echo those tool_calls
 * attached to that assistant message. Without this, OpenAI rejects the chain
 * with "tool_call_id missing on preceding assistant message" and the
 * conversation loop fails on the second turn.
 */
export type LlmMessage =
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export type LlmProviderName = 'mock' | 'anthropic' | 'openai' | 'rule';

/** A single tool call produced by the model — name + parsed JSON args. */
export interface LlmToolCall {
  /** Provider-supplied id used to thread the result back. */
  id: string;
  name: string;
  args: Record<string, any>;
}

export type LlmResponse = {
  content: string;
  provider: LlmProviderName;
  tokensIn?: number;
  tokensOut?: number;
  /** Structured tool calls the model produced this turn. */
  toolCalls?: LlmToolCall[];
};

/**
 * Tool spec passed to the LLM. JSON-Schema parameters; the provider
 * transforms to its native shape (OpenAI `tools[].function`, Anthropic
 * `tools[].input_schema`).
 */
export interface LlmTool {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, any>; required?: string[] };
}

export type LlmCallOpts = {
  /** Constrain the response to a JSON schema (mock + anthropic + openai honor). */
  jsonSchema?: any;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Temperature 0..1. */
  temperature?: number;
  /** Tools the model may call. */
  tools?: LlmTool[];
};

export interface LlmProvider {
  readonly name: 'mock' | 'anthropic' | 'openai';
  generate(messages: LlmMessage[], opts?: LlmCallOpts): Promise<LlmResponse>;
}

/**
 * Resolve the right provider at startup. Pure factory — no Nest-DI, so any
 * service can call it directly.
 */
export function createLlmProvider(): LlmProvider {
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase().trim();
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockLlmProvider } = require('./mock.provider');

  try {
    if (explicit === 'openai' || (!explicit && hasOpenAI)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenAILlmProvider } = require('./openai.provider');
      return new OpenAILlmProvider();
    }
    if (explicit === 'anthropic' || (!explicit && hasAnthropic)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AnthropicLlmProvider } = require('./anthropic.provider');
      return new AnthropicLlmProvider();
    }
  } catch (err: any) {
    // If the chosen provider can't initialise (e.g. SDK not installed), fall
    // back to mock so the rest of the app stays online. We log loudly so the
    // operator knows real-LLM calls aren't happening.
    // eslint-disable-next-line no-console
    console.warn(`[LLM] Failed to init requested provider: ${err?.message}. Using mock.`);
  }
  return new MockLlmProvider();
}
