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
      {
        name: "get_profit_loss_summary",
        description: "Get profit & loss summary for a specific organization",
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
            date: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
            periodMonths: {
              type: "number",
              description: "Number of months to analyze (default 12)",
            },
          },
        },
      },
      {
        name: "get_aged_receivables",
        description:
          "Get aged receivables analysis showing customer payment aging",
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
            date: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },
      {
        name: "analyze_expense_categories",
        description: "Analyze expense breakdown and trends by category",
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
            date: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
            periodMonths: {
              type: "number",
              description: "Number of months to analyze (default 12)",
            },
          },
        },
      },
      {
        name: "get_intercompany_transactions",
        description:
          "Analyze intercompany transactions and balances between RAC entities",
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
            date: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },
      {
        name: "get_financial_ratios",
        description: "Calculate key financial ratios for performance analysis",
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
            date: {
              type: "string",
              description:
                "Report date in YYYY-MM-DD format (optional, defaults to today)",
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

    // FIXED ANALYTICAL TOOLS - Replace lines 696-1051 with this code

    if (name === "get_journal_entries") {
      const { tenantId, organizationName, dateFrom, dateTo, accountName } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // Build query parameters
      let queryParams = "";
      if (dateFrom || dateTo || accountName) {
        const params = new URLSearchParams();
        if (dateFrom) params.append("dateFrom", dateFrom);
        if (dateTo) params.append("dateTo", dateTo);
        if (accountName) params.append("accountName", accountName);
        queryParams = "?" + params.toString();
      }

      // Call your actual Railway endpoint
      const journalData = await callRailwayAPI(
        `/api/journal-entries/${actualTenantId}${queryParams}`
      );

      let result = `📝 JOURNAL ENTRIES ANALYSIS\n\n`;
      result += `Organization: ${journalData.tenantName}\n`;
      result += `Date Range: ${journalData.dateFrom} to ${journalData.dateTo}\n`;
      result += `Total Journals: ${journalData.totalJournals}\n`;
      result += `Suspicious Journals: ${journalData.suspiciousJournals}\n`;
      result += `Unbalanced Journals: ${journalData.unbalancedJournals}\n\n`;

      if (journalData.journals && journalData.journals.length > 0) {
        result += `🚨 SUSPICIOUS ENTRIES:\n`;
        journalData.journals
          .filter((j) => j.isSuspicious)
          .slice(0, 10)
          .forEach((journal) => {
            result += `\n• Journal #${journal.journalNumber} (${journal.date})\n`;
            result += `  Reference: ${journal.reference || "None"}\n`;
            result += `  Status: ${journal.status}\n`;
            result += `  Amount: $${Math.max(
              journal.totalDebits,
              journal.totalCredits
            ).toLocaleString()}\n`;
            if (!journal.isBalanced) {
              result += `  ❌ UNBALANCED by $${Math.abs(
                journal.imbalanceAmount
              ).toLocaleString()}\n`;
            }
            if (journal.flags && journal.flags.affectsFutureFund) {
              result += `  🎯 AFFECTS FUTURE FUND\n`;
            }
          });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "analyze_equity_movements") {
      const { tenantId, organizationName, equityAccountName, monthsBack } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (equityAccountName)
        params.append("equityAccountName", equityAccountName);
      if (monthsBack) params.append("monthsBack", monthsBack.toString());
      const queryParams = params.toString() ? "?" + params.toString() : "";

      // Call your actual Railway endpoint
      const equityData = await callRailwayAPI(
        `/api/equity-analysis/${actualTenantId}${queryParams}`
      );

      let result = `📈 EQUITY MOVEMENTS ANALYSIS\n\n`;
      result += `Organization: ${equityData.tenantName}\n`;
      result += `Search Term: ${equityData.searchTerm}\n`;
      result += `Period: ${equityData.monthsAnalyzed} months\n`;
      result += `Accounts Found: ${equityData.accountsFound}\n\n`;

      if (equityData.accounts && equityData.accounts.length > 0) {
        equityData.accounts.forEach((account) => {
          result += `💰 ${account.accountName} (${account.accountCode})\n`;
          result += `  Current Balance: $${
            account.currentBalance?.toLocaleString() || 0
          }\n`;
          result += `  Transaction Count: ${account.transactionCount || 0}\n`;
          if (account.totalMovements) {
            result += `  Total Movements: $${account.totalMovements.toLocaleString()}\n`;
          }
          if (account.transactions && account.transactions.length > 0) {
            result += `  Recent Transactions:\n`;
            account.transactions.slice(0, 5).forEach((trans) => {
              result += `    • ${trans.date}: ${
                trans.reference || "No reference"
              }\n`;
              trans.relevantLines.forEach((line) => {
                result += `      ${
                  line.description
                }: $${line.lineAmount.toLocaleString()}\n`;
              });
            });
          }
          if (account.error) {
            result += `  ❌ Error: ${account.error}\n`;
          }
          result += `\n`;
        });
      } else {
        result += `No equity accounts found matching "${equityData.searchTerm}"\n`;
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_account_history") {
      const { tenantId, organizationName, accountName, dateFrom, dateTo } =
        args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      const queryParams = params.toString() ? "?" + params.toString() : "";

      // Call your actual Railway endpoint
      const accountData = await callRailwayAPI(
        `/api/account-history/${actualTenantId}/${encodeURIComponent(
          accountName
        )}${queryParams}`
      );

      let result = `📚 ACCOUNT HISTORY ANALYSIS\n\n`;
      result += `Organization: ${accountData.tenantName}\n`;
      result += `Account: ${accountData.account.accountName} (${accountData.account.accountCode})\n`;
      result += `Account Type: ${accountData.account.accountType}\n`;
      result += `Current Balance: $${accountData.account.currentBalance.toLocaleString()}\n`;
      result += `Period: ${accountData.dateFrom} to ${accountData.dateTo}\n`;
      result += `Transaction Count: ${accountData.transactionCount}\n`;
      result += `Total Movement: $${accountData.totalMovement.toLocaleString()}\n\n`;

      if (accountData.transactions && accountData.transactions.length > 0) {
        result += `📋 TRANSACTION HISTORY:\n`;
        accountData.transactions.slice(0, 20).forEach((trans) => {
          result += `\n• ${trans.date} - Journal #${trans.journalNumber}\n`;
          result += `  Reference: ${trans.reference || "None"}\n`;
          result += `  Net Amount: $${trans.netAmount.toLocaleString()}\n`;
          result += `  Status: ${trans.status}\n`;
          if (trans.description) {
            result += `  Description: ${trans.description}\n`;
          }
          trans.relevantLines.forEach((line) => {
            result += `    ${
              line.description
            }: $${line.lineAmount.toLocaleString()}\n`;
          });
        });

        if (accountData.transactions.length > 20) {
          result += `\n... and ${
            accountData.transactions.length - 20
          } more transactions\n`;
        }
      } else {
        result += `No transactions found for this account in the specified period.\n`;
      }

      return { content: [{ type: "text", text: result }] };
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

      // Build query parameters
      const params = new URLSearchParams();
      if (minimumAmount)
        params.append("minimumAmount", minimumAmount.toString());
      if (dateRange) params.append("dateRange", dateRange);
      const queryParams = params.toString() ? "?" + params.toString() : "";

      // Call your actual Railway endpoint
      const unbalancedData = await callRailwayAPI(
        `/api/find-unbalanced/${actualTenantId}${queryParams}`
      );

      let result = `🔍 UNBALANCED TRANSACTIONS ANALYSIS\n\n`;
      result += `Organization: ${unbalancedData.tenantName}\n`;
      result += `Minimum Amount: $${unbalancedData.criteria.minimumAmount.toLocaleString()}\n`;
      result += `Date Range: ${unbalancedData.criteria.dateRange} (from ${unbalancedData.criteria.startDate})\n\n`;

      result += `📊 SUMMARY:\n`;
      result += `• Total Journals Analyzed: ${unbalancedData.summary.totalJournalsAnalyzed}\n`;
      result += `• Unbalanced Found: ${unbalancedData.summary.unbalancedFound}\n`;
      result += `• Large Amount Found: ${unbalancedData.summary.largeAmountFound}\n`;
      result += `• Critical Issues: ${unbalancedData.summary.criticalIssues}\n`;
      result += `• Future Fund Related: ${unbalancedData.summary.futureFundRelated}\n\n`;

      if (
        unbalancedData.transactions &&
        unbalancedData.transactions.length > 0
      ) {
        result += `🚨 PROBLEMATIC TRANSACTIONS:\n`;
        unbalancedData.transactions.slice(0, 15).forEach((trans) => {
          result += `\n• Journal #${trans.journalNumber} (${trans.date})\n`;
          result += `  Reference: ${trans.reference || "None"}\n`;
          result += `  Status: ${trans.status}\n`;
          result += `  Severity: ${trans.severity}\n`;
          result += `  Debits: $${trans.totalDebits.toLocaleString()}\n`;
          result += `  Credits: $${trans.totalCredits.toLocaleString()}\n`;

          if (trans.isUnbalanced) {
            result += `  ❌ IMBALANCE: $${Math.abs(
              trans.imbalanceAmount
            ).toLocaleString()}\n`;
          }

          if (trans.flags) {
            const flags = [];
            if (trans.flags.largeAmount) flags.push("LARGE AMOUNT");
            if (trans.flags.unbalanced) flags.push("UNBALANCED");
            if (trans.flags.singleSided) flags.push("SINGLE-SIDED");
            if (trans.flags.affectsFutureFund) flags.push("FUTURE FUND");
            if (flags.length > 0) {
              result += `  🚩 FLAGS: ${flags.join(", ")}\n`;
            }
          }

          // Show account lines for Future Fund related entries
          if (trans.flags && trans.flags.affectsFutureFund) {
            result += `  📝 ACCOUNT LINES:\n`;
            trans.journalLines.forEach((line) => {
              result += `    ${
                line.accountName
              }: $${line.lineAmount.toLocaleString()}\n`;
            });
          }
        });
      } else {
        result += `No unbalanced transactions found matching the criteria.\n`;
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_chart_of_accounts") {
      const { tenantId, organizationName, accountType, includeArchived } = args;

      let actualTenantId = tenantId;
      if (!actualTenantId && organizationName) {
        actualTenantId = await getTenantIdFromName(organizationName);
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (accountType) params.append("accountType", accountType);
      if (includeArchived)
        params.append("includeArchived", includeArchived.toString());
      const queryParams = params.toString() ? "?" + params.toString() : "";

      // Call your actual Railway endpoint
      const chartData = await callRailwayAPI(
        `/api/chart-of-accounts/${actualTenantId}${queryParams}`
      );

      let result = `📋 CHART OF ACCOUNTS ANALYSIS\n\n`;
      result += `Organization: ${chartData.tenantName}\n`;
      result += `Filter: ${chartData.filters.accountType}\n`;
      result += `Include Archived: ${chartData.filters.includeArchived}\n\n`;

      result += `📊 SUMMARY:\n`;
      result += `• Total Accounts: ${chartData.summary.totalAccounts}\n`;
      result += `• Active Accounts: ${chartData.summary.activeAccounts}\n`;
      result += `• Archived Accounts: ${chartData.summary.archivedAccounts}\n`;
      result += `• Large Balance Accounts: ${chartData.summary.largeBalanceAccounts}\n`;
      result += `• Unusual Equity Accounts: ${chartData.summary.unusualEquityAccounts}\n\n`;

      result += `📈 ACCOUNTS BY TYPE:\n`;
      Object.entries(chartData.summary.accountsByType).forEach(
        ([type, count]) => {
          result += `• ${type}: ${count}\n`;
        }
      );
      result += `\n`;

      if (chartData.flaggedAccounts && chartData.flaggedAccounts.length > 0) {
        result += `🚩 FLAGGED ACCOUNTS:\n`;
        chartData.flaggedAccounts.forEach((account) => {
          result += `\n• ${account.name} (${account.code})\n`;
          result += `  Type: ${account.type}\n`;
          result += `  Balance: $${account.currentBalance.toLocaleString()}\n`;
          result += `  Status: ${account.status}\n`;

          const flags = [];
          if (account.flags.largeBalance) flags.push("LARGE BALANCE");
          if (account.flags.unusualEquity) flags.push("UNUSUAL EQUITY");
          if (account.flags.negativeAsset) flags.push("NEGATIVE ASSET");
          if (account.flags.positiveExpense) flags.push("POSITIVE EXPENSE");

          if (flags.length > 0) {
            result += `  🚩 FLAGS: ${flags.join(", ")}\n`;
          }

          if (account.description) {
            result += `  Description: ${account.description}\n`;
          }
        });
      }

      return { content: [{ type: "text", text: result }] };
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
          result += `1. Use get_journal_entries to find entries affecting Future Fund\n`;
          result += `2. Use analyze_equity_movements to track when this account was created\n`;
          result += `3. Use find_unbalanced_transactions to identify the problematic entry\n`;
          result += `4. Use get_account_history for detailed Future Fund transaction history\n\n`;
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
        result += `1. Run: get_journal_entries with accountName "Future Fund"\n`;
        result += `2. Run: find_unbalanced_transactions with minimumAmount 1000000\n`;
        result += `3. Run: get_account_history for "Future Fund Charitable Payment Reserve"\n`;
        result += `4. Consult with Financial Controller about findings\n`;
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

      // Build query parameters
      const params = new URLSearchParams();
      params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);
      if (accountFilter) params.append("accountFilter", accountFilter);
      const queryParams = "?" + params.toString();

      // Call your actual Railway endpoint
      const comparisonData = await callRailwayAPI(
        `/api/compare-periods/${actualTenantId}${queryParams}`
      );

      let result = `📊 PERIOD COMPARISON ANALYSIS\n\n`;
      result += `Organization: ${comparisonData.tenantName}\n`;
      result += `From Date: ${comparisonData.fromDate}\n`;
      result += `To Date: ${comparisonData.toDate}\n\n`;

      result += `📈 PERIOD COMPARISON:\n`;
      result += `FROM PERIOD (${comparisonData.fromDate}):\n`;
      result += `• Assets: $${comparisonData.fromPeriod.totalAssets.toLocaleString()}\n`;
      result += `• Liabilities: $${comparisonData.fromPeriod.totalLiabilities.toLocaleString()}\n`;
      result += `• Equity: $${comparisonData.fromPeriod.totalEquity.toLocaleString()}\n`;
      result += `• Balanced: ${
        comparisonData.fromPeriod.balanced ? "YES" : "NO"
      }\n\n`;

      result += `TO PERIOD (${comparisonData.toDate}):\n`;
      result += `• Assets: $${comparisonData.toPeriod.totalAssets.toLocaleString()}\n`;
      result += `• Liabilities: $${comparisonData.toPeriod.totalLiabilities.toLocaleString()}\n`;
      result += `• Equity: $${comparisonData.toPeriod.totalEquity.toLocaleString()}\n`;
      result += `• Balanced: ${
        comparisonData.toPeriod.balanced ? "YES" : "NO"
      }\n\n`;

      result += `📊 CHANGES:\n`;
      result += `• Assets Change: $${comparisonData.changes.assetsChange.toLocaleString()}\n`;
      result += `• Liabilities Change: $${comparisonData.changes.liabilitiesChange.toLocaleString()}\n`;
      result += `• Equity Change: $${comparisonData.changes.equityChange.toLocaleString()}\n`;

      if (comparisonData.changes.balanceStatusChange) {
        result += `• ⚠️ BALANCE STATUS CHANGED!\n`;
      }
      result += `\n`;

      if (
        comparisonData.significantChanges &&
        comparisonData.significantChanges.length > 0
      ) {
        result += `🚨 SIGNIFICANT ACCOUNT CHANGES (>$100k):\n`;
        comparisonData.significantChanges.forEach((change) => {
          result += `\n• ${change.accountName}\n`;
          result += `  From: $${change.fromBalance.toLocaleString()}\n`;
          result += `  To: $${change.toBalance.toLocaleString()}\n`;
          result += `  Change: $${change.change.toLocaleString()} (${
            change.changeType
          })\n`;
        });
      }

      if (
        comparisonData.accountChanges &&
        comparisonData.accountChanges.length >
          comparisonData.significantChanges.length
      ) {
        result += `\n📋 ALL ACCOUNT CHANGES:\n`;
        comparisonData.accountChanges.slice(0, 20).forEach((change) => {
          result += `• ${
            change.accountName
          }: $${change.change.toLocaleString()} (${change.changeType})\n`;
        });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_profit_loss_summary") {
      const { tenantId, organizationName, date, periodMonths } = args;

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

      // Build query parameters
      const params = new URLSearchParams();
      if (date) params.append("date", date);
      if (periodMonths) params.append("periodMonths", periodMonths.toString());
      const queryParams = params.toString() ? "?" + params.toString() : "";

      const plData = await callRailwayAPI(
        `/api/profit-loss/${actualTenantId}${queryParams}`
      );

      let result = `📈 PROFIT & LOSS SUMMARY\n\n`;
      result += `Organization: ${plData.tenantName}\n`;
      result += `Period: ${plData.period.from} to ${plData.period.to} (${plData.period.months} months)\n\n`;

      result += `💰 FINANCIAL PERFORMANCE:\n`;
      result += `• Total Revenue: $${plData.summary.totalRevenue.toLocaleString()}\n`;
      result += `• Total Expenses: $${plData.summary.totalExpenses.toLocaleString()}\n`;
      result += `• Net Profit: $${plData.summary.netProfit.toLocaleString()}\n`;
      result += `• Profit Margin: ${(
        (plData.summary.netProfit / plData.summary.totalRevenue) *
        100
      ).toFixed(1)}%\n\n`;

      if (plData.summary.revenueAccounts.length > 0) {
        result += `📊 TOP REVENUE SOURCES:\n`;
        plData.summary.revenueAccounts.slice(0, 5).forEach((account) => {
          result += `• ${account.name}: $${account.amount.toLocaleString()}\n`;
        });
        result += `\n`;
      }

      if (plData.summary.expenseAccounts.length > 0) {
        result += `💳 TOP EXPENSES:\n`;
        plData.summary.expenseAccounts.slice(0, 5).forEach((account) => {
          result += `• ${account.name}: $${account.amount.toLocaleString()}\n`;
        });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_aged_receivables") {
      const { tenantId, organizationName, date } = args;

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

      const params = new URLSearchParams();
      if (date) params.append("date", date);
      const queryParams = params.toString() ? "?" + params.toString() : "";

      const agedData = await callRailwayAPI(
        `/api/aged-receivables/${actualTenantId}${queryParams}`
      );

      let result = `📅 AGED RECEIVABLES ANALYSIS\n\n`;
      result += `Organization: ${agedData.tenantName}\n`;
      result += `Report Date: ${agedData.reportDate}\n`;
      result += `Total Outstanding: $${agedData.summary.totalOutstanding.toLocaleString()}\n\n`;

      result += `⏰ AGING BREAKDOWN:\n`;
      result += `• Current: $${agedData.summary.current.toLocaleString()}\n`;
      result += `• 1-30 days: $${agedData.summary.days1to30.toLocaleString()}\n`;
      result += `• 31-60 days: $${agedData.summary.days31to60.toLocaleString()}\n`;
      result += `• 61-90 days: $${agedData.summary.days61to90.toLocaleString()}\n`;
      result += `• Over 90 days: $${agedData.summary.over90days.toLocaleString()}\n\n`;

      result += `🚨 RISK ANALYSIS:\n`;
      result += `• High Risk Customers: ${agedData.riskAnalysis.highRiskCustomers}\n`;
      result += `• Over 90 Days %: ${agedData.riskAnalysis.over90DaysPercentage}%\n\n`;

      if (agedData.summary.contactBreakdown.length > 0) {
        result += `👥 TOP OUTSTANDING CUSTOMERS:\n`;
        agedData.summary.contactBreakdown.slice(0, 10).forEach((contact) => {
          result += `\n• ${contact.contactName} (${contact.riskLevel} risk)\n`;
          result += `  Total: $${contact.total.toLocaleString()}\n`;
          result += `  Current: $${contact.current.toLocaleString()}\n`;
          result += `  Over 90 days: $${contact.over90days.toLocaleString()}\n`;
        });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "analyze_expense_categories") {
      const { tenantId, organizationName, date, periodMonths } = args;

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

      const params = new URLSearchParams();
      if (date) params.append("date", date);
      if (periodMonths) params.append("periodMonths", periodMonths.toString());
      const queryParams = params.toString() ? "?" + params.toString() : "";

      const expenseData = await callRailwayAPI(
        `/api/expense-analysis/${actualTenantId}${queryParams}`
      );

      let result = `💳 EXPENSE CATEGORY ANALYSIS\n\n`;
      result += `Organization: ${expenseData.tenantName}\n`;
      result += `Period: ${expenseData.period.from} to ${expenseData.period.to} (${expenseData.period.months} months)\n`;
      result += `Total Expenses: $${expenseData.analysis.totalExpenses.toLocaleString()}\n`;
      result += `Monthly Average: $${expenseData.analysis.monthlyAverage.toLocaleString()}\n\n`;

      if (expenseData.analysis.categoryBreakdown) {
        result += `📊 EXPENSE BY CATEGORY:\n`;
        expenseData.analysis.categoryBreakdown.forEach((category) => {
          result += `• ${
            category.category
          }: $${category.total.toLocaleString()} (${category.percentage}%)\n`;
        });
        result += `\n`;
      }

      if (expenseData.analysis.topExpenses.length > 0) {
        result += `🔝 TOP EXPENSE ACCOUNTS:\n`;
        expenseData.analysis.topExpenses
          .slice(0, 10)
          .forEach((expense, index) => {
            result += `${index + 1}. ${
              expense.accountName
            }: $${expense.amount.toLocaleString()}\n`;
            result += `   Category: ${
              expense.category
            } | Monthly: $${expense.monthlyAverage.toLocaleString()}\n`;
          });
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_intercompany_transactions") {
      const { tenantId, organizationName, date } = args;

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

      const params = new URLSearchParams();
      if (date) params.append("date", date);
      const queryParams = params.toString() ? "?" + params.toString() : "";

      const intercompanyData = await callRailwayAPI(
        `/api/intercompany/${actualTenantId}${queryParams}`
      );

      let result = `🏢 INTERCOMPANY TRANSACTION ANALYSIS\n\n`;
      result += `Organization: ${intercompanyData.tenantName}\n`;
      result += `Report Date: ${intercompanyData.reportDate}\n`;
      result += `Intercompany Accounts Found: ${intercompanyData.analysis.accountCount}\n\n`;

      result += `💰 INTERCOMPANY BALANCES:\n`;
      result += `• Total IC Assets: $${intercompanyData.analysis.totalIntercompanyAssets.toLocaleString()}\n`;
      result += `• Total IC Liabilities: $${intercompanyData.analysis.totalIntercompanyLiabilities.toLocaleString()}\n`;
      result += `• Net Position: $${(
        intercompanyData.analysis.totalIntercompanyAssets -
        intercompanyData.analysis.totalIntercompanyLiabilities
      ).toLocaleString()}\n\n`;

      if (intercompanyData.analysis.accounts.length > 0) {
        result += `📋 INTERCOMPANY ACCOUNTS:\n`;
        intercompanyData.analysis.accounts.forEach((account) => {
          result += `\n• ${account.accountName}\n`;
          result += `  Balance: $${account.balance.toLocaleString()}\n`;
          result += `  Section: ${account.section}\n`;
          result += `  Related Entity: ${account.relatedEntity || "Unknown"}\n`;
        });
      } else {
        result += `No intercompany accounts found.\n`;
      }

      return { content: [{ type: "text", text: result }] };
    }

    if (name === "get_financial_ratios") {
      const { tenantId, organizationName, date } = args;

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

      const params = new URLSearchParams();
      if (date) params.append("date", date);
      const queryParams = params.toString() ? "?" + params.toString() : "";

      const ratiosData = await callRailwayAPI(
        `/api/financial-ratios/${actualTenantId}${queryParams}`
      );

      let result = `📊 FINANCIAL RATIOS ANALYSIS\n\n`;
      result += `Organization: ${ratiosData.tenantName}\n`;
      result += `Report Date: ${ratiosData.reportDate}\n\n`;

      result += `💧 LIQUIDITY RATIOS:\n`;
      result += `• Current Ratio: ${ratiosData.ratios.liquidity.currentRatio.toFixed(
        2
      )} (${ratiosData.interpretations.currentRatio})\n`;
      result += `• Working Capital: $${ratiosData.ratios.liquidity.workingCapital.toLocaleString()}\n\n`;

      result += `⚖️ LEVERAGE RATIOS:\n`;
      result += `• Debt-to-Equity: ${ratiosData.ratios.leverage.debtToEquity.toFixed(
        2
      )} (${ratiosData.interpretations.debtToEquity})\n`;
      result += `• Equity Ratio: ${(
        ratiosData.ratios.leverage.equityRatio * 100
      ).toFixed(1)}%\n\n`;

      result += `💰 PROFITABILITY RATIOS:\n`;
      result += `• Net Profit Margin: ${ratiosData.ratios.profitability.netProfitMargin.toFixed(
        1
      )}% (${ratiosData.interpretations.profitability})\n`;
      result += `• Return on Assets: ${ratiosData.ratios.profitability.returnOnAssets.toFixed(
        1
      )}%\n`;
      result += `• Return on Equity: ${ratiosData.ratios.profitability.returnOnEquity.toFixed(
        1
      )}%\n\n`;

      result += `⚡ EFFICIENCY RATIOS:\n`;
      result += `• Asset Turnover: ${ratiosData.ratios.efficiency.assetTurnover.toFixed(
        2
      )}\n`;
      result += `• Expense Ratio: ${ratiosData.ratios.efficiency.expenseRatio.toFixed(
        1
      )}%\n\n`;

      result += `📈 DATA SUMMARY:\n`;
      result += `• Total Assets: $${ratiosData.dataSource.totalAssets.toLocaleString()}\n`;
      result += `• Total Liabilities: $${ratiosData.dataSource.totalLiabilities.toLocaleString()}\n`;
      result += `• Total Equity: $${ratiosData.dataSource.totalEquity.toLocaleString()}\n`;
      result += `• Revenue: $${ratiosData.dataSource.totalRevenue.toLocaleString()}\n`;
      result += `• Net Profit: $${ratiosData.dataSource.netProfit.toLocaleString()}\n`;

      return { content: [{ type: "text", text: result }] };
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
