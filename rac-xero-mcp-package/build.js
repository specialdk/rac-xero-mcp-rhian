#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy the main mcp-server.js file to dist/index.js
const srcFile = path.join(__dirname, "src", "mcp-server.js");
const distFile = path.join(distDir, "index.js");

try {
  // Check if source file exists
  if (!fs.existsSync(srcFile)) {
    console.error("❌ Source file not found:", srcFile);
    console.log("Expected structure:");
    console.log("├── src/");
    console.log("│   └── mcp-server.js");
    console.log("├── package.json");
    console.log("└── build.js");
    process.exit(1);
  }

  // Read source file
  let content = fs.readFileSync(srcFile, "utf8");

  // Add shebang if not present
  if (!content.startsWith("#!/usr/bin/env node")) {
    content = "#!/usr/bin/env node\n\n" + content;
  }

  // Write to dist
  fs.writeFileSync(distFile, content);

  // Make executable
  fs.chmodSync(distFile, "755");

  console.log("✅ Build completed successfully!");
  console.log(`📁 Output: ${distFile}`);
  console.log("🚀 Ready for distribution");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
