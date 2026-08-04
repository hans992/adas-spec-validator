import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The package's default ESM export is the browser WASM loader. API routes
    // must use its Node build or production parsing fails during WASM loading.
    resolveAlias: {
      "web-ifc": "./node_modules/web-ifc/web-ifc-api-node.js"
    }
  }
};

export default nextConfig;
