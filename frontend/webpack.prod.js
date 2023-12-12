const { merge } = require("webpack-merge");
const UglifyJSPlugin = require("uglifyjs-webpack-plugin");

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
      minimizer: [
        new UglifyJSPlugin({
          uglifyOptions: {
            compress: {
              pure_funcs: ["console.log", "console.debug"],
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
