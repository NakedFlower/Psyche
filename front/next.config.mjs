/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  eslint: {
    // Ignore during build to avoid potential strict checks in static build
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
