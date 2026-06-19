/** @type {import('next').NextConfig} */
const nextConfig = {
  // ★ 移除 output: 'export'，因為 /api/proxy 需要 Node.js runtime
  //    改用 Vercel 自動部署即可（支援 serverless function）
  images: { unoptimized: true },
};
module.exports = nextConfig;
