/**
 * Board-pack PDF — server-rendered via @react-pdf/renderer.
 *
 * Three sections in order: Income Statement, Balance Sheet, Cash Flow.
 * Numbers come from ReportsService; this file only handles layout.
 *
 * Currency formatting uses Intl.NumberFormat with the org's currency. Pages
 * auto-break on overflow — @react-pdf paginates content blocks for us, so we
 * avoid hard-coded page splits.
 */
import * as React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
} from '../reports.service';

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#1F2937' },
  header: { marginBottom: 18, borderBottom: '1px solid #E5E7EB', paddingBottom: 10 },
  orgName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  packTitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  periodLine: { fontSize: 9, color: '#6B7280', marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginTop: 16, marginBottom: 8 },
  subSection: { fontSize: 11, fontWeight: 'bold', color: '#374151', marginTop: 8, marginBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #D1D5DB', paddingBottom: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 3 },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 3, backgroundColor: '#F9FAFB' },
  totalRow: { flexDirection: 'row', borderTop: '1px solid #111827', paddingTop: 4, marginTop: 4, fontWeight: 'bold' },
  codeCol: { width: 50, fontSize: 9, color: '#6B7280' },
  nameCol: { flex: 1, paddingRight: 8 },
  amountCol: { width: 90, textAlign: 'right', fontVariant: ['tabular-nums'] },
  amountColBold: { width: 90, textAlign: 'right', fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: '#9CA3AF', textAlign: 'center' },
  pageNumber: { position: 'absolute', bottom: 24, right: 36, fontSize: 8, color: '#9CA3AF' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#6B7280' },
  badgeOk: { padding: 2, paddingHorizontal: 6, fontSize: 8, color: '#065F46', backgroundColor: '#D1FAE5', borderRadius: 3 },
  badgeWarn: { padding: 2, paddingHorizontal: 6, fontSize: 8, color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 3 },
});

export interface BoardPackData {
  organization: { name: string; logoUrl: string | null; currency: string };
  period: { from: string; to: string };
  income: IncomeStatement;
  balance: BalanceSheet;
  cash: CashFlowStatement;
}

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

const PackHeader = ({ data }: { data: BoardPackData }) => (
  <View style={styles.header}>
    <Text style={styles.orgName}>{data.organization.name}</Text>
    <Text style={styles.packTitle}>Board pack — Financial statements</Text>
    <View style={styles.meta}>
      <Text>Period: {fmtDate(data.period.from)} — {fmtDate(data.period.to)}</Text>
      <Text>Currency: {data.organization.currency}</Text>
    </View>
    <Text style={styles.periodLine}>Generated: {fmtDate(new Date().toISOString())}</Text>
  </View>
);

const Footer = () => (
  <>
    <Text style={styles.footer}>HOA.africa — Confidential. For exco and finance team use only.</Text>
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      fixed
    />
  </>
);

const IncomeStatementSection = ({ data }: { data: BoardPackData }) => (
  <View>
    <Text style={styles.sectionTitle}>1. Income statement</Text>

    <Text style={styles.subSection}>Income</Text>
    <View style={styles.tableHeader}>
      <Text style={styles.codeCol}>Code</Text>
      <Text style={styles.nameCol}>Account</Text>
      <Text style={styles.amountCol}>Amount</Text>
    </View>
    {data.income.income.accounts.map((a, i) => (
      <View key={a.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
        <Text style={styles.codeCol}>{a.code}</Text>
        <Text style={styles.nameCol}>{a.name}</Text>
        <Text style={styles.amountCol}>{fmt(a.balance, data.organization.currency)}</Text>
      </View>
    ))}
    {data.income.income.accounts.length === 0 && (
      <View style={styles.tableRow}>
        <Text style={styles.codeCol}> </Text>
        <Text style={styles.nameCol}>(no income recorded in period)</Text>
        <Text style={styles.amountCol}>—</Text>
      </View>
    )}
    <View style={styles.totalRow}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Total income</Text>
      <Text style={styles.amountColBold}>{fmt(data.income.income.total, data.organization.currency)}</Text>
    </View>

    <Text style={styles.subSection}>Expenses</Text>
    <View style={styles.tableHeader}>
      <Text style={styles.codeCol}>Code</Text>
      <Text style={styles.nameCol}>Account</Text>
      <Text style={styles.amountCol}>Amount</Text>
    </View>
    {data.income.expenses.accounts.map((a, i) => (
      <View key={a.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
        <Text style={styles.codeCol}>{a.code}</Text>
        <Text style={styles.nameCol}>{a.name}</Text>
        <Text style={styles.amountCol}>{fmt(a.balance, data.organization.currency)}</Text>
      </View>
    ))}
    {data.income.expenses.accounts.length === 0 && (
      <View style={styles.tableRow}>
        <Text style={styles.codeCol}> </Text>
        <Text style={styles.nameCol}>(no expenses recorded in period)</Text>
        <Text style={styles.amountCol}>—</Text>
      </View>
    )}
    <View style={styles.totalRow}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Total expenses</Text>
      <Text style={styles.amountColBold}>{fmt(data.income.expenses.total, data.organization.currency)}</Text>
    </View>

    <View style={[styles.totalRow, { marginTop: 12 }]}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Net surplus / (deficit)</Text>
      <Text style={styles.amountColBold}>{fmt(data.income.netSurplus, data.organization.currency)}</Text>
    </View>
  </View>
);

const BalanceSheetSection = ({ data }: { data: BoardPackData }) => (
  <View break>
    <Text style={styles.sectionTitle}>2. Balance sheet (as of {fmtDate(data.balance.asOf)})</Text>

    {(['assets', 'liabilities', 'equity'] as const).map((bucket) => (
      <View key={bucket}>
        <Text style={styles.subSection}>{bucket.charAt(0).toUpperCase() + bucket.slice(1)}</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.codeCol}>Code</Text>
          <Text style={styles.nameCol}>Account</Text>
          <Text style={styles.amountCol}>Balance</Text>
        </View>
        {data.balance[bucket].accounts.map((a, i) => (
          <View key={a.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={styles.codeCol}>{a.code}</Text>
            <Text style={styles.nameCol}>{a.name}</Text>
            <Text style={styles.amountCol}>{fmt(a.balance, data.organization.currency)}</Text>
          </View>
        ))}
        {data.balance[bucket].accounts.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.codeCol}> </Text>
            <Text style={styles.nameCol}>(no {bucket} accounts)</Text>
            <Text style={styles.amountCol}>—</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.codeCol}> </Text>
          <Text style={styles.nameCol}>Total {bucket}</Text>
          <Text style={styles.amountColBold}>{fmt(data.balance[bucket].total, data.organization.currency)}</Text>
        </View>
      </View>
    ))}

    <View style={[styles.totalRow, { marginTop: 12 }]}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Retained surplus (this period)</Text>
      <Text style={styles.amountColBold}>{fmt(data.balance.retainedSurplus, data.organization.currency)}</Text>
    </View>
    <View style={styles.totalRow}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Total liabilities + equity</Text>
      <Text style={styles.amountColBold}>{fmt(data.balance.totalLiabilitiesAndEquity, data.organization.currency)}</Text>
    </View>
    <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end' }}>
      <Text style={data.balance.balanced ? styles.badgeOk : styles.badgeWarn}>
        {data.balance.balanced ? 'Balanced ✓' : 'Out of balance — investigate'}
      </Text>
    </View>
  </View>
);

const CashFlowSection = ({ data }: { data: BoardPackData }) => (
  <View break>
    <Text style={styles.sectionTitle}>3. Cash flow</Text>

    {(['operating', 'investing', 'financing'] as const).map((bucket) => (
      <View key={bucket}>
        <Text style={styles.subSection}>{bucket.charAt(0).toUpperCase() + bucket.slice(1)} activities</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.codeCol}>Code</Text>
          <Text style={styles.nameCol}>Account</Text>
          <Text style={styles.amountCol}>Net</Text>
        </View>
        {data.cash[bucket].categories.map((c, i) => (
          <View key={c.accountId} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={styles.codeCol}>{c.code}</Text>
            <Text style={styles.nameCol}>{c.name}</Text>
            <Text style={styles.amountCol}>{fmt(c.net, data.organization.currency)}</Text>
          </View>
        ))}
        {data.cash[bucket].categories.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.codeCol}> </Text>
            <Text style={styles.nameCol}>(no {bucket} cash activity)</Text>
            <Text style={styles.amountCol}>—</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.codeCol}> </Text>
          <Text style={styles.nameCol}>Net {bucket} cash flow</Text>
          <Text style={styles.amountColBold}>{fmt(data.cash[bucket].net, data.organization.currency)}</Text>
        </View>
      </View>
    ))}

    <View style={[styles.totalRow, { marginTop: 12 }]}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Opening cash</Text>
      <Text style={styles.amountColBold}>{fmt(data.cash.openingCash, data.organization.currency)}</Text>
    </View>
    <View style={styles.totalRow}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Net change in cash</Text>
      <Text style={styles.amountColBold}>{fmt(data.cash.netChange, data.organization.currency)}</Text>
    </View>
    <View style={styles.totalRow}>
      <Text style={styles.codeCol}> </Text>
      <Text style={styles.nameCol}>Closing cash</Text>
      <Text style={styles.amountColBold}>{fmt(data.cash.closingCash, data.organization.currency)}</Text>
    </View>
  </View>
);

export function BoardPackPDF({ data }: { data: BoardPackData }) {
  return (
    <Document
      title={`Board pack — ${data.organization.name}`}
      author="HOA.africa"
      subject="Financial statements"
    >
      <Page size="A4" style={styles.page}>
        <PackHeader data={data} />
        <IncomeStatementSection data={data} />
        <BalanceSheetSection data={data} />
        <CashFlowSection data={data} />
        <Footer />
      </Page>
    </Document>
  );
}
