# DigitalOcean 

*Playbook Path: [ansible/playbooks/install_microk8s.yml](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/playbooks/do_setup.yml)*

This playbook provides an easy way to install Browsertrix on DigitalOcean. It automatically sets up Browsertrix with LetsEncrypt certificates.

### Requirements

To run this ansible playbook, you need to:

- Have a [DigitalOcean Account](https://m.do.co/c/e0db3814e33e) where this will run.
- Create a [DigitalOcean API Key](https://cloud.digitalocean.com/account/api) which will need to be set in your terminal sessions environment variables `export DO_API_TOKEN` 
- `doctl` command line client configured (run `doctl auth init`)
- Create a [DigitalOcean Spaces](https://docs.digitalocean.com/reference/api/spaces-api/) API Key which will also need to be set in your terminal sessions environment variables, which should be set as `DO_AWS_ACCESS_KEY` and `DO_AWS_SECRET_KEY`
- Configure a DNS A Record and CNAME record.
- Have a working Python and pip configuration through your OS Package Manager

#### Install

1. Clone the repo:
```zsh
git clone https://github.com/webrecorder/browsertrix-cloud.git
cd browsertrix-cloud
```

2. Install the Dependencies through pipenv
```zsh
cd ansible
pip install pipenv
pipenv install
pipenv shell
```

3. [Look at the configuration options](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/inventory/digital_ocean/group_vars/main.yml) and modify them or pass them as extra variables as shown below. If you haven't configured `kubectl`, please enable the `configure_kube` option 

4. Run the playbook:
```zsh
ansible-playbook do_setup.yml -e project_name="your-project" -e superuser_email="you@yourdomain.com" -e domain="yourdomain.com"
```

You may optionally configure these command line parameters through the [group_vars file](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/inventory/digital_ocean/group_vars/main.yml)

#### Upgrading

1. Run `git pull`

2. Run the playbook:
```zsh
ansible-playbook do_setup.yml -e project_name="your-project" -e superuser_email="you@yourdomain.com" -e domain="yourdomain.com" -t helm_upgrade
```

### Uninstall

You can tear down your deployment through ansible as well. By default ansible will dump all the databases into your DO space. You can configure an option to disable this feature. 

```zsh
ansible-playbook playbooks/do_teardown.yml -e project_name="your-project" -e superuser_email="you@yourdomain.com" -e domain="yourdomain.com"
```
