---
hide:
  - toc
---

# Developing Browsertrix

Browsertrix consists of a Python-based backend and TypeScript-based frontend.

To develop Browsertrix, the system must [first be deployed locally](../deploy/local.md) in a Kubernetes cluster.

The deployment can then be [further customized for local development](./local-dev-setup.md).

### Backend

The backend is an API-only system, using the FastAPI framework. Latest API docs can be viewed in the browser by adding `/api/redoc` to the URL of a running cluster (ex: `http://localhost:30870/api/redoc` when running locally on port `30870`.)

At this time, the backend must be deployed in the Kubernetes cluster.

<!-- *TODO Add additional info here* -->

### Frontend

The frontend UI is implemented in TypeScript, using the Lit framework and Shoelace component library.

The static build of the frontend is bundled with nginx, but the frontend can be deployed locally in dev mode against an existing backend.

See [Developing the Frontend UI](frontend-dev.md) for more details.

<!-- *TODO Add additional info here* -->
