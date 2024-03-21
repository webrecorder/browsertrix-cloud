# Customizing Browsertrix Deployment

Local and production deployments alike can be customized by modifying the `chart/values.yaml` Helm chart file or a local override. For more on using local overrides, see the [Local Deployment Guide](local.md). The remainder of this guide covers some of the customization options available in the Helm chart.

## Default Organization

The `default_org` setting is used to specify the name for the default organization created in a Browsertrix deployment. A slug will be auto-generated based on this value and can be modified in [Org Settings](../user-guide/org-settings.md) within the application.

## Superuser

The `superuser` setting is used to set the username and password for a deployment's superuser. If `password` is left blank, the application will auto-generate a secure password for the superuser.

## Crawler Channels

The `crawler_channels` setting is used to specify the [_Crawler Release Channel_](../user-guide/workflow-setup.md#crawler-release-channel) option available to users via dropdown menus in workflows and browser profiles. Each crawler channel has an id and a Docker image tag. These channels are modifiable with the restriction that there must always be one channel with the id `default`. By default this is the only channel available on deployments:

```yaml
crawler_channels:
  - id: default
    image: "docker.io/webrecorder/browsertrix-crawler:latest"
```

This can be extended with additional channels. For example, here is what the value would look like adding a new x.y.z release of Browsertrix Crawler with the id `testing`:

```yaml
crawler_channels:
  - id: default
    image: "docker.io/webrecorder/browsertrix-crawler:latest"
  - id: testing
    image: "docker.io/webrecorder/browsertrix-crawler:x.y.z"
```

## Storage

The `storage` setting is used to specify primary and replica storage for a Browsertrix deployment. All configured storage options must be S3-compatible buckets. At minimum, there must be one configured storage option, as can be seen in the default configuration:

```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: *local_bucket_name

    endpoint_url: "http://local-minio.default:9000/"
```

It is possible to add one or more replica storage locations. If replica locations are enabled, all stored content in the application will be automatically replicated to each configured replica storage location in background jobs after being stored in the default primary storage. If replica locations are enabled, at least one must be set as the default replica location for primary backups. This is indicated with `is_default_replica: True`. If more than one storage location is configured, the primary storage must also be indicated with `is_default_primary: True`.

For example, here is what a storage configuration with two replica locations, one in another bucket on the same Minio S3 service as primary storage as well as another in an external S3 provider:

```yaml
storages:
  - name: "default"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: *local_bucket_name

    endpoint_url: "http://local-minio.default:9000/"
    is_default_primary: True

  - name: "replica-0"
    type: "s3"
    access_key: "ADMIN"
    secret_key: "PASSW0RD"
    bucket_name: "replica-0"

    endpoint_url: "http://local-minio.default:9000/"
    is_default_replica: True
  
  - name: "replica-1"
    type: "s3"
    access_key: "accesskey"
    secret_key: "secret"
    bucket_name: "replica-1"

    endpoint_url: "http://s3provider.example.com"
```

## Email / SMTP Server

Browsertrix sends user invitations, password resets, background job failure notifications, and other important messages via email. The `email` setting can be used to configure the SMTP server used to send emails. To avoid email messages from Browsertrix being flagged as spam, be sure to use the same domain for `sender_email` and `reply_to_email`.

## Signing WACZ files

Browsertrix has the ability to cryptographically sign WACZ files with [Authsign](https://github.com/webrecorder/authsign). The ``signer`` setting can be used to enable this feature and configure Authsign.
