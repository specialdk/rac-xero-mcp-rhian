#!/usr/bin/env node

import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "..", ".env") });

console.log("Starting test...");
console.log("Environment check:", {
  RAILWAY_API_URL: process.env.RAILWAY_API_URL,
  NODE_ENV: process.env.NODE_ENV,
});

const RAILWAY_API_BASE =
  process.env.RAILWAY_API_URL ||
  "https://rac-financial-dashboard-production.up.railway.app";

console.log("Using API base:", RAILWAY_API_BASE);

async function testConnection() {
  console.log("Testing RAC Xero MCP Connection...\n");

  try {
    // Test 1: Health Check
    console.log("1. Testing API Health...");
    const healthUrl = `${RAILWAY_API_BASE}/api/health`;
    console.log(`   URL: ${healthUrl}`);

    const healthResponse = await fetch(healthUrl);

    if (!healthResponse.ok) {
      throw new Error(
        `Health check failed: ${healthResponse.status} - ${healthResponse.statusText}`
      );
    }

    const healthData = await healthResponse.json();
    console.log("   ✅ Health check passed");
    console.log(`   Database: ${healthData.database}`);
    console.log(`   Status: ${healthData.status}`);
    console.log(`   Uptime: ${Math.round(healthData.uptime)}s\n`);

    // Test 2: Connection Status
    console.log("2. Testing Connection Status...");
    const connectionsUrl = `${RAILWAY_API_BASE}/api/connection-status`;

    const connectionsResponse = await fetch(connectionsUrl);

    if (!connectionsResponse.ok) {
      throw new Error(
        `Connections check failed: ${connectionsResponse.status}`
      );
    }

    const connections = await connectionsResponse.json();
    console.log("   ✅ Connection status retrieved");
    console.log(`   Total connections: ${connections.length}`);

    const activeConnections = connections.filter((c) => c.connected);
    const expiredConnections = connections.filter((c) => !c.connected);

    console.log(`   Active: ${activeConnections.length}`);
    console.log(`   Expired: ${expiredConnections.length}`);

    if (activeConnections.length > 0) {
      console.log("   Active Organizations:");
      activeConnections.forEach((conn) => {
        console.log(`     • ${conn.tenantName}`);
      });
    }

    console.log("\n✅ All tests passed! MCP package is working correctly.");
  } catch (error) {
    console.error("\n❌ Connection test failed:");
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run test
testConnection().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
