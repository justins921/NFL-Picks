import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "a.espncdn.com" }],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // The SQLite file and its write-ahead log live under data/. Every pick
      // touches them, and without this the dev file watcher treats each write
      // as a source change and recompiles mid-navigation.
      const ignored = ["**/node_modules/**", "**/.git/**", "**/data/**"];
      config.watchOptions = { ...config.watchOptions, ignored };
    }
    return config;
  },
};

export default config;
