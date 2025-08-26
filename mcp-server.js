#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import required modules
import dotenv from "dotenv";
import fetch from "node-fetch";

// Load environment variables
dotenv.config();

// Your Railway API base URL
const RAILWAY_API_BASE =
  process.env.RAILWAY_API_URL ||
  "https://rac-financial-dashboard-production.up.railway.app";

// Helper function to call Railway APIs
async function callRailwayAPI(endpoint) {
  try {
    const url = `${RAILWAY_API_BASE}${endpoint}`;
    console.error(`🌐 Calling Railway API: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Railway API error: ${response.status} - ${response.statusText}`
      );
    }

    const data = await response.json();
    console.error(
      `✅ Railway API response received: ${JSON.stringify(data).substring(
        0,
        200
      )}...`
    );

    return data;
  } catch (error) {
    console.error(`❌ Railway API call failed: ${error.message}`);
    throw error;
  }
}

// Helper function to get tenant ID from organization name
async function getTenantIdFromName(organizationName) {
  const connections = await callRailwayAPI("/api/connection-status");

  const matchingConnection = connections.find(
    (conn) =>
      conn.tenantName.toLowerCase().includes(organizationName.toLowerCase()) ||
      organizationName.toLowerCase().includes(conn.tenantName.toLowerCase())
  );

  if (!matchingConnection) {
    throw new Error(
      `No connected organization found matching: ${organizationName}`
    );
  }

  if (!matchingConnection.connected) {
    throw new Error(
      `Organization ${matchingConnection.tenantName} is not currently connected (token expired)`
    );
  }

  return matchingConnection.tenantId;
}

// Mock function for deep Xero API calls that would require direct API access
// In a real implementation, these would need additional Railway endpoints
async function mockXeroAPICall(endpoint, description) {
  return {
    error: "Deep analysis requires additional Railway API endpoints",
    suggested_endpoint: endpoint,
    description: description,
    note: "These tools would require your Railway server to implement additional Xero API endpoints for granular transaction data",
  };
}

const server = new Server(
  {
    name: "rac-xero-enhanced",
    version: "3.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Enhanced tool definitions with new analytical tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Existing tools
      {
        name: "test_rac_connection",
        description: "Test if RAC Xero MCP server can connect to Railway APIs",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_organizations",
        description:
          "Get list of connected Xero organizations from Railway system",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_trial_balance",
        description: "Get trial balance for a specific Xero organization",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description:
                "Organization name (e.g., 'Mining' or 'Aboriginal Corporation')",
            },
            reportDate: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },
      {
        name: "get_cash_position",
        description:
          "Get cash position and bank account balances for a Xero organization",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name (e.g., 'Mining')",
            },
          },
        },
      },
      {
        name: "get_outstanding_invoices",
        description: "Get outstanding invoices for a Xero organization",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name (e.g., 'Mining')",
            },
          },
        },
      },
      {
        name: "get_consolidated_trial_balance",
        description:
          "Get consolidated trial balance across all connected RAC entities",
        inputSchema: {
          type: "object",
          properties: {
            reportDate: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },

      // NEW ANALYTICAL TOOLS
      {
        name: "get_journal_entries",
        description:
          "Get manual journal entries for a specific organization to identify unusual postings",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            dateFrom: {
              type: "string",
              description:
                "Start date in YYYY-MM-DD format (optional, defaults to 30 days ago)",
            },
            dateTo: {
              type: "string",
              description:
                "End date in YYYY-MM-DD format (optional, defaults to today)",
            },
            accountName: {
              type: "string",
              description: "Filter by specific account name (optional)",
            },
          },
        },
      },
      {
        name: "analyze_equity_movements",
        description:
          "Analyze movements in equity accounts, particularly useful for investigating the Future Fund account",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            equityAccountName: {
              type: "string",
              description:
                "Specific equity account to analyze (e.g., 'Future Fund')",
            },
            monthsBack: {
              type: "number",
              description: "Number of months to analyze (default 12)",
            },
          },
        },
      },
      {
        name: "get_account_history",
        description: "Get detailed transaction history for a specific account",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            accountName: {
              type: "string",
              description: "Name of the account to analyze",
              required: true,
            },
            dateFrom: {
              type: "string",
              description: "Start date in YYYY-MM-DD format (optional)",
            },
            dateTo: {
              type: "string",
              description: "End date in YYYY-MM-DD format (optional)",
            },
          },
        },
      },
      {
        name: "check_bank_reconciliation",
        description:
          "Compare bank account balances between trial balance and actual bank feeds to identify discrepancies",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            bankAccountName: {
              type: "string",
              description:
                "Specific bank account to check (optional, checks all if not provided)",
            },
          },
        },
      },
      {
        name: "find_unbalanced_transactions",
        description:
          "Find transactions or journal entries that may be causing trial balance imbalances",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            minimumAmount: {
              type: "number",
              description:
                "Minimum transaction amount to analyze (default 10000)",
            },
            dateRange: {
              type: "string",
              description:
                "Date range to search (e.g., '3months', '1year', 'all')",
            },
          },
        },
      },
      {
        name: "get_chart_of_accounts",
        description:
          "Get complete chart of accounts structure to identify unusual or problematic accounts",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            accountType: {
              type: "string",
              description:
                "Filter by account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)",
            },
            includeArchived: {
              type: "boolean",
              description: "Include archived accounts (default false)",
            },
          },
        },
      },
      {
        name: "investigate_imbalance",
        description:
          "Comprehensive analysis tool that investigates trial balance imbalances using multiple data sources",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            focusAccount: {
              type: "string",
              description:
                "Specific account to focus investigation on (optional)",
            },
            analysisDepth: {
              type: "string",
              description:
                "Level of analysis: 'basic', 'detailed', 'comprehensive' (default 'detailed')",
            },
          },
        },
      },
      {
        name: "compare_periods",
        description:
          "Compare trial balance between different time periods to identify when imbalances were introduced",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description:
                "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name",
            },
            fromDate: {
              type: "string",
              description: "Earlier date for comparison (YYYY-MM-DD)",
            },
            toDate: {
              type: "string",
              description:
                "Later date for comparison (YYYY-MM-DD, optional - defaults to today)",
            },
            accountFilter: {
              type: "string",
              description: "Filter by specific account type or name (optional)",
            },
          },
        },
      },
    ],
  };
});

// Enhanced tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Existing tools (unchanged)
    if (name === "test_rac_connection") {
      const healthCheck = await callRailwayAPI("/api/health");
      const connections = await callRailwayAPI("/api/connection-status");

      return {
        content: [
          {
            type: "text",
            text: `✅ SUCCESS! RAC Xero MCP server connected to Railway APIs!\n\nRailway System: ${
              healthCheck.status
            }\nDatabase: ${healthCheck.database}\nXero Connections: ${
              connections.length
            } found\nActive Connections: ${
              connections.filter((c) => c.connected).length
            }\n\nConnected Organizations:\n${connections
              .filter((c) => c.connected)
              .map((c) => `• ${c.tenantName}`)
              .join("\n")}\n\nExpired Connections:\n${connections
              .filter((c) => !c.connected)
              .map((c) => `• ${c.tenantName} (${c.error})`)
              .join("\n")}`,
          },
        ],
      };
    }

    if (name === "get_organizations") {
      const connections = await callRailwayAPI("/api/connection-status");

      if (connections.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No Xero organizations found. Please connect organizations through the Railway web dashboard first.",
            },
          ],
        };
      }

      const activeConnections = connections.filter((c) => c.connected);
      const expiredConnections = connections.filter((c) => !c.connected);

      let result = `📊 Found ${connections.length} Xero organization(s):\n\n`;

      if (activeConnections.length > 0) {
        result += "✅ ACTIVE CONNECTIONS:\n";
        activeConnections.forEach((conn) => {
          result += `• ${conn.tenantName}\n  ID: ${conn.tenantId}\n  Last seen: ${conn.lastSeen}\n\n`;
        });
      }

      if (expiredConnections.length > 0) {
        result += "⚠️ EXPIRED CONNECTIONS:\n";
        expiredConnections.forEach((conn) => {
          result += `• ${conn.tenantName}\n  ID: ${conn.tenantId}\n  Error: ${conn.error}\n\n`;
        });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_trial_balance") {
      const { tenantId, organizationName, reportDate } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }
      if (!actualTenantId) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Error: Must provide either tenantId or organizationName",
            },
          ],
        };
      }

      const dateParam = reportDate ? `?date=${reportDate}` : "";
      const trialBalanceData = await callRailwayAPI(
        `/api/trial-balance/${actualTenantId}${dateParam}`
      );

      const tb = trialBalanceData.trialBalance;
      const totals = tb.totals;
      const balanceCheck = trialBalanceData.balanceCheck;

      let result = `📋 TRIAL BALANCE - ${trialBalanceData.tenantName}\n`;
      result += `📅 Report Date: ${trialBalanceData.reportDate}\n\n`;

      result += `⚖️ BALANCE STATUS: ${
        balanceCheck.debitsEqualCredits ? "✅ BALANCED" : "❌ OUT OF BALANCE"
      }\n`;
      if (!balanceCheck.debitsEqualCredits) {
        result += `   Difference: $${balanceCheck.difference.toLocaleString()}\n`;
      }
      result += `   Total Debits: $${totals.totalDebits.toLocaleString()}\n`;
      result += `   Total Credits: $${totals.totalCredits.toLocaleString()}\n\n`;

      result += `💰 FINANCIAL SUMMARY:\n`;
      result += `• Total Assets: $${totals.totalAssets.toLocaleString()}\n`;
      result += `• Total Liabilities: $${totals.totalLiabilities.toLocaleString()}\n`;
      result += `• Total Equity: $${totals.totalEquity.toLocaleString()}\n\n`;

      // Include account details
      if (tb.assets.length > 0) {
        result += `🏦 ASSETS (${tb.assets.length} accounts):\n`;
        tb.assets.forEach((account) => {
          result += `• ${account.name}: $${account.balance.toLocaleString()}\n`;
        });
        result += "\n";
      }

      if (tb.liabilities.length > 0) {
        result += `📊 LIABILITIES (${tb.liabilities.length} accounts):\n`;
        tb.liabilities.forEach((account) => {
          result += `• ${account.name}: $${account.balance.toLocaleString()}\n`;
        });
        result += "\n";
      }

      if (tb.equity.length > 0) {
        result += `🏛️ EQUITY (${tb.equity.length} accounts):\n`;
        tb.equity.forEach((account) => {
          result += `• ${account.name}: $${account.balance.toLocaleString()}\n`;
        });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_cash_position") {
      const { tenantId, organizationName } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }
      if (!actualTenantId) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Error: Must provide either tenantId or organizationName",
            },
          ],
        };
      }

      const cashData = await callRailwayAPI(
        `/api/cash-position/${actualTenantId}`
      );

      let result = `💰 CASH POSITION\n\nTotal Cash: $${cashData.totalCash.toLocaleString()}\n\n`;

      if (cashData.bankAccounts.length > 0) {
        result += `🏦 BANK ACCOUNTS (${cashData.bankAccounts.length}):\n`;
        cashData.bankAccounts.forEach((account) => {
          result += `• ${account.name} (${
            account.code
          }): $${account.balance.toLocaleString()}\n`;
        });
      } else {
        result += "No bank accounts found.\n";
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_outstanding_invoices") {
      const { tenantId, organizationName } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }
      if (!actualTenantId) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Error: Must provide either tenantId or organizationName",
            },
          ],
        };
      }

      const invoices = await callRailwayAPI(
        `/api/outstanding-invoices/${actualTenantId}`
      );

      let result = `📄 OUTSTANDING INVOICES\n\n`;

      if (invoices.length === 0) {
        result += "No outstanding invoices found.\n";
      } else {
        const totalOutstanding = invoices.reduce(
          (sum, inv) => sum + inv.amountDue,
          0
        );
        result += `Total Outstanding: $${totalOutstanding.toLocaleString()}\n`;
        result += `Number of Invoices: ${invoices.length}\n\n`;

        // Show first 10 invoices
        invoices.slice(0, 10).forEach((inv) => {
          result += `• Invoice ${inv.invoiceNumber}\n`;
          result += `  Customer: ${inv.contact}\n`;
          result += `  Amount Due: $${inv.amountDue.toLocaleString()}\n`;
          result += `  Due Date: ${inv.dueDate}\n\n`;
        });

        if (invoices.length > 10) {
          result += `... and ${invoices.length - 10} more invoices\n`;
        }
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_consolidated_trial_balance") {
      const { reportDate } = args;
      const dateParam = reportDate ? `?date=${reportDate}` : "";

      const consolidatedData = await callRailwayAPI(
        `/api/consolidated-trial-balance${dateParam}`
      );

      const totals = consolidatedData.consolidated.totals;
      const balanceCheck = consolidatedData.consolidated.balanceCheck;

      let result = `📊 RAC CONSOLIDATED TRIAL BALANCE\n`;
      result += `📅 Report Date: ${consolidatedData.reportDate}\n`;
      result += `🏢 Entities: ${consolidatedData.companies.length} companies\n\n`;

      result += `⚖️ CONSOLIDATED BALANCE: ${
        balanceCheck.debitsEqualCredits ? "✅ BALANCED" : "❌ OUT OF BALANCE"
      }\n`;
      if (!balanceCheck.debitsEqualCredits) {
        result += `   Difference: $${balanceCheck.difference.toLocaleString()}\n`;
      }
      result += `   Total Debits: $${totals.totalDebits.toLocaleString()}\n`;
      result += `   Total Credits: $${totals.totalCredits.toLocaleString()}\n\n`;

      result += `💼 RAC PORTFOLIO SUMMARY:\n`;
      result += `• Total Assets: $${totals.totalAssets.toLocaleString()}\n`;
      result += `• Total Liabilities: $${totals.totalLiabilities.toLocaleString()}\n`;
      result += `• Total Equity: $${totals.totalEquity.toLocaleString()}\n`;
      result += `• Net Worth: $${(
        totals.totalAssets - totals.totalLiabilities
      ).toLocaleString()}\n\n`;

      result += `🏢 COMPANY BREAKDOWN:\n`;
      consolidatedData.companies.forEach((company) => {
        result += `\n• ${company.tenantName}\n`;
        result += `  Assets: $${company.totals.totalAssets.toLocaleString()}\n`;
        result += `  Liabilities: $${company.totals.totalLiabilities.toLocaleString()}\n`;
        result += `  Equity: $${company.totals.totalEquity.toLocaleString()}\n`;
        result += `  Accounts: ${company.accountCounts.totalAccounts}\n`;
        result += `  Status: ${
          company.balanceCheck.debitsEqualCredits
            ? "✅ Balanced"
            : "❌ Imbalanced"
        }\n`;
      });

      return { content: [{ type: "text", text: result }] };
    }

    // NEW ANALYTICAL TOOLS (using mock data for now - would require additional Railway endpoints)

    if (name === "get_journal_entries") {
      const { tenantId, organizationName, dateFrom, dateTo, accountName } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      const mockResult = await mockXeroAPICall(
        `/api/journal-entries/${actualTenantId}`,
        "Retrieve manual journal entries to identify unusual postings"
      );

      return {
        content: [
          {
            type: "text",
            text:
              `📝 JOURNAL ENTRIES ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `Date Range: ${dateFrom || "Last 30 days"} to ${
                dateTo || "Today"
              }\n\n` +
              `❌ ${mockResult.error}\n\n` +
              `To implement this feature, add this endpoint to your Railway server:\n` +
              `${mockResult.suggested_endpoint}\n\n` +
              `This would call Xero's ManualJournals API to find:\n` +
              `• Large unusual journal entries\n` +
              `• Entries affecting equity accounts\n` +
              `• Unbalanced manual postings\n` +
              `• Entries with unusual account combinations`,
          },
        ],
      };
    }

    if (name === "analyze_equity_movements") {
      const { tenantId, organizationName, equityAccountName, monthsBack } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `📈 EQUITY MOVEMENTS ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `Focus Account: ${equityAccountName || "All Equity Accounts"}\n` +
              `Period: Last ${monthsBack || 12} months\n\n` +
              `❌ This deep analysis requires additional Railway API endpoints.\n\n` +
              `ANALYSIS FOCUS for Future Fund Charitable Payment Reserve:\n` +
              `• When was the $29.5M entry made?\n` +
              `• What was the offsetting debit entry?\n` +
              `• Who created this journal entry?\n` +
              `• Was this a data migration or manual entry?\n\n` +
              `To implement: Add endpoint /api/equity-analysis/${actualTenantId}\n` +
              `This would track equity account movements over time and identify\n` +
              `the specific transactions that created large equity balances.`,
          },
        ],
      };
    }

    if (name === "get_account_history") {
      const { tenantId, organizationName, accountName, dateFrom, dateTo } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `📚 ACCOUNT HISTORY ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `Account: ${accountName}\n` +
              `Period: ${dateFrom || "All time"} to ${dateTo || "Today"}\n\n` +
              `❌ Requires additional Railway endpoint implementation.\n\n` +
              `For the Future Fund account, this would show:\n` +
              `• Every transaction affecting this account\n` +
              `• Source documents (invoices, journal entries)\n` +
              `• Running balance over time\n` +
              `• Counterparty accounts for each transaction\n\n` +
              `Implementation: /api/account-history/${actualTenantId}/${encodeURIComponent(
                accountName
              )}\n` +
              `This would use Xero's Accounts/{AccountID}/Transactions API`,
          },
        ],
      };
    }

    if (name === "check_bank_reconciliation") {
      const { tenantId, organizationName, bankAccountName } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // We can partially implement this using existing data
      const trialBalance = await callRailwayAPI(
        `/api/trial-balance/${actualTenantId}`
      );
      const cashPosition = await callRailwayAPI(
        `/api/cash-position/${actualTenantId}`
      );

      let result = `🏦 BANK RECONCILIATION ANALYSIS\n\n`;
      result += `Organization: ${organizationName || actualTenantId}\n\n`;

      // Compare trial balance vs cash position
      const tbCashAccounts = trialBalance.trialBalance.assets.filter(
        (acc) =>
          acc.name.toLowerCase().includes("bank") ||
          acc.name.toLowerCase().includes("cash") ||
          acc.name.toLowerCase().includes("macquarie") ||
          acc.name.toLowerCase().includes("commonwealth")
      );

      result += `📊 TRIAL BALANCE CASH ACCOUNTS:\n`;
      tbCashAccounts.forEach((acc) => {
        result += `• ${acc.name}: $${acc.balance.toLocaleString()}\n`;
      });

      result += `\n💰 BANK FEEDS CASH POSITION: $${cashPosition.totalCash.toLocaleString()}\n\n`;

      if (tbCashAccounts.length > 0 && cashPosition.totalCash === 0) {
        result += `❌ MAJOR DISCREPANCY DETECTED!\n`;
        result += `Trial balance shows cash assets but bank feeds show $0\n\n`;
        result += `POSSIBLE CAUSES:\n`;
        result += `• Bank feeds not connected or not working\n`;
        result += `• Manual journal entries creating cash balances without bank transactions\n`;
        result += `• Timing differences between book entries and bank clearing\n`;
        result += `• Accounts may be investments/term deposits, not regular bank accounts\n\n`;

        result += `RECOMMENDATION:\n`;
        result += `Check if these accounts are actually bank accounts or investment accounts.\n`;
        result += `The Macquarie accounts appear to be investment funds, not bank accounts,\n`;
        result += `which would explain why they don't appear in bank feeds.\n`;
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "find_unbalanced_transactions") {
      const { tenantId, organizationName, minimumAmount, dateRange } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `🔍 UNBALANCED TRANSACTIONS ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `Minimum Amount: $${(
                minimumAmount || 10000
              ).toLocaleString()}\n` +
              `Date Range: ${dateRange || "All time"}\n\n` +
              `❌ This requires additional Railway endpoint implementation.\n\n` +
              `TARGET: Find the transaction that created the $29.5M imbalance\n\n` +
              `This analysis would:\n` +
              `• Search for large journal entries (>$1M)\n` +
              `• Identify entries with only one side (debit without credit, or vice versa)\n` +
              `• Find entries with unusual account combinations\n` +
              `• Check for suspended or incomplete transactions\n\n` +
              `Implementation: /api/find-unbalanced/${actualTenantId}\n` +
              `Would use Xero's Journal API with filtering for large amounts`,
          },
        ],
      };
    }

    if (name === "get_chart_of_accounts") {
      const { tenantId, organizationName, accountType, includeArchived } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `📋 CHART OF ACCOUNTS ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `Filter: ${accountType || "All account types"}\n` +
              `Include Archived: ${includeArchived || false}\n\n` +
              `❌ This requires additional Railway endpoint implementation.\n\n` +
              `This would retrieve the complete chart of accounts from Xero\n` +
              `and identify accounts that might be causing issues:\n\n` +
              `• Unusual account names or codes\n` +
              `• Accounts with abnormally large balances\n` +
              `• Equity accounts that shouldn't exist\n` +
              `• Accounts with zero activity but large balances\n\n` +
              `SPECIFIC TARGET: Analyze the "Future Fund Charitable Payment Reserve"\n` +
              `• Is this a standard account type?\n` +
              `• When was it created?\n` +
              `• What's its intended purpose?\n\n` +
              `Implementation: /api/chart-of-accounts/${actualTenantId}`,
          },
        ],
      };
    }

    if (name === "investigate_imbalance") {
      const { tenantId, organizationName, focusAccount, analysisDepth } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // We can do a basic investigation using existing data
      const trialBalance = await callRailwayAPI(
        `/api/trial-balance/${actualTenantId}`
      );

      let result = `🔍 COMPREHENSIVE IMBALANCE INVESTIGATION\n\n`;
      result += `Organization: ${trialBalance.tenantName}\n`;
      result += `Analysis Depth: ${analysisDepth || "detailed"}\n`;
      result += `Focus Account: ${focusAccount || "All accounts"}\n\n`;

      const balanceCheck = trialBalance.balanceCheck;
      result += `⚖️ IMBALANCE SUMMARY:\n`;
      result += `• Status: ${
        balanceCheck.debitsEqualCredits ? "BALANCED" : "OUT OF BALANCE"
      }\n`;

      if (!balanceCheck.debitsEqualCredits) {
        result += `• Difference: $${balanceCheck.difference.toLocaleString()}\n`;
        result += `• Severity: ${
          Math.abs(balanceCheck.difference) > 1000000
            ? "CRITICAL"
            : Math.abs(balanceCheck.difference) > 10000
            ? "HIGH"
            : "LOW"
        }\n\n`;

        result += `🎯 PRIMARY ISSUE IDENTIFIED:\n`;
        const futureFund = trialBalance.trialBalance.equity.find((acc) =>
          acc.name.toLowerCase().includes("future fund")
        );

        if (futureFund) {
          result += `• Future Fund Charitable Payment Reserve: $${futureFund.balance.toLocaleString()}\n`;
          result += `• This single account represents ${(
            (futureFund.balance / Math.abs(balanceCheck.difference)) *
            100
          ).toFixed(1)}% of the imbalance\n\n`;

          result += `🔬 ROOT CAUSE ANALYSIS:\n`;
          result += `The $${futureFund.balance.toLocaleString()} Future Fund entry appears to be the primary cause.\n`;
          result += `This suggests either:\n`;
          result += `1. A manual journal entry that wasn't properly balanced\n`;
          result += `2. A data migration error during system setup\n`;
          result += `3. An incomplete transaction or suspended entry\n\n`;

          result += `💡 INVESTIGATION RECOMMENDATIONS:\n`;
          result += `1. Review journal entries containing "Future Fund" account\n`;
          result += `2. Check if there's a corresponding asset that should balance this equity\n`;
          result += `3. Verify with Financial Controller Matt about the purpose of this account\n`;
          result += `4. Look for any matching debit entries that may have been posted to wrong accounts\n\n`;
        } else {
          result += `• No obvious single account causing the imbalance\n`;
          result += `• The imbalance may be spread across multiple accounts\n\n`;
        }

        result += `⚠️ BUSINESS IMPACT:\n`;
        result += `• Financial statements will not balance\n`;
        result += `• Audit/review procedures will flag this as a material issue\n`;
        result += `• Management reporting may be unreliable\n`;
        result += `• Compliance with accounting standards may be compromised\n\n`;

        result += `🚀 NEXT STEPS:\n`;
        result += `1. Implement additional MCP tools for transaction-level analysis\n`;
        result += `2. Consult with Financial Controller Matt about the Future Fund account\n`;
        result += `3. Prepare correcting journal entries once root cause is identified\n`;
        result += `4. Establish controls to prevent similar issues in the future\n`;
      } else {
        result += `• Books are properly balanced - no investigation needed\n`;
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "compare_periods") {
      const { tenantId, organizationName, fromDate, toDate, accountFilter } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `📊 PERIOD COMPARISON ANALYSIS\n\n` +
              `Organization: ${organizationName || actualTenantId}\n` +
              `From Date: ${fromDate}\n` +
              `To Date: ${toDate || "Today"}\n` +
              `Account Filter: ${accountFilter || "All accounts"}\n\n` +
              `❌ This requires additional Railway endpoint implementation.\n\n` +
              `PURPOSE: Identify when the $29.5M imbalance was introduced\n\n` +
              `This analysis would compare trial balances between periods to:\n` +
              `• Show balance changes for each account\n` +
              `• Identify the period when imbalances first appeared\n` +
              `• Highlight accounts with unusual movement patterns\n` +
              `• Track the Future Fund account creation/modification dates\n\n` +
              `STRATEGY: Run monthly comparisons to pinpoint when\n` +
              `the Future Fund Charitable Payment Reserve was created.\n\n` +
              `Implementation: /api/compare-periods/${actualTenantId}\n` +
              `Would retrieve trial balances for multiple dates and compare`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${error.message}`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
