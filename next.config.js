/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    // Enable WebAssembly support for Tesseract.js
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    
    // Ensure proper handling of native modules
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      }
      
      // Externalize Tesseract.js worker scripts to avoid Next.js bundling issues
      config.externals = config.externals || []
      config.externals.push({
        'tesseract.js': 'commonjs tesseract.js',
      })
    }
    
    return config
  },
}

module.exports = nextConfig

