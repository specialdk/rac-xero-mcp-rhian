# RAC Xero MCP Server

A Model Context Protocol (MCP) server for integrating RAC Xero financial data with Claude Desktop and other MCP-compatible applications.

## Features

- **Trial Balance Analysis**: Get detailed trial balance reports with date support
- **Financial Analytics**: Cash position, outstanding invoices, P&L summaries
- **Journal Entry Investigation**: Analyze manual journal entries and suspicious transactions
- **Equity Movement Analysis**: Track movements in equity accounts like Future Fund
- **Multi-Entity Support**: Consolidated reporting across all RAC organizations
- **Bank Reconciliation**: Compare trial balance vs bank feeds
- **Financial Ratios**: Calculate key performance ratios
- **Expense Analysis**: Categorize and analyze expense patterns

## Installation

### Option 1: NPM Package (Recommended)

```bash
npm install -g @rac/xero-mcp
```

### Option 2: Local Development

```bash
git clone https://github.com/rac/xero-mcp.git
cd xero-mcp
npm install
npm run build
```

## Configuration

### 1. Environment Variables

Create a `.env` file or set environment variables:

```bash
RAILWAY_API_URL=https://your-rac-api-deployment.up.railway.app
```

### 2. Claude Desktop Configuration

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rac-xero": {
      "command": "rac-xero-mcp",
      "env": {
        "RAILWAY_API_URL": "https://your-rac-api-deployment.up.railway.app"
      }
    }
  }
}
```

### 3. Local Development Configuration

For local development, use the full path:

```json
{
  "mcpServers": {
    "rac-xero": {
      "command": "node",
      "args": ["path/to/dist/index.js"],
      "env": {
        "RAILWAY_API_URL": "https://your-rac-api-deployment.up.railway.app"
      }
    }
  }
}
```

## Available Tools

### Basic Financial Data

- `test_rac_connection` - Test MCP server connectivity
- `get_organizations` - List connected Xero organizations
- `get_trial_balance` - Get trial balance for specific organization
- `get_cash_position` - Get bank account balances
- `get_outstanding_invoices` - List unpaid invoices

### Advanced Analytics

- `get_consolidated_trial_balance` - Multi-entity consolidated reporting
- `get_journal_entries` - Analyze manual journal entries
- `analyze_equity_movements` - Track equity account changes
- `find_unbalanced_transactions` - Identify problematic entries
- `investigate_imbalance` - Comprehensive imbalance analysis

### Financial Analysis

- `get_profit_loss_summary` - P&L analysis
- `get_aged_receivables` - Customer payment aging
- `analyze_expense_categories` - Expense breakdown by category
- `get_financial_ratios` - Key performance ratios
- `compare_periods` - Period-over-period comparison

### Bank Reconciliation

- `check_bank_reconciliation` - Compare books vs bank feeds
- `get_account_history` - Detailed account transaction history
- `get_chart_of_accounts` - Complete chart of accounts

## Usage Examples

### Test Connection

```
test_rac_connection
```

### Get Trial Balance

```
get_trial_balance organizationName="Investment" reportDate="2024-12-31"
```

### Investigate Imbalances

```
investigate_imbalance organizationName="Mining" analysisDepth="comprehensive"
```

### Analyze Future Fund

```
analyze_equity_movements organizationName="Investment" equityAccountName="Future Fund" monthsBack=12
```

## Project Structure

```
rac-xero-mcp/
├── src/
│   └── mcp-server.js       # Main MCP server implementation
├── dist/                   # Built distribution files
├── test/                   # Test files
├── package.json           # Package configuration
├── build.js              # Build script
├── README.md             # This file
└── .env.example          # Environment variables example
```

## Building

```bash
npm run build
```

This creates the distribution files in the `dist/` directory.

## Testing

```bash
npm test
```

## Requirements

- Node.js >= 18.0.0
- Access to RAC Railway API deployment
- Valid Xero OAuth connections

## Support

For issues or questions, contact the RAC development team.

## License

MIT License - see LICENSE file for details.
