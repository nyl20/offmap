import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @offmap/shared and @offmap/db ship raw .ts source (no build step —
  // package.json "main"/"types" point straight at src/index.ts), so Next
  // needs to be told to compile them itself rather than treating them like
  // pre-built node_modules.
  transpilePackages: ['@offmap/shared', '@offmap/db'],
};

export default nextConfig;
