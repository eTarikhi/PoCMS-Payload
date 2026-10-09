/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
    // output: 'export',
    // Optional: Change links `/me` -> `/me/` and emit `/me.html` -> `/me/index.html`
    // trailingSlash: true,
    // images: {
    //     loader: 'custom',
    //     loaderFile: './loader.tsx',
    //   },
    // images.unoptimized = true,
    // Optional: Prevent automatic `/me` -> `/me/`, instead preserve `href`
    // skipTrailingSlashRedirect: true,
   
    // Optional: Change the output directory `out` -> `dist`
    // distDir: 'build',

    // experimental: {
    //   optimizePackageImports: ['icon-library'],
    // },
  }
  // next.config.js
 
  // const withBundleAnalyzer = require('@next/bundle-analyzer')({
  //   enabled: process.env.ANALYZE === 'true',
  // })
   
// const withCss = require("@zeit/next-css");
// const withPurgeCss = require("next-purgecss");

// module.exports = withCss(withPurgeCss());

console.log(nextConfig);

module.exports = nextConfig;