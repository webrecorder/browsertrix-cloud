# Developing the Frontend UI

This guide explains how to run the Browsertrix frontend development server with [Yarn](https://classic.yarnpkg.com).

Instead of rebuilding the entire frontend image to view your UI changes, you can use the included local development server to access the frontend from your browser. This setup is ideal for rapid UI development that does not rely on any backend changes.

## Requirements

### 1. Browsertrix API backend already in a Kubernetes cluster

The frontend development server requires an existing backend that has been deployed locally or is in production. See [Deploying Browsertrix](../deploy/index.md).

### 2. Node.js ≥18 and Yarn 1

To check if you already have Node.js installed, run the following command in your command line terminal:

```sh
node --version
```

You should see a version number like `v18.12.1`. If you see a command line error instead of a version number, [install Node.js](https://nodejs.org) before continuing.

??? question "What if my other project requires a different version of Node.js?"

    You can use [Node Version Manager](https://nodejs.org/en/download/package-manager#nvm) to install multiple Node.js versions and switch versions between projects.

To check your Yarn installation:

```sh
yarn --version
```

You should see a version number like `1.22.19`. If you do not, [install or upgrade Yarn](https://classic.yarnpkg.com/en/docs/install).

## Quickstart

From the command line, change your current working directory to `/frontend`:

```sh
cd frontend
```

!!! note

    From this point on, all commands in this guide should be run from the `frontend` directory.

Install UI dependencies:

```sh
yarn install
```

Copy environment variables from the sample file:

```sh
cp sample.env.local .env.local
```

Update `API_BASE_URL` in `.env.local` to point to your backend API host. For example:

```
API_BASE_URL=http://dev.example.com
```

!!! note

    This setup assumes that your API endpoints are available under `/api`, which is the default configuration for the Browsertrix backend.

If connecting to a local deployment cluster, set `API_BASE_URL` to:

```
API_BASE_URL=http://localhost:30870
```

If the API is not running at `localhost:30870`, port forward it from your local cluster:

```sh
kubectl port-forward svc/browsertrix-cloud-backend 30870:8000
```

??? info "Port when using Minikube (on macOS)"

    When using Minikube on macOS, the port will not be 30870. Instead, Minikube opens a tunnel to a random port,
    obtained by running `minikube service browsertrix-cloud-frontend --url` in a separate terminal.

    Set API_BASE_URL to provided URL instead, eg. `API_BASE_URL=http://127.0.0.1:<TUNNEL_PORT>`

Start the frontend development server:

```sh
yarn start
```

This will open `localhost:9870` in a new tab in your default browser. It will take a few minutes to finish.

Saving changes to files in `src` will automatically reload your browser window with the latest UI updates.

To stop the development server type ++ctrl+c++ into your command line terminal.

## Scripts

| `yarn <name>`      |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| `start`            | runs app in development server, reloading on file changes       |
| `test`             | runs tests in chromium with playwright                          |
| `build-dev`        | bundles app and outputs it in `dist` directory                  |
| `build`            | bundles app, optimized for production, and outputs it to `dist` |
| `lint`             | find and fix auto-fixable javascript errors                     |
| `format`           | formats js, html, and css files                                 |
| `localize:extract` | generate XLIFF file to be translated                            |
| `localize:build`   | output a localized version of strings/templates                 |

## Testing

Tests assertions are written in [Chai](https://www.chaijs.com/api/bdd/).

To watch for file changes while running tests:

```sh
yarn test --watch
```

To run tests in multiple browsers:

```sh
yarn test --browsers chromium firefox webkit
```

## Localization

Wrap text or templates in the `msg` helper to make them localizable:

```js
// import from @lit/localize:
import { msg } from "@lit/localize";

// later, in the render function:
render() {
  return html`
    <button>
      ${msg("Click me")}
    </button>
  `
}
```

Entire templates can be wrapped as well:

```js
render() {
  return msg(html`
    <p>Click the button</p>
    <button>Click me</button>
  `)
}
```

See: <https://lit.dev/docs/localization/overview/#message-types>

To add new languages:

1. Add [BCP 47 language tag](https://www.w3.org/International/articles/language-tags/index.en) to `targetLocales` in `lit-localize.json`
2. Run `yarn localize:extract` to generate new .xlf file in `/xliff`
3. Provide .xlf file to translation team
4. Replace .xlf file once translated
5. Run `yarn localize:build` bring translation into `src`

See: <https://lit.dev/docs/localization/overview/#extracting-messages>
