/* eslint-env node */
const path = require("path");
require(path.resolve(process.cwd(), "./webpack.config.js"));

// for testing: for prod, using the version specified in Helm values.yaml
const RWP_BASE_URL =
  process.env.RWP_BASE_URL || "https://cdn.jsdelivr.net/npm/replaywebpage/";

if (!process.env.API_BASE_URL) {
  throw new Error(
    "To run a dev frontend server, please set the API_BASE_URL pointing to your backend api server in '.env.local'",
  );
}

const devBackendUrl = new URL(process.env.API_BASE_URL);

module.exports = {
  proxy: {
    "/api": {
      target: devBackendUrl.href,
      headers: {
        Host: devBackendUrl.host,
      },
      ws: true,
    },

    "/data": {
      target: devBackendUrl.href,
      headers: {
        Host: devBackendUrl.host,
      },
    },
  },
  // Serve replay service worker file
  onBeforeSetupMiddleware: (server) => {
    server.app.get("/replay/sw.js", (req, res) => {
      res.set("Content-Type", "application/javascript");
      res.set("Service-Worker-Allowed", "/");
      res.send(`importScripts("${RWP_BASE_URL}sw.js")`);
    });

    server.app.get("/replay/ui.js", (req, res) => {
      res.set("Content-Type", "application/javascript");
      res.redirect(307, RWP_BASE_URL + "ui.js");
    });
  },
};
