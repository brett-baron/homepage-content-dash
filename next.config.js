/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  trailingSlash: true,
  distDir: 'out',
  images: {
    unoptimized: true
  },
  assetPrefix: './',
  exportPathMap: async function (defaultPathMap) {
    return {
      '/': { page: '/' }
    }
  }
};

module.exports = nextConfig;
