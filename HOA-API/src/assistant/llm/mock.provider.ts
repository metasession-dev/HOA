import { LlmProvider, LlmMessage, LlmResponse, LlmCallOpts } from './provider';

/**
 * Deterministic, no-network provider used when no real LLM API key is
 * configured. The Assistant module routes most user requests through a
 * rule-based intent classifier + action dispatcher; the LLM is only consulted
 * for "freeform" replies. This mock produces sensible canned answers so the
 * full chat surface can be exercised in dev and CI without burning credits.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock' as const;

  async generate(messages: LlmMessage[], opts: LlmCallOpts = {}): Promise<LlmResponse> {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const userText = last?.content?.trim() ?? '';

    // JSON-schema mode: emit an empty object that satisfies a minimal schema.
    if (opts.jsonSchema) {
      return {
        content: JSON.stringify({}),
        provider: 'mock',
        tokensIn: this.approxTokens(messages),
        tokensOut: 2,
      };
    }

    // Pattern-based canned responses so the UX feels alive in dev.
    const lc = userText.toLowerCase();
    let content: string;
    if (!userText) {
      content = "Hi — I'm your HOA assistant. Ask me about your balance, recent invoices, gate passes, or to log a maintenance request.";
    } else if (/\b(hello|hi|hey)\b/.test(lc)) {
      content = "Hi! How can I help — check a balance, open a gate pass, file a request, or look up a notice?";
    } else if (/\b(thanks|thank you|cheers)\b/.test(lc)) {
      content = "You're welcome.";
    } else if (/\b(help|what can you do)\b/.test(lc)) {
      content = [
        'I can:',
        '• Show your outstanding balance and recent invoices',
        '• Issue a one-time gate pass',
        '• Submit a maintenance request',
        '• Look up community notices',
        'Ask me anything in plain English.',
      ].join('\n');
    } else {
      content = "I didn't quite catch that. Try \"what's my balance\" or \"open a gate pass for tomorrow\".";
    }

    return {
      content,
      provider: 'mock',
      tokensIn: this.approxTokens(messages),
      tokensOut: Math.ceil(content.length / 4),
    };
  }

  private approxTokens(messages: LlmMessage[]): number {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
  }
}
