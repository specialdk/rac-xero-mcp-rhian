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
const RAILWAY_API_BASE = process.env.RAILWAY_API_URL || 'https://rac-financial-dashboard-production.up.railway.app';

// Helper function to call Railway APIs
async function callRailwayAPI(endpoint) {
  try {
    const url = `${RAILWAY_API_BASE}${endpoint}`;
    console.error(`🌐 Calling Railway API: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Railway API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.error(`✅ Railway API response received: ${JSON.stringify(data).substring(0, 200)}...`);
    
    return data;
  } catch (error) {
    console.error(`❌ Railway API call failed: ${error.message}`);
    throw error;
  }
}

// Helper function to get tenant ID from organization name
async function getTenantIdFromName(organizationName) {
  const connections = await callRailwayAPI('/api/connection-status');
  
  const matchingConnection = connections.find(conn => 
    conn.tenantName.toLowerCase().includes(organizationName.toLowerCase()) ||
    organizationName.toLowerCase().includes(conn.tenantName.toLowerCase())
  );
  
  if (!matchingConnection) {
    throw new Error(`No connected organization found matching: ${organizationName}`);
  }
  
  if (!matchingConnection.connected) {
    throw new Error(`Organization ${matchingConnection.tenantName} is not currently connected (token expired)`);
  }
  
  return matchingConnection.tenantId;
}

const server = new Server(
  {
    name: "rac-xero-api",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Enhanced tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "test_rac_connection",
        description: "Test if RAC Xero MCP server can connect to Railway APIs",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_organizations",
        description: "Get list of connected Xero organizations from Railway system",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_trial_balance",
        description: "Get trial balance for a specific Xero organization",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description: "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name (e.g., 'Mining' or 'Rirratjingu Mining') - will find matching tenant",
            },
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM-DD format (optional, defaults to today)",
            },
          },
        },
      },
      {
        name: "get_cash_position",
        description: "Get cash position and bank account balances for a Xero organization",
        inputSchema: {
          type: "object",
          properties: {
            tenantId: {
              type: "string",
              description: "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string", 
              description: "Organization name (e.g., 'Mining') - will find matching tenant",
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
              description: "Xero tenant ID (optional if organizationName provided)",
            },
            organizationName: {
              type: "string",
              description: "Organization name (e.g., 'Mining') - will find matching tenant",
            },
          },
        },
      },
      {
        name: "get_consolidated_trial_balance", 
        description: "Get consolidated trial balance across all connected RAC entities",
        inputSchema: {
          type: "object",
          properties: {
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM-DD format (optional, defaults to today)",
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
    if (name === "test_rac_connection") {
      // Test Railway API connection
      const healthCheck = await callRailwayAPI('/api/health');
      const connections = await callRailwayAPI('/api/connection-status');

      return {
        content: [
          {
            type: "text",
            text: `✅ SUCCESS! RAC Xero MCP server connected to Railway APIs!\n\nRailway System: ${healthCheck.status}\nDatabase: ${healthCheck.database}\nXero Connections: ${connections.length} found\nActive Connections: ${connections.filter(c => c.connected).length}\n\nConnected Organizations:\n${connections.filter(c => c.connected).map(c => `• ${c.tenantName}`).join('\n')}\n\nExpired Connections:\n${connections.filter(c => !c.connected).map(c => `• ${c.tenantName} (${c.error})`).join('\n')}`,
          },
        ],
      };
    }

    if (name === "get_organizations") {
      const connections = await callRailwayAPI('/api/connection-status');

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

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }

    if (name === "get_trial_balance") {
      const { tenantId, organizationName, reportDate } = args;
      
      let actualTenantId = tenantId;
      
      // If no tenantId provided, try to find it from organization name
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

      const dateParam = reportDate ? `?date=${reportDate}` : '';
      const trialBalanceData = await callRailwayAPI(`/api/trial-balance/${actualTenantId}${dateParam}`);

      const tb = trialBalanceData.trialBalance;
      const totals = tb.totals;
      const balanceCheck = trialBalanceData.balanceCheck;

      let result = `📋 TRIAL BALANCE - ${trialBalanceData.tenantName}\n`;
      result += `📅 Report Date: ${trialBalanceData.reportDate}\n\n`;

      // Balance status
      result += `⚖️ BALANCE STATUS: ${balanceCheck.debitsEqualCredits ? '✅ BALANCED' : '❌ OUT OF BALANCE'}\n`;
      if (!balanceCheck.debitsEqualCredits) {
        result += `   Difference: $${balanceCheck.difference.toLocaleString()}\n`;
      }
      result += `   Total Debits: $${totals.totalDebits.toLocaleString()}\n`;
      result += `   Total Credits: $${totals.totalCredits.toLocaleString()}\n\n`;

      // Financial summary
      result += `💰 FINANCIAL SUMMARY:\n`;
      result += `• Total Assets: $${totals.totalAssets.toLocaleString()}\n`;
      result += `• Total Liabilities: $${totals.totalLiabilities.toLocaleString()}\n`;
      result += `• Total Equity: $${totals.totalEquity.toLocaleString()}\n\n`;

      // Account details
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

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
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

      const cashData = await callRailwayAPI(`/api/cash-position/${actualTenantId}`);

      let result = `💰 CASH POSITION\n\n`;
      result += `Total Cash: $${cashData.totalCash.toLocaleString()}\n\n`;

      if (cashData.bankAccounts.length > 0) {
        result += `🏦 BANK ACCOUNTS (${cashData.bankAccounts.length}):\n`;
        cashData.bankAccounts.forEach((account) => {
          result += `• ${account.name} (${account.code}): $${account.balance.toLocaleString()}\n`;
        });
      } else {
        result += "No bank accounts found.\n";
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
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

      const invoices = await callRailwayAPI(`/api/outstanding-invoices/${actualTenantId}`);

      let result = `📄 OUTSTANDING INVOICES\n\n`;

      if (invoices.length === 0) {
        result += "No outstanding invoices found.\n";
      } else {
        const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
        result += `Total Outstanding: $${totalOutstanding.toLocaleString()}\n`;
        result += `Number of Invoices: ${invoices.length}\n\n`;

        invoices.forEach((inv) => {
          result += `• Invoice ${inv.invoiceNumber}\n`;
          result += `  Customer: ${inv.contact}\n`;
          result += `  Amount Due: $${inv.amountDue.toLocaleString()}\n`;
          result += `  Due Date: ${inv.dueDate}\n\n`;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    }

    if (name === "get_consolidated_trial_balance") {
      const { reportDate } = args;
      const dateParam = reportDate ? `?date=${reportDate}` : '';
      
      const consolidatedData = await callRailwayAPI(`/api/consolidated-trial-balance${dateParam}`);

      const totals = consolidatedData.consolidated.totals;
      const balanceCheck = consolidatedData.consolidated.balanceCheck;
      const summary = consolidatedData.summary;

      let result = `📊 RAC CONSOLIDATED TRIAL BALANCE\n`;
      result += `📅 Report Date: ${consolidatedData.reportDate}\n`;
      result += `🏢 Entities: ${consolidatedData.companies.length} companies\n\n`;

      // Overall balance status
      result += `⚖️ CONSOLIDATED BALANCE: ${balanceCheck.debitsEqualCredits ? '✅ BALANCED' : '❌ OUT OF BALANCE'}\n`;
      if (!balanceCheck.debitsEqualCredits) {
        result += `   Difference: $${balanceCheck.difference.toLocaleString()}\n`;
      }
      result += `   Total Debits: $${totals.totalDebits.toLocaleString()}\n`;
      result += `   Total Credits: $${totals.totalCredits.toLocaleString()}\n\n`;

      // Portfolio summary
      result += `💼 RAC PORTFOLIO SUMMARY:\n`;
      result += `• Total Assets: $${totals.totalAssets.toLocaleString()}\n`;
      result += `• Total Liabilities: $${totals.totalLiabilities.toLocaleString()}\n`;
      result += `• Total Equity: $${totals.totalEquity.toLocaleString()}\n`;
      result += `• Net Worth: $${(totals.totalAssets - totals.totalLiabilities).toLocaleString()}\n\n`;

      // Company breakdown
      result += `🏢 COMPANY BREAKDOWN:\n`;
      consolidatedData.companies.forEach((company) => {
        result += `\n• ${company.tenantName}\n`;
        result += `  Assets: $${company.totals.totalAssets.toLocaleString()}\n`;
        result += `  Liabilities: $${company.totals.totalLiabilities.toLocaleString()}\n`;
        result += `  Equity: $${company.totals.totalEquity.toLocaleString()}\n`;
        result += `  Accounts: ${company.accountCounts.totalAccounts}\n`;
        result += `  Status: ${company.balanceCheck.debitsEqualCredits ? '✅ Balanced' : '❌ Imbalanced'}\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
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