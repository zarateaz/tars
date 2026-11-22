/** @type {import('next').NextConfig} */
// CORS ya no es "*": lo gestiona src/middleware.ts (solo la APK y JARVIS_ALLOWED_ORIGINS).
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
};

export default nextConfig;
