const path = require("path");

const { merge } = require("webpack-merge");

const devServerConfig = require("./config/dev-server.js");
const [main, vnc] = require("./webpack.config.js");

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets",
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = [
  merge(main, {
    devtool: "eval-cheap-source-map",
    devServer: {
      watchFiles: ["src/**/*", __filename],
      open: true,
      compress: true,
      hot: false,
      static: [
        {
          directory: shoelaceAssetsSrcPath,
          publicPath: "/" + shoelaceAssetsPublicPath,
        },
      ],
      historyApiFallback: true,
      proxy: devServerConfig.proxy,
      onBeforeSetupMiddleware: devServerConfig.onBeforeSetupMiddleware,
      port: 9870,
    },
    cache: {
      type: "filesystem",
      hashAlgorithm: "xxhash64",
      buildDependencies: {
        config: [__filename],
      },
    },
  }),
  {
    ...vnc,
    mode: "production",
  },
];
