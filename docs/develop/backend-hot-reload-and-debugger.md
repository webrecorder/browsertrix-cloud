# Deploy the Backend with Hot Reloading and Interactive Debugging

This guide explains how to deploy Browsertrix with [skaffold](https://skaffold.dev/) 
so the backend hot reloads and allows interactive debugging.

This may save time since you don't need to rebuild the backend container every time you change code
and can use a debugger to step through code.

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
Navigate to `localhost:8000/api/redoc` or `localhost:8000/api/docs` to see the documentation.
Changing any code in `backend/btrixcloud` will trigger a reload.

### Debugger

Interactive debugging uses [debugpy](https://github.com/microsoft/debugpy), which 
works on VSCode but not PyCharm.

Use this debug configuration in VSCode:

```JSON
{
    "name": "Attach to Browsertrix Backend",
    "type": "debugpy",
    "request": "attach",
    "connect": {
        "host": "127.0.0.1",
        "port": 5678
    },
    "pathMappings": [
        {
        "localRoot": "${workspaceFolder}/backend/btrixcloud/",
        "remoteRoot": "/app/btrixcloud/"
        }
    ],
    "justMyCode": false
}
```

This will attach to the Kubernetes pod running Browsertrix and persist between
hot reloads. Change your code, wait for the application to reload, 
and still hit breakpoints in the same debugging session.


