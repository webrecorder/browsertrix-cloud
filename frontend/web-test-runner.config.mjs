/* eslint-env node */
import { fileURLToPath } from "url";

import commonjsPlugin from "@rollup/plugin-commonjs";
import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";
import { fromRollup } from "@web/dev-server-rollup";
import glob from "glob";
import { typescriptPaths as typescriptPathsPlugin } from "rollup-plugin-typescript-paths";

const commonjs = fromRollup(commonjsPlugin);
const typescriptPaths = fromRollup(typescriptPathsPlugin);

// Map css and assert imports to mock file
const emptyImports = {};
glob.sync("./src/**/*.css").forEach((filepath) => {
  emptyImports[filepath] = fileURLToPath(
    new URL("./src/__mocks__/_empty.js", import.meta.url),
  );
});
glob.sync("./src/assets/**/*").forEach((filepath) => {
  // Enable "~assets" imports, which doesn't work with `rollup-plugin-typescript-paths`
  const aliasedImportPath = filepath.replace("./src/", "~");

  emptyImports[aliasedImportPath] = fileURLToPath(
    new URL("./src/__mocks__/_empty.js", import.meta.url),
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
        "node_modules/lodash/**/*",
      ],
    }),
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            ...emptyImports,
            "./src/shoelace": fileURLToPath(
              new URL("./src/__mocks__/shoelace.js", import.meta.url),
            ),
            "tailwindcss/tailwind.css": fileURLToPath(
              new URL("./src/__mocks__/_empty.js", import.meta.url),
            ),
            "@shoelace-style/shoelace/dist/themes/light.css": fileURLToPath(
              new URL("./src/__mocks__/_empty.js", import.meta.url),
            ),
            color: fileURLToPath(
              new URL("./src/__mocks__/color.js", import.meta.url),
            ),
            slugify: fileURLToPath(
              new URL("./src/__mocks__/slugify.js", import.meta.url),
            ),
          },
        },
      },
    }),
  ],
};
