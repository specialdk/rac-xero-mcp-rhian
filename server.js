// RAC Financial Dashboard - Complete JavaScript
// Replace everything between <script> and </script> tags with this

let currentView = "overview";
let currentSystemView = "all";
let dashboardData = {};
let tokenStatusInterval;
let lastTokenCheck = null;
let selectedReportDate = new Date().toISOString().split("T")[0];

// Define all RAC entities
const racEntities = [
  "Rirratjingu Aboriginal Corporation 8538",
  "Rirratjingu Mining Pty Ltd 7168",
  "Rirratjingu Property Management & Maintenance Services Pty Ltd",
  "Rirratjingu Enterprises Pty Ltd",
  "Rirratjingu Invest P/ L ATF Miliditjpi Trust",
  "Ngarrkuwuy Developments Pty Ltd",
  "Marrin Square Developments Pty Ltd",
];

// Set system view (all, xero, approvalmax)
function setSystemView(view) {
  currentSystemView = view;

  // Update tab states
  document.querySelectorAll(".system-tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  if (event && event.target) {
    event.target.classList.add("active");
  }

  // Reload connection status with filter
  loadConnectionStatus();
}

// Show connection manager
function showConnectionManager(connectionData) {
  const connectionStatus = document.getElementById("connection-status");

  if (!connectionStatus) {
    console.error("❌ connection-status element not found");
    return;
  }

  // Create comprehensive entity list for both systems
  const entityConnections = createEntityConnectionList(connectionData);

  // Filter based on current system view
  let filteredConnections = entityConnections;
  if (currentSystemView === "xero") {
    filteredConnections = entityConnections.filter(
      (conn) => conn.provider === "xero"
    );
  } else if (currentSystemView === "approvalmax") {
    filteredConnections = entityConnections.filter(
      (conn) => conn.provider === "approvalmax"
    );
  }

  const connectedCount = filteredConnections.filter(
    (conn) => conn.connected
  ).length;
  const totalCount = filteredConnections.length;
  const progressPercent =
    totalCount > 0 ? (connectedCount / totalCount) * 100 : 0;

  connectionStatus.innerHTML = `
    <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span><strong>Connection Progress:</strong></span>
            <span><strong>${connectedCount} of ${totalCount} connections active</strong></span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
    </div>
    
    <div class="connection-grid">
        ${filteredConnections
          .map((conn) => {
            return `
                <div class="entity-connection-card ${
                  conn.connected ? "connected" : "disconnected"
                } ${conn.provider}">
                    <div class="provider-badge ${
                      conn.provider
                    }">${conn.provider.toUpperCase()}</div>
                    <div class="entity-name">${conn.tenantName}</div>
                    <div class="connection-status">
                        <div class="status-indicator ${
                          conn.connected ? "connected" : "disconnected"
                        }"></div>
                        <span>${
                          conn.connected
                            ? "Connected & Active"
                            : "Not Connected"
                        }</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #666; margin: 5px 0;">
                        ${
                          conn.provider === "approvalmax" &&
                          conn.organizationCount !== undefined
                            ? `Organizations: ${conn.organizationCount} connected`
                            : `Last seen: ${conn.lastSeen || "Never"}`
                        }
                    </div>
                    ${
                      !conn.connected
                        ? `
                        <button class="connect-btn ${
                          conn.provider
                        }" onclick="connectEntity('${conn.tenantName}', '${
                            conn.provider
                          }')">
                            Connect ${
                              conn.provider === "xero" ? "Xero" : "ApprovalMax"
                            }
                        </button>
                    `
                        : `
                        <div style="color: #4CAF50; font-size: 0.9rem; margin-top: 10px;">
                            ✅ Live data connection active
                        </div>
                        <button class="connect-btn ${conn.provider}" onclick="connectEntity('${conn.tenantName}', '${conn.provider}')" style="font-size: 0.8rem; padding: 6px 12px; margin-top: 5px;">
                            Reconnect
                        </button>
                    `
                    }
                </div>
            `;
          })
          .join("")}
    </div>
    
    ${
      connectedCount > 0
        ? `
        <div class="success-box" style="margin-top: 20px;">
            🎉 <strong>${connectedCount} connections active!</strong> Your dashboard is receiving live data.
            <button class="connect-btn" onclick="showDashboard()" style="margin-left: 15px;">
                ${
                  connectedCount === totalCount
                    ? "Launch Full Dashboard"
                    : "View Partial Dashboard"
                }
            </button>
        </div>
    `
        : `
        <div class="info-box" style="margin-top: 20px;">
            💡 <strong>Connect your systems:</strong> Set up Xero and ApprovalMax connections to enable consolidated financial reporting.
        </div>
    `
    }
  `;
}

// Create comprehensive entity connection list for both systems
function createEntityConnectionList(connectionData) {
  const entityConnections = [];

  // Add individual Xero connection entries for each RAC entity
  racEntities.forEach((entityName) => {
    const xeroConnection = connectionData.find(
      (conn) => conn.provider === "xero" && conn.tenantName === entityName
    );

    entityConnections.push({
      tenantId: xeroConnection ? xeroConnection.tenantId : null,
      tenantName: entityName,
      provider: "xero",
      connected: xeroConnection ? xeroConnection.connected : false,
      lastSeen: xeroConnection ? xeroConnection.lastSeen : null,
      error: xeroConnection ? xeroConnection.error : null,
    });
  });

  // Add single ApprovalMax connection entry for all organizations
  const approvalMaxConnections = connectionData.filter(
    (conn) => conn.provider === "approvalmax"
  );
  const hasApprovalMaxConnection = approvalMaxConnections.length > 0;
  const connectedOrgsCount = approvalMaxConnections.filter(
    (conn) => conn.connected
  ).length;

  entityConnections.push({
    tenantId: hasApprovalMaxConnection ? "approvalmax-integration" : null,
    tenantName: "RAC ApprovalMax Integration",
    provider: "approvalmax",
    connected: connectedOrgsCount > 0,
    lastSeen: hasApprovalMaxConnection
      ? approvalMaxConnections[0].lastSeen
      : null,
    error: hasApprovalMaxConnection ? approvalMaxConnections[0].error : null,
    organizationCount: connectedOrgsCount,
    totalOrganizations: approvalMaxConnections.length,
  });

  return entityConnections;
}

// Connect to specific entity
function connectEntity(entityName, provider) {
  console.log(`🔗 Connecting to ${provider} for entity: ${entityName}`);

  localStorage.setItem("connecting_entity", entityName);
  localStorage.setItem("connecting_provider", provider);

  if (provider === "approvalmax") {
    window.location.href = "/auth?provider=approvalmax";
  } else {
    window.location.href = "/auth";
  }
}

// Toggle connection manager overlay
function toggleConnectionManager() {
  const connectionManager = document.getElementById("connection-manager");
  const dashboardControls = document.getElementById("dashboard-controls");
  const dashboardContent = document.getElementById("dashboard-content");

  if (connectionManager.style.display === "none") {
    // Show connection manager, hide dashboard
    connectionManager.style.display = "block";
    dashboardControls.style.display = "none";
    dashboardContent.style.display = "none";
  } else {
    // Hide connection manager, show dashboard
    connectionManager.style.display = "none";
    dashboardControls.style.display = "block";
    dashboardContent.style.display = "grid";
  }

  // Load connection status when showing connection manager
  if (connectionManager.style.display === "block") {
    loadConnectionStatus();
  }
}

// Close connection manager overlay
function closeConnectionManager() {
  document.getElementById("connection-overlay").style.display = "none";
}

// Load connection status
async function loadConnectionStatus() {
  try {
    console.log("🔄 Loading connection status...");

    const response = await fetch("/api/connection-status");
    if (!response.ok) {
      throw new Error(`Connection status API returned ${response.status}`);
    }

    const connectionStatus = await response.json();
    console.log("📊 Connection status received:", connectionStatus);

    if (
      document.getElementById("connection-overlay").style.display === "flex"
    ) {
      showOverlayConnectionManager(connectionStatus);
    } else {
      showConnectionManager(connectionStatus);
    }
  } catch (error) {
    console.error("❌ Error loading connection status:", error);
    const targetElement =
      document.getElementById("connection-overlay").style.display === "flex"
        ? document.getElementById("overlay-connection-status")
        : document.getElementById("connection-status");

    if (targetElement) {
      targetElement.innerHTML = `
        <div class="error">❌ Failed to load connection status: ${error.message}</div>
      `;
    }
  }
}

// Show connection manager in overlay
function showOverlayConnectionManager(connectionStatusArray) {
  const connectionStatus = document.getElementById("overlay-connection-status");

  if (!connectionStatus) {
    console.error("❌ overlay-connection-status element not found");
    return;
  }

  // Create comprehensive entity list for both systems
  const entityConnections = createEntityConnectionList(connectionStatusArray);

  // Filter based on current system view
  let filteredConnections = entityConnections;
  if (currentSystemView === "xero") {
    filteredConnections = entityConnections.filter(
      (conn) => conn.provider === "xero"
    );
  } else if (currentSystemView === "approvalmax") {
    filteredConnections = entityConnections.filter(
      (conn) => conn.provider === "approvalmax"
    );
  }

  const connectedCount = filteredConnections.filter(
    (conn) => conn.connected
  ).length;
  const totalCount = filteredConnections.length;
  const progressPercent =
    totalCount > 0 ? (connectedCount / totalCount) * 100 : 0;

  const healthStatus = connectedCount > 0 ? "healthy" : "error";
  const healthText =
    connectedCount > 0 ? "Connections active" : "No connections";

  connectionStatus.innerHTML = `
    <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span><strong>RAC System Connections:</strong></span>
            <div class="connection-status-indicator ${healthStatus}">
                <div class="status-indicator ${healthStatus}"></div>
                ${healthText}
            </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span><strong>Connection Progress:</strong></span>
            <span><strong>${connectedCount} of ${totalCount} connections active</strong></span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
    </div>
    
    <div class="connection-grid">
        ${filteredConnections
          .map((conn) => {
            const lastSeen = conn.lastSeen
              ? new Date(conn.lastSeen).toLocaleString()
              : "Never";

            return `
                <div class="entity-connection-card ${
                  conn.connected ? "connected" : "disconnected"
                } ${conn.provider}">
                    <div class="provider-badge ${
                      conn.provider
                    }">${conn.provider.toUpperCase()}</div>
                    <div class="entity-name">${conn.tenantName}</div>
                    <div class="connection-status">
                        <div class="status-indicator ${
                          conn.connected ? "connected" : "disconnected"
                        }"></div>
                        <span>${
                          conn.connected
                            ? "Connected & Active"
                            : "Not Connected"
                        }</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #666; margin: 5px 0;">
                        ${
                          conn.provider === "approvalmax" &&
                          conn.organizationCount !== undefined
                            ? `Organizations: ${conn.organizationCount} connected`
                            : `Last seen: ${lastSeen}`
                        }
                    </div>
                    ${
                      !conn.connected
                        ? `
                        <button class="connect-btn ${
                          conn.provider
                        }" onclick="connectEntity('${conn.tenantName}', '${
                            conn.provider
                          }')">
                            Connect ${
                              conn.provider === "xero" ? "Xero" : "ApprovalMax"
                            }
                        </button>
                    `
                        : `
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="connect-btn ${conn.provider}" onclick="testConnection('${conn.tenantId}', '${conn.provider}')" style="font-size: 0.8rem; padding: 6px 12px;">
                                Test Connection
                            </button>
                            <button class="connect-btn ${conn.provider}" onclick="connectEntity('${conn.tenantName}', '${conn.provider}')" style="opacity: 0.7; font-size: 0.8rem; padding: 6px 12px;">
                                Reconnect
                            </button>
                        </div>
                    `
                    }
                </div>
            `;
          })
          .join("")}
    </div>
  `;
}

// Test connection for specific entity
async function testConnection(tenantId, provider) {
  try {
    let response;
    if (provider === "xero") {
      response = await fetch(`/api/cash-position/${tenantId}`);
    } else if (provider === "approvalmax") {
      response = await fetch(`/api/approvalmax/approval-summary/${tenantId}`);
    }

    if (response.ok) {
      alert(
        `✅ ${provider.toUpperCase()} connection is healthy and returning data`
      );
    } else {
      alert(
        `⚠️ ${provider.toUpperCase()} connection may have issues (${
          response.status
        })`
      );
    }
  } catch (error) {
    alert(
      `❌ ${provider.toUpperCase()} connection test failed: ${error.message}`
    );
  }
}

// Load available tenants and show appropriate interface
async function loadTenants() {
  try {
    console.log("🔄 Loading tenants...");

    const response = await fetch("/api/connection-status");
    if (!response.ok) {
      throw new Error(`Failed to load connection status: ${response.status}`);
    }

    const connectionStatus = await response.json();
    console.log("📊 Connection status loaded:", connectionStatus);

    // Show connection manager with all systems
    showConnectionManager(connectionStatus);

    // Populate dashboard selector with connected entities
    const connectedEntities = connectionStatus.filter(
      (entity) => entity.connected
    );
    if (connectedEntities.length > 0) {
      const select = document.getElementById("subsidiary-select");
      if (select) {
        const consolidatedOption = select.querySelector(
          'option[value="consolidated"]'
        );
        select.innerHTML = "";
        if (consolidatedOption) {
          select.appendChild(consolidatedOption);
        }

        connectedEntities.forEach((entity) => {
          const option = document.createElement("option");
          option.value = entity.tenantId;
          option.textContent = `🏢 ${
            entity.tenantName
          } (${entity.provider.toUpperCase()})`;
          select.appendChild(option);
        });
      }
    }

    // Auto-launch dashboard if we have connections
    if (connectedEntities.length > 0) {
      setTimeout(() => showDashboard(), 2000);
    }
  } catch (error) {
    console.error("❌ Error loading connection status:", error);
    const connectionStatusEl = document.getElementById("connection-status");
    if (connectionStatusEl) {
      connectionStatusEl.innerHTML = `
        <div class="error">❌ Failed to load connection status. 
        <button class="connect-btn" onclick="window.location.href='/auth'">Connect to Xero</button>
        <button class="connect-btn approvalmax" onclick="window.location.href='/auth?provider=approvalmax'">Connect to ApprovalMax</button></div>
      `;
    }
  }
}

// Load dashboard data based on selected view
async function loadDashboardData() {
  const selectedTenant =
    document.getElementById("subsidiary-select")?.value || "consolidated";

  try {
    if (selectedTenant === "consolidated") {
      await loadTrialBalanceData();
    } else {
      await loadIndividualTenantData(selectedTenant);
    }
  } catch (error) {
    console.error("❌ Error loading dashboard data:", error);
    showError("Failed to load financial data");
  }
}

// Load individual tenant data
async function loadIndividualTenantData(tenantId) {
  try {
    // Determine if this is Xero or ApprovalMax based on tenant ID format
    const connectionStatus = await fetch("/api/connection-status").then((r) =>
      r.json()
    );
    const entityInfo = connectionStatus.find(
      (conn) => conn.tenantId === tenantId
    );

    if (!entityInfo) {
      throw new Error("Entity not found");
    }

    if (entityInfo.provider === "xero") {
      await loadXeroTenantData(tenantId);
    } else if (entityInfo.provider === "approvalmax") {
      await loadApprovalMaxTenantData(tenantId);
    }
  } catch (error) {
    console.error("❌ Error loading tenant data:", error);
    showError("Failed to load entity data");
  }
}

// Load Xero tenant data
async function loadXeroTenantData(tenantId) {
  const [
    cashResponse,
    receivablesResponse,
    invoicesResponse,
    contactsResponse,
  ] = await Promise.all([
    fetch(`/api/cash-position/${tenantId}`),
    fetch(`/api/receivables/${tenantId}`),
    fetch(`/api/outstanding-invoices/${tenantId}`),
    fetch(`/api/contacts/${tenantId}`),
  ]);

  const [cashData, receivablesData, invoicesData, contactsData] =
    await Promise.all([
      cashResponse.json(),
      receivablesResponse.json(),
      invoicesResponse.json(),
      contactsResponse.json(),
    ]);

  const tenantData = {
    provider: "xero",
    cash: cashData,
    receivables: receivablesData,
    invoices: invoicesData,
    contacts: contactsData,
  };

  dashboardData = tenantData;
  renderXeroTenantView(tenantData);
}

// Load ApprovalMax tenant data
async function loadApprovalMaxTenantData(organizationId) {
  const [pendingResponse, summaryResponse, bottlenecksResponse] =
    await Promise.all([
      fetch(`/api/approvalmax/pending-approvals/${organizationId}`),
      fetch(`/api/approvalmax/approval-summary/${organizationId}`),
      fetch(`/api/approvalmax/workflow-bottlenecks/${organizationId}`),
    ]);

  const [pendingData, summaryData, bottlenecksData] = await Promise.all([
    pendingResponse.json(),
    summaryResponse.json(),
    bottlenecksResponse.json(),
  ]);

  const organizationData = {
    provider: "approvalmax",
    pending: pendingData,
    summary: summaryData,
    bottlenecks: bottlenecksData,
  };

  dashboardData = organizationData;
  renderApprovalMaxTenantView(organizationData);
}

// Show main dashboard
function showDashboard() {
  document.getElementById("connection-manager").style.display = "none";
  document.getElementById("dashboard-controls").style.display = "block";
  document.getElementById("dashboard-content").style.display = "grid";
  loadDashboardData();
}

// TOKEN STATUS MONITORING
async function monitorTokenStatus() {
  try {
    console.log("🔄 Checking token status...");

    const response = await fetch("/api/token-status");
    if (!response.ok) {
      throw new Error(`Token status API returned ${response.status}`);
    }

    const tokenStatus = await response.json();
    console.log("📊 Token status received:", tokenStatus);

    lastTokenCheck = tokenStatus;
    updateTokenStatusDisplay(tokenStatus);

    // Show warnings if needed
    if (tokenStatus.needsAttention) {
      console.log("⚠️ Tokens need attention:", tokenStatus.expiringTokens);
      showTokenWarnings(tokenStatus);
    }
  } catch (error) {
    console.error("❌ Error monitoring token status:", error);
  }
}

// Update token status display in dashboard
function updateTokenStatusDisplay(tokenStatus) {
  let tokenStatusHtml = "";

  if (tokenStatus.expiringTokens > 0) {
    tokenStatusHtml = `
      <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 8px 12px; margin-left: 15px; font-size: 0.9rem;">
        ⚠️ ${tokenStatus.expiringTokens} token(s) expiring soon
        <button onclick="manualRefreshTokens(event)" style="margin-left: 10px; padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
          Refresh Now
        </button>
      </div>
    `;
  } else if (tokenStatus.connectedTokens > 0) {
    tokenStatusHtml = `
      <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 8px 12px; margin-left: 15px; font-size: 0.9rem;">
        ✅ ${tokenStatus.connectedTokens} connection(s) active
      </div>
    `;
  }

  // Add to header if not already there
  const header = document.querySelector(".header");
  let statusDiv = document.getElementById("token-status-display");

  if (!statusDiv && tokenStatusHtml) {
    statusDiv = document.createElement("div");
    statusDiv.id = "token-status-display";
    statusDiv.innerHTML = tokenStatusHtml;
    header.appendChild(statusDiv);
  } else if (statusDiv) {
    statusDiv.innerHTML = tokenStatusHtml;
  }
}

// Show detailed token warnings
function showTokenWarnings(tokenStatus) {
  if (tokenStatus.expiringDetails && tokenStatus.expiringDetails.length > 0) {
    const warningMessages = tokenStatus.expiringDetails
      .map(
        (token) =>
          `${token.tenantName}: ${token.minutesUntilExpiry} minutes remaining`
      )
      .join("\n");

    console.warn("⚠️ Tokens expiring soon:\n" + warningMessages);

    // Optional: Show browser notification if user granted permission
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("RAC Dashboard: Tokens Expiring Soon", {
        body: `${tokenStatus.expiringTokens} connection(s) will expire in the next 15 minutes`,
        icon: "/favicon.ico",
      });
    }
  }
}

// Manual token refresh function
async function manualRefreshTokens(event) {
  try {
    console.log("🔄 Manual token refresh triggered");

    // Show loading state
    const refreshBtn = event
      ? event.target
      : document.querySelector('button[onclick*="manualRefreshTokens"]');
    if (!refreshBtn) {
      console.error("❌ Could not find refresh button");
      return;
    }

    const originalText = refreshBtn.textContent;
    refreshBtn.textContent = "Refreshing...";
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = "0.6";

    const response = await fetch("/api/refresh-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Refresh response:", result);

    if (result.success) {
      // Show success message
      showRefreshResult(
        `✅ Refreshed ${result.refreshed} tokens successfully!`
      );

      // Reload dashboard data with fresh tokens
      await loadDashboardData();

      // Update token status immediately
      await monitorTokenStatus();
    } else {
      showRefreshResult(
        `❌ Refresh failed: ${result.error || "Unknown error"}`
      );
    }

    // Restore button
    refreshBtn.textContent = originalText;
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = "1";
  } catch (error) {
    console.error("❌ Manual refresh error:", error);
    showRefreshResult(`❌ Refresh failed: ${error.message}`);

    // Restore button even on error
    const refreshBtn = event
      ? event.target
      : document.querySelector('button[onclick*="manualRefreshTokens"]');
    if (refreshBtn) {
      refreshBtn.textContent = "Refresh Now";
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = "1";
    }
  }
}

// Show refresh result message
function showRefreshResult(message) {
  console.log("📢 Showing refresh result:", message);

  // Create temporary notification
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${message.includes("✅") ? "#d4edda" : "#f8d7da"};
    border: 1px solid ${message.includes("✅") ? "#c3e6cb" : "#f5c6cb"};
    color: ${message.includes("✅") ? "#155724" : "#721c24"};
    padding: 12px 20px;
    border-radius: 6px;
    font-weight: bold;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-width: 400px;
    word-wrap: break-word;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);
  console.log("✅ Notification added to DOM");

  // Remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
      console.log("🗑️ Notification removed from DOM");
    }
  }, 5000);
}

// Start token monitoring when dashboard loads
function startTokenMonitoring() {
  // Check token status immediately
  monitorTokenStatus();

  // Then check every 2 minutes
  tokenStatusInterval = setInterval(monitorTokenStatus, 2 * 60 * 1000);

  console.log("🔄 Token status monitoring started");
}

// Stop token monitoring
function stopTokenMonitoring() {
  if (tokenStatusInterval) {
    clearInterval(tokenStatusInterval);
    tokenStatusInterval = null;
    console.log("⏹️ Token status monitoring stopped");
  }
}

// Request notification permission when dashboard loads
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        console.log("✅ Notification permission granted");
      }
    });
  }
}

// DATE PICKER FUNCTIONS
function updateReportDate(newDate) {
  selectedReportDate = newDate;
  const displayElement = document.getElementById("display-date");
  if (displayElement) {
    displayElement.textContent = formatDisplayDate(newDate);
  }
  loadDashboardData();
}

function setQuickDate(option) {
  let newDate;
  const today = new Date();

  switch (option) {
    case "today":
      newDate = today;
      break;
    case "monthEnd":
      newDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case "lastMonth":
      newDate = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    default:
      newDate = today;
  }

  const dateString = newDate.toISOString().split("T")[0];
  selectedReportDate = dateString;

  const dateInput = document.getElementById("report-date");
  if (dateInput) {
    dateInput.value = dateString;
  }

  const displayElement = document.getElementById("display-date");
  if (displayElement) {
    displayElement.textContent = formatDisplayDate(dateString);
  }

  loadDashboardData();
}

function formatDisplayDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  };
  return date.toLocaleDateString("en-AU", options);
}

// TRIAL BALANCE FUNCTIONS

// Load and render hierarchical trial balance data
async function loadTrialBalanceData() {
  try {
    const response = await fetch("/api/consolidated-trial-balance");
    const data = await response.json();

    dashboardData = data;
    renderHierarchicalTrialBalanceView(data);
  } catch (error) {
    console.error("❌ Error loading hierarchical trial balance:", error);
    showError("Failed to load hierarchical trial balance data");
  }
}

// Render hierarchical trial balance view with expandable sections
function renderHierarchicalTrialBalanceView(data) {
  document.querySelector(".toggle-btn").parentElement.style.display = "block";
  const content = document.getElementById("dashboard-content");

  const totals = data.consolidated.totals;
  const balanceCheck = data.consolidated.balanceCheck;
  const summary = data.summary;

  content.innerHTML = `
    <!-- Consolidated Trial Balance Overview - FULL WIDTH -->
    <div class="demo-card financial-overview">
        <div class="card-header">
            <h3>⚖️ RAC Consolidated Trial Balance</h3>
            <p>Hierarchical financial position across ${
              data.companies.length
            } RAC entities</p>
        </div>
        <div class="card-content">
            <div class="dashboard-mockup">
                <!-- Consolidated Balance Check Status -->
                <div style="margin-bottom: 20px; padding: 15px; border-radius: 8px; ${
                  balanceCheck.debitsEqualCredits
                    ? "background: #d4edda; border: 1px solid #c3e6cb; color: #155724;"
                    : "background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24;"
                }">
                    <div style="font-weight: bold; margin-bottom: 5px;">
                        ${
                          balanceCheck.debitsEqualCredits
                            ? "✅ Consolidated Books are BALANCED"
                            : "⚠️ Consolidated Books are OUT OF BALANCE"
                        }
                    </div>
                    <div style="font-size: 0.9rem;">
                        Debits: ${totals.totalDebits.toLocaleString()} | Credits: ${totals.totalCredits.toLocaleString()}
                        ${
                          !balanceCheck.debitsEqualCredits
                            ? ` | Difference: ${Math.abs(
                                balanceCheck.difference
                              ).toLocaleString()}`
                            : ""
                        }
                    </div>
                    <div style="font-size: 0.9rem; margin-top: 5px;">
                        Accounting Equation: Assets (${totals.totalAssets.toLocaleString()}) = Liabilities + Equity (${(
    totals.totalLiabilities + totals.totalEquity
  ).toLocaleString()})
                        ${
                          balanceCheck.accountingEquation.balanced
                            ? " ✅"
                            : " ⚠️"
                        }
                    </div>
                </div>

                <!-- Consolidated Summary Totals -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                    <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 1.4rem; font-weight: bold; color: #28a745;">${totals.totalAssets.toLocaleString()}</div>
                        <div style="font-size: 1rem; color: #666;">Total Assets</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 1.4rem; font-weight: bold; color: #dc3545;">${totals.totalLiabilities.toLocaleString()}</div>
                        <div style="font-size: 1rem; color: #666;">Total Liabilities</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 1.4rem; font-weight: bold; color: #17a2b8;">${totals.totalEquity.toLocaleString()}</div>
                        <div style="font-size: 1rem; color: #666;">Total Equity</div>
                    </div>
                </div>

                <!-- Entity Breakdown Header -->
                <div style="border-bottom: 2px solid #13547a; padding-bottom: 10px; margin-bottom: 20px;">
                    <div style="font-weight: bold; font-size: 1.1rem; color: #13547a;">📊 Entity Breakdown:</div>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${summary.totalCompanies} companies • ${
    summary.totalAccounts
  } accounts • 
                        ${summary.balancedCompanies}/${
    summary.totalCompanies
  } balanced
                    </div>
                </div>

                <!-- Company-by-Company Hierarchical Breakdown -->
                <div id="companies-breakdown">
                    ${data.companies
                      .map(
                        (company, companyIndex) => `
                        <div class="company-card" style="margin-bottom: 25px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
                            <!-- Company Header (Clickable to expand/collapse) -->
                            <div class="company-header" 
                                 onclick="toggleCompany(${companyIndex})" 
                                 style="
                                    background: ${
                                      company.balanceCheck.debitsEqualCredits
                                        ? "#f8f9fa"
                                        : "#fff3cd"
                                    }; 
                                    padding: 15px; 
                                    cursor: pointer; 
                                    border-bottom: 1px solid #ddd;
                                    display: flex; 
                                    justify-content: space-between; 
                                    align-items: center;
                                 ">
                                <div>
                                    <div style="font-weight: bold; color: #13547a; font-size: 1.1rem;">
                                        <span id="company-toggle-${companyIndex}" style="margin-right: 8px;">▶</span>
                                        🏢 ${company.tenantName}
                                    </div>
                                    <div style="font-size: 0.9rem; color: #666; margin-top: 5px;">
                                        ${
                                          company.accountCounts.totalAccounts
                                        } accounts • 
                                        ${
                                          company.balanceCheck
                                            .debitsEqualCredits
                                            ? "✅ Balanced"
                                            : "⚠️ Out of Balance"
                                        }
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 0.9rem; color: #666;">Assets: ${company.totals.totalAssets.toLocaleString()}</div>
                                    <div style="font-size: 0.9rem; color: #666;">Liabilities: ${company.totals.totalLiabilities.toLocaleString()}</div>
                                    <div style="font-size: 0.9rem; color: #666;">Equity: ${company.totals.totalEquity.toLocaleString()}</div>
                                </div>
                            </div>

                            <!-- Company Sections (Initially Hidden) -->
                            <div id="company-sections-${companyIndex}" class="company-sections" style="display: none;">
                                ${Object.entries(company.sections)
                                  .filter(
                                    ([sectionKey, section]) =>
                                      section.accounts.length > 0
                                  )
                                  .map(
                                    ([sectionKey, section], sectionIndex) => `
                                    <div class="section-card" style="margin: 10px; border: 1px solid #e9ecef; border-radius: 8px;">
                                        <!-- Section Header (Clickable to expand/collapse accounts) -->
                                        <div class="section-header" 
                                             onclick="toggleSection(${companyIndex}, '${sectionKey}')"
                                             style="
                                                background: #f8f9fa; 
                                                padding: 12px; 
                                                cursor: pointer;
                                                display: flex; 
                                                justify-content: space-between; 
                                                align-items: center;
                                             ">
                                            <div>
                                                <span id="section-toggle-${companyIndex}-${sectionKey}" style="margin-right: 8px;">▶</span>
                                                <strong>${
                                                  section.title
                                                }</strong>
                                                <span style="color: #666; margin-left: 10px;">(${
                                                  section.accounts.length
                                                } accounts)</span>
                                            </div>
                                            <div style="font-weight: bold; color: ${
                                              sectionKey === "assets"
                                                ? "#28a745"
                                                : sectionKey === "liabilities"
                                                ? "#dc3545"
                                                : sectionKey === "equity"
                                                ? "#17a2b8"
                                                : sectionKey === "revenue"
                                                ? "#28a745"
                                                : "#ffc107"
                                            };">
                                                ${section.total.toLocaleString()}
                                            </div>
                                        </div>

                                        <!-- Account Details (Initially Hidden) -->
                                        <div id="section-accounts-${companyIndex}-${sectionKey}" class="section-accounts" style="display: none;">
                                            <div style="padding: 10px;">
                                                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; background: #f1f3f4; padding: 8px; font-weight: bold; font-size: 0.9rem;">
                                                    <div>Account Name</div>
                                                    <div style="text-align: right;">Debit</div>
                                                    <div style="text-align: right;">Credit</div>
                                                </div>
                                                ${section.accounts
                                                  .map(
                                                    (account) => `
                                                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; padding: 8px; border-bottom: 1px solid #eee; font-size: 0.9rem;">
                                                        <div>${
                                                          account.name
                                                        }</div>
                                                        <div style="text-align: right; ${
                                                          account.debit > 0
                                                            ? "font-weight: bold;"
                                                            : "color: #999;"
                                                        }">
                                                            ${
                                                              account.debit > 0
                                                                ? "$" +
                                                                  account.debit.toLocaleString()
                                                                : "-"
                                                            }
                                                        </div>
                                                        <div style="text-align: right; ${
                                                          account.credit > 0
                                                            ? "font-weight: bold;"
                                                            : "color: #999;"
                                                        }">
                                                            ${
                                                              account.credit > 0
                                                                ? "$" +
                                                                  account.credit.toLocaleString()
                                                                : "-"
                                                            }
                                                        </div>
                                                    </div>
                                                `
                                                  )
                                                  .join("")}
                                            </div>
                                        </div>
                                    </div>
                                `
                                  )
                                  .join("")}
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
            
            <div class="${
              balanceCheck.debitsEqualCredits ? "success-box" : "alert-box"
            }">
                ${
                  balanceCheck.debitsEqualCredits
                    ? "✅ Consolidated Trial Balance is accurate across all RAC entities"
                    : "⚠️ Trial Balance shows discrepancies - expand companies above to review individual entity balances"
                }
            </div>
        </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="demo-card">
        <div class="card-header">
            <h3>📈 Portfolio Overview</h3>
            <p>RAC financial portfolio at a glance</p>
        </div>
        <div class="card-content">
            <div class="dashboard-mockup">
                <div class="metric-row">
                    <span class="metric-label">Total Portfolio Value</span>
                    <span class="metric-value large">${(
                      totals.totalAssets - totals.totalLiabilities
                    ).toLocaleString()}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Largest Entity</span>
                    <span class="metric-value">${
                      data.companies.length > 0
                        ? data.companies
                            .reduce((max, company) =>
                              company.totals.totalAssets >
                              max.totals.totalAssets
                                ? company
                                : max
                            )
                            .tenantName.split(" ")
                            .slice(0, 3)
                            .join(" ")
                        : "N/A"
                    }</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Data Quality</span>
                    <span class="metric-value" style="color: ${
                      summary.dataQuality.allBalanced ? "green" : "orange"
                    };">
                        ${
                          summary.dataQuality.allBalanced
                            ? "100% Balanced"
                            : "Review Required"
                        }
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- Integration Status -->
    <div class="demo-card">
        <div class="card-header">
            <h3>🔗 Integration Status</h3>
            <p>System connections and data flow</p>
        </div>
        <div class="card-content">
            <div class="dashboard-mockup">
                <div class="metric-row">
                    <span class="metric-label">Connected Entities</span>
                    <span class="metric-value">${
                      summary.totalCompanies
                    } RAC companies</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Total Accounts</span>
                    <span class="metric-value">${
                      summary.totalAccounts
                    } active accounts</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Last Update</span>
                    <span class="metric-value">Just now</span>
                </div>
            </div>
            <div class="success-box">
                ✅ Hierarchical Trial Balance system operational - Real-time drilling from consolidated to account level
            </div>
        </div>
    </div>
  `;
}

// Toggle company expansion
function toggleCompany(companyIndex) {
  const sectionsDiv = document.getElementById(
    `company-sections-${companyIndex}`
  );
  const toggleIcon = document.getElementById(`company-toggle-${companyIndex}`);

  if (sectionsDiv.style.display === "none") {
    sectionsDiv.style.display = "block";
    toggleIcon.textContent = "▼";
  } else {
    sectionsDiv.style.display = "none";
    toggleIcon.textContent = "▶";
  }
}

// Toggle section expansion
function toggleSection(companyIndex, sectionKey) {
  const accountsDiv = document.getElementById(
    `section-accounts-${companyIndex}-${sectionKey}`
  );
  const toggleIcon = document.getElementById(
    `section-toggle-${companyIndex}-${sectionKey}`
  );

  if (accountsDiv.style.display === "none") {
    accountsDiv.style.display = "block";
    toggleIcon.textContent = "▼";
  } else {
    accountsDiv.style.display = "none";
    toggleIcon.textContent = "▶";
  }
}

// Show error message
function showError(message) {
  const content = document.getElementById("dashboard-content");
  content.innerHTML = `<div class="error">❌ ${message}</div>`;
}

// Set view type
function setView(viewType) {
  currentView = viewType;

  // Update button states
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  if (event && event.target) {
    event.target.classList.add("active");
  }

  // Reload data with new view
  loadDashboardData();
}

// Placeholder functions for missing renders
function renderXeroTenantView(tenantData) {
  console.log("renderXeroTenantView called with:", tenantData);
  // Add implementation if needed
}

function renderApprovalMaxTenantView(organizationData) {
  console.log("renderApprovalMaxTenantView called with:", organizationData);
  // Add implementation if needed
}

// Debug function for testing
function testRefreshButton() {
  console.log("🧪 Testing refresh button...");

  const button = document.querySelector(
    'button[onclick*="manualRefreshTokens"]'
  );
  if (button) {
    console.log("✅ Found refresh button:", button);
    const fakeEvent = { target: button };
    manualRefreshTokens(fakeEvent);
  } else {
    console.log("❌ Refresh button not found");
  }
}

// Update timestamp
function updateTimestamp() {
  const timestampElement = document.getElementById("timestamp");
  if (timestampElement) {
    timestampElement.textContent = new Date().toLocaleString();
  }
}

// Initialize dashboard
function initializeDashboard() {
  // Request notification permission
  requestNotificationPermission();

  // Start token monitoring after a short delay
  setTimeout(() => {
    startTokenMonitoring();
  }, 3000);

  // Update timestamp
  updateTimestamp();
  setInterval(updateTimestamp, 30000);

  // Load tenants and connection status
  loadTenants();

  // Auto-refresh data every 5 minutes
  setInterval(loadDashboardData, 300000);
}

// Event listeners and initialization
document.addEventListener("DOMContentLoaded", function () {
  initializeDashboard();
});

// Initialize when page loads
window.addEventListener("load", () => {
  initializeDashboard();
});

// Cleanup when page unloads
window.addEventListener("beforeunload", function () {
  stopTokenMonitoring();
});

// Make functions available globally
window.setSystemView = setSystemView;
window.setView = setView;
window.toggleConnectionManager = toggleConnectionManager;
window.showDashboard = showDashboard;
window.connectEntity = connectEntity;
window.manualRefreshTokens = manualRefreshTokens;
window.testRefreshButton = testRefreshButton;
window.toggleCompany = toggleCompany;
window.toggleSection = toggleSection;
window.updateReportDate = updateReportDate;
window.setQuickDate = setQuickDate;
