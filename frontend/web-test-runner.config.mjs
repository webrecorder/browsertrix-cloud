/* eslint-env node */
import { fileURLToPath } from "url";

import commonjsPlugin from "@rollup/plugin-commonjs";
import imagePlugin from "@rollup/plugin-image";
import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";
import { fromRollup } from "@web/dev-server-rollup";
import glob from "glob";
import { typescriptPaths as typescriptPathsPlugin } from "rollup-plugin-typescript-paths";

const commonjs = fromRollup(commonjsPlugin);
const image = fromRollup(imagePlugin);
const typescriptPaths = fromRollup(typescriptPathsPlugin);

// Map all css imports to mock file
const cssImports = {};
glob.sync("./src/**/*.css").forEach((filepath) => {
  cssImports[filepath] = fileURLToPath(
    new URL("./src/__mocks__/css.js", import.meta.url),
  );
});

export default {
  nodeResolve: true,
  rootDir: process.cwd(),
  plugins: [
    typescriptPaths({
      preserveExtensions: true,
      absolute: false,
      nonRelative: true, // needed for non-ts files
      transform(path) {
        return `/${path}`;
      },
    }),
    esbuildPlugin({
      ts: true,
      tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      target: "esnext",
    }),
    commonjs({
      include: [
        // web-test-runner expects es modules,
        // include umd/commonjs modules here:
        "node_modules/url-pattern/**/*",
      ],
    }),
    image({
      include: ["./src/assets/**/*"],
    }),
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            ...cssImports,
            "./src/shoelace": fileURLToPath(
              new URL("./src/__mocks__/shoelace.js", import.meta.url),
            ),
            "tailwindcss/tailwind.css": fileURLToPath(
              new URL("./src/__mocks__/css.js", import.meta.url),
            ),
            "@shoelace-style/shoelace/dist/themes/light.css": fileURLToPath(
              new URL("./src/__mocks__/css.js", import.meta.url),
            ),
            // FIXME: `@web/dev-server-esbuild` or its dependencies seem to be ignoring .js
            // extension and shoelace exports and switching it to .ts
            // Needs a better solution than import mapping individual files.
            // Maybe related:
            // - https://github.com/modernweb-dev/web/issues/1929
            // - https://github.com/modernweb-dev/web/issues/224
            "@shoelace-style/shoelace/dist/utilities/form.js": fileURLToPath(
              new URL(
                "./node_modules/@shoelace-style/shoelace/dist/utilities/form.js",
                import.meta.url,
              ),
            ),
            color: fileURLToPath(
              new URL("./src/__mocks__/color.js", import.meta.url),
            ),
          },
        },
      },
    }),
  ],
};
