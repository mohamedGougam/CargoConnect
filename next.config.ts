import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Prevent Next from treating the parent home package-lock as the workspace root.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
