import type { PrismaService } from '../../common/prisma.service';

/**
 * Tool — a typed, RBAC-gated function the assistant can invoke to fetch real
 * data from the platform. Each tool declares:
 *   - `name`        : OpenAI-compatible identifier (snake_case, prefixed by domain).
 *   - `domain`      : "management" | "finance" | "operations" | "governance".
 *   - `description` : Plain English — used by the LLM to decide when to call it.
 *   - `parameters`  : JSON Schema (subset OpenAI accepts) describing args.
 *   - `allowedRoles`: Roles permitted to invoke. Anyone outside this set never
 *                     sees the tool in the schema sent to the LLM.
 *   - `execute`     : Async function that runs the query and returns:
 *                     - `data`    — structured payload the LLM consumes
 *                     - `summary` — one-line human-readable trace shown in the
 *                                   chat UI ("Looked up 12 overdue invoices")
 *
 * Keep tools read-only for now. Write actions will need a separate confirmation
 * path with explicit user approval before execution.
 */

export type ToolDomain = 'management' | 'finance' | 'operations' | 'governance';

export interface ToolActor {
  userId: string;
  organizationId: string;
  role: string;
}

export interface ToolContext {
  actor: ToolActor;
  prisma: PrismaService;
}

export interface ToolJsonSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolResult {
  /** Structured payload the LLM consumes — keep small (< 4KB stringified). */
  data: unknown;
  /** One-liner shown to the user in the chat trace. */
  summary: string;
}

export interface Tool {
  name: string;
  domain: ToolDomain;
  description: string;
  parameters: ToolJsonSchema;
  allowedRoles: string[];
  execute(args: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}

/** Roles helper — admin tier sees everything across domains. */
export const ALL_ADMIN_ROLES = [
  'super_admin',
  'hoa_admin',
  'property_manager',
];

export const FINANCE_ROLES = [
  ...ALL_ADMIN_ROLES,
  'finance_officer',
  'external_accountant',
];

export const BOARD_ROLES = [
  ...ALL_ADMIN_ROLES,
  'exco_member',
  'exco_chairperson',
];

export const OPERATIONS_ROLES = [
  ...ALL_ADMIN_ROLES,
  'communications_manager',
  'maintenance_coordinator',
  'gate_security',
];
