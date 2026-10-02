import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The e2e suite drives the dev server over 127.0.0.1 rather than localhost.
  allowedDevOrigins: ['127.0.0.1'],
  // The floating dev badge sits on top of the UI and ends up in screenshots.
  devIndicators: false,
};

export default nextConfig;
