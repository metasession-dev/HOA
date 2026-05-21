import { Tool, ToolActor, ToolContext, ToolResult } from './types';
import { MANAGEMENT_TOOLS } from './management.tools';
import { FINANCE_TOOLS } from './finance.tools';
import { OPERATIONS_TOOLS } from './operations.tools';
import { GOVERNANCE_TOOLS } from './governance.tools';
import type { PrismaService } from '../../common/prisma.service';

/**
 * Tool registry. Single source of truth — every domain ships its tools here,
 * and the registry decides which subset the actor's role is allowed to see.
 *
 * Tool execution is hardened in three places:
 *   1. RBAC filter — the LLM never sees tools the actor isn't allowed to call.
 *   2. Org scoping — every tool's Prisma query injects the actor's
 *      organizationId; LLM-supplied args can't punch through.
 *   3. Schema validation — we don't run a tool if the args don't match the
 *      declared parameters shape (defence-in-depth against malformed LLM
 *      output that the SDK might somehow have let through).
 */

const ALL_TOOLS: Tool[] = [
  ...MANAGEMENT_TOOLS,
  ...FINANCE_TOOLS,
  ...OPERATIONS_TOOLS,
  ...GOVERNANCE_TOOLS,
];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** Tools the actor is allowed to invoke based on their role. */
export function toolsForActor(actor: ToolActor): Tool[] {
  return ALL_TOOLS.filter((t) => t.allowedRoles.includes(actor.role));
}

/**
 * Render the tool list as OpenAI's `tools` array (also accepted by our
 * Anthropic adapter via a thin transform). Used by the LLM provider.
 */
export function toolsToOpenAISpec(tools: Tool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Resolve + execute a tool by name. Returns a uniform shape:
 *   `{ ok: true, result }` or `{ ok: false, error }`
 *
 * Errors are returned (not thrown) so the assistant loop can feed them back
 * to the LLM as tool-result messages — the model then explains the failure
 * to the user rather than crashing the chat turn.
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  actor: ToolActor,
  prisma: PrismaService,
): Promise<{ ok: true; result: ToolResult } | { ok: false; error: string }> {
  const tool = BY_NAME.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (!tool.allowedRoles.includes(actor.role)) {
    return { ok: false, error: `Role "${actor.role}" cannot invoke ${name}` };
  }
  const ctx: ToolContext = { actor, prisma };
  try {
    const result = await tool.execute(args || {}, ctx);
    return { ok: true, result };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** For health checks and admin observability. */
export function allTools(): Tool[] {
  return ALL_TOOLS;
}
