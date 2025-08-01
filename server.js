// RAC Financial Dashboard - Database Token Storage Fix
// Fixes the "Access token is undefined!" issue by using PostgreSQL instead of in-memory storage

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
                UPDATE SET 
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

// Initialize Xero client with FIXED scopes
const xero = new XeroClient({
  clientId: XERO_CLIENT_ID,
  clientSecret: XERO_CLIENT_SECRET,
  redirectUris: [XERO_REDIRECT_URI],
  scopes: [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
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
    //xero.setTenantId(req.params.tenantId);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="BANK"'
    );
    const bankAccounts = response.body.accounts || [];

    // FIXED: Use runningBalance instead of bankAccountNumber
    const totalCash = bankAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.runningBalance) || 0);
    }, 0);

    res.json({
      totalCash,
      bankAccounts: bankAccounts.map((acc) => ({
        name: acc.name,
        balance: parseFloat(acc.runningBalance) || 0,
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
    //xero.setTenantId(req.params.tenantId);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="RECEIVABLE"'
    );
    const receivableAccounts = response.body.accounts || [];

    // FIXED: Use runningBalance instead of bankAccountNumber
    const totalReceivables = receivableAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.runningBalance) || 0);
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
    //xero.setTenantId(req.params.tenantId);

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
    //xero.setTenantId(req.params.tenantId);

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

// Add this endpoint temporarily to your server.js to force create tables

// TEMPORARY: Force database table creation
app.get("/api/fix-database", async (req, res) => {
  try {
    console.log("🔧 Forcing database table creation...");

    // Drop existing tables if they exist (clean slate)
    await pool.query("DROP TABLE IF EXISTS approvalmax_tokens CASCADE");
    await pool.query("DROP TABLE IF EXISTS tokens CASCADE");

    // Create tokens table with correct schema
    await pool.query(`
            CREATE TABLE tokens (
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

    // Create ApprovalMax tokens table with correct schema
    await pool.query(`
            CREATE TABLE approvalmax_tokens (
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

    console.log("✅ Database tables created successfully");

    res.json({
      success: true,
      message: "Database tables created successfully",
      tables: ["tokens", "approvalmax_tokens"],
    });
  } catch (error) {
    console.error("❌ Error creating database tables:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

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

// Serve main dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();

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
        `🎯 Ready for RAC financial integration with persistent token storage!`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
