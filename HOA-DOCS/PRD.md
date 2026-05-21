# HOA.africa — Product Requirements Document
### Enterprise-Grade HOA & Resident Association Management Platform
**Prepared by:** Metasession Product Team  
**Version:** 1.0.0  
**Date:** March 10, 2026  
**Status:** Draft for Review  
**Classification:** Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [Target Market & User Personas](#3-target-market--user-personas)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [AI & Intelligent Automation Layer](#5-ai--intelligent-automation-layer)
6. [Feature Specifications](#6-feature-specifications)
   - 6.1 [Financial Module](#61-financial-module)
   - 6.2 [Communications Module](#62-communications-module)
   - 6.3 [Management Module](#63-management-module)
   - 6.4 [Visitor Management & Gate Pass](#64-visitor-management--gate-pass)
   - 6.5 [AI-Powered Chat & Email Integration](#65-ai-powered-chat--email-integration)
   - 6.6 [PWA Resident Portal](#66-pwa-resident-portal)
   - 6.7 [Dashboards](#67-dashboards)
   - 6.8 [Team Management & RBAC](#68-team-management--rbac)
   - 6.9 [Integrations & Platform](#69-integrations--platform)
7. [Multi-Currency & Multi-Language Support](#7-multi-currency--multi-language-support)
8. [Payment Channels & Methods](#8-payment-channels--methods)
9. [Security Architecture](#9-security-architecture)
10. [Data Models](#10-data-models)
11. [API Architecture](#11-api-architecture)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [AI Feature Roadmap](#13-ai-feature-roadmap)
14. [Compliance & Regulatory](#14-compliance--regulatory)
15. [Implementation Phases](#15-implementation-phases)
16. [Success Metrics & KPIs](#16-success-metrics--kpis)
17. [Appendix](#17-appendix)

---

## 1. Executive Summary

**HOA.africa** is Metasession's enterprise-grade SaaS platform purpose-built for Home Owners Associations (HOAs) and Resident Associations across the African continent and diaspora. It consolidates financial management, resident communications, property governance, visitor management, and intelligent automation into a single unified platform.

The platform is differentiated by:

- **AI-first design** — every workflow is augmented by intelligent automation, natural language interfaces, and predictive insights
- **Africa-native** — built with multi-currency (including local currencies), multi-language (including major African languages), and locally relevant payment methods at its core
- **Omnichannel engagement** — residents and administrators can interact through web, PWA, WhatsApp, Telegram, and email — all with full RBAC enforcement
- **Enterprise-grade security** — military-grade encryption, audit trails, and compliance with POPIA, GDPR, and local regulations
- **Unlimited-tier architecture** — no per-feature caps; all functionality unlocked for all qualifying plans

### Key Value Propositions

| Stakeholder | Value |
|---|---|
| HOA Board / Exco | Real-time financial visibility, automated governance, reduced administrative burden |
| Property Manager | Centralized operations dashboard, automated workflows, compliance tracking |
| Homeowners | Transparent billing, easy payments, self-service portal, gate pass management |
| Renters | Bill payments, maintenance requests, visitor passes via PWA or WhatsApp |
| Security / Gate | Digital gate pass verification, visitor pre-authorization |
| Finance Team | Automated bookkeeping, multi-bank reconciliation, AI-powered payables |

---

## 2. Product Vision & Strategy

### 2.1 Mission Statement

> *To empower every African residential community with the tools, intelligence, and connectivity to self-govern effectively, transparently, and efficiently.*

### 2.2 Strategic Pillars

**1. Intelligence by Default**  
Every module ships with embedded AI capabilities — anomaly detection in financials, NLP-driven communications, predictive maintenance flagging, and conversational interfaces.

**2. Payments Anywhere**  
Support for every payment method used across Africa: mobile money (M-Pesa, MTN MoMo, Airtel Money), bank transfers, card payments, cash logging, and in-app credits — all reconciled automatically.

**3. Community First**  
Resident experience is first-class. The PWA, WhatsApp bot, and Telegram integration ensure that even residents without desktop access can fully participate in community governance.

**4. Compliance & Trust**  
All financial data is immutable, auditable, and compliant. Every action taken by any user is logged with full context, timestamps, and role attribution.

**5. Open Ecosystem**  
A robust API and pre-built integrations with accounting software, banking APIs, and communication platforms ensure HOA.africa fits into any technology ecosystem.

### 2.3 Competitive Positioning

HOA.africa targets the gap between generic property management software (which is not HOA-specific) and international HOA platforms (which lack African payment rails, language support, and local compliance). The platform positions as the definitive enterprise HOA solution built for African residential communities.

---

## 3. Target Market & User Personas

### 3.1 Market Segments

| Segment | Description | Size Indicator |
|---|---|---|
| **Gated Estates** | High-end residential estates with active HOAs, 50–2,000 units | Primary |
| **Apartment Complexes** | Multi-story residential buildings with body corporates | Primary |
| **Mixed-Use Developments** | Residential + commercial with shared services | Secondary |
| **Township HOAs** | Government-backed community associations | Secondary |
| **Diaspora HOAs** | African communities abroad managing property in Africa | Tertiary |

### 3.2 User Personas

---

**Persona 1: Admin / Property Manager (Ade)**
- Role: Full-time property manager for 3 estates
- Needs: Centralized dashboard, automated levy collection, vendor payment workflows, violation tracking
- Pain Points: Manual reconciliation, resident complaints via personal WhatsApp, paper-based violation notices
- Tech Comfort: High

---

**Persona 2: Exco Member / Board Director (Ngozi)**
- Role: HOA Chairperson, volunteer role alongside full-time job
- Needs: Financial reports, meeting agendas, voting, budget approvals
- Pain Points: Can't access data when traveling, paper-based board packets, slow decisions
- Tech Comfort: Medium

---

**Persona 3: Homeowner (Kwame)**
- Role: Property owner, pays levies, uses common facilities
- Needs: View statements, pay levies, submit requests, manage gate passes for family
- Pain Points: Unclear billing, no visibility into HOA spend, difficulty reaching management
- Tech Comfort: Medium–High

---

**Persona 4: Tenant / Renter (Amina)**
- Role: Long-term tenant in HOA property
- Needs: Pay utilities, request maintenance, create visitor passes
- Pain Points: Excluded from HOA communications, no self-service tools
- Tech Comfort: High (mobile-first)

---

**Persona 5: Gate / Security Officer (Seun)**
- Role: Security at estate entrance
- Needs: Verify gate passes, log visitors, manage access
- Pain Points: Paper logs, verbal approvals, fake pass attempts
- Tech Comfort: Basic–Medium

---

**Persona 6: Finance Officer (Fatima)**
- Role: HOA bookkeeper or treasurer
- Needs: Levy management, vendor payments, bank reconciliation, audit reports
- Pain Points: Excel-based accounting, manual data entry, no approval workflows
- Tech Comfort: Medium–High

---

## 4. System Architecture Overview

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOA.africa Platform                          │
├────────────────┬────────────────┬──────────────────┬────────────────┤
│   Web App      │   PWA          │  AI Chat Bots    │  Admin Panel   │
│  (React/Next)  │  (Offline+)    │  (WA / TG / SMS) │  (Internal)    │
├────────────────┴────────────────┴──────────────────┴────────────────┤
│                        API Gateway (REST + GraphQL)                  │
├──────────┬──────────┬──────────┬──────────┬───────────┬─────────────┤
│Financial │Comms     │Management│Visitor   │AI Engine  │Auth & RBAC  │
│Module    │Module    │Module    │Module    │           │             │
├──────────┴──────────┴──────────┴──────────┴───────────┴─────────────┤
│              Core Services (Events, Notifications, Audit)            │
├──────────┬──────────┬──────────┬──────────┬───────────┬─────────────┤
│PostgreSQL│Redis     │Cloudflare│Typesense │AI/ML      │Queue        │
│(Railway) │(Railway) │R2 Storage│(Railway) │(Railway)  │(Bull/Redis) │
└──────────┴──────────┴──────────┴──────────┴───────────┴─────────────┘
                  ── All backend services hosted on Railway ──
```

### 4.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend (Web)** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui | SSR performance, type safety |
| **PWA** | Next.js PWA, Workbox, IndexedDB | Offline capability, mobile-first |
| **Mobile** | React Native (future) | Cross-platform from shared codebase |
| **API** | Node.js / NestJS, REST + GraphQL | Scalable, modular — deployed as Railway services |
| **AI Engine** | Python FastAPI, LangChain, OpenAI/Anthropic APIs — deployed as Railway service | Flexible LLM orchestration |
| **Database** | Railway PostgreSQL (primary), Railway Redis (cache/sessions) | Managed Railway-native services, ACID compliance |
| **Search** | Typesense — deployed as Railway service | Self-hostable, fast full-text search on Railway |
| **File Storage** | Cloudflare R2 | S3-compatible object storage, zero egress fees |
| **Queue** | Bull (backed by Railway Redis) | Async jobs and real-time events on existing Redis |
| **Authentication** | Supabase Auth / Auth0 | MFA, social login, SSO |
| **Payments** | Paystack, Flutterwave, Stripe, local rails | African payment coverage |
| **Email** | Resend | Transactional and bulk email — developer-friendly, React Email templates |
| **SMS** | Africa's Talking, Twilio | Pan-African SMS |
| **WhatsApp** | Twilio WhatsApp API / Meta Cloud API | WhatsApp Business integration |
| **Telegram** | Telegram Bot API | Bot integration |
| **OCR** | AWS Textract / Google Vision AI | Invoice and document scanning |
| **CDN** | Cloudflare | Global edge caching, R2 storage CDN |
| **Hosting** | Railway (all backend services + databases) + Cloudflare (CDN/DNS) | Simplified ops, Railway-native deployments |

### 4.3 Multi-Tenancy Model

HOA.africa uses a **schema-per-tenant** database architecture:

- Each HOA organization gets an isolated PostgreSQL schema
- Shared infrastructure with logical data isolation
- Data sovereignty options for enterprise clients (dedicated instances)
- Cross-tenant analytics at the platform level (anonymized)

### 4.4 Railway Infrastructure Design

All compute, databases, and background workers run exclusively on Railway. The following table maps every backend concern to its Railway service definition:

| Railway Service | Type | Technology | Purpose |
|---|---|---|---|
| `api-gateway` | Web Service | NestJS (Node.js) | Primary REST + GraphQL API |
| `ai-engine` | Web Service | Python FastAPI | LLM orchestration, OCR, NLP, anomaly detection |
| `worker-jobs` | Worker Service | Node.js + Bull | Async jobs: report generation, document processing, scheduled tasks |
| `worker-payments` | Worker Service | Node.js + Bull | Payment webhook processing, reconciliation triggers |
| `worker-comms` | Worker Service | Node.js + Bull | Email/SMS/WhatsApp dispatch queue |
| `web-frontend` | Web Service | Next.js | Web application + PWA |
| `postgresql-primary` | Railway PostgreSQL | PostgreSQL 16 | Primary database (schema-per-tenant) |
| `redis-primary` | Railway Redis | Redis 7 | Cache, session store, Bull queue backend |
| `typesense` | Web Service (private) | Typesense | Full-text search (self-hosted on Railway private network) |

**Railway Networking:**
- All services communicate over Railway's **private network** (internal DNS: `api-gateway.railway.internal`, etc.)
- Only `api-gateway` and `web-frontend` expose public Railway-generated domains
- Production domains proxied through Cloudflare (`app.hoa.africa`, `api.hoa.africa`)
- `typesense` is private-only; never exposed to the public internet

**Railway Environment Configuration:**
```
Environments:
  production   → hoa-africa-prod   (Railway project)
  staging      → hoa-africa-staging (Railway project)
  preview      → Auto-created per PR via Railway GitHub integration

Secrets Management:
  All environment variables stored as Railway service variables
  Sensitive keys (payment API keys, LLM keys) set at project level
  No secrets committed to repository

Scaling:
  Horizontal scaling via Railway's replicas setting (api-gateway, ai-engine)
  Worker services scale by increasing replica count during peak levy periods
  PostgreSQL: Railway managed with automated backups (daily snapshots + WAL)
  Redis: Railway managed with persistence enabled (AOF)
```

**Cloudflare R2 for Object Storage:**
- All document uploads, vendor invoices, profile photos, and generated PDFs stored in Cloudflare R2
- R2 is S3-compatible; accessed via AWS SDK with R2 endpoint configuration
- Zero egress fees (critical for high-volume PDF report delivery to residents)
- Buckets: `hoa-documents`, `hoa-media`, `hoa-reports`, `hoa-backups`
- Files served via Cloudflare CDN with signed URL access control

**Resend for Email:**
- All transactional email (invoices, receipts, OTPs, notifications) sent via Resend API
- Templates built with React Email for consistency with the web component library
- Bulk communications (broadcasts) dispatched through Resend's batch send API via the `worker-comms` Railway service
- Resend webhooks (delivery, open, bounce events) received by `api-gateway` and written to audit log
- Custom sending domain: `mail.hoa.africa` (DNS managed via Cloudflare)

### 4.5 Deployment Architecture

```
Infrastructure Platform: Railway
  All backend services, databases, and async workers run as Railway services
  within a single Railway project per environment (production, staging, dev)

Railway Services:
  api-gateway          → NestJS API (REST + GraphQL)
  ai-engine            → Python FastAPI (LLM orchestration, OCR, NLP)
  worker-jobs          → Bull worker (async jobs, email, notifications)
  worker-payments      → Bull worker (payment webhook processing)
  web-frontend         → Next.js (web app + PWA)

Railway Managed Databases:
  postgresql-primary   → Railway PostgreSQL (schema-per-tenant)
  redis-primary        → Railway Redis (cache, sessions, Bull queues)

Railway Add-on Services:
  typesense            → Typesense (Railway-deployed, full-text search)

External Services (non-Railway):
  Cloudflare R2        → Object / document storage (S3-compatible)
  Cloudflare CDN       → DNS, edge caching, DDoS protection
  Resend               → Transactional + bulk email
  Africa's Talking     → SMS + USSD + voice
  Meta Cloud API       → WhatsApp Business
  Paystack / Flutterwave → Payment processing

Environments:
  production           → Railway project: hoa-africa-prod
  staging              → Railway project: hoa-africa-staging
  development          → Local Docker Compose (mirrors Railway services)

Multi-Region Strategy:
  Railway region: us-west2 (primary — best latency to Africa via CDN)
  Cloudflare Anycast   → Routes residents to nearest edge (Nairobi, 
                         Lagos, Johannesburg, Cairo PoPs)
  Database replication: Railway PostgreSQL with read replicas
                        (configured via Railway private networking)
  Enterprise option:   Dedicated Railway project per large HOA org
                        for data sovereignty requirements
```

---

## 5. AI & Intelligent Automation Layer

### 5.1 AI Engine Architecture

The HOA.africa AI layer is a dedicated microservice that provides intelligent capabilities across all modules.

```
AI Engine Components:
├── NLP Chat Interface (LLM-powered, multi-language)
├── Financial Intelligence
│   ├── Anomaly Detection (levy underpayments, unusual expenses)
│   ├── Budget Forecasting (trend analysis)
│   └── Invoice OCR + Classification
├── Operations Intelligence
│   ├── Violation Pattern Detection
│   ├── Maintenance Request Categorization
│   └── Visitor Pattern Analysis (security alerts)
├── Communication Intelligence
│   ├── Smart Reply Suggestions
│   ├── Sentiment Analysis on resident feedback
│   └── Automated escalation routing
└── Reporting Intelligence
    ├── Natural language report generation
    ├── Executive summary auto-drafts
    └── Predictive cash flow reports
```

### 5.2 AI-Powered Conversational Interface

**Channels:** WhatsApp, Telegram, Email, Web Chat  
**Authentication:** RBAC-enforced per channel (users authenticate via OTP or PIN before executing actions)

**Capabilities by Role:**

| Action | Resident | Exco | Admin | Finance |
|---|---|---|---|---|
| Check outstanding balance | ✅ | ✅ | ✅ | ✅ |
| Pay levy via chat | ✅ | ✅ | ✅ | ✅ |
| Create gate pass | ✅ | ✅ | ✅ | — |
| Submit maintenance request | ✅ | ✅ | ✅ | — |
| Approve vendor invoice | — | ✅ | ✅ | ✅ |
| Generate financial report | — | ✅ | ✅ | ✅ |
| Log violation | — | ✅ | ✅ | — |
| Broadcast communication | — | ✅ | ✅ | — |
| View budget vs actuals | — | ✅ | ✅ | ✅ |

**Chat Session Flow:**

```
1. User sends message to HOA WhatsApp number
2. System identifies HOA from number mapping
3. AI bot greets user and requests identification (phone/unit number)
4. OTP or saved session token authenticates user
5. Role is resolved from RBAC engine
6. Intent is classified by NLP engine
7. Action is executed (read/write) with full audit logging
8. Result returned to user in their preferred language
9. Escalation triggers human handoff if confidence < threshold
```

### 5.3 AI Anomaly Detection

**Financial Anomalies:**
- Sudden spike in levy arrears across multiple units (signals economic distress or billing error)
- Vendor invoice amounts deviating > 20% from historical average
- Duplicate payment detection
- Cash flow shortfall prediction (30/60/90-day horizon)

**Operations Anomalies:**
- Recurring violations by same unit (pattern flagging)
- Gate access at unusual hours (security alert)
- Maintenance request clusters indicating systemic infrastructure issues

**Communication Anomalies:**
- Mass unsubscribe events (communication quality signal)
- Negative sentiment spikes in resident feedback

### 5.4 AI Document Processing

- **OCR Scanning:** Vendor invoices, receipts, and utility bills are automatically scanned and data extracted
- **Classification:** Documents auto-categorized into vendor, type, amount, VAT, and GL account
- **Validation:** Cross-reference against approved vendor list and budget lines before routing for approval

---

## 6. Feature Specifications

---

### 6.1 Financial Module

#### 6.1.1 Invoicing & Payments

**Description:** Comprehensive levy management system supporting recurring and one-time invoicing with automated payment collection.

**Core Features:**

| Feature | Specification |
|---|---|
| Recurring invoices | Monthly, quarterly, annual — auto-generated per schedule |
| One-time invoices | Ad hoc charges (fines, special levies, facility hire) |
| Bulk invoicing | Generate invoices for all units in one action |
| Pro-rata calculations | Auto-calculated for mid-period move-ins/move-outs |
| Late payment fees | Configurable grace period + interest rate |
| Invoice templates | Branded PDF templates per HOA |
| Invoice delivery | Email, WhatsApp, SMS, portal notification |
| Payment links | Unique per-invoice payment URLs |
| Partial payments | Supported with running balance tracking |
| Payment receipts | Auto-generated and delivered on payment |
| Overdue reminders | Configurable automated reminder sequences |
| Payment plans | Installment agreements for debtors |
| Credit notes | Reverse and adjust invoices with full audit trail |

**AI Enhancement:**
- Predictive levy compliance: flags units likely to default based on payment history
- Smart reminder timing: learns optimal reminder timing per resident
- Dispute detection: flags invoice disputes based on resident messaging patterns

**Acceptance Criteria:**
- Invoice generation < 2 seconds for up to 5,000 units
- Payment status updates in real-time (< 5 seconds from payment processor webhook)
- All invoices immutable once sent (amendments create credit note + new invoice)

---

#### 6.1.2 Accounting (General Ledger)

**Description:** Full double-entry bookkeeping with a chart of accounts tailored for HOA financial management.

**Core Features:**

| Feature | Specification |
|---|---|
| Chart of accounts | Customizable, pre-seeded with HOA-standard accounts |
| Journal entries | Manual and automatic, with full audit trail |
| Trial balance | Real-time |
| Income statement | Configurable periods |
| Balance sheet | Assets, liabilities, equity |
| Cash flow statement | Direct and indirect methods |
| Fund accounting | Reserve fund, operating fund, special levies |
| Multi-fund tracking | Separate P&L per fund |
| GL codes | Configurable, with import/export |
| Year-end close | Automated period closing with reversals |
| Audit trail | Every entry traceable to user, timestamp, source document |
| Accountant access | Read-only external accountant role |

**HOA-Specific GL Accounts (Pre-seeded):**

```
INCOME
  4000 - Levy Income
  4010 - Special Levy Income
  4020 - Interest on Late Payments
  4030 - Facility Hire Income
  4040 - Parking Fee Income

EXPENSES
  5000 - Security Services
  5010 - Landscaping & Gardening
  5020 - Maintenance & Repairs
  5030 - Utilities - Electricity
  5040 - Utilities - Water
  5050 - Insurance
  5060 - Management Fees
  5070 - Legal Fees
  5080 - Audit Fees
  5090 - Bank Charges

RESERVES
  6000 - Reserve Fund Contribution
  6010 - Sinking Fund

ASSETS
  1000 - Bank - Operating Account
  1010 - Bank - Reserve Account
  1020 - Accounts Receivable - Levies
  1030 - Prepaid Expenses

LIABILITIES
  2000 - Accounts Payable
  2010 - Deferred Income
  2020 - VAT Payable
```

---

#### 6.1.3 Budgets & Reports

**Description:** Professional budget management with 50+ pre-built report templates and custom report builder.

**Budget Features:**
- Annual budget creation with line-item detail
- Budget templates from prior year (with % increase option)
- Board approval workflow with digital sign-off
- Monthly budget vs. actuals comparison
- Variance analysis with drill-down
- Budget amendments with approval history
- Multi-year budget planning (5-year view)
- Reserve fund adequacy study integration

**Report Library (50+ Reports):**

| Category | Reports |
|---|---|
| **Financial Statements** | Income Statement, Balance Sheet, Cash Flow, Trial Balance |
| **Levy Reports** | Arrears Report, Collection Rate, Levy Roll, Payment History |
| **Budget Reports** | Budget vs Actuals, Variance Analysis, Forecast, YTD Summary |
| **Bank Reports** | Bank Reconciliation, Bank Transaction Summary, Reconciliation History |
| **Vendor Reports** | Vendor Payments, Outstanding Payables, Vendor Spend Analysis |
| **Reserve Reports** | Reserve Fund Balance, Reserve Adequacy, Sinking Fund Projection |
| **Audit Reports** | Journal Entry Audit, Modified Records Report, User Activity |
| **Tax Reports** | VAT Summary, VAT Detailed, Withholding Tax |
| **Board Packets** | Monthly Board Pack, Annual Report, AGM Financial Pack |
| **Custom Reports** | Drag-and-drop report builder |

**Report Packets:**
- Bundle multiple reports into a single PDF for board meetings
- Scheduled auto-generation and email distribution
- Custom branding and cover pages
- Digital signature collection on report review

**AI Enhancement:**
- Natural language report generation: *"Show me variance report for Q3 vs budget"*
- Executive summary auto-drafts for board packs
- Predictive cash flow narratives

---

#### 6.1.4 Bank Integrations

**Description:** Direct bank feed connections for automatic transaction import and intelligent reconciliation.

**Supported Integrations:**

| Region | Banks |
|---|---|
| **South Africa** | FNB, Standard Bank, ABSA, Nedbank, Capitec Business |
| **Nigeria** | GTBank, Access Bank, Zenith Bank, First Bank, UBA |
| **Kenya** | KCB, Equity Bank, Co-operative Bank |
| **Ghana** | GCB, Ecobank, Absa Ghana |
| **Pan-African** | Stanbic, Citibank, Standard Chartered |
| **Global** | Open Banking (via Plaid, Mono, Okra) |

**Features:**
- Automatic daily transaction import
- Real-time sync option (where bank API supports)
- AI-powered transaction categorization (matches GL codes)
- Rule-based auto-categorization (e.g., "Levy" → 4000)
- Unmatched transaction queue for manual review
- Multi-account support per HOA
- Historical import (up to 24 months on setup)
- Reconciliation matching with confidence scores
- One-click reconciliation for matched items
- Reconciliation lock (prevent editing reconciled periods)

---

#### 6.1.5 Payables & Vendors

**Description:** End-to-end vendor payment management with multi-tier approval workflows and AI-powered invoice processing.

**Vendor Management:**
- Vendor onboarding with document collection (registration docs, tax cert, banking details)
- Vendor document storage (certificates, contracts, insurance)
- Vendor performance scoring
- Preferred vendor list management
- Vendor portal (self-service document submission)
- Blacklist and alert functionality

**Invoice Processing:**
- Email-to-invoice capture (vendors email invoice → auto-created in system)
- OCR scanning of PDF/image invoices
- AI extraction: vendor, date, amount, line items, VAT
- Duplicate invoice detection
- PO matching (3-way match: PO → receipt → invoice)
- GL coding suggestions from AI

**Approval Workflows:**
- Configurable multi-tier approval (e.g., <R5,000 = manager, R5k–R50k = exco, >R50k = full board)
- Parallel or sequential approval chains
- Mobile approval (approve via WhatsApp or app)
- Delegation of authority during absences
- Escalation on non-response (configurable timeout)
- Audit trail of every approval decision with timestamps

**Payments:**
- Batch payment processing
- Scheduled payments
- EFT/bank transfer initiation (where banking API supports)
- Remittance advice generation
- Vendor payment history
- Payment reconciliation

---

#### 6.1.6 Bookkeeping Services

**Description:** Metasession-backed managed bookkeeping offering where HOA.africa staff maintain the books on behalf of the HOA.

**Service Tiers:**

| Tier | Description |
|---|---|
| **Self-Serve** | HOA manages own books using the platform |
| **Assisted** | Monthly review by HOA.africa bookkeeper |
| **Full-Service** | Complete bookkeeping, payables, reconciliation, reports |
| **Audit-Ready** | Full-service + annual audit preparation pack |

**Features:**
- Dedicated bookkeeper assignment
- Monthly close checklist
- Exception review and query management
- Year-end preparation
- CIPC / regulatory filing support
- Handover reporting if client transitions to self-serve

---

### 6.2 Communications Module

#### 6.2.1 Mass Communication

**Description:** Multi-channel broadcast communications to all or segmented groups of residents, owners, and stakeholders.

**Channels:**
- Email (HTML templates, branded — delivered via Resend)
- SMS (bulk, with delivery reports)
- Push notifications (PWA)
- WhatsApp broadcasts
- Voice calls (auto-dialed recorded messages)
- In-app notification center

**Targeting & Segmentation:**
- All units
- Specific blocks / phases / sections
- Owners only vs. tenants only
- Debtors only
- Tag-based segments (custom tags on units/people)
- Cohort-based (e.g., "moved in after Jan 2025")

**Message Features:**
- Rich HTML email editor (drag-and-drop)
- SMS character counter with multi-part splitting
- Merge fields (resident name, unit number, balance, etc.)
- Scheduled sends
- Recurring communications (e.g., monthly newsletter)
- A/B testing for subject lines
- Delivery, open, and click tracking (email)
- SMS delivery reports
- Opt-out / unsubscribe management (POPIA/GDPR compliant)
- Communication history per unit/person

**Templates:**
- Pre-built: levy reminder, AGM notice, rule changes, maintenance notice, emergency alert
- Custom template builder
- Multi-language templates

**AI Enhancement:**
- Smart send timing (per segment engagement data)
- Subject line optimization suggestions
- Sentiment tracking on replies
- Auto-draft from bullet points

---

### 6.3 Management Module

#### 6.3.1 Violations

**Description:** Complete CC&R (community rules) enforcement platform with photographic evidence, notice workflow, and appeals management.

**Features:**
- Violation category library (customizable per HOA)
- Mobile-friendly violation capture (photo + notes)
- Violation notice templates (email + PDF)
- Fine schedule configuration
- Automated fine invoicing
- Violation status tracking (open, noticed, acknowledged, resolved, closed)
- Appeals workflow with board review
- Repeat offender flagging
- Violation history per unit
- Bulk violation entry
- Violation analytics dashboard
- Integration with Invoicing (auto-generate fine invoices)

**AI Enhancement:**
- Pattern detection: units with recurring violation types
- Suggested violation category from description text
- Recommended fine amounts based on history

---

#### 6.3.2 Request Forms

**Description:** Configurable intake forms for resident requests, eliminating email and phone-based request management.

**Features:**
- Drag-and-drop form builder
- Unlimited form types (maintenance, access, parking, move-in/out, pets, renovation, etc.)
- Conditional logic (show/hide fields based on answers)
- File/photo attachments
- Request categorization and routing rules
- SLA tracking per category
- Status updates to resident (auto-notifications)
- Internal notes and collaboration
- Request escalation
- Resolution confirmation with resident sign-off
- Request history per unit
- Bulk request export

**Request Workflow:**
```
Resident submits → Auto-acknowledge → Auto-route to category owner 
→ Assignee reviews → Action taken → Status updated → 
Resident notified → Resolution confirmed → Closed
```

---

#### 6.3.3 Document Storage

**Description:** Secure, organized document repository for HOA-wide and unit-level documents.

**Features:**
- Folder hierarchy (board creates structure)
- File upload: PDF, Word, Excel, images, videos
- Version control (documents can be replaced with new versions; old versions retained)
- Access control per folder (public to all residents, restricted to board, confidential)
- Document expiry alerts (contracts, insurance certificates)
- Full-text search across documents
- Bulk upload
- Watermarking option
- Audit log (who viewed, downloaded, modified)
- Integration with vendor records, violation notices, meeting minutes
- Resident document store (personal documents per unit: lease, ownership title, etc.)

---

#### 6.3.4 Voting & Surveys

**Description:** Digital ballot and survey system for HOA governance decisions.

**Voting Features:**
- Motion creation and seconding
- Voting eligibility rules (paid-up owners only, etc.)
- Anonymous or identified voting
- Quorum tracking
- Proxy voting support
- Vote casting via web, PWA, or WhatsApp
- Real-time result tracking (hidden until close or live, per config)
- Results export (PDF with signatures)
- AGM vote management
- Special resolution workflows (75% threshold, 14-day notice, etc.)
- Vote audit trail

**Survey Features:**
- Multiple question types: multiple choice, rating, text, matrix
- Conditional branching
- Scheduled open/close dates
- Anonymous option
- Result visualization (charts, word clouds)
- Export to CSV/PDF
- Benchmarking against prior surveys

---

#### 6.3.5 Owner Portal

**Description:** Self-service resident hub accessible via web browser or PWA.

**Portal Sections:**

| Section | Content |
|---|---|
| **Dashboard** | Current balance, upcoming payments, pending requests, notices |
| **Financials** | All invoices, payment history, statements, receipts |
| **Communications** | All HOA messages received, notice archive |
| **Requests** | All submitted requests with status |
| **Documents** | Access to community and personal documents |
| **Gate Passes** | Create and manage visitor passes |
| **Violations** | View violations on unit, submit appeals |
| **Voting** | Active votes and surveys, past results |
| **Profile** | Contact details, payment methods, notification preferences |

---

#### 6.3.6 Resale Documents

**Description:** Streamlined resale packet management for property transfers, eliminating paperwork delays.

**Features:**
- Resale certificate generation (certified financials, levy status, outstanding amounts)
- Disclosure documents checklist
- Status verification letters (good standing / arrears)
- Transfer levy calculation
- Attorney portal (external access for transfer attorneys)
- Digital delivery with timestamped confirmation
- Fee management for document preparation
- Rush processing flag with SLA tracking
- Automated HOA rule pack for new owners
- Welcome onboarding trigger on transfer completion

---

### 6.4 Visitor Management & Gate Pass

**Description:** End-to-end visitor and access management system replacing paper-based gate registers.

#### 6.4.1 Gate Pass Creation

**Resident Actions:**
- Create single-visit passes (one-time access code)
- Create recurring passes (daily/weekly for domestic workers, regular visitors)
- Create bulk passes (events, parties)
- Set pass validity window (date range + time window)
- Specify vehicle details (optional)
- Share pass via WhatsApp/SMS directly to visitor

**Pass Types:**

| Type | Description | Validity |
|---|---|---|
| **Single Visit** | One-time access code | Single use |
| **Recurring** | Regular visitor (cleaner, caregiver) | Repeating schedule |
| **Event** | Multiple visitors for event | Specified date/time window |
| **Contractor** | For approved maintenance contractors | Duration of project |
| **Delivery** | Short-duration access | Time-limited (e.g., 30 min) |
| **Emergency** | Bypass pre-authorization | Requires admin override |

#### 6.4.2 Gate/Security Interface

- Dedicated gate tablet/desktop interface (simplified UI)
- QR code scanner for digital passes
- Manual lookup by resident unit or visitor name
- Auto-display of pass details and photo ID on scan
- Log entry/exit timestamps
- Flag unregistered or expired passes
- Override log (when gate security allows access manually, reason required)
- Visitor register (real-time, searchable)
- Shift handover log
- Incident reporting (linked to violations module)

#### 6.4.3 Visitor Analytics

- Visitor traffic heatmaps by hour/day
- Most frequent visitors per unit
- Anomaly detection (unusual access patterns)
- Contractor time-on-site tracking
- Security report generation

#### 6.4.4 Integration

- CCTV system integration hooks (camera timestamp matching)
- Access control hardware integration (boom gates, turnstiles) via API
- ANPR (Automatic Number Plate Recognition) integration support

---

### 6.5 AI-Powered Chat & Email Integration

#### 6.5.1 WhatsApp Integration

**Setup:**
- Official WhatsApp Business API (Meta Cloud API or Twilio)
- HOA-branded WhatsApp number per estate
- Verified business profile

**Capabilities:**
- Full conversational AI assistant in WhatsApp
- Intent recognition in English + major African languages
- RBAC-enforced actions (resident vs. admin permissions)
- Session authentication via OTP or 4-digit PIN
- Rich messages (buttons, lists, images, PDFs)
- Payment initiation links within conversation
- Gate pass creation and sharing within chat
- Support request submission with photo attachment
- Invoice viewing and payment status
- Emergency alerts pushed from admin

**Security:**
- Session expiry (configurable, default 30 min inactivity)
- Sensitive actions require re-authentication
- All conversations logged to audit trail
- GDPR/POPIA consent captured on first interaction
- Data minimization: WhatsApp messages not stored beyond audit need

#### 6.5.2 Telegram Integration

- Telegram bot per HOA (optional channel)
- Same AI capabilities as WhatsApp
- Telegram-native rich interface (inline keyboards, inline queries)
- Support for Telegram groups for community announcements (admin broadcast)
- Bot authentication via Telegram account linking

#### 6.5.3 Email Intelligence

- Dedicated HOA email inbox monitored by AI
- Intent classification: invoice query, maintenance request, complaint, compliment
- Auto-routing to correct team member or workflow
- Auto-reply drafting with AI (human review before send, or fully automated)
- Invoice attachment auto-parsing (residents emailing utility bills trigger capture workflow)
- Thread management (keeps conversation context)
- Escalation rules (no reply within SLA → escalate)
- Two-way sync with communications module

#### 6.5.4 AI Chat Engine (Technical)

```
Components:
  Intent Classifier (fine-tuned LLM):
    - Read balance
    - Make payment
    - Create gate pass
    - Submit request
    - Report violation
    - Get document
    - Book facility
    - Contact admin
    - Emergency

  Entity Extractor:
    - Unit numbers, amounts, dates, visitor names, 
      plate numbers, request types

  Context Manager:
    - Multi-turn conversation state
    - User profile + role resolution
    - HOA-specific configuration loading

  Action Executor:
    - Maps intent + entities to API calls
    - RBAC enforcement before execution
    - Result formatting per channel

  Fallback Handler:
    - Low-confidence → clarifying question
    - Unknown intent → suggest options
    - Complex request → escalate to human
```

---

### 6.6 PWA Resident Portal

**Description:** A Progressive Web App delivering a native app-like experience for residents on mobile devices without requiring app store installation.

#### 6.6.1 PWA Technical Requirements

| Requirement | Specification |
|---|---|
| Installable | Add to Home Screen on iOS and Android |
| Offline capable | Core features work without internet (cached) |
| Push notifications | Web push (iOS 16.4+ and Android) |
| Performance | First Contentful Paint < 1.5s on 4G |
| Responsive | Optimized for 360px–428px mobile screens |
| Lighthouse Score | > 90 for Performance, Accessibility, PWA |

#### 6.6.2 PWA Features

**Gate Pass Module:**
- Create single/recurring passes in < 30 seconds
- QR code display for visitor to show at gate
- Pass history and status
- Real-time notification when visitor arrives

**Bills & Payments:**
- View current statement and balance
- Pay levy in app (all supported payment methods)
- View payment history
- Download receipts
- Set up recurring payment instructions

**Support Requests:**
- Submit maintenance/general requests
- Attach photos directly from camera
- Track request status in real-time
- Chat with management on request thread

**Community:**
- Read HOA announcements
- Vote on active polls/motions
- Access HOA documents
- Emergency contact directory

**Profile:**
- Manage unit details
- Add/remove occupants
- Update vehicle information
- Notification preferences

#### 6.6.3 Offline Capability

| Feature | Offline Behavior |
|---|---|
| View last statement | ✅ Cached |
| View gate passes | ✅ Cached |
| Submit request | ✅ Queued (syncs when online) |
| Make payment | ❌ Requires online |
| View documents | ✅ Downloaded docs cached |
| View announcements | ✅ Last 30 days cached |

---

### 6.7 Dashboards

#### 6.7.1 Admin / Property Manager Dashboard

**Sections:**

| Widget | Metrics |
|---|---|
| Financial Health | Total levy collected (MTD), arrears %, cash in bank |
| Pending Approvals | Invoices awaiting approval, requests pending assignment |
| Violations Summary | Open violations, overdue violations |
| Recent Transactions | Last 10 payments received |
| Communication Stats | Emails sent, open rate, SMS delivered |
| Visitor Activity | Today's visitors, active passes |
| Request Queue | Overdue requests by category |
| Bank Reconciliation | Unreconciled items count, last reconciled date |
| AI Alerts | Anomalies detected, suggested actions |
| Quick Actions | Create invoice, send broadcast, log violation |

**Views:** Day / Week / Month / Custom range  
**Export:** All dashboard data exportable to PDF or Excel

---

#### 6.7.2 Exco / Board Dashboard

**Focus:** Governance and financial oversight

| Widget | Metrics |
|---|---|
| Budget vs Actuals | YTD variance chart per major expense category |
| Cash Position | Operating + Reserve fund balances |
| Arrears Report | Total arrears, top 10 debtors |
| Pending Approvals | Items awaiting my approval |
| Reserve Fund Status | Balance vs. plan, adequacy % |
| Upcoming Decisions | Votes closing soon, items for next meeting |
| Community Health | Resident satisfaction score (from surveys) |
| AGM Preparation | Checklist, document status |

---

#### 6.7.3 Resident / Owner Dashboard

**Focus:** Personal unit management

| Widget | Metrics |
|---|---|
| Account Balance | Current outstanding, next due date |
| Recent Invoices | Last 5 invoices with status |
| Active Gate Passes | Currently valid passes |
| Open Requests | My pending maintenance requests |
| Community Notices | Latest 3 announcements |
| Upcoming Votes | Active votes awaiting my participation |
| Levy History | 12-month payment history chart |

---

#### 6.7.4 Renter / Tenant Dashboard

**Focus:** Day-to-day living

| Widget | Metrics |
|---|---|
| My Bills | Outstanding charges |
| Gate Passes | Create / manage visitor passes |
| Requests | Submit and track maintenance |
| Notices | Community announcements |
| Documents | My lease and community rules |

---

#### 6.7.5 Gate / Security Dashboard

**Focus:** Access control

| Widget | Metrics |
|---|---|
| Today's Visitors | Expected and arrived |
| Active Passes | Currently valid passes |
| Scan Pass | QR code scanner interface |
| Alert Queue | Flagged access attempts |
| Visitor Register | Today's log |
| Quick Lookup | Search by unit or name |

---

### 6.8 Team Management & RBAC

#### 6.8.1 Role Architecture

HOA.africa implements a **dynamic, granular, context-aware RBAC** system supporting hierarchical and custom role definitions.

**System Roles (pre-defined):**

| Role | Scope | Access Level |
|---|---|---|
| **Super Admin** | Platform (Metasession staff) | All tenants, support access |
| **HOA Admin** | Single HOA organization | Full access to HOA |
| **Property Manager** | Single or multi-estate | Operational management |
| **Finance Officer** | Financial module | Bookkeeping + payables |
| **Exco / Board Member** | Governance + finance view | Approval + board reports |
| **Exco Chairperson** | All board access + admin lite | Higher approval thresholds |
| **Communications Manager** | Communications module | Broadcasts + templates |
| **Gate / Security** | Visitor module only | Gate pass verification |
| **Maintenance Coordinator** | Requests + violations | Request management |
| **External Accountant** | Read-only financial | Reports + GL |
| **HOA Owner** | Own unit | Self-service |
| **HOA Tenant** | Own unit (restricted) | Limited self-service |
| **Attorney** | Resale documents only | Document view |

**Custom Roles:**
- HOA admin can create custom roles
- Permissions selected from a full permission library
- Role assignment per person (multiple roles supported)
- Role time-bounding (e.g., "Exco Member" role active for 1-year term)

#### 6.8.2 Permission Granularity

Permissions are defined at the **entity + action** level:

```
Module.Entity.Action

Examples:
  financial.invoices.create
  financial.invoices.void
  financial.reports.view
  financial.payments.approve_above_50000
  management.violations.create
  management.violations.delete
  communications.sms.send
  visitors.passes.create
  visitors.passes.override
  admin.users.invite
  admin.roles.modify
```

**Contextual Permissions:**
- Amount-based approval limits (finance approvals capped by role)
- Time-based access (gate staff role active only during shift hours)
- Unit-scoped access (a managing agent for specific blocks only)

#### 6.8.3 Team Management

- Invite team members by email with role assignment
- Bulk import team via CSV
- User profile: name, contact, role, assigned units/blocks
- Two-factor authentication enforcement per role
- Login history and session management
- Device management (trusted devices)
- Inactive user auto-deactivation (configurable)
- Team directory

---

### 6.9 Integrations & Platform

#### 6.9.1 Pre-Built Integrations

| Category | Integration |
|---|---|
| **Accounting Export** | QuickBooks, Xero, Sage |
| **Banking** | FNB, GTBank, Equity, Standard Bank (open banking) |
| **Payments** | Paystack, Flutterwave, Stripe, PayFast, DPO Pay |
| **Mobile Money** | M-Pesa, MTN MoMo, Airtel Money, Orange Money |
| **Communication** | Resend, Africa's Talking, Twilio, Mailchimp |
| **Chat** | WhatsApp Business API, Telegram Bot API |
| **Storage** | Cloudflare R2 (primary), Google Cloud Storage, Dropbox |
| **Calendar** | Google Calendar (AGM and meeting scheduling) |
| **E-signature** | DocuSign, Adobe Sign |
| **Access Control** | ZKTeco, HID, Paxton (hardware integration) |
| **CCTV** | Hikvision, Dahua (metadata integration) |
| **Maps** | Google Maps (estate mapping, unit layout) |
| **ID Verification** | Smile Identity, Onfido (KYC for residents) |

#### 6.9.2 REST API & Webhooks

- Full REST API (OpenAPI 3.0 specification)
- API key + OAuth 2.0 authentication
- Webhooks for all key events (payment received, pass created, violation raised, etc.)
- GraphQL API for flexible data querying
- API rate limiting with configurable quotas
- API documentation with interactive sandbox
- SDK libraries: JavaScript/TypeScript, Python

#### 6.9.3 Security

| Feature | Standard |
|---|---|
| Encryption in transit | TLS 1.3 |
| Encryption at rest | AES-256 |
| Key management | Railway service variables (encrypted at rest) + Cloudflare secrets |
| Authentication | JWT + refresh tokens, MFA (TOTP, SMS) |
| Password policy | Minimum complexity, breach checking (HaveIBeenPwned) |
| Session management | Configurable timeout, concurrent session control |
| IP allowlisting | Per HOA admin configuration |
| DDOS protection | Cloudflare |
| Vulnerability scanning | Weekly automated scans, monthly pen tests |
| SOC 2 | Type II compliance roadmap |
| Data residency | Africa-region primary, configurable |
| Audit logs | Immutable, 7-year retention |
| RBAC enforcement | Every API call, every chat interaction |

---

## 7. Multi-Currency & Multi-Language Support

### 7.1 Multi-Currency

**Base Currency:** Configurable per HOA (ZAR, NGN, KES, GHS, USD, EUR, GBP, etc.)  
**Display Currency:** Can differ from base (resident sees USD, system stores NGN)  
**Exchange Rates:** Daily auto-update from reliable FX API (Open Exchange Rates / ECB)

| Feature | Description |
|---|---|
| Per-HOA currency configuration | Each HOA sets its functional currency |
| Multi-currency invoicing | Invoice in resident's preferred currency |
| FX rate locking | Lock rate at invoice creation |
| Realized/unrealized FX | Proper accounting treatment |
| Currency conversion reporting | Reports available in any currency |
| Payment in multiple currencies | Paystack / Flutterwave handle FX |

**Supported Currencies (Phase 1):**  
ZAR, NGN, KES, GHS, UGX, TZS, RWF, ZMW, USD, EUR, GBP, AED

### 7.2 Multi-Language

**Platform UI Languages (Phase 1):**

| Language | Code | Region |
|---|---|---|
| English | en | Pan-Africa, Global |
| French | fr | West/Central Africa |
| Portuguese | pt | Mozambique, Angola |
| Swahili | sw | East Africa |
| Afrikaans | af | South Africa |
| Hausa | ha | Nigeria, Niger |
| Yoruba | yo | Nigeria |
| Zulu / isiZulu | zu | South Africa |

**Language Features:**
- UI fully translated per language setting
- Communication templates in multiple languages
- AI chat responses in user's configured language
- PDF documents generated in selected language
- Number/date formatting per locale
- Language auto-detection from browser/device settings
- Per-user language preference
- HOA-level default language setting

---

## 8. Payment Channels & Methods

### 8.1 Supported Payment Methods

| Method | Description | Regions |
|---|---|---|
| **Debit/Credit Card** | Visa, Mastercard | All |
| **Bank Transfer (EFT)** | Direct bank transfer | All |
| **Mobile Money - M-Pesa** | Safaricom M-Pesa | Kenya, Tanzania, Mozambique |
| **Mobile Money - MTN MoMo** | MTN Mobile Money | Nigeria, Ghana, Uganda, Rwanda |
| **Mobile Money - Airtel** | Airtel Money | Nigeria, Uganda, Tanzania, Zambia |
| **USSD Payment** | No internet required | All (via telco partnerships) |
| **Cash** | Logged manually by admin/finance | All (operational) |
| **Bank-to-Bank** | Auto-matched via bank feeds | All |
| **In-App Credit** | Prepaid wallet top-up and spend | All |
| **QR Code Payment** | SnapScan, Zapper (SA) | South Africa |
| **OZOW / InstantEFT** | Instant bank pay | South Africa |
| **Paystack** | Card + bank transfer | Nigeria, Ghana, Kenya |
| **Flutterwave** | Omnichannel | Pan-Africa |
| **DPO Pay** | Pan-African acquirer | 30+ African countries |

### 8.2 Payment Flow

```
1. Resident receives invoice (email / WhatsApp / portal)
2. Resident selects payment method
3. Redirected to payment processor or USSD prompt
4. Payment processed
5. Webhook received by HOA.africa API (< 5 seconds)
6. Invoice marked paid
7. Receipt generated and delivered
8. GL entry created automatically
9. Bank feed reconciliation queued
```

### 8.3 In-App Credit (Wallet)

- Residents can top up a prepaid wallet
- Levies auto-deducted from wallet on due date (if sufficient balance)
- Auto-top-up rules (e.g., keep minimum R500 balance)
- Wallet transactions in full audit trail
- Balance visible on dashboard and portal
- Refunds can be issued to wallet

### 8.4 Cash Payment Logging

- Finance officer logs cash payment received
- Generates paper receipt (print or PDF)
- Triggers same payment flow as electronic
- Requires dual control for amounts above threshold (configurable)
- Cash register reconciliation report

---

## 9. Security Architecture

### 9.1 Security Principles

1. **Zero Trust**: No implicit trust; every request authenticated and authorized
2. **Least Privilege**: Users access only what their role requires
3. **Defense in Depth**: Multiple security layers
4. **Audit Everything**: Immutable logs for all actions
5. **Data Minimization**: Collect and retain only necessary data

### 9.2 Application Security

| Layer | Controls |
|---|---|
| **API** | JWT authentication, rate limiting, input validation, output encoding |
| **Database** | Row-level security, encrypted sensitive columns, parameterized queries |
| **File Storage (Cloudflare R2)** | Signed URLs (time-limited), virus scanning on upload, encryption at rest, served via Cloudflare CDN |
| **Frontend** | CSP headers, XSS prevention, CSRF tokens, secure cookies |
| **Infrastructure** | VPC isolation, private subnets, security groups, WAF |
| **Secrets** | AWS Secrets Manager / Vault, no secrets in code/env |

### 9.3 Authentication & Authorization

- MFA mandatory for all admin roles
- MFA optional (default on) for residents
- Single Sign-On (SAML 2.0, OIDC) for enterprise clients
- Password breach detection (HaveIBeenPwned API check)
- Passwordless login option (magic link / passkey)
- Session management: configurable timeout, concurrent session limits, device trust

### 9.4 Data Privacy

| Regulation | Compliance Measure |
|---|---|
| **POPIA (South Africa)** | Data subject rights, consent management, breach notification |
| **GDPR (EU)** | Data portability, right to erasure, DPA agreements |
| **NDPR (Nigeria)** | Data localization, consent, security standards |
| **Kenya DPA 2019** | Data subject rights, cross-border transfer controls |

### 9.5 Penetration Testing & Compliance

- Annual third-party penetration test
- OWASP Top 10 remediation program
- Bug bounty program (HackerOne)
- SOC 2 Type II roadmap (Year 2)
- ISO 27001 roadmap (Year 3)

---

## 10. Data Models

### 10.1 Core Entities

```
Organization
  id, name, country, currency, timezone, language, subscription_plan, 
  created_at, settings (JSONB)

Estate
  id, organization_id, name, address, total_units, settings (JSONB)

Unit
  id, estate_id, unit_number, block, floor, type (apartment|house|commercial),
  area_sqm, tags (array), custom_fields (JSONB)

Person
  id, organization_id, first_name, last_name, email, phone,
  preferred_language, preferred_currency, identity_verified_at

UnitOccupancy
  id, unit_id, person_id, role (owner|tenant), 
  start_date, end_date, is_active, is_primary_contact

Invoice
  id, organization_id, unit_id, invoice_number, type (recurring|one_time),
  amount, currency, due_date, status (draft|sent|partial|paid|voided|overdue),
  line_items (JSONB), created_by, sent_at, paid_at

Payment
  id, invoice_id, amount, currency, method, 
  processor_reference, status, processed_at, logged_by

GLAccount
  id, organization_id, code, name, type (asset|liability|equity|income|expense),
  parent_id, is_system

JournalEntry
  id, organization_id, date, reference, description,
  lines (JSONB: [{gl_account_id, debit, credit, notes}]),
  created_by, posted_at

Vendor
  id, organization_id, name, category, contact_info (JSONB),
  documents (JSONB), payment_details (JSONB), status, rating

VendorInvoice
  id, vendor_id, invoice_number, amount, currency, due_date,
  status, ocr_data (JSONB), approvals (JSONB), paid_at

Violation
  id, unit_id, category, description, photos (array),
  status, fine_amount, invoice_id, created_by, resolved_at

Request
  id, unit_id, form_id, status, data (JSONB), files (array),
  assigned_to, sla_due_at, resolved_at, notes (JSONB)

GatePass
  id, unit_id, created_by, visitor_name, visitor_phone,
  vehicle_plate, type, valid_from, valid_to, qr_code,
  used_at (array of timestamps), status

VisitorLog
  id, estate_id, gate_pass_id (nullable), visitor_name,
  vehicle_plate, arrived_at, departed_at, security_officer_id

AuditLog
  id, organization_id, actor_id, actor_role, action,
  entity_type, entity_id, changes (JSONB), ip_address, created_at
```

---

## 11. API Architecture

### 11.1 API Design Principles

- RESTful with resource-oriented endpoints
- Consistent response envelope: `{success, data, error, meta}`
- Pagination: cursor-based for lists
- Filtering: query parameter based
- Versioning: `/api/v1/`, `/api/v2/`
- Idempotency keys on mutation endpoints

### 11.2 Key API Endpoints (Summary)

```
Authentication
  POST /api/v1/auth/login
  POST /api/v1/auth/refresh
  POST /api/v1/auth/mfa/verify

Organizations
  GET  /api/v1/organizations/:id
  PUT  /api/v1/organizations/:id

Units & People
  GET  /api/v1/estates/:id/units
  POST /api/v1/units
  GET  /api/v1/units/:id/occupants

Financial
  POST /api/v1/invoices (create)
  GET  /api/v1/invoices (list)
  POST /api/v1/invoices/:id/send
  POST /api/v1/invoices/:id/void
  POST /api/v1/payments (log payment)
  GET  /api/v1/reports/:type (financial reports)

Vendors & Payables
  GET  /api/v1/vendors
  POST /api/v1/vendor-invoices
  POST /api/v1/vendor-invoices/:id/approve
  POST /api/v1/vendor-invoices/:id/pay

Management
  POST /api/v1/violations
  GET  /api/v1/requests
  POST /api/v1/gate-passes
  GET  /api/v1/gate-passes/:code/verify

Communications
  POST /api/v1/broadcasts
  POST /api/v1/broadcasts/preview

AI
  POST /api/v1/ai/chat (chat interface)
  GET  /api/v1/ai/insights (financial insights)
  POST /api/v1/ai/ocr (invoice OCR)

Webhooks
  POST /api/v1/webhooks (register webhook)
  GET  /api/v1/webhooks (list)
```

### 11.3 Webhook Events

```
payment.received
payment.failed
invoice.created
invoice.overdue
violation.created
violation.resolved
gate_pass.created
gate_pass.used
request.submitted
request.resolved
vendor_invoice.awaiting_approval
vendor_invoice.approved
vendor_invoice.paid
user.invited
broadcast.sent
```

---

## 12. Non-Functional Requirements

### 12.1 Performance

| Metric | Target |
|---|---|
| API response time (p50) | < 200ms |
| API response time (p99) | < 1,000ms |
| Page load (FCP) | < 1.5s on 4G |
| Time to Interactive | < 3s |
| Report generation | < 10s for standard reports |
| Invoice batch (1,000 units) | < 30 seconds |
| Payment webhook processing | < 5 seconds end-to-end |
| Search results | < 500ms |

### 12.2 Reliability

| Metric | Target |
|---|---|
| Uptime SLA | 99.9% (planned maintenance excluded) |
| RTO (Recovery Time Objective) | < 4 hours |
| RPO (Recovery Point Objective) | < 1 hour |
| Database backup frequency | Every 6 hours + continuous WAL |
| Backup retention | 30 days |

### 12.3 Scalability

| Dimension | Target |
|---|---|
| Organizations | 10,000+ |
| Units per org | 50,000+ |
| Concurrent users | 50,000+ |
| API requests/day | 10M+ |
| File storage | Unlimited (Cloudflare R2-backed) |
| Message throughput | 100,000 SMS/hour |

### 12.4 Accessibility

- WCAG 2.1 Level AA compliance
- Screen reader support
- Keyboard navigation
- Color contrast compliance
- Responsive design (320px–4K)

---

## 13. AI Feature Roadmap

### Phase 1 (MVP — Months 1–6)

- [x] AI-powered invoice OCR and data extraction
- [x] WhatsApp & Telegram bot with core intents (balance check, gate pass, support request)
- [x] Email intent classification and auto-routing
- [x] Basic financial anomaly detection (arrears patterns, duplicate invoices)
- [x] Smart send timing for communications

### Phase 2 (Months 7–12)

- [ ] Natural language report queries ("Show arrears for Block A last quarter")
- [ ] Predictive levy default scoring
- [ ] AI-generated board pack executive summaries
- [ ] Maintenance request auto-categorization and contractor matching
- [ ] Visitor pattern anomaly detection
- [ ] AI-powered violation detection from CCTV metadata (camera integration)

### Phase 3 (Months 13–24)

- [ ] Full conversational assistant (multi-turn, all modules)
- [ ] AI budget forecasting with scenario modeling
- [ ] Resident sentiment score (from interactions, surveys, requests)
- [ ] Automated HOA performance benchmarking (across platform — anonymized)
- [ ] Smart contract automation (lease and service contract triggers)
- [ ] Predictive infrastructure maintenance recommendations
- [ ] AI property valuation trend alerts

---

## 14. Compliance & Regulatory

### 14.1 Financial Compliance

| Country | Regulation | Requirement |
|---|---|---|
| South Africa | CIPC | Financial statements, HOA registration |
| South Africa | SARS | VAT returns, withholding tax, PAYE |
| Nigeria | CAC | Association registration |
| Nigeria | FIRS | VAT, withholding tax |
| Kenya | KRA | Tax compliance, VAT returns |
| Ghana | GRA | Tax compliance |

**Platform Support:**
- VAT-compliant invoicing per country
- Tax report generation ready for submission
- Statutory reserve fund tracking (where required by law)
- Audit-ready financial statements

### 14.2 Data & Privacy Compliance

| Regulation | Jurisdiction | Compliance Level |
|---|---|---|
| POPIA | South Africa | Full compliance |
| GDPR | EU / diaspora | Full compliance |
| NDPR | Nigeria | Full compliance |
| Kenya Data Protection Act | Kenya | Full compliance |

**Platform Mechanisms:**
- Consent collection and management
- Data subject request portal (access, erasure, portability)
- Data retention policies (configurable per org, within legal bounds)
- Breach notification workflow
- DPA (Data Processing Agreement) generation for HOAs
- Privacy policy and terms management

---

## 15. Implementation Phases

### Phase 1 — Foundation (Months 1–4)

**Goal:** Deployable MVP for pilot HOAs

**Features:**
- Core authentication + RBAC
- Unit and people management
- Basic invoicing + payment (Paystack, Flutterwave)
- Communications (email + SMS)
- Document storage
- Owner portal (web)
- Admin dashboard
- Basic GL and bank reconciliation

**Target:** 3 pilot HOA clients across South Africa and Nigeria

---

### Phase 2 — Operations (Months 5–8)

**Goal:** Full operational management suite

**Features:**
- Violations module
- Request forms
- Vendor management + payables
- Voting & surveys
- Visitor management (gate pass)
- WhatsApp bot (basic intents)
- PWA launch
- Multi-currency

---

### Phase 3 — Intelligence (Months 9–12)

**Goal:** AI-powered differentiation

**Features:**
- Full WhatsApp + Telegram AI assistant
- OCR invoice processing
- Financial anomaly detection
- Report packets + AI summaries
- Resale documents
- Bank integrations (FNB, GTBank)
- Multi-language (Phase 1 languages)

---

### Phase 4 — Enterprise (Months 13–18)

**Goal:** Enterprise-grade hardening and scale

**Features:**
- Advanced RBAC (custom roles, time-bound)
- SSO / SAML integration
- Bookkeeping services module
- SOC 2 Type II audit
- Full API SDK release
- Dedicated instance option
- Remaining African bank integrations
- Advanced AI features (Phase 2 roadmap)

---

### Phase 5 — Scale (Months 19–24)

**Goal:** Market leadership across Africa

**Features:**
- Phase 3 AI features
- ANPR integration
- Property management expansion (beyond HOA — full property management)
- Native mobile apps (iOS + Android)
- Pan-African bank coverage
- Marketplace for HOA service providers

---

## 16. Success Metrics & KPIs

### 16.1 Product Metrics

| Metric | Target (Year 1) | Target (Year 2) |
|---|---|---|
| HOA organizations onboarded | 50 | 300 |
| Total units managed | 10,000 | 80,000 |
| Monthly Active Users (residents) | 5,000 | 50,000 |
| Platform uptime | 99.9% | 99.95% |
| Levy collection rate (platform avg) | 85% | 90% |
| Payments processed (monthly) | $500K | $5M |
| WhatsApp interactions/month | 20,000 | 200,000 |

### 16.2 Resident Experience Metrics

| Metric | Target |
|---|---|
| Resident NPS | > 45 |
| PWA adoption (% of residents) | > 60% |
| Self-service request rate | > 70% (vs. email/phone) |
| Payment on first reminder | > 75% |
| Average support response time | < 4 hours |

### 16.3 Financial Metrics

| Metric | Target |
|---|---|
| ARR (Year 1) | $500K |
| ARR (Year 2) | $3M |
| Gross Revenue Retention | > 90% |
| Net Revenue Retention | > 110% |
| CAC Payback Period | < 12 months |
| Customer LTV | > $15,000 |

### 16.4 Operational Metrics

| Metric | Target |
|---|---|
| Time to onboard new HOA | < 5 business days |
| Bookkeeping accuracy rate | > 99.5% |
| OCR extraction accuracy | > 95% |
| AI intent classification accuracy | > 90% |
| False positive anomaly alerts | < 5% |

---

## 17. Appendix

### 17.1 Glossary

| Term | Definition |
|---|---|
| **HOA** | Home Owners Association — a legal entity formed by property owners in a development to manage common areas and enforce community rules |
| **CC&Rs** | Covenants, Conditions & Restrictions — the governing rules of an HOA |
| **Levy** | Regular assessment (fee) charged to unit owners by the HOA |
| **Exco** | Executive Committee — elected board members of the HOA |
| **GL** | General Ledger — the complete record of all financial transactions |
| **EFT** | Electronic Funds Transfer |
| **RBAC** | Role-Based Access Control |
| **OCR** | Optical Character Recognition |
| **PWA** | Progressive Web App |
| **MoMo** | Mobile Money |
| **POPIA** | Protection of Personal Information Act (South Africa) |
| **AGM** | Annual General Meeting |
| **PO** | Purchase Order |
| **ANPR** | Automatic Number Plate Recognition |
| **NPS** | Net Promoter Score |
| **ARR** | Annual Recurring Revenue |

### 17.2 Supported African Countries (Phase 1)

South Africa, Nigeria, Kenya, Ghana, Uganda, Tanzania, Rwanda, Zambia, Zimbabwe, Mozambique, Namibia, Botswana, Egypt, Morocco, Ivory Coast, Cameroon, Senegal

### 17.3 Integration Partner Shortlist

| Category | Partner | Priority |
|---|---|---|
| Pan-Africa Payments | Flutterwave | P0 |
| Nigeria/Africa Payments | Paystack | P0 |
| Mobile Money | Africa's Talking | P0 |
| SMS | Africa's Talking | P0 |
| Email | Resend | P0 |
| WhatsApp | Meta Cloud API | P0 |
| Infrastructure | Railway | P0 |
| Object Storage | Cloudflare R2 | P0 |
| CDN / DNS / DDoS | Cloudflare | P0 |
| Search | Typesense (self-hosted on Railway) | P0 |
| South Africa Banking | Fincraft / Plaid SA | P1 |
| Nigeria Banking | Mono, Okra | P1 |
| Kenya Banking | Stitch, Mono KE | P1 |
| OCR | AWS Textract | P1 |
| E-signature | DocuSign | P2 |
| Accounting Export | Xero | P2 |
| Access Control | ZKTeco | P2 |

### 17.4 Technology Licensing

All platform code to be developed as proprietary software owned by Metasession. Open-source dependencies to be inventoried and license-reviewed. No GPL-licensed dependencies in production API layer.

---

*This document is a living specification. All sections subject to revision through the product development lifecycle. Changes must be versioned and approved by the Product Lead.*

**Document Owner:** Metasession Product Team  
**Next Review Date:** April 10, 2026  
**Version History:**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | March 10, 2026 | Metasession Product | Initial draft |
| 1.1.0 | March 10, 2026 | Metasession Product | Infrastructure revised to Railway; email revised to Resend; search revised to Typesense; storage revised to Cloudflare R2; queue consolidated to Bull/Redis on Railway; removed AWS/GCP hosting references |
