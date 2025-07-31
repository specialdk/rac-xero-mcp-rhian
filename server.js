// RAC Financial Dashboard - Fixed ApprovalMax Integration

const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const { XeroAccessToken, XeroIdToken, XeroClient } = require("xero-node");
const app = express();
const port = process.env.PORT || 3000;

// Environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI;

const APPROVALMAX_CLIENT_ID = process.env.APPROVALMAX_CLIENT_ID;
const APPROVALMAX_CLIENT_SECRET = process.env.APPROVALMAX_CLIENT_SECRET;
const APPROVALMAX_REDIRECT_URI = process.env.APPROVALMAX_REDIRECT_URI;

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

// In-memory storage (replace with database in production)
let tokenStore = new Map();
let approvalMaxTokens = new Map();

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Initialize Xero client
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
// XERO ROUTES (EXISTING - WORKING)
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

      // Store state for verification
      tokenStore.set(`state_${state}`, {
        provider: "approvalmax",
        timestamp: Date.now(),
      });

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

// Xero OAuth callback
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

    // Store tokens for each tenant
    tenants.forEach((tenant) => {
      tokenStore.set(tenant.tenantId, {
        provider: "xero",
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token,
        expiresAt: Date.now() + tokenSet.expires_in * 1000,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        lastSeen: new Date().toISOString(),
      });
    });

    console.log("✅ Xero tokens stored for", tenants.length, "tenants");
    res.redirect("/?success=xero_connected");
  } catch (error) {
    console.error("❌ Error in Xero callback:", error);
    res.redirect("/?error=callback_failed");
  }
});

// ============================================================================
// APPROVALMAX ROUTES (NEW - FIXED)
// ============================================================================

// ApprovalMax OAuth callback - FIXED VERSION
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

    // Verify state if stored
    if (state) {
      const storedState = tokenStore.get(`state_${state}`);
      if (!storedState || storedState.provider !== "approvalmax") {
        console.error("❌ State verification failed");
        return res.redirect("/?error=state_mismatch");
      }
      tokenStore.delete(`state_${state}`);
    }

    console.log("🔄 Exchanging ApprovalMax authorization code for tokens...");

    // FIXED: Force HTTPS for redirect URI to match app registration
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

    console.log("📤 Token request parameters:", {
      grant_type: tokenRequestBody.grant_type,
      client_id: tokenRequestBody.client_id,
      client_secret: tokenRequestBody.client_secret ? "[PROVIDED]" : "MISSING",
      redirect_uri: tokenRequestBody.redirect_uri,
      code: code.substring(0, 20) + "...",
    });

    const tokenResponse = await fetch(APPROVALMAX_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(tokenRequestBody),
    });

    const tokenData = await tokenResponse.json();

    console.log("📥 Token response status:", tokenResponse.status);
    console.log("📥 Token response:", {
      success: tokenResponse.ok,
      hasAccessToken: !!tokenData.access_token,
      error: tokenData.error,
      errorDescription: tokenData.error_description,
    });

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

    // Store tokens - FIXED: Use single entry for all organizations
    const tokenEntry = {
      provider: "approvalmax",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      organizations: organizations,
      lastSeen: new Date().toISOString(),
    };

    // Store with a single key for ApprovalMax integration
    approvalMaxTokens.set("approvalmax_integration", tokenEntry);

    // Also store individual entries for each organization for compatibility
    organizations.forEach((org, index) => {
      approvalMaxTokens.set(org.companyId || `org_${index}`, {
        ...tokenEntry,
        organizationId: org.companyId,
        organizationName: org.name,
        tenantId: org.companyId || `org_${index}`,
        tenantName: org.name || `ApprovalMax Organization ${index + 1}`,
      });
    });

    console.log(
      "✅ ApprovalMax tokens stored for",
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
// API ROUTES (EXISTING XERO + NEW APPROVALMAX)
// ============================================================================

// Connection status endpoint - ENHANCED
app.get("/api/connection-status", async (req, res) => {
  try {
    const connections = [];

    // Add Xero connections
    for (const [tenantId, tokenData] of tokenStore.entries()) {
      if (tokenData.provider === "xero") {
        const isExpired = Date.now() > tokenData.expiresAt;
        connections.push({
          tenantId: tenantId,
          tenantName: tokenData.tenantName,
          provider: "xero",
          connected: !isExpired,
          lastSeen: tokenData.lastSeen,
          error: isExpired ? "Token expired" : null,
        });
      }
    }

    // Add ApprovalMax connections - FIXED
    for (const [key, tokenData] of approvalMaxTokens.entries()) {
      if (tokenData.provider === "approvalmax") {
        const isExpired = Date.now() > tokenData.expiresAt;

        if (key === "approvalmax_integration") {
          // Add single ApprovalMax entry representing all organizations
          connections.push({
            tenantId: "approvalmax_integration",
            tenantName: "RAC ApprovalMax Integration",
            provider: "approvalmax",
            connected: !isExpired,
            lastSeen: tokenData.lastSeen,
            organizationCount: tokenData.organizations
              ? tokenData.organizations.length
              : 0,
            error: isExpired ? "Token expired" : null,
          });
        }
      }
    }

    console.log(
      "📊 Connection status:",
      connections.length,
      "total connections"
    );
    res.json(connections);
  } catch (error) {
    console.error("❌ Error getting connection status:", error);
    res.status(500).json({ error: "Failed to get connection status" });
  }
});

// Existing Xero API endpoints (unchanged)
app.get("/api/cash-position/:tenantId", async (req, res) => {
  try {
    const tokenData = tokenStore.get(req.params.tenantId);
    if (!tokenData || tokenData.provider !== "xero") {
      return res.status(404).json({ error: "Tenant not found or not Xero" });
    }

    await xero.setTokenSet(tokenData);
    xero.setTenantId(req.params.tenantId);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="BANK"'
    );
    const bankAccounts = response.body.accounts || [];

    const totalCash = bankAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.runningBalance) || 0);
    }, 0);

    res.json({
      totalCash,
      bankAccounts: bankAccounts.map((acc) => ({
        name: acc.name,
        balance: parseFloat(acc.bankAccountNumber) || 0,
        code: acc.code,
      })),
    });
  } catch (error) {
    console.error("❌ Error getting cash position:", error);
    res.status(500).json({ error: "Failed to get cash position" });
  }
});

app.get("/api/receivables/:tenantId", async (req, res) => {
  try {
    const tokenData = tokenStore.get(req.params.tenantId);
    if (!tokenData || tokenData.provider !== "xero") {
      return res.status(404).json({ error: "Tenant not found or not Xero" });
    }

    await xero.setTokenSet(tokenData);
    xero.setTenantId(req.params.tenantId);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      'Type=="RECEIVABLE"'
    );
    const receivableAccounts = response.body.accounts || [];

    const totalReceivables = receivableAccounts.reduce((sum, account) => {
      return sum + (parseFloat(account.bankAccountNumber) || 0);
    }, 0);

    res.json({ totalReceivables });
  } catch (error) {
    console.error("❌ Error getting receivables:", error);
    res.status(500).json({ error: "Failed to get receivables" });
  }
});

app.get("/api/outstanding-invoices/:tenantId", async (req, res) => {
  try {
    const tokenData = tokenStore.get(req.params.tenantId);
    if (!tokenData || tokenData.provider !== "xero") {
      return res.status(404).json({ error: "Tenant not found or not Xero" });
    }

    await xero.setTokenSet(tokenData);
    xero.setTenantId(req.params.tenantId);

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

app.get("/api/contacts/:tenantId", async (req, res) => {
  try {
    const tokenData = tokenStore.get(req.params.tenantId);
    if (!tokenData || tokenData.provider !== "xero") {
      return res.status(404).json({ error: "Tenant not found or not Xero" });
    }

    await xero.setTokenSet(tokenData);
    xero.setTenantId(req.params.tenantId);

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

// NEW: ApprovalMax API endpoints
app.get("/api/approvalmax/companies", async (req, res) => {
  try {
    const tokenData = approvalMaxTokens.get("approvalmax_integration");
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

app.get(
  "/api/approvalmax/pending-approvals/:organizationId",
  async (req, res) => {
    try {
      const tokenData = approvalMaxTokens.get("approvalmax_integration");
      if (!tokenData) {
        return res.status(404).json({ error: "ApprovalMax not connected" });
      }

      console.log("🔄 Getting pending approvals from ApprovalMax...");

      // Try different endpoint variations to find what works
      const endpoints = [
        "/bills?limit=50",
        "/purchase-orders?limit=50",
        "/documents?limit=50",
      ];

      let allDocuments = [];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(
            `${APPROVALMAX_CONFIG.apiUrl}${endpoint}`,
            {
              headers: {
                Authorization: `Bearer ${tokenData.accessToken}`,
                Accept: "application/json",
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            console.log(
              `✅ ${endpoint} returned:`,
              Array.isArray(data) ? data.length + " items" : typeof data
            );
            if (Array.isArray(data)) {
              allDocuments = [...allDocuments, ...data];
            }
          } else {
            console.log(`⚠️ ${endpoint} returned status:`, response.status);
          }
        } catch (endpointError) {
          console.log(`⚠️ ${endpoint} failed:`, endpointError.message);
        }
      }

      // Filter for pending items if we have status field
      const pendingDocuments = allDocuments.filter(
        (doc) =>
          doc.status === "pending" ||
          doc.status === "waiting" ||
          doc.approvalStatus === "pending"
      );

      console.log(
        `📊 Total documents found: ${allDocuments.length}, Pending: ${pendingDocuments.length}`
      );
      res.json(pendingDocuments);
    } catch (error) {
      console.error("❌ Error getting pending approvals:", error);
      res.status(500).json({ error: "Failed to get pending approvals" });
    }
  }
);

app.get(
  "/api/approvalmax/approval-summary/:organizationId",
  async (req, res) => {
    try {
      const tokenData = approvalMaxTokens.get("approvalmax_integration");
      if (!tokenData) {
        return res.status(404).json({ error: "ApprovalMax not connected" });
      }

      console.log("🔄 Getting approval summary from ApprovalMax...");

      // Try to get data from multiple endpoints to build a comprehensive summary
      let allBills = [];
      let allPOs = [];
      let totalDocuments = 0;

      try {
        // Try bills endpoint
        const billsResponse = await fetch(
          `${APPROVALMAX_CONFIG.apiUrl}/bills?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
              Accept: "application/json",
            },
          }
        );

        if (billsResponse.ok) {
          allBills = await billsResponse.json();
          if (Array.isArray(allBills)) {
            totalDocuments += allBills.length;
            console.log(`✅ Bills endpoint returned: ${allBills.length} items`);
          }
        }
      } catch (error) {
        console.log("⚠️ Bills endpoint failed:", error.message);
      }

      try {
        // Try purchase orders endpoint
        const posResponse = await fetch(
          `${APPROVALMAX_CONFIG.apiUrl}/purchase-orders?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
              Accept: "application/json",
            },
          }
        );

        if (posResponse.ok) {
          allPOs = await posResponse.json();
          if (Array.isArray(allPOs)) {
            totalDocuments += allPOs.length;
            console.log(
              `✅ Purchase Orders endpoint returned: ${allPOs.length} items`
            );
          }
        }
      } catch (error) {
        console.log("⚠️ Purchase Orders endpoint failed:", error.message);
      }

      // Combine all documents
      const allDocuments = [...allBills, ...allPOs];

      // Calculate summary statistics
      const pendingApprovals = allDocuments.filter(
        (doc) =>
          doc.status === "pending" ||
          doc.status === "waiting" ||
          doc.approvalStatus === "pending"
      ).length;

      const today = new Date().toISOString().split("T")[0];
      const approvedToday = allDocuments.filter((doc) => {
        const docDate = doc.updatedDate || doc.approvedDate || doc.lastModified;
        return (
          (doc.status === "approved" || doc.approvalStatus === "approved") &&
          docDate &&
          docDate.startsWith(today)
        );
      }).length;

      const totalValue = allDocuments.reduce((sum, doc) => {
        const amount = parseFloat(doc.amount || doc.total || doc.value || 0);
        return sum + amount;
      }, 0);

      const rejectedCount = allDocuments.filter(
        (doc) => doc.status === "rejected" || doc.approvalStatus === "rejected"
      ).length;

      const summary = {
        pendingApprovals,
        totalDocuments,
        approvedToday,
        totalValue,
        averageApprovalTime: 12, // Default value - would need historical data to calculate
        rejectedCount,
        organizationCount: tokenData.organizations
          ? tokenData.organizations.length
          : 0,
      };

      console.log("📊 ApprovalMax summary calculated:", summary);
      res.json(summary);
    } catch (error) {
      console.error("❌ Error getting approval summary:", error);
      res.status(500).json({ error: "Failed to get approval summary" });
    }
  }
);

app.get(
  "/api/approvalmax/workflow-bottlenecks/:organizationId",
  async (req, res) => {
    try {
      const tokenData = approvalMaxTokens.get("approvalmax_integration");
      if (!tokenData) {
        return res.status(404).json({ error: "ApprovalMax not connected" });
      }

      // Mock bottleneck data (would be calculated from real approval workflows)
      const bottlenecks = [
        { approver: "John Smith", pendingCount: 5, totalValue: 25000 },
        { approver: "Sarah Wilson", pendingCount: 3, totalValue: 15000 },
        { approver: "Michael Brown", pendingCount: 2, totalValue: 8500 },
      ];

      res.json(bottlenecks);
    } catch (error) {
      console.error("❌ Error getting workflow bottlenecks:", error);
      res.status(500).json({ error: "Failed to get workflow bottlenecks" });
    }
  }
);

// Consolidated data endpoint - ENHANCED
app.get("/api/consolidated", async (req, res) => {
  try {
    console.log("🔄 Loading consolidated data...");

    let totalCash = 0;
    let totalReceivables = 0;
    let totalOutstandingInvoices = 0;
    let tenantData = [];

    // Aggregate Xero data
    for (const [tenantId, tokenData] of tokenStore.entries()) {
      if (tokenData.provider === "xero" && Date.now() < tokenData.expiresAt) {
        try {
          const [cashResponse, receivablesResponse, invoicesResponse] =
            await Promise.all([
              fetch(
                `${req.protocol}://${req.get(
                  "host"
                )}/api/cash-position/${tenantId}`
              ),
              fetch(
                `${req.protocol}://${req.get(
                  "host"
                )}/api/receivables/${tenantId}`
              ),
              fetch(
                `${req.protocol}://${req.get(
                  "host"
                )}/api/outstanding-invoices/${tenantId}`
              ),
            ]);

          if (
            cashResponse.ok &&
            receivablesResponse.ok &&
            invoicesResponse.ok
          ) {
            const [cashData, receivablesData, invoicesData] = await Promise.all(
              [
                cashResponse.json(),
                receivablesResponse.json(),
                invoicesResponse.json(),
              ]
            );

            totalCash += cashData.totalCash || 0;
            totalReceivables += receivablesData.totalReceivables || 0;
            totalOutstandingInvoices += invoicesData.length || 0;

            tenantData.push({
              tenantId,
              tenantName: tokenData.tenantName,
              provider: "xero",
              cashPosition: cashData.totalCash || 0,
              receivables: receivablesData.totalReceivables || 0,
              outstandingInvoices: invoicesData.length || 0,
            });
          }
        } catch (error) {
          console.error(`❌ Error loading data for tenant ${tenantId}:`, error);
        }
      }
    }

    // Add ApprovalMax data
    let totalPendingApprovals = 0;
    let totalApprovalValue = 0;
    let approvalData = [];

    const amTokenData = approvalMaxTokens.get("approvalmax_integration");
    if (amTokenData && Date.now() < amTokenData.expiresAt) {
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

    console.log("✅ Consolidated data loaded:", {
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

// Debug endpoint to check ApprovalMax data
app.get("/api/debug/approvalmax", async (req, res) => {
  try {
    const tokenData = approvalMaxTokens.get("approvalmax_integration");
    if (!tokenData) {
      return res.json({
        error: "No ApprovalMax tokens found",
        tokenStore: Array.from(approvalMaxTokens.keys()),
      });
    }

    console.log("🔍 Debug: ApprovalMax token data:", {
      hasToken: !!tokenData.accessToken,
      expiresAt: new Date(tokenData.expiresAt),
      isExpired: Date.now() > tokenData.expiresAt,
      organizationCount: tokenData.organizations
        ? tokenData.organizations.length
        : 0,
    });

    // Test companies endpoint
    const companiesResponse = await fetch(
      `${APPROVALMAX_CONFIG.apiUrl}/companies`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    console.log("🔍 Debug: Companies API response:", companiesResponse.status);

    let companies = [];
    if (companiesResponse.ok) {
      companies = await companiesResponse.json();
    }

    res.json({
      tokenExists: !!tokenData,
      tokenExpired: Date.now() > tokenData.expiresAt,
      organizationCount: tokenData.organizations
        ? tokenData.organizations.length
        : 0,
      companiesApiStatus: companiesResponse.status,
      companiesCount: Array.isArray(companies) ? companies.length : 0,
      sampleCompany:
        Array.isArray(companies) && companies.length > 0 ? companies[0] : null,
    });
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    xeroConnections: Array.from(tokenStore.values()).filter(
      (t) => t.provider === "xero"
    ).length,
    approvalMaxConnections: approvalMaxTokens.size,
    uptime: process.uptime(),
  });
});

// Serve main dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(port, () => {
  console.log(`🚀 RAC Financial Dashboard running on port ${port}`);
  console.log(
    `📊 Dashboard: ${
      process.env.NODE_ENV === "production"
        ? "https://your-app.up.railway.app"
        : `http://localhost:${port}`
    }`
  );
  console.log(`🔗 Xero OAuth: /auth`);
  console.log(`🔗 ApprovalMax OAuth: /auth?provider=approvalmax`);
  console.log(`🎯 Ready for RAC financial integration!`);
});
