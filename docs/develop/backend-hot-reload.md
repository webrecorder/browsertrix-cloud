# Deploy the Backend with Hot Reloading

This guide explains how to deploy Browsertrix with [skaffold](https://skaffold.dev/) so the backend hot reloads. This
may save you time since you don't need to rebuild the backend container every time you change code.

## Requirements

Follow the documentation to [install skaffold](https://skaffold.dev/docs/install/), i.e. if you are on
Mac OS run:

```sh
brew install skaffold
```

To install helm and set up a local Kubernetes cluster, see the section on [local dev set up](local-dev-setup.md).

## Quickstart

From the command line, run:

```sh
skaffold dev
```

This will deploy Browsertrix into the cluster and port forward the API with hot reloading. 
Navigate to `localhost:8000/api/redoc` to see the documentation.
Changing any code in `backend/btrixcloud` will trigger a reload.