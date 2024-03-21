# Local Deployment

To try out the latest release of Browsertrix on your local machine, you'll first need to have a working Kubernetes cluster.

## Installing Kubernetes

Before running Browsertrix, you'll need to set up a running [Kubernetes](https://kubernetes.io/) cluster.

Today, there are numerous ways to deploy Kubernetes fairly easily, and we recommend trying one of the single-node options, which include Docker Desktop, microk8s, minikube, and k3s.

The instructions below assume a local package manager for your platform (eg. `brew` for macOS, `choco` for Windows, etc...) is already installed.

Cloning the repository at [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder/browsertrix-cloud) is only needed to access additional configuration files.

Here are some environment specific instructions for setting up a local cluster from different Kubernetes vendors:

??? info "Docker Desktop (recommended for macOS and Windows)"

    For macOS and Windows, we recommend testing out Browsertrix using Kubernetes support in Docker Desktop as that will be one of the simplest options.

    1. [Install Docker Desktop](https://www.docker.com/products/docker-desktop/) if not already installed.

    2. Under Settings > Kubernetes, ensure _Enable Kubernetes_ is checked.

    3. Restart Docker Desktop if asked, and wait for it to fully restart.

    4. Install [Helm](https://helm.sh/), with `#!sh brew install helm` (macOS) or `#!powershell choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)

??? info "MicroK8S (recommended for Ubuntu)"

    For Ubuntu and other Linux distros, we recommend using MicroK8S for both local deployment and production.

    1. Install MicroK8s, by running `#!sh sudo snap install microk8s --classic` [see more detailed instructions here](https://microk8s.io/docs/getting-started) or [alternate installation instructions here](https://microk8s.io/docs/install-alternatives).

    2. Install the following addons: `#!sh microk8s enable dns hostpath-storage registry helm3`. (For production, also add `ingress cert-manager` to the list of addons)

    3. Wait for add-ons to finish installing with `#!sh microk8s status --wait-ready`

    **Note:** microk8s comes with its own version helm, so you don't need to install it separately. Replace `helm` with `microk8s helm3` in the subsequent instructions below.

??? info "Minikube (Windows, macOS, or Linux)"

    1. Install Minikube [following installation instructions](https://minikube.sigs.k8s.io/docs/start/), eg. `brew install minikube`.
       Note that Minikube also requires Docker or another container management system to be installed as well.

    2. Install [Helm](https://helm.sh/), with `!sh brew install helm` (macOS) or `#!powershell choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)


??? info "K3S (recommended for non-Ubuntu Linux)"

    1. Install K3s [as per the instructions](https://docs.k3s.io/quick-start)

    2. Install [Helm](https://helm.sh/), with `#!sh brew install helm` (macOS) or `#!powershell choco install kubernetes-helm` (Windows) or following some of the [other install options](https://helm.sh/docs/intro/install/)

    3. Set `KUBECONFIG` to point to the config for K3S: `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml` to ensure Helm will use the correct version.

## Launching Browsertrix with Helm

Once you have a running Kubernetes cluster with one of the options above, and Helm 3 installed, install the latest release of Browsertrix directly from the latest GitHub release.

<insert-version></insert-version>


```sh
helm upgrade --install btrix \
https://github.com/webrecorder/browsertrix-cloud/releases/download/VERSION/browsertrix-cloud-VERSION.tgz
```

??? info "MicroK8S"

    If using microk8s, the command will be:

    <insert-version></insert-version>

    ```sh
    microk8s helm3 upgrade --install btrix \
    https://github.com/webrecorder/browsertrix-cloud/releases/download/VERSION/browsertrix-cloud-VERSION.tgz
    ```

    **Note:** Subsequent commands will also use `microk8s helm3` instead of `helm`.


The default setup includes the full Browsertrix system, with frontend, backend api, db (via MongoDB), and storage (via Minio)

An admin user with name `admin@example.com` and password `PASSW0RD!` will be automatically created.

With Helm, additional YAML files can be added to further override previous settings.

Some possible settings can be changed are found in [chart/examples/local-config.yaml](https://github.com/webrecorder/browsertrix-cloud/blob/main/chart/examples/local-config.yaml).

For example, to change the default superadmin, uncomment the `superadmin` block in `local-config.yaml`, and then change the username (`admin@example.com`) and password (`PASSW0RD!`) to different values. (The admin username and password will be updated with each deployment).
To change the local port, change `local_service_port` setting.

You can then redeploy with these additional settings by running:

<insert-version></insert-version>

```shell
helm upgrade --install btrix https://github.com/webrecorder/browsertrix-cloud/releases/download/VERSION/browsertrix-cloud-VERSION.tgz \
-f ./chart/examples/local-config.yaml
```

The above examples assumes running from a cloned Browsertrix repo, however the config file can be saved anywhere and specified with `-f <extra-config.yaml>`.


## Waiting for Cluster to Start

After running the helm command, you should see something like:

```shell
Release "btrix" does not exist. Installing it now.
NAME: btrix
LAST DEPLOYED: <time>
NAMESPACE: default
STATUS: deployed
REVISION: 1
TEST SUITE: None
```

After that, especially on first run, it may take a few minutes for the Browsertrix cluster to start, as all images need to be downloaded locally.

You can try running the following command to wait for all pods to be initialized: 

```shell
kubectl wait --for=condition=ready pod --all --timeout=300s
```

The command will exit when all pods have been loaded, or if there is an error and it times out.

If the command succeeds, you should be able to access Browsertrix by loading: [http://localhost:30870/](http://localhost:30870/) in your browser.

??? info "Minikube (on macOS)"

    When using Minikube on a macOS, the port will not be 30870. Instead, Minikube opens a tunnel to a random port,
    obtained by running `minikube service browsertrix-cloud-frontend --url` in a separate terminal.
    Use the provided URL (in the format `http://127.0.0.1:<TUNNEL_PORT>`) instead.


### Debugging Pod Issues

If this command fails, you can also run `#!sh kubectl get pods` to see the status of each of the pods.

There should be 4 pods listed: backend, frontend, minio, and mongodb. If any one is not ready for a while, something may be wrong.

To get more details about why a pod has not started, run `#!sh kubectl describe <podname>` and see the latest status at the bottom.

Often, the error may be obvious, such as failed to pull an image.

If the pod is running, or previously ran, you can also get the logs from the container by running `#!sh kubectl logs <podname>`

The outputs of these commands are helpful when reporting an issue [on GitHub](https://github.com/webrecorder/browsertrix-cloud/issues)

## Updating the Cluster

To update the cluster, for example to update to new version `NEWVERSION`, re-run the same command again, which will pull the latest images. In this way, you can upgrade to the latest release of Browsertrix. The upgrade will preserve the database and current archives.

```shell
helm upgrade --install btrix https://github.com/webrecorder/browsertrix-cloud/releases/download/NEWVERSION/browsertrix-cloud-NEWVERSION.tgz
```

## Uninstalling

To uninstall, run `#!sh helm uninstall btrix`.

By default, the database + storage volumes are not automatically deleted, run `#!sh helm upgrade ...` again to restart the cluster in its current state.

If you are upgrading from a previous version, and run into issues with `#!sh helm upgrade ...`, we recommend uninstalling and then re-running upgrade.

## Deleting all Data

To fully delete all persistent data (db + archives) created in the cluster, run `#!sh kubectl delete pvc --all` after uninstalling.

## Deploying for Local Development

These instructions are intended for deploying the cluster from the latest releases published on GitHub. See [setting up cluster for local development](../develop/local-dev-setup.md) for additional customizations related to developing Browsertrix and deploying from local images.
