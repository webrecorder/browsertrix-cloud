const TerserPlugin = require("terser-webpack-plugin");
const { merge } = require("webpack-merge");

const [main, vnc] = require("./webpack.config.js");

module.exports = [
  merge(main, {
    mode: "production",
    devtool: "source-map",

    // TODO figure out minifying lit templates
    optimization: {
      runtimeChunk: "single",
      splitChunks: {
        // Split both async and non-async chunks (only async by default)
        chunks: "all",
      },
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: ["log", "info"],
            },
          },
        }),
      ],
    },
  }),
  {
    ...vnc,
    mode: "production",
  },
];
