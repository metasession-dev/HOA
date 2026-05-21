'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Plus, Archive, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ui/confirm-provider';
import { MarkdownText } from '@/components/ui/markdown-text';
import { cn } from '@/lib/utils';

type ToolTraceEntry = { tool: string; summary: string; ok: boolean };

/**
 * Tool names are snake_case prefixed by domain (e.g. `finance_top_arrears`).
 * Render them as `finance · top arrears` so the chat trace is human-readable.
 */
function humaniseToolName(name: string): string {
  const [domain, ...rest] = name.split('_');
  const tail = rest.join(' ').replace(/_/g, ' ');
  return `${domain} · ${tail}`;
}

/**
 * Renders one chat message. Assistant turns put the model's text answer
 * front-and-centre, with a collapsible "What I looked up" footer for tool
 * traces — keeps the bubble readable while still letting power users audit
 * which tools produced the data.
 */
function ChatBubble({ message: m }: { message: Message }) {
  const trace = m.actions?.toolTrace ?? null;
  const hasTrace = m.role === 'assistant' && trace && trace.length > 0;
  const [traceOpen, setTraceOpen] = useState(false);
  return (
    <div className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
          m.role === 'user'
            ? 'bg-midnight text-white whitespace-pre-wrap'
            : 'bg-stone-surface text-graphite',
        )}
      >
        {/* Answer comes first — the reason the user asked.
            User turns stay literal (whitespace-pre-wrap above).
            Assistant turns go through the markdown renderer so **bold**,
            bullet lists, code spans render properly instead of leaking
            literal asterisks/dashes that look like raw LLM output. */}
        {m.role === 'assistant' ? (
          <MarkdownText text={m.content} className="space-y-2" />
        ) : (
          <div>{m.content}</div>
        )}

        {/* Tool trace + provider metadata sit BELOW the answer in a quiet
            collapsible footer. Trust signal without dominating the bubble. */}
        {hasTrace && (
          <div className="mt-2 border-t border-stone-200/60 pt-1.5">
            <button
              type="button"
              onClick={() => setTraceOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-graphite/70 hover:text-graphite transition-colors"
              aria-expanded={traceOpen}
            >
              <span aria-hidden>{traceOpen ? '▾' : '▸'}</span>
              <span>
                Looked up {trace!.length} source{trace!.length === 1 ? '' : 's'}
              </span>
            </button>
            {traceOpen && (
              <ul className="mt-1.5 space-y-1">
                {trace!.map((t, i) => (
                  <li
                    key={`${m.id}-tool-${i}`}
                    className={cn(
                      'flex items-start gap-1.5 text-[11px]',
                      t.ok ? 'text-graphite/80' : 'text-coral-red/80',
                    )}
                  >
                    <span aria-hidden>{t.ok ? '🔎' : '⚠️'}</span>
                    <span className="flex-1">
                      <code className="font-mono text-[10px] text-charcoal-primary/80">
                        {humaniseToolName(t.tool)}
                      </code>{' '}
                      — {t.summary}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {m.role === 'assistant' && !hasTrace && (m.intentSlug || m.provider) && (
          <p className="mt-1.5 text-[10px] opacity-70">
            {m.intentSlug ? `intent · ${m.intentSlug}` : ''}
            {m.intentSlug && m.provider ? ' · ' : ''}
            {m.provider}
          </p>
        )}
      </div>
    </div>
  );
}

type Message = {
  id: string;
  role: string;
  content: string;
  intentSlug: string | null;
  provider: string | null;
  createdAt: string;
  // `actions` carries `{ action, toolTrace }` from the server — see
  // assistant.service.ts. We coerce here so the chat bubble can render the
  // tool-call lines under the assistant's reply.
  actions?: { action?: any; toolTrace?: ToolTraceEntry[] | null } | null;
};

type Conversation = {
  id: string;
  title: string | null;
  updatedAt: string;
  _count: { messages: number };
};

export default function AssistantPage() {
  const confirm = useConfirm();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const r = await api.get<any>('/assistant/conversations');
      // listConversations returns { items, nextCursor } — pull out the array.
      // Defensive: tolerate either shape in case the service signature shifts.
      const items: Conversation[] = Array.isArray(r?.data)
        ? r.data
        : Array.isArray(r?.data?.items)
        ? r.data.items
        : [];
      setConversations(items);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadConversation = async (id: string) => {
    setActiveId(id);
    try {
      const r = await api.get<any>(`/assistant/conversations/${id}`);
      setMessages(r.data.messages || []);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Load failed', description: err.message });
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (activeId) loadConversation(activeId);
  }, [activeId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    // Optimistic user message
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      intentSlug: null,
      provider: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    try {
      const idemp = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r = await api.post<any>('/assistant/messages', {
        conversationId: activeId,
        text,
      }, idemp);
      const newId = r.data.conversationId;
      if (newId !== activeId) {
        setActiveId(newId);
        loadList();
      }
      // Reload the conversation to pick up the assistant message
      await loadConversation(newId);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
      // Re-focus the input so the user can keep typing without grabbing the
      // mouse. requestAnimationFrame is enough — by then React has flipped
      // `disabled={sending}` back to false so .focus() actually lands.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
  };

  const archive = async (id: string) => {
    const ok = await confirm({
      title: 'Archive this conversation?',
      description: 'It will be hidden from the list but preserved for audit.',
      confirmText: 'Archive',
    });
    if (!ok) return;
    try {
      await api.delete(`/assistant/conversations/${id}`);
      toast({ variant: 'success', title: 'Archived' });
      if (activeId === id) startNew();
      loadList();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Failed', description: err.message });
    }
  };

  // Suggestions cover all four domains the assistant can reach via tools.
  // Click pre-fills the input so the user can hit Send (or tweak first).
  const suggestions = [
    'How many tenants and owners do we have?',                    // management
    'Top 5 units in arrears',                                     // finance
    'Are there any open maintenance requests?',                   // operations
    'What votes are running right now?',                          // governance
    'Total collected this month',                                 // finance
    'Active gate passes',                                         // operations
  ];

  return (
    <div className="w-full">
      <div className="grid gap-4 md:grid-cols-[260px_1fr] h-[calc(100vh-180px)]">
        {/* Sidebar */}
        <Card className="h-full overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-stone-surface">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-ember-orange" />
              <p className="text-sm font-medium text-charcoal-primary">Assistant</p>
            </div>
            <Button size="sm" variant="ghost" onClick={startNew}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <div className="space-y-1.5 p-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : conversations.length === 0 ? (
              <p className="text-caption text-muted-foreground p-3 text-center">No conversations yet.</p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id} className="group">
                    <button onClick={() => setActiveId(c.id)}
                      className={cn(
                        'w-full text-left rounded-lg px-2.5 py-2 text-sm flex items-start gap-2 transition-colors',
                        activeId === c.id ? 'bg-stone-surface text-charcoal-primary' : 'text-graphite hover:bg-stone-surface/50',
                      )}>
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{c.title || 'New chat'}</span>
                        <span className="block text-[11px] text-muted-foreground">{c._count.messages} messages</span>
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); archive(c.id); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-coral-red">
                        <Archive className="h-3 w-3" />
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Chat */}
        <Card className="h-full overflow-hidden flex flex-col">
          <div className="p-3 border-b border-stone-surface flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ember-orange" />
            <p className="text-sm font-medium text-charcoal-primary">
              {activeId
                ? conversations.find((c) => c.id === activeId)?.title || 'Chat'
                : 'New chat'}
            </p>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ember-orange/10 mb-3">
                  <Sparkles className="h-6 w-6 text-ember-orange" />
                </div>
                <p className="text-heading-sm font-display text-charcoal-primary">How can I help?</p>
                <p className="text-caption max-w-sm mt-1">Ask about balances, gate passes, maintenance requests, anomalies, or recent notices.</p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => setInput(s)}
                      className="rounded-pill px-3 py-1.5 text-xs bg-stone-surface text-graphite hover:bg-card hover:shadow-inset-stone transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <ChatBubble key={m.id} message={m} />)
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 text-sm bg-stone-surface text-muted-foreground">…</div>
              </div>
            )}
          </div>
          <form onSubmit={send} className="p-3 border-t border-stone-surface flex gap-2">
            <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" autoFocus disabled={sending} />
            <Button type="submit" disabled={sending || !input.trim()}><Send className="h-4 w-4" /></Button>
          </form>
        </Card>
      </div>
      <p className="mt-3 text-caption text-muted-foreground text-center">
        State-changing actions (issue gate pass, submit request) go through the standard forms — the assistant prefills them.
      </p>
    </div>
  );
}
