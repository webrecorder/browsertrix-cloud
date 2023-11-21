# Administration

## Org Import & Export

This guide covers exporting an organization from Browsertrix Cloud and optionally importing it into another Browsertrix Cloud cluster.

Both export and import are two-step processes, which involve:

1. Copying an organization's crawl, upload, and profile files in object storage
2. Copying an organization's database information via a portable JSON file

### Export

#### Export files

An organization's files are co-located within a "directory" in the S3 bucket being used for storage. This makes it possible to recursively copy all of the files in their original logical structure using tools such as the `aws s3` command-line interface or `rclone`, e.g.:

```
aws s3 cp s3://current-bucket/<org-id> /path/to/local/directory --recursive --endpoint=https://ams3.digitaloceanspaces.com
```

It is important to retain the directory structure if you wish to re-import this data into another Browsertrix Cloud cluster later, as some assets such as browser profile files have "subdirectory" prefixes.

??? info "Object storage"

    Browsertrix Cloud uses S3-comptaible object storage to manage files. In object storage systems, all files are stored flat in the underlying system but presented in logical "directories" based on file prefixes for user convenience.

    When we speak of a "directory" in an S3 bucket in this guide, we are referring to a consistent file prefix, in this case an organization's ID.

    When files are exported from an S3 bucket to a local filesystem such as a laptop or desktop computer, these logical "directories" will turn into folders in the local filesystem.

If you are moving an organization from one Browsertrix Cloud cluster to another, you can sync the org id "directory" from one S3 bucket to another directly, skipping the need to download files locally as an intermediary step.

#### Export database information

To generate a portable JSON representation of an org's database information, use the `GET /api/orgs/<org-id>/export` API endpoint and save the returned JSON to a file, e.g.:

```
curl -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" http://localhost:30870/api/orgs/<org-id>/export > org-export.json
```

This endpoint is available to superusers only.

### Import

#### Import files

If you already copied an organization's files to the S3 bucket being used in the new cluster, then you can skip this step. Otherwise, use a tool such as the `aws s3` command-line interface or `rclone` to sync the local directory of your files to the new bucket, being careful to retain the org ID "directory" and logical structure within, e.g.:

```
aws s3 cp /path/to/local/directory/<org-id> s3://new-bucket/<org-id> --recursive
```

#### Import database information

To import an organization from a JSON export, use the `POST /api/orgs/import` API endpoint, e.g.:

```
curl -X POST -H "Content-type: application/json" -H "Authorization: Bearer <jwt token>" --data-binary "@org-export.json" http://localhost:30870/api/orgs/import

```

This endpoint is available to superusers only.

In addition to importing the organization and its constituent parts such as workflows, crawls, uploads, profiles, and collections, the import process will also recreate any users from the original organization that do not exist on the new cluster. These users are given the same roles in the imported organization and retain their names and email addresses. If a user account already exists on the new cluster with the same email address, that user will be given the appropriate role in the imported organization. References to user IDs throughout the organization are updated on import for any newly created users.

Newly created imported users are given a new secure random password. Prior to logging in on the new cluster for the first times, users will need to request a password reset from the main login screen and follow the directions in the resulting email to create a new password.

