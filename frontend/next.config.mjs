/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing shared alert filter from repo-root `src/`
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
