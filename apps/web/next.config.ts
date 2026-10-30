import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Stop `next dev` from writing an AGENTS.md file into the app folder.
  agentRules: false,
};

export default nextConfig;
