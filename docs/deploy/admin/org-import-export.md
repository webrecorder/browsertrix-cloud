# Org Import & Export

This guide covers exporting an organization from Browsertrix and optionally importing it into another Browsertrix cluster.

Both export and import are two-step processes, which involve:

1. Copying an organization's crawl, upload, and profile files in object storage
2. Copying an organization's database information via a portable JSON file

## Export

### Export files

An organization's files are co-located within a "directory" in the S3 bucket being used for storage. This makes it possible to recursively copy all of the files in their original logical structure using tools such as the `aws s3` command-line interface or `rclone`, e.g.:

```sh
aws s3 cp s3://current-bucket/<org-id> /path/to/local/directory/<org-id> --recursive --endpoint=https://ams3.digitaloceanspaces.com
```

It is important to retain the directory structure to re-import an organization's files into another Browsertrix cluster later, as some assets such as browser profiles and uploads  have "subdirectory" prefixes.

!!! note

    Browsertrix uses S3-compatible object storage to manage files. In object storage systems, all files are stored flat in the underlying system but presented in logical "directories" based on file prefixes for user convenience.

    When we speak of a "directory" in an S3 bucket in this guide, we are referring to a consistent file prefix, in this case an organization's ID.

    When files are exported from an S3 bucket to a local filesystem such as a laptop or desktop computer, these logical "directories" will turn into folders in the local filesystem.

To move an organization from one Browsertrix cluster to another, sync the org id "directory" from one S3 bucket to another directly, as there is no need to download files locally as an intermediary step.

### Export Database Information

To generate a portable JSON representation of an org's database information, use the `GET /api/orgs/<org-id>/export/json` API endpoint and save the returned JSON to a file, e.g.:

```sh
curl -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" https://app.browsertrix.com/api/orgs/<org-id>/export/json -o org-export.json
```

This endpoint is available to superusers only.

## Import

### Import Files

If an organization's files have already been copied to the S3 bucket configured in the new cluster, skip this step. Otherwise, use a tool such as the `aws s3` command-line interface or `rclone` to sync the local organization directory to the new bucket, being careful to retain the org ID directory and logical structure within, e.g.:

```sh
aws s3 cp /path/to/local/directory/<org-id> s3://new-bucket/<org-id> --recursive
```

### Import Database Information

To import an organization from a JSON export, use the `POST /api/orgs/import/json` API endpoint, adding the JSON export file to the request as a stream, e.g.:

```sh
curl -X POST -H "Content-Type: application/octet-stream" -H "Authorization: Bearer <jwt token>" --data-binary "@org-export.json" https://app.browsertrix.com/api/orgs/import/json
```

This endpoint is available to superusers only.

The organization name must not already exist in the new cluster or the import API endpoint will fail and return a `400` status code.

In addition to importing the organization and its constituent parts such as workflows, crawls, uploads, profiles, and collections, the import process will also recreate any users from the original organization that do not exist on the new cluster. These users are given the same roles in the imported organization and retain their names and email addresses. If a user account already exists on the new cluster with the same email address, that user is given their original role in the imported organization. References to user IDs throughout the organization are updated on import for any newly created users.

Newly created imported users are given a new secure random password. Prior to logging in on the new cluster for the first times, users will need to request a password reset from the login screen and follow the directions in the resulting email to create a new password.

#### Storage Configuration

The storage name referenced in the organization and files to be imported must match the storage configuration name for primary storage in the newly created cluster.

If the storage name and configuration details are identical in the original and new clusters, no additional steps need to be taken.

If the primary storage for the new cluster uses a different name than the original cluster, update the storage references during import by passing the `storageName` query parameter to the import API endpont, e.g.:

```sh
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" --data-binary "@org-export.json" https://app.browsertrix.com/api/orgs/import/json?storageName=newname
```

#### Database Versions

By default, the import API endpoint will fail and return a `400` status code if the database version in the imported JSON differs from the database version of the new cluster.

To ignore this check, pass the `ignoreVersion` query parameter with a true value to the import API endpoint, e.g.:

```sh
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" --data-binary "@org-export.json" https://app.browsertrix.com/api/orgs/import/json?ignoreVersion=true
```

If the JSON export is from an earlier database version than the cluster the org is being imported into, re-run migrations from the version in the JSON export after importing the org. To do this, re-install the application with helm, setting `rerun_from_migration` in the helm chart to the database version specified in the JSON export.
