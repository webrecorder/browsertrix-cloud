// cSpell:ignore glitchtip
// webpack.config.js
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const CopyPlugin = require("copy-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");

const packageJSON = require("./package.json");

const isDevServer = process.env.WEBPACK_SERVE;

const dotEnvPath = path.resolve(
  process.cwd(),
  `.env${isDevServer ? `.local` : ""}`,
);
require("dotenv").config({
  path: dotEnvPath,
});

// for testing: for prod, the Dockerfile should have the official prod version used
const _RWP_BASE_URL = process.env.RWP_BASE_URL || "https://replayweb.page/";

const WEBSOCKET_HOST =
  isDevServer && process.env.API_BASE_URL
    ? new URL(process.env.API_BASE_URL).host
    : process.env.WEBSOCKET_HOST || "";

// Get git info for release version info

const execCommand = (cmd, defValue) => {
  try {
    return childProcess.execSync(cmd).toString().trim();
  } catch (e) {
    return defValue;
  }
};

// Local dev only
// Git branch and commit hash is used to add build info to error reporter when running locally
const gitBranch =
  process.env.GIT_BRANCH_NAME ||
  execCommand("git rev-parse --abbrev-ref HEAD", "unknown");

const commitHash =
  process.env.GIT_COMMIT_HASH ||
  execCommand("git rev-parse --short HEAD", "unknown");

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets",
);
const shoelaceAssetsPublicPath = "shoelace/assets";

const version = (() => {
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  try {
    return fs.readFileSync("../version.txt", { encoding: "utf-8" }).trim();
  } catch (e) {
    /* empty */
  }

  return packageJSON.version;
})();

/** @type {import('webpack').Configuration} */
const main = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: `js/[name]${isDevServer ? "" : ".[contenthash]"}.js`,
    publicPath: "/",
    hashFunction: "xxhash64",
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "src"),
        use: [
          {
            loader: "postcss-loader",
            options: {
              /** @type {import('postcss-load-config').Config} */
              postcssOptions: {
                syntax: "postcss-lit",
                plugins: [["tailwindcss"], ["autoprefixer"]],
              },
            },
          },
          {
            loader: "ts-loader",
            options: {
              onlyCompileBundledFiles: true,
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        // Global styles and assets, like fonts and Shoelace,
        // that get added to document styles
        test: /\.css$/,
        include: [
          path.resolve(__dirname, "src"),
          path.resolve(__dirname, "node_modules/@shoelace-style/shoelace"),
        ],
        exclude: /\.stylesheet\.css$/,
        use: [
          "style-loader",
          { loader: "css-loader", options: { importLoaders: 1 } },
          "postcss-loader",
        ],
      },
      {
        // CSS loaded as raw string and used as a CSSStyleSheet
        test: /\.stylesheet\.css$/,
        type: "asset/source",
        include: [path.resolve(__dirname, "src")],
        use: ["postcss-loader"],
      },
      {
        test: /\.html$/,
        include: path.resolve(__dirname, "src"),
        loader: "html-loader",
      },
      {
        test: /\.(woff(2)?|ttf|svg|webp)(\?v=\d+\.\d+\.\d+)?$/,
        include: path.resolve(__dirname, "src"),
        type: "asset/resource",
      },
    ],
  },

  resolve: {
    extensions: [".ts", ".js"],
    plugins: [new TsconfigPathsPlugin()],
  },

  plugins: [
    new webpack.DefinePlugin({
      "process.env.WEBSOCKET_HOST": JSON.stringify(WEBSOCKET_HOST),
    }),

    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 12,
    }),

    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configOverwrite: {
          exclude: ["**/*.test.ts", "tests/**/*.ts", "playwright.config.ts"],
        },
      },
    }),

    new HtmlWebpackPlugin({
      template: "src/index.ejs",
      templateParameters: {
        glitchtip_dsn: process.env.GLITCHTIP_DSN || "",
        environment: isDevServer ? "development" : "production",
        version,
        gitBranch,
        commitHash,
      },
      // TODO this breaks shoelace forms, but seems HMR is broken anyway?
      // // Need to block during local development for HMR:
      // inject: isDevServer ? "head" : true,
      // scriptLoading: isDevServer ? "blocking" : "defer",
      inject: true,
      scriptLoading: "defer",
    }),

    // Lint js files
    new ESLintPlugin({
      // lint only changed files:
      lintDirtyModulesOnly: true,
      // prevent warnings from stopping dev build
      emitWarning: false,
      // enable to auto-fix source files:
      // fix: true
    }),

    new CopyPlugin({
      patterns: [
        // Copy Shoelace assets to dist/shoelace
        {
          from: shoelaceAssetsSrcPath,
          to: path.resolve(__dirname, "dist", shoelaceAssetsPublicPath),
        },
        // Copy custom icon library
        {
          from: path.resolve(__dirname, "src/assets/icons"),
          to: path.resolve(__dirname, "dist", "assets/icons"),
        },
        // Copy favicons to root
        {
          from: path.resolve(__dirname, "src/assets/favicons"),
          to: path.resolve(__dirname, "dist"),
        },
        // Copy app manifest
        {
          from: path.resolve(__dirname, "src/manifest.webmanifest"),
          to: path.resolve(__dirname, "dist"),
        },
      ],
    }),
    ...(process.env.BUNDLE_ANALYZER
      ? [new (require("webpack-bundle-analyzer").BundleAnalyzerPlugin)()]
      : []),
  ],
};

const vnc = {
  entry: "./node_modules/@novnc/novnc/core/rfb.js",
  experiments: { outputModule: true },
  output: {
    filename: "js/novnc.js",
    library: {
      type: "module",
    },
    hashFunction: "xxhash64",
  },
};

module.exports = [main, vnc];
