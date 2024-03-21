# Remote: Self-Hosted and Cloud

For remote and hosted deployments (both on a single machine or in the cloud), the only requirement is to have a designed domain and (strongly recommended, but not required) second domain for signing web archives. 

We are also experimenting with [Ansible playbooks](ansible/digitalocean.md) for cloud deployment setups.

The production deployments also allow using an external mongodb server, and/or external S3-compatible storage instead of the bundled minio.


## Single Machine Deployment with MicroK8S

For a single-machine remote deployment, we recommend using [MicroK8s](https://microk8s.io/).

1. Install MicroK8S, as suggested in [the local deployment guide](../deploy/local.md) and ensure the `ingress` and `cert-manager` addons are also enabled.

2. Copy `cp ./chart/examples/microk8s-hosted.yaml ./chart/my-config.yaml` to make local changes.

2. Set the `ingress.host`, `ingress.cert_email` and `signing.host` fields in `./chart/my-config.yaml` to your host and domain

3. Set the super-admin username and password, and mongodb username and password in `./chart/my-config.yaml`

4. Run with:

   ```shell
   helm upgrade --install -f ./chart/values.yaml -f ./chart/my-config.yaml btrix ./chart/
   ```

## Single Machine Deployment with k3s

Another option for a single-machine remote deployment is [k3s](https://k3s.io)

1. Install K3s, as suggested in the [local deployment guide](../deploy/local.md). Make sure to **disable traefik** which can be done by adding `--no-deploy traefik` to the `systemd` unit when installing k3s

2. Install `nginx-ingress` with: `helm upgrade --install nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace`
3. Install `cert-manager`. We recommend installing `cert-manager` through Jetpack, like so: 

```zsh
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm repo update jetstack
helm upgrade --install \
  cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.12.0 \
  --set installCRDs=true
``` 

4. Copy `cp ./chart/examples/k3s-hosted.yaml ./chart/my-config.yaml` to make local changes.

5. Set the `ingress.host`, `ingress.cert_email` and `signing.host` fields in `./chart/my-config.yaml` to your host and domain

6. Set the super-admin username and password, and mongodb username and password in `./chart/my-config.yaml`

7. Run with:

   ```shell
   helm upgrade --install -f ./chart/values.yaml -f ./chart/my-config.yaml btrix ./chart/
   ```

### Using Custom Storage

If you would like to use existing external storage, such an existing S3-compatible storage, also set the default storage, for example:

```yaml
minio_local: false

storages:
  - name: "default"
    access_key: <access key>
    secret_key: <secret key>

    endpoint_url: "https://s3.<region>.amazonaws.com/bucket/path/"
```

Note that this setup is not limited to Amazon S3, but should work with any S3-compatible storage service.


### Using Custom MongoDB

If you would like to use an externally hosted MongoDB, you can add the following config to point to a custom MongoDB instance.

The `db_url` should follow the [MongoDB Connection String Format](https://www.mongodb.com/docs/manual/reference/connection-string/) which should include the username and password of the remote instance.


```yaml
mongo_local: false

mongo_auth:
  db_url: mongodb+srv://...

```

## Cloud Deployment

There are also many ways to deploy Browsertrix on various cloud providers.

To simplify this process, we are working on Ansible playbooks for setting up Browsertrix on commonly used infrastructure.

### Ansible Deployment

[Ansible](https://ansible.com) makes the initial setup and configuration of your Browsertrix instance automated and repeatable. 

To use, you will need to [install Ansible](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html#control-node-requirements) on your control computer and then you can use these to deploy to Browsertrix on remote and cloud environments.

Currently, we provide playbooks for the following tested environments:

- [DigitalOcean](ansible/digitalocean.md)
- [Microk8s](ansible/microk8s.md)
- [k3s](ansible/k3s.md)
