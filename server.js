// RAC Financial Dashboard - Complete Server.js with Date Picker Support
// Includes all functionality: Database Token Storage, Trial Balance with Date Support, Multi-entity Integration

const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const { XeroAccessToken, XeroIdToken, XeroClient } = require("xero-node");
const { Pool } = require("pg");
const app = express();
const port = process.env.PORT || 3000;

// Environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI;

const APPROVALMAX_CLIENT_ID = process.env.APPROVALMAX_CLIENT_ID;
const APPROVALMAX_CLIENT_SECRET = process.env.APPROVALMAX_CLIENT_SECRET;
const APPROVALMAX_REDIRECT_URI = process.env.APPROVALMAX_REDIRECT_URI;

// PostgreSQL connection (Railway provides DATABASE_URL automatically)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// ApprovalMax configuration
const APPROVALMAX_CONFIG = {
  authUrl: "https://identity.approvalmax.com/connect/authorize",
  tokenUrl: "https://identity.approvalmax.com/connect/token",
  apiUrl: "https://public-api.approvalmax.com/api/v1",
  scopes: [
    "https://www.approvalmax.com/scopes/public_api/read",
    "https://www.approvalmax.com/scopes/public_api/write",
    "offline_access",
  ],
};

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create tokens table if it doesn't exist
    await pool.query(`
            CREATE TABLE IF NOT EXISTS tokens (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(255) UNIQUE NOT NULL,
                tenant_name VARCHAR(255) NOT NULL,
                provider VARCHAR(50) NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at BIGINT NOT NULL,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create ApprovalMax tokens table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS approvalmax_tokens (
                id SERIAL PRIMARY KEY,
                integration_key VARCHAR(255) UNIQUE NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at BIGINT NOT NULL,
                organizations JSONB,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

    console.log("✅ Database tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

// Database token storage functions
const tokenStorage = {
  // Store Xero token
  async storeXeroToken(tenantId, tenantName, tokenData) {
    try {
      await pool.query(
        `
    INSERT INTO tokens (tenant_id, tenant_name, provider, access_token, refresh_token, expires_at, last_seen)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id) 
    DO UPDATE SET 
        access_token = $4,
        refresh_token = $5,
        expires_at = $6,
        last_seen = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
`,
        [
          tenantId,
          tenantName,
          "xero",
          tokenData.access_token,
          tokenData.refresh_token,
          Date.now() + tokenData.expires_in * 1000,
        ]
      );
      console.log(`✅ Stored Xero token for: ${tenantName}`);
    } catch (error) {
      console.error("❌ Error storing Xero token:", error);
    }
  },

  // Get Xero token
  async getXeroToken(tenantId) {
    try {
      const result = await pool.query(
        "SELECT * FROM tokens WHERE tenant_id = $1 AND provider = $2",
        [tenantId, "xero"]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const token = result.rows[0];

      // Check if token is expired
      if (Date.now() > token.expires_at) {
        console.log(`⚠️ Token expired for tenant: ${tenantId}`);
        return null;
      }

      return {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: Math.floor((token.expires_at - Date.now()) / 1000),
        tenantId: token.tenant_id,
        tenantName: token.tenant_name,
      };
    } catch (error) {
      console.error("❌ Error getting Xero token:", error);
      return null;
    }
  },

  // Get all Xero connections
  async getAllXeroConnections() {
    try {
      const result = await pool.query(
        "SELECT tenant_id, tenant_name, provider, expires_at, last_seen FROM tokens WHERE provider = $1",
        ["xero"]
      );

      return result.rows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        provider: row.provider,
        connected: Date.now() < row.expires_at,
        lastSeen: row.last_seen.toISOString(),
        error: Date.now() > row.expires_at ? "Token expired" : null,
      }));
    } catch (error) {
      console.error("❌ Error getting Xero connections:", error);
      return [];
    }
  },

  // Store ApprovalMax token
  async storeApprovalMaxToken(tokenData, organizations) {
    try {
      await pool.query(
        `
                INSERT INTO approvalmax_tokens (integration_key, access_token, refresh_token, expires_at, organizations, last_seen)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (integration_key)
                DO UPDATE SET 
                    access_token = $2,
                    refresh_token = $3,
                    expires_at = $4,
                    organizations = $5,
                    last_seen = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `,
        [
          "approvalmax_integration",
          tokenData.access_token,
          tokenData.refresh_token,
          Date.now() + tokenData.expires_in * 1000,
          JSON.stringify(organizations),
        ]
      );
      console.log(
        `✅ Stored ApprovalMax token for ${organizations.length} organizations`
      );
    } catch (error) {
      console.error("❌ Error storing ApprovalMax token:", error);
    }
  },

  // Get ApprovalMax token
  async getApprovalMaxToken() {
    try {
      const result = await pool.query(
        "SELECT * FROM approvalmax_tokens WHERE integration_key = $1",
        ["approvalmax_integration"]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const token = result.rows[0];

      // Check if token is expired
      if (Date.now() > token.expires_at) {
        console.log("⚠️ ApprovalMax token expired");
        return null;
      }

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        organizations: token.organizations,
        lastSeen: token.last_seen.toISOString(),
      };
    } catch (error) {
      console.error("❌ Error getting ApprovalMax token:", error);
      return null;
    }
  },
};

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Initialize Xero client with reports scope
const xero = new XeroClient({
  clientId: XERO_CLIENT_ID,
  clientSecret: XERO_CLIENT_SECRET,
  redirectUris: [XERO_REDIRECT_URI],
  scopes: [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "accounting.reports.read",
  ],
});

// Utility functions
function generateState() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// ============================================================================
// XERO ROUTES (UPDATED WITH DATABASE STORAGE)
// ============================================================================

// Xero OAuth authorization
app.get("/auth", async (req, res) => {
  try {
    const provider = req.query.provider;

    if (provider === "approvalmax") {
      // Redirect to ApprovalMax OAuth
      const state = generateState();
      const authUrl = new URL(APPROVALMAX_CONFIG.authUrl);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", APPROVALMAX_CLIENT_ID);
      authUrl.searchParams.set("scope", APPROVALMAX_CONFIG.scopes.join(" "));
      authUrl.searchParams.set("redirect_uri", APPROVALMAX_REDIRECT_URI);
      authUrl.searchParams.set("state", state);

      console.log("🎯 Redirecting to ApprovalMax OAuth:", authUrl.toString());
      res.redirect(authUrl.toString());
    } else {
      // Existing Xero OAuth
      const consentUrl = await xero.buildConsentUrl();
      console.log("🎯 Redirecting to Xero OAuth:", consentUrl);
      res.redirect(consentUrl);
    }
  } catch (error) {
    console.error("❌ Error in /auth:", error);
    res
      .status(500)
      .json({ error: "Authorization failed", details: error.message });
  }
});

// Xero OAuth callback - UPDATED WITH DATABASE STORAGE
app.get("/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("❌ OAuth error:", error);
      return res.redirect("/?error=oauth_failed");
    }

    if (!code) {
      console.error("❌ No authorization code received");
      return res.redirect("/?error=no_code");
    }

    console.log("🔄 Processing Xero callback...");
    const tokenSet = await xero.apiCallback(req.url);

    if (!tokenSet || !tokenSet.access_token) {
      console.error("❌ No access token received from Xero");
      return res.redirect("/?error=no_token");
    }

    // Get tenant information
    const tenants = await xero.updateTenants(false, tokenSet);
    console.log("✅ Xero tenants received:", tenants.length);

    // Store tokens in database (instead of memory)
    for (const tenant of tenants) {
      await tokenStorage.storeXeroToken(
        tenant.tenantId,
        tenant.tenantName,
        tokenSet
      );
    }

    console.log(
      "✅ Xero tokens stored in database for",
      tenants.length,
      "tenants"
    );
    res.redirect("/?success=xero_connected");
  } catch (error) {
    console.error("❌ Error in Xero callback:", error);
    res.redirect("/?error=callback_failed");
  }
});

// ============================================================================
// APPROVALMAX ROUTES (UPDATED WITH DATABASE STORAGE)
// ============================================================================

// ApprovalMax OAuth callback - UPDATED WITH DATABASE STORAGE
app.get("/callback/approvalmax", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    console.log("🎯 ApprovalMax callback received:", {
      code: code?.substring(0, 20) + "...",
      state,
      error,
    });

    if (error) {
      console.error("❌ ApprovalMax OAuth error:", error);
      return res.redirect("/?error=approvalmax_oauth_failed");
    }

    if (!code) {
      console.error("❌ No authorization code received from ApprovalMax");
      return res.redirect("/?error=approvalmax_no_code");
    }

    console.log("🔄 Exchanging ApprovalMax authorization code for tokens...");

    const redirectUri =
      APPROVALMAX_REDIRECT_URI ||
      "https://rac-financial-dashboard-production.up.railway.app/callback/approvalmax";

    const tokenRequestBody = {
      grant_type: "authorization_code",
      client_id: APPROVALMAX_CLIENT_ID,
      client_secret: APPROVALMAX_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code: code,
    };

    const tokenResponse = await fetch(APPROVALMAX_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(tokenRequestBody),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("❌ ApprovalMax token exchange failed:", {
        status: tokenResponse.status,
        error: tokenData.error,
        description: tokenData.error_description,
      });
      return res.redirect(
        `/?error=approvalmax_token_failed&details=${encodeURIComponent(
          tokenData.error || "Unknown error"
        )}`
      );
    }

    console.log("✅ ApprovalMax tokens received successfully");

    // Get organization information
    console.log("🔄 Fetching ApprovalMax organizations...");
    const orgsResponse = await fetch(`${APPROVALMAX_CONFIG.apiUrl}/companies`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    let organizations = [];
    if (orgsResponse.ok) {
      organizations = await orgsResponse.json();
      console.log(
        "✅ ApprovalMax organizations received:",
        organizations.length
      );
    } else {
      console.warn("⚠️ Failed to fetch organizations:", orgsResponse.status);
    }

    // Store tokens in database (instead of memory)
    await tokenStorage.storeApprovalMaxToken(tokenData, organizations);

    console.log(
      "✅ ApprovalMax tokens stored in database for",
      organizations.length,
      "organizations"
    );
    res.redirect("/?success=approvalmax_connected");
  } catch (error) {
    console.error("❌ Error in ApprovalMax callback:", error);
    res.redirect("/?error=approvalmax_callback_failed");
  }
});

// ============================================================================
// API ROUTES (UPDATED WITH DATABASE TOKEN RETRIEVAL)
// ============================================================================

// Connection status endpoint - UPDATED WITH DATABASE
app.get("/api/connection-status", async (req, res) => {
  try {
    const connections = [];

    // Get Xero connections from database
    const xeroConnections = await tokenStorage.getAllXeroConnections();
    connections.push(...xeroConnections);

    // Get ApprovalMax connections from database
    const approvalMaxToken = await tokenStorage.getApprovalMaxToken();
    if (approvalMaxToken) {
      connections.push({
        tenantId: "approvalmax_integration",
        tenantName: "RAC ApprovalMax Integration",
        provider: "approvalmax",
        connected: true,
        lastSeen: approvalMaxToken.lastSeen,
        organizationCount: approvalMaxToken.organizations
          ? approvalMaxToken.organizations.length
          : 0,
        error: null,
      });
    }

    console.log(
      "📊 Connection status from database:",
      connections.length,
      "total connections"
    );
    res.json(connections);
  } catch (error) {
    console.error("❌ Error getting connection status:", error);
    res.status(500).json({ error: "Failed to get connection status" });
  }
});

// FIXED: Cash position endpoint with DATABASE token retrieval
app.get("/api/cash-position/:tenantId", async (req, res) => {
  try {
    // Get token from database instead of memory
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="BANK"'
    );
    const bankAccounts = response.body.accounts || [];

    // FIXED: Use CurrentBalance instead of runningBalance
    const totalCash = bankAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.CurrentBalance) || 0);
    }, 0);

    res.json({
      totalCash,
      bankAccounts: bankAccounts.map((acc) => ({
        name: acc.name,
        balance: parseFloat(acc.CurrentBalance) || 0,
        code: acc.code,
      })),
    });
  } catch (error) {
    console.error("❌ Error getting cash position:", error);
    res.status(500).json({ error: "Failed to get cash position" });
  }
});

// FIXED: Receivables endpoint with DATABASE token retrieval
app.get("/api/receivables/:tenantId", async (req, res) => {
  try {
    // Get token from database instead of memory
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="RECEIVABLE"'
    );
    const receivableAccounts = response.body.accounts || [];

    // FIXED: Use CurrentBalance instead of runningBalance
    const totalReceivables = receivableAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.CurrentBalance) || 0);
    }, 0);

    res.json({ totalReceivables });
  } catch (error) {
    console.error("❌ Error getting receivables:", error);
    res.status(500).json({ error: "Failed to get receivables" });
  }
});

// Outstanding invoices endpoint - UPDATED WITH DATABASE
app.get("/api/outstanding-invoices/:tenantId", async (req, res) => {
  try {
    // Get token from database instead of memory
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);

    const response = await xero.accountingApi.getInvoices(
      req.params.tenantId,
      null,
      null,
      'Status=="AUTHORISED"'
    );
    const invoices = response.body.invoices || [];

    const outstandingInvoices = invoices.filter(
      (inv) => inv.status === "AUTHORISED" && parseFloat(inv.amountDue) > 0
    );

    res.json(
      outstandingInvoices.map((inv) => ({
        invoiceID: inv.invoiceID,
        invoiceNumber: inv.invoiceNumber,
        contact: inv.contact?.name,
        amountDue: parseFloat(inv.amountDue),
        total: parseFloat(inv.total),
        date: inv.date,
        dueDate: inv.dueDate,
      }))
    );
  } catch (error) {
    console.error("❌ Error getting outstanding invoices:", error);
    res.status(500).json({ error: "Failed to get outstanding invoices" });
  }
});

// Contacts endpoint - UPDATED WITH DATABASE
app.get("/api/contacts/:tenantId", async (req, res) => {
  try {
    // Get token from database instead of memory
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);

    const response = await xero.accountingApi.getContacts(req.params.tenantId);
    const contacts = response.body.contacts || [];

    res.json(
      contacts.map((contact) => ({
        contactID: contact.contactID,
        name: contact.name,
        isCustomer: contact.isCustomer,
        isSupplier: contact.isSupplier,
        emailAddress: contact.emailAddress,
      }))
    );
  } catch (error) {
    console.error("❌ Error getting contacts:", error);
    res.status(500).json({ error: "Failed to get contacts" });
  }
});

// ApprovalMax companies endpoint - UPDATED WITH DATABASE
app.get("/api/approvalmax/companies", async (req, res) => {
  try {
    const tokenData = await tokenStorage.getApprovalMaxToken();
    if (!tokenData) {
      return res.status(404).json({ error: "ApprovalMax not connected" });
    }

    const response = await fetch(`${APPROVALMAX_CONFIG.apiUrl}/companies`, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`ApprovalMax API error: ${response.status}`);
    }

    const companies = await response.json();
    res.json(companies);
  } catch (error) {
    console.error("❌ Error getting ApprovalMax companies:", error);
    res.status(500).json({ error: "Failed to get companies" });
  }
});

// Consolidated data endpoint - UPDATED WITH DATABASE
app.get("/api/consolidated", async (req, res) => {
  try {
    console.log("🔄 Loading consolidated data from database...");

    let totalCash = 0;
    let totalReceivables = 0;
    let totalOutstandingInvoices = 0;
    let tenantData = [];

    // Get all Xero connections from database
    const xeroConnections = await tokenStorage.getAllXeroConnections();
    const connectedXeroEntities = xeroConnections.filter(
      (conn) => conn.connected
    );

    // Aggregate Xero data
    for (const connection of connectedXeroEntities) {
      try {
        const [cashResponse, receivablesResponse, invoicesResponse] =
          await Promise.all([
            fetch(
              `${req.protocol}://${req.get("host")}/api/cash-position/${
                connection.tenantId
              }`
            ),
            fetch(
              `${req.protocol}://${req.get("host")}/api/receivables/${
                connection.tenantId
              }`
            ),
            fetch(
              `${req.protocol}://${req.get("host")}/api/outstanding-invoices/${
                connection.tenantId
              }`
            ),
          ]);

        if (cashResponse.ok && receivablesResponse.ok && invoicesResponse.ok) {
          const [cashData, receivablesData, invoicesData] = await Promise.all([
            cashResponse.json(),
            receivablesResponse.json(),
            invoicesResponse.json(),
          ]);

          totalCash += cashData.totalCash || 0;
          totalReceivables += receivablesData.totalReceivables || 0;
          totalOutstandingInvoices += invoicesData.length || 0;

          tenantData.push({
            tenantId: connection.tenantId,
            tenantName: connection.tenantName,
            provider: "xero",
            cashPosition: cashData.totalCash || 0,
            receivables: receivablesData.totalReceivables || 0,
            outstandingInvoices: invoicesData.length || 0,
            bankAccounts: cashData.bankAccounts || [],
          });
        }
      } catch (error) {
        console.error(
          `❌ Error loading data for tenant ${connection.tenantId}:`,
          error
        );
      }
    }

    // Add ApprovalMax data
    let totalPendingApprovals = 0;
    let totalApprovalValue = 0;
    let approvalData = [];

    const amTokenData = await tokenStorage.getApprovalMaxToken();
    if (amTokenData) {
      try {
        const summaryResponse = await fetch(
          `${req.protocol}://${req.get(
            "host"
          )}/api/approvalmax/approval-summary/integration`
        );
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          totalPendingApprovals = summaryData.pendingApprovals || 0;
          totalApprovalValue = summaryData.totalValue || 0;

          approvalData.push({
            organizationId: "integration",
            organizationName: "RAC ApprovalMax Integration",
            provider: "approvalmax",
            pendingApprovals: summaryData.pendingApprovals || 0,
            totalValue: summaryData.totalValue || 0,
            organizationCount: summaryData.organizationCount || 0,
          });
        }
      } catch (error) {
        console.error("❌ Error loading ApprovalMax data:", error);
      }
    }

    const consolidatedData = {
      totalCash,
      totalReceivables,
      totalOutstandingInvoices,
      totalPendingApprovals,
      totalApprovalValue,
      tenantData,
      approvalData,
      lastUpdated: new Date().toISOString(),
    };

    console.log("✅ Consolidated data loaded from database:", {
      xeroEntities: tenantData.length,
      approvalMaxOrgs: approvalData.length,
      totalCash,
      totalReceivables,
    });

    res.json(consolidatedData);
  } catch (error) {
    console.error("❌ Error loading consolidated data:", error);
    res.status(500).json({ error: "Failed to load consolidated data" });
  }
});

// AUTO TOKEN REFRESH SYSTEM
// Add these functions to your server.js

// Enhanced token storage with refresh capability
const enhancedTokenStorage = {
  ...tokenStorage, // Keep all existing functions

  // Refresh a specific Xero token
  async refreshXeroToken(tenantId) {
    try {
      console.log(`🔄 Attempting to refresh token for tenant: ${tenantId}`);

      // Get current token from database
      const result = await pool.query(
        "SELECT * FROM tokens WHERE tenant_id = $1 AND provider = $2",
        [tenantId, "xero"]
      );

      if (result.rows.length === 0) {
        console.log(`❌ No token found for tenant: ${tenantId}`);
        return { success: false, error: "Token not found" };
      }

      const storedToken = result.rows[0];

      if (!storedToken.refresh_token) {
        console.log(`❌ No refresh token available for tenant: ${tenantId}`);
        return { success: false, error: "No refresh token" };
      }

      // Use Xero SDK to refresh the token
      const tokenSet = {
        access_token: storedToken.access_token,
        refresh_token: storedToken.refresh_token,
        expires_in: Math.floor((storedToken.expires_at - Date.now()) / 1000),
      };

      await xero.setTokenSet(tokenSet);

      // Refresh the token
      const newTokenSet = await xero.refreshToken();
      console.log(
        `✅ Token refreshed successfully for: ${storedToken.tenant_name}`
      );

      // Store the new token in database
      await pool.query(
        `UPDATE tokens 
         SET access_token = $1, 
             refresh_token = $2, 
             expires_at = $3, 
             last_seen = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $4 AND provider = $5`,
        [
          newTokenSet.access_token,
          newTokenSet.refresh_token,
          Date.now() + newTokenSet.expires_in * 1000,
          tenantId,
          "xero",
        ]
      );

      return {
        success: true,
        newExpiresAt: Date.now() + newTokenSet.expires_in * 1000,
        tenantName: storedToken.tenant_name,
      };
    } catch (error) {
      console.error(`❌ Error refreshing token for ${tenantId}:`, error);
      return {
        success: false,
        error: error.message,
        requiresReauth:
          error.message?.includes("invalid_grant") ||
          error.message?.includes("unauthorized"),
      };
    }
  },

  // Refresh all Xero tokens that are close to expiring
  async refreshAllExpiringTokens() {
    try {
      console.log("🔄 Checking for tokens that need refresh...");

      // Get tokens that expire in the next 10 minutes
      const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;

      const result = await pool.query(
        `SELECT tenant_id, tenant_name, expires_at 
         FROM tokens 
         WHERE provider = $1 
         AND expires_at < $2 
         AND expires_at > $3`,
        ["xero", tenMinutesFromNow, Date.now()]
      );

      if (result.rows.length === 0) {
        console.log("✅ No tokens need refreshing");
        return { refreshed: 0, failed: 0, results: [] };
      }

      console.log(`🔄 Found ${result.rows.length} tokens that need refreshing`);

      const refreshResults = [];
      let refreshed = 0;
      let failed = 0;

      // Refresh each token
      for (const token of result.rows) {
        const result = await this.refreshXeroToken(token.tenant_id);
        refreshResults.push({
          tenantId: token.tenant_id,
          tenantName: token.tenant_name,
          ...result,
        });

        if (result.success) {
          refreshed++;
          console.log(`✅ Refreshed: ${token.tenant_name}`);
        } else {
          failed++;
          console.log(
            `❌ Failed to refresh: ${token.tenant_name} - ${result.error}`
          );
        }
      }

      return { refreshed, failed, results: refreshResults };
    } catch (error) {
      console.error("❌ Error in refreshAllExpiringTokens:", error);
      return { refreshed: 0, failed: 0, error: error.message };
    }
  },

  // Get tokens that will expire soon (for frontend warning)
  async getExpiringTokens(minutesAhead = 15) {
    try {
      const futureTime = Date.now() + minutesAhead * 60 * 1000;

      const result = await pool.query(
        `SELECT tenant_id, tenant_name, expires_at 
         FROM tokens 
         WHERE provider = $1 
         AND expires_at < $2 
         AND expires_at > $3
         ORDER BY expires_at ASC`,
        ["xero", futureTime, Date.now()]
      );

      return result.rows.map((row) => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        expiresAt: row.expires_at,
        minutesUntilExpiry: Math.floor(
          (row.expires_at - Date.now()) / (1000 * 60)
        ),
      }));
    } catch (error) {
      console.error("❌ Error getting expiring tokens:", error);
      return [];
    }
  },
};

// Auto-refresh scheduler - runs every 5 minutes
let autoRefreshInterval;

function startAutoRefresh() {
  console.log("🚀 Starting auto token refresh system...");

  // Run immediately
  enhancedTokenStorage.refreshAllExpiringTokens();

  // Then run every 5 minutes
  autoRefreshInterval = setInterval(async () => {
    const result = await enhancedTokenStorage.refreshAllExpiringTokens();

    if (result.refreshed > 0) {
      console.log(
        `🔄 Auto-refresh completed: ${result.refreshed} tokens refreshed, ${result.failed} failed`
      );
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log("⏹️ Auto token refresh stopped");
  }
}

// API endpoint to manually trigger refresh
app.post("/api/refresh-tokens", async (req, res) => {
  try {
    console.log("🔄 Manual token refresh requested");
    const result = await enhancedTokenStorage.refreshAllExpiringTokens();

    res.json({
      success: true,
      refreshed: result.refreshed,
      failed: result.failed,
      results: result.results,
      message: `Refreshed ${result.refreshed} tokens, ${result.failed} failed`,
    });
  } catch (error) {
    console.error("❌ Manual refresh error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API endpoint to check token status and warnings
app.get("/api/token-status", async (req, res) => {
  try {
    const [allConnections, expiringTokens] = await Promise.all([
      enhancedTokenStorage.getAllXeroConnections(),
      enhancedTokenStorage.getExpiringTokens(15), // Warn 15 minutes ahead
    ]);

    const tokenStatus = {
      totalTokens: allConnections.length,
      connectedTokens: allConnections.filter((conn) => conn.connected).length,
      expiredTokens: allConnections.filter((conn) => !conn.connected).length,
      expiringTokens: expiringTokens.length,
      expiringDetails: expiringTokens,
      needsAttention:
        expiringTokens.length > 0 ||
        allConnections.filter((conn) => !conn.connected).length > 0,
    };

    res.json(tokenStatus);
  } catch (error) {
    console.error("❌ Token status error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced connection status with auto-refresh info
app.get("/api/connection-status-enhanced", async (req, res) => {
  try {
    const [connections, expiringTokens] = await Promise.all([
      enhancedTokenStorage.getAllXeroConnections(),
      enhancedTokenStorage.getExpiringTokens(30), // Check 30 minutes ahead
    ]);

    // Add expiry warnings to connection data
    const enhancedConnections = connections.map((conn) => {
      const expiring = expiringTokens.find(
        (exp) => exp.tenantId === conn.tenantId
      );
      return {
        ...conn,
        minutesUntilExpiry: expiring ? expiring.minutesUntilExpiry : null,
        needsRefresh: expiring ? expiring.minutesUntilExpiry < 15 : false,
      };
    });

    // Add ApprovalMax connections (keep existing logic)
    const approvalMaxToken = await enhancedTokenStorage.getApprovalMaxToken();
    if (approvalMaxToken) {
      enhancedConnections.push({
        tenantId: "approvalmax_integration",
        tenantName: "RAC ApprovalMax Integration",
        provider: "approvalmax",
        connected: true,
        lastSeen: approvalMaxToken.lastSeen,
        organizationCount: approvalMaxToken.organizations
          ? approvalMaxToken.organizations.length
          : 0,
        error: null,
        minutesUntilExpiry: null,
        needsRefresh: false,
      });
    }

    res.json(enhancedConnections);
  } catch (error) {
    console.error("❌ Error getting enhanced connection status:", error);
    res.status(500).json({ error: "Failed to get enhanced connection status" });
  }
});

// Start auto-refresh when server starts
// Add this to your startServer() function, after initializeDatabase()
async function initializeAutoRefresh() {
  try {
    await initializeDatabase();

    // Start the auto-refresh system
    startAutoRefresh();

    console.log("✅ Auto token refresh system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize auto-refresh:", error);
  }
}

// Update your existing startServer function to call initializeAutoRefresh()
// Replace: await initializeDatabase();
// With: await initializeAutoRefresh();

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const dbTest = await pool.query("SELECT NOW()");
    const xeroConnections = await tokenStorage.getAllXeroConnections();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      xeroConnections: xeroConnections.length,
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// DATABASE DEBUG endpoint - Add this to see what's stored
app.get("/api/debug/database", async (req, res) => {
  try {
    console.log("🔍 DEBUG: Checking database contents...");

    // Get all tokens from database
    const result = await pool.query(
      "SELECT tenant_id, tenant_name, provider, expires_at, last_seen FROM tokens ORDER BY last_seen DESC"
    );

    const now = Date.now();
    const tokens = result.rows.map((row) => ({
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      provider: row.provider,
      expired: now > row.expires_at,
      expires_in_minutes: Math.floor((row.expires_at - now) / (1000 * 60)),
      last_seen: row.last_seen,
    }));

    console.log("✅ DEBUG: Database tokens:", tokens);

    res.json({
      totalTokens: tokens.length,
      tokens: tokens,
      currentTime: new Date().toISOString(),
      currentTimestamp: now,
    });
  } catch (error) {
    console.error("❌ DEBUG: Database error:", error);
    res.status(500).json({
      error: "Database query failed",
      details: error.message,
    });
  }
});

// Serve main dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==============================================================================
// ENHANCED TRIAL BALANCE ENDPOINTS WITH DATE SUPPORT
// ==============================================================================

// Enhanced Individual Trial Balance with Date Support
app.get("/api/trial-balance/:tenantId", async (req, res) => {
  try {
    console.log(
      `🔍 Getting PROPER trial balance for tenant: ${req.params.tenantId}`
    );

    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);

    // Get date from query parameter or use today
    const reportDate = req.query.date || new Date().toISOString().split("T")[0];
    console.log(`📅 Report date: ${reportDate}`);

    // Get Balance Sheet report for specified date
    const balanceSheetResponse = await xero.accountingApi.getReportBalanceSheet(
      req.params.tenantId,
      reportDate
    );

    const balanceSheetRows = balanceSheetResponse.body.reports?.[0]?.rows || [];
    console.log(
      `📊 Processing ${balanceSheetRows.length} Balance Sheet sections for ${reportDate}`
    );

    // Initialize trial balance structure
    const trialBalance = {
      assets: [],
      liabilities: [],
      equity: [],
      revenue: [],
      expenses: [],
      totals: {
        totalDebits: 0,
        totalCredits: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        totalRevenue: 0,
        totalExpenses: 0,
      },
    };

    let processedAccounts = 0;

    // Process each Balance Sheet section
    balanceSheetRows.forEach((section, sectionIndex) => {
      if (section.rowType === "Section" && section.rows && section.title) {
        const sectionTitle = section.title.toLowerCase();
        console.log(
          `🔄 Processing section: ${section.title} (${section.rows.length} rows)`
        );

        section.rows.forEach((row) => {
          if (row.rowType === "Row" && row.cells && row.cells.length >= 2) {
            const accountName = row.cells[0]?.value || "";
            const currentBalance = parseFloat(row.cells[1]?.value || 0);

            if (
              accountName.toLowerCase().includes("total") ||
              currentBalance === 0
            ) {
              return;
            }

            processedAccounts++;
            console.log(
              `📈 Processing: ${accountName} = ${currentBalance.toLocaleString()}`
            );

            const accountInfo = {
              name: accountName,
              balance: currentBalance,
              debit: 0,
              credit: 0,
              section: section.title,
            };

            // Account classification logic
            if (
              sectionTitle.includes("bank") ||
              sectionTitle.includes("asset")
            ) {
              accountInfo.debit = currentBalance >= 0 ? currentBalance : 0;
              accountInfo.credit =
                currentBalance < 0 ? Math.abs(currentBalance) : 0;
              trialBalance.assets.push(accountInfo);
              trialBalance.totals.totalAssets += currentBalance;
            } else if (sectionTitle.includes("liabilit")) {
              accountInfo.credit = currentBalance >= 0 ? currentBalance : 0;
              accountInfo.debit =
                currentBalance < 0 ? Math.abs(currentBalance) : 0;
              trialBalance.liabilities.push(accountInfo);
              trialBalance.totals.totalLiabilities += currentBalance;
            } else if (sectionTitle.includes("equity")) {
              accountInfo.credit = currentBalance >= 0 ? currentBalance : 0;
              accountInfo.debit =
                currentBalance < 0 ? Math.abs(currentBalance) : 0;
              trialBalance.equity.push(accountInfo);
              trialBalance.totals.totalEquity += currentBalance;
            }

            trialBalance.totals.totalDebits += accountInfo.debit;
            trialBalance.totals.totalCredits += accountInfo.credit;
          }
        });
      }
    });

    // Get P&L data for the same date
    try {
      console.log("🔄 Fetching P&L report for Revenue/Expenses...");
      const profitLossResponse =
        await xero.accountingApi.getReportProfitAndLoss(
          req.params.tenantId,
          reportDate,
          reportDate
        );

      const plRows = profitLossResponse.body.reports?.[0]?.rows || [];

      plRows.forEach((section) => {
        if (section.rowType === "Section" && section.rows && section.title) {
          const sectionTitle = section.title.toLowerCase();

          section.rows.forEach((row) => {
            if (row.rowType === "Row" && row.cells && row.cells.length >= 2) {
              const accountName = row.cells[0]?.value || "";
              const currentAmount = parseFloat(row.cells[1]?.value || 0);

              if (
                accountName.toLowerCase().includes("total") ||
                currentAmount === 0
              ) {
                return;
              }

              processedAccounts++;
              const accountInfo = {
                name: accountName,
                balance: currentAmount,
                debit: 0,
                credit: 0,
                section: section.title,
              };

              if (
                sectionTitle.includes("income") ||
                sectionTitle.includes("revenue")
              ) {
                accountInfo.credit = Math.abs(currentAmount);
                trialBalance.revenue.push(accountInfo);
                trialBalance.totals.totalRevenue += Math.abs(currentAmount);
              } else if (
                sectionTitle.includes("expense") ||
                sectionTitle.includes("cost")
              ) {
                accountInfo.debit = Math.abs(currentAmount);
                trialBalance.expenses.push(accountInfo);
                trialBalance.totals.totalExpenses += Math.abs(currentAmount);
              }

              trialBalance.totals.totalDebits += accountInfo.debit;
              trialBalance.totals.totalCredits += accountInfo.credit;
            }
          });
        }
      });
    } catch (plError) {
      console.log("⚠️ Could not fetch P&L data:", plError.message);
    }

    // Sort and calculate balance check
    ["assets", "liabilities", "equity", "revenue", "expenses"].forEach(
      (category) => {
        trialBalance[category].sort((a, b) => a.name.localeCompare(b.name));
      }
    );

    const balanceCheck = {
      debitsEqualCredits:
        Math.abs(
          trialBalance.totals.totalDebits - trialBalance.totals.totalCredits
        ) < 0.01,
      difference:
        trialBalance.totals.totalDebits - trialBalance.totals.totalCredits,
      accountingEquation: {
        assets: trialBalance.totals.totalAssets,
        liabilitiesAndEquity:
          trialBalance.totals.totalLiabilities +
          trialBalance.totals.totalEquity,
        balanced:
          Math.abs(
            trialBalance.totals.totalAssets -
              (trialBalance.totals.totalLiabilities +
                trialBalance.totals.totalEquity)
          ) < 0.01,
      },
    };

    console.log(
      `✅ PROPER Trial balance completed for ${tokenData.tenantName} as at ${reportDate}:`,
      {
        processedAccounts: processedAccounts,
        totalAssets: trialBalance.totals.totalAssets,
        totalLiabilities: trialBalance.totals.totalLiabilities,
        totalEquity: trialBalance.totals.totalEquity,
        balanced: balanceCheck.debitsEqualCredits,
      }
    );

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      trialBalance,
      balanceCheck,
      generatedAt: new Date().toISOString(),
      reportDate: reportDate,
      processedAccounts: processedAccounts,
      dataSource: "Balance Sheet + P&L Reports",
    });
  } catch (error) {
    console.error("❌ Error getting PROPER trial balance:", error);
    res.status(500).json({
      error: "Failed to get trial balance",
      details: error.message,
      tenantId: req.params.tenantId,
    });
  }
});

// Enhanced Consolidated Trial Balance with Date Support
app.get("/api/consolidated-trial-balance", async (req, res) => {
  try {
    // Get date from query parameter or use today
    const reportDate = req.query.date || new Date().toISOString().split("T")[0];
    console.log(
      `🔄 Loading HIERARCHICAL consolidated trial balance for ${reportDate}...`
    );

    const xeroConnections = await tokenStorage.getAllXeroConnections();
    const connectedXeroEntities = xeroConnections.filter(
      (conn) => conn.connected
    );

    console.log(`🏢 Found ${connectedXeroEntities.length} connected entities`);

    const hierarchicalTrialBalance = {
      consolidated: {
        totals: {
          totalDebits: 0,
          totalCredits: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          totalEquity: 0,
          totalRevenue: 0,
          totalExpenses: 0,
        },
        balanceCheck: {
          debitsEqualCredits: false,
          difference: 0,
          accountingEquation: {
            assets: 0,
            liabilitiesAndEquity: 0,
            balanced: false,
          },
        },
      },
      companies: [],
      reportDate: reportDate,
      generatedAt: new Date().toISOString(),
    };

    // Process each entity with the specified date
    for (const connection of connectedXeroEntities) {
      try {
        console.log(
          `🔄 Processing entity: ${connection.tenantName} for ${reportDate}`
        );

        const trialBalanceResponse = await fetch(
          `${req.protocol}://${req.get("host")}/api/trial-balance/${
            connection.tenantId
          }?date=${reportDate}`
        );

        if (trialBalanceResponse.ok) {
          const entityTrialBalance = await trialBalanceResponse.json();

          // Create hierarchical company structure
          const companyData = {
            tenantId: connection.tenantId,
            tenantName: connection.tenantName,
            balanceCheck: entityTrialBalance.balanceCheck,
            totals: entityTrialBalance.trialBalance.totals,
            reportDate: entityTrialBalance.reportDate,
            sections: {
              assets: {
                title: "Assets",
                total: entityTrialBalance.trialBalance.totals.totalAssets,
                accounts: entityTrialBalance.trialBalance.assets.map(
                  (account) => ({
                    name: account.name,
                    debit: account.debit,
                    credit: account.credit,
                    balance: account.balance,
                    section: account.section || "Assets",
                  })
                ),
              },
              liabilities: {
                title: "Liabilities",
                total: entityTrialBalance.trialBalance.totals.totalLiabilities,
                accounts: entityTrialBalance.trialBalance.liabilities.map(
                  (account) => ({
                    name: account.name,
                    debit: account.debit,
                    credit: account.credit,
                    balance: account.balance,
                    section: account.section || "Liabilities",
                  })
                ),
              },
              equity: {
                title: "Equity",
                total: entityTrialBalance.trialBalance.totals.totalEquity,
                accounts: entityTrialBalance.trialBalance.equity.map(
                  (account) => ({
                    name: account.name,
                    debit: account.debit,
                    credit: account.credit,
                    balance: account.balance,
                    section: account.section || "Equity",
                  })
                ),
              },
              revenue: {
                title: "Revenue",
                total: entityTrialBalance.trialBalance.totals.totalRevenue,
                accounts: entityTrialBalance.trialBalance.revenue.map(
                  (account) => ({
                    name: account.name,
                    debit: account.debit,
                    credit: account.credit,
                    balance: account.balance,
                    section: account.section || "Revenue",
                  })
                ),
              },
              expenses: {
                title: "Expenses",
                total: entityTrialBalance.trialBalance.totals.totalExpenses,
                accounts: entityTrialBalance.trialBalance.expenses.map(
                  (account) => ({
                    name: account.name,
                    debit: account.debit,
                    credit: account.credit,
                    balance: account.balance,
                    section: account.section || "Expenses",
                  })
                ),
              },
            },
            accountCounts: {
              totalAccounts: Object.values({
                assets: entityTrialBalance.trialBalance.assets,
                liabilities: entityTrialBalance.trialBalance.liabilities,
                equity: entityTrialBalance.trialBalance.equity,
                revenue: entityTrialBalance.trialBalance.revenue,
                expenses: entityTrialBalance.trialBalance.expenses,
              }).reduce((sum, accounts) => sum + accounts.length, 0),
              assetAccounts: entityTrialBalance.trialBalance.assets.length,
              liabilityAccounts:
                entityTrialBalance.trialBalance.liabilities.length,
              equityAccounts: entityTrialBalance.trialBalance.equity.length,
              revenueAccounts: entityTrialBalance.trialBalance.revenue.length,
              expenseAccounts: entityTrialBalance.trialBalance.expenses.length,
            },
          };

          hierarchicalTrialBalance.companies.push(companyData);

          // Add to consolidated totals
          const totals = hierarchicalTrialBalance.consolidated.totals;
          const entityTotals = entityTrialBalance.trialBalance.totals;

          totals.totalDebits += entityTotals.totalDebits;
          totals.totalCredits += entityTotals.totalCredits;
          totals.totalAssets += entityTotals.totalAssets;
          totals.totalLiabilities += entityTotals.totalLiabilities;
          totals.totalEquity += entityTotals.totalEquity;
          totals.totalRevenue += entityTotals.totalRevenue;
          totals.totalExpenses += entityTotals.totalExpenses;

          console.log(
            `✅ Added ${connection.tenantName} to hierarchical structure for ${reportDate}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Error loading trial balance for ${connection.tenantId}:`,
          error
        );
      }
    }

    // Calculate consolidated balance check and summary
    const totals = hierarchicalTrialBalance.consolidated.totals;
    hierarchicalTrialBalance.consolidated.balanceCheck = {
      debitsEqualCredits:
        Math.abs(totals.totalDebits - totals.totalCredits) < 0.01,
      difference: totals.totalDebits - totals.totalCredits,
      accountingEquation: {
        assets: totals.totalAssets,
        liabilitiesAndEquity: totals.totalLiabilities + totals.totalEquity,
        balanced:
          Math.abs(
            totals.totalAssets - (totals.totalLiabilities + totals.totalEquity)
          ) < 0.01,
      },
    };

    hierarchicalTrialBalance.summary = {
      totalCompanies: hierarchicalTrialBalance.companies.length,
      totalAccounts: hierarchicalTrialBalance.companies.reduce(
        (sum, company) => sum + company.accountCounts.totalAccounts,
        0
      ),
      balancedCompanies: hierarchicalTrialBalance.companies.filter(
        (company) => company.balanceCheck.debitsEqualCredits
      ).length,
      dataQuality: {
        allConnected:
          hierarchicalTrialBalance.companies.length ===
          connectedXeroEntities.length,
        allBalanced: hierarchicalTrialBalance.companies.every(
          (company) => company.balanceCheck.debitsEqualCredits
        ),
        consolidatedBalanced:
          hierarchicalTrialBalance.consolidated.balanceCheck.debitsEqualCredits,
      },
    };

    console.log(
      `✅ Hierarchical consolidated trial balance completed for ${reportDate}:`,
      {
        companies: hierarchicalTrialBalance.companies.length,
        totalAccounts: hierarchicalTrialBalance.summary.totalAccounts,
        totalAssets: totals.totalAssets,
        consolidatedBalanced:
          hierarchicalTrialBalance.consolidated.balanceCheck.debitsEqualCredits,
      }
    );

    res.json(hierarchicalTrialBalance);
  } catch (error) {
    console.error(
      "❌ Error loading hierarchical consolidated trial balance:",
      error
    );
    res.status(500).json({
      error: "Failed to load hierarchical consolidated trial balance",
    });
  }
});

// DEBUG ENDPOINTS (Keep existing ones)
app.get("/api/debug/simple/:tenantId", async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);
    const response = await xero.accountingApi.getAccounts(req.params.tenantId);
    const allAccounts = response.body.accounts || [];
    const firstThree = allAccounts.slice(0, 3);

    console.log("Raw Xero Response Structure:");
    console.log("Total accounts:", allAccounts.length);
    console.log(
      "First account keys:",
      firstThree[0] ? Object.keys(firstThree[0]) : "No accounts"
    );
    console.log("First account full:", firstThree[0]);

    res.json({
      message: "Raw Xero account data",
      totalAccounts: allAccounts.length,
      firstThreeAccounts: firstThree,
      firstAccountKeys: firstThree[0] ? Object.keys(firstThree[0]) : [],
    });
  } catch (error) {
    console.error("❌ Simple debug error:", error);
    res
      .status(500)
      .json({ error: "Simple debug failed", details: error.message });
  }
});

// TESTING - Balance Sheet endpoint (Keep for testing)
app.get("/api/trial-balance-fixed/:tenantId", async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res
        .status(404)
        .json({ error: "Tenant not found or token expired" });
    }

    await xero.setTokenSet(tokenData);
    const response = await xero.accountingApi.getAccounts(req.params.tenantId);
    const allAccounts = response.body.accounts || [];

    const today = new Date().toISOString().split("T")[0];
    const balanceSheetResponse = await xero.accountingApi.getReportBalanceSheet(
      req.params.tenantId,
      today
    );

    console.log("✅ Got Balance Sheet report");

    res.json({
      message: "Testing Balance Sheet approach",
      totalAccounts: allAccounts.length,
      balanceSheetStructure:
        balanceSheetResponse.body.reports?.[0]?.rows?.slice(0, 10),
    });
  } catch (error) {
    console.error("❌ Error:", error);
    res
      .status(500)
      .json({ error: "Failed", details: error.message || "No message" });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeAutoRefresh();

    app.listen(port, () => {
      console.log(`🚀 RAC Financial Dashboard running on port ${port}`);
      console.log(
        `📊 Dashboard: ${
          process.env.NODE_ENV === "production"
            ? "https://your-app.up.railway.app"
            : `http://localhost:${port}`
        }`
      );
      console.log(`💾 Database: Connected to PostgreSQL`);
      console.log(`🔗 Xero OAuth: /auth`);
      console.log(`🔗 ApprovalMax OAuth: /auth?provider=approvalmax`);
      console.log(
        `🎯 Ready for RAC financial integration with date-flexible trial balance!`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
