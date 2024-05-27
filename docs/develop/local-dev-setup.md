# Setup for Local Development

## Installation

First, see our [Local Deployment guide](../deploy/local.md#installing-kubernetes) for instructions on how to install the latest release with [Kubernetes](https://kubernetes.io/) with [Helm 3](https://v3.helm.sh/).

## Local Dev Configuration

The local deployment guide explains how to deploy Browsertrix with latest published images.

However, if you are developing locally, you will need to use your local images instead.

We recommend the following setup:

1. Copy the provided `./chart/examples/local-config.yaml` Helm configuration file to a separate file `local.yaml`, so that local changes to it will not be accidentally committed to git. 

    From the root directory:

    ```sh
    cp ./chart/examples/local-config.yaml ./chart/local.yaml
    ```

2. Uncomment `backend_image`, `frontend_image`, and pull policies in `./chart/local.yaml`, which will ensure the local images are used:
```yaml
backend_image: docker.io/webrecorder/browsertrix-backend:latest
frontend_image: docker.io/webrecorder/browsertrix-frontend:latest
backend_pull_policy: 'Never'
frontend_pull_policy: 'Never'
```

    ??? info "MicroK8S"

        For microk8s, the pull policies actually need to be set to `IfNotPresent` instead of `Never`:

        ```yaml
        backend_pull_policy: 'IfNotPresent'
        frontend_pull_policy: 'IfNotPresent'
        ```

        This will ensure images are pulled from the MicroK8S registry (configured in next section).



3. Build the local backend and frontend images. The exact process depends on the Kubernetes environment you've selected in your initial deployment. Environment specific build instructions are as follows:

    ??? info "Docker Desktop"

        Rebuild the local images by running `#!shell ./scripts/build-backend.sh` and/or `#!shell ./scripts/build-frontend.sh` scripts to build the images in the local Docker.

    ??? info "MicroK8S"

        MicroK8s uses its own container registry, running on port 32000.

        1. Ensure the registry add-on is enabled by running `microk8s enable registry`

        2. Set `export REGISTRY=localhost:32000/` and then run `#!shell ./scripts/build-backend.sh` and/or `#!shell ./scripts/build-frontend.sh` to rebuild the images into the MicroK8S registry.

        3. In `./chart/local.yaml`, also uncomment the following lines to use the local images:
        ```yaml
        backend_image: "localhost:32000/webrecorder/browsertrix-backend:latest"
        frontend_image: "localhost:32000/webrecorder/browsertrix-frontend:latest"
        ```

    ??? info "Minikube"

        Minikube comes with its own image builder to update the images used in Minikube.

        To build the backend image, run:

        ```shell
        minikube image build -t webrecorder/browsertrix-backend:latest ./backend
        ```

        To build a local frontend image, run:

        ```shell
        minikube image build -t webrecorder/browsertrix-frontend:latest ./frontend
        ```

    ??? info "K3S"

        K3S uses `containerd` by default. To use local images, they need to be imported after rebuilding.

        1. Rebuild the images with Docker by running by running `./scripts/build-backend.sh` and/or `./scripts/build-frontend.sh` scripts. (Requires Docker to be installed as well).

        2. Serializer the images to .tar:
        ```shell
        docker save webrecorder/browsertrix-backend:latest > ./backend.tar
        docker save webrecorder/browsertrix-frontend:latest > ./frontend.tar
        ```

        3. Import images into k3s containerd:
        ```shell
        k3s ctr images import --base-name webrecorder/browsertrix-backend:latest ./backend.tar
        k3s ctr images import --base-name webrecorder/browsertrix-frontend:latest ./frontend.tar
        ```

4. To change other options, uncomment them as needed in `./chart/local.yaml` or add additional overrides from `./chart/values.yaml`. 

    For example, to set a superuser email to `my_super_user_email@example.com` and password to `MySecretPassword!`, uncomment that block and set:
    ```yaml
    superuser:
    # set this to enable a superuser admin
    email: my_super_user_email@example.com

    # optional: if not set, automatically generated
    # change or remove this
    password: MySecretPassword!
    ```

5. Once the images have been built and config changes made in `./chart/local.yaml`, the cluster can be re-deployed by running:
```sh
helm upgrade --install -f ./chart/values.yaml \
-f ./chart/local.yaml btrix ./chart/
```

    ??? info "MicroK8S"

        If using microk8s, the command will be:

        ```sh
        microk8s helm3 upgrade --install -f ./chart/values.yaml -f ./chart/local.yaml btrix ./chart/
        ```

Refer back to the [Local Development guide](../deploy/local.md#waiting-for-cluster-to-start) for additional information on running and debugging your local cluster.

## Update the Images

After making any changes to backend code (in `./backend`) or frontend code (in `./frontend`), you'll need to rebuild the images as specified above, before running `helm upgrade ...` to re-deploy.

Changes to settings in `./chart/local.yaml` can be deployed with `helm upgrade ...` directly.

## Deploying Frontend Only

If you are just making changes to the frontend, you can also [deploy the frontend separately](frontend-dev.md) using a dev server for quicker iteration.

## Deploying Backend with Hot Reloading

If you want to iterate faster on the backend, read [deploy the backend with hot reloading and interactive debugging](backend-hot-reload-and-debugger.md).