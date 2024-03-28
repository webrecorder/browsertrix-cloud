<h1>
    <div align="center">
        <img alt="Browsertrix" src="assets/browsertrix-lockup-color-dynamic.svg" width="90%">
    </div>
</h1>

&nbsp;

Browsertrix is an open-source cloud-native high-fidelity browser-based crawling service designed
to make web archiving easier and more accessible for everyone.

The service provides an API and UI for scheduling crawls and viewing results, and managing all aspects of crawling process. This system provides the orchestration and management around crawling, while the actual crawling is performed using [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) containers, which are launched for each crawl.

See [browsertrix.com](https://browsertrix.com) for a feature overview and information about Browsertrix hosting.

## Documentation

The full docs for using, deploying, and developing Browsertrix are available at: [https://docs.browsertrix.cloud](https://docs.browsertrix.cloud)

## Deployment

The latest deployment documentation is available at: [https://docs.browsertrix.cloud/deploy](https://docs.browsertrix.cloud/deploy)

The docs cover deploying Browsertrix in different environments using Kubernetes, from a single-node setup to scalable clusters in the cloud.

Previously, Browsertrix also supported Docker Compose and podman-based deployment. This has been deprecated due to the complexity of maintaining feature parity across different setups, and with various Kubernetes deployment options being available and easy to deploy, even on a single machine.

Making deployment of Browsertrix as easy as possible remains a key goal, and we welcome suggestions for how we can further improve our Kubernetes deployment options.

If you are looking to just try running a single crawl, you may want to try [Browsertrix Crawler](https://github.com/webrecorder/browsertrix-crawler) first to test out the crawling capabilities.

## Development Status

Browsertrix is currently in a beta, though the system and backend API is fairly stable, we are working on many additional features.

Additional developer documentation is available at [https://docs.browsertrix.cloud/develop](https://docs.browsertrix.cloud/develop/)

Please see the GitHub issues and [this GitHub Project](https://github.com/orgs/webrecorder/projects/9) for our current project plan and tasks.

## License

Browsertrix is made available under the AGPLv3 License.

Documentation is made available under the Creative Commons Attribution 4.0 International License
