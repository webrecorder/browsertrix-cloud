# K3S

*Playbook Path: [ansible/playbooks/install_k3s.yml](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/playbooks/install_k3s.yml)*

This playbook provides an easy way to install Browsertrix on a Linux box (tested on Rocky Linux 9). It automatically sets up Browsertrix with Let's Encrypt certificates.

### Requirements

To run this ansible playbook, you need to:

* Have a server / VPS where Browsertrix will run.
* Configure a DNS A Record to point at your server's IP address.
* Make sure SSH is working, with a sudo user: `#!shell ssh your-user@your-domain`
* Install Ansible on your local machine (the control machine).


1. Clone the repo:
```zsh
git clone https://github.com/webrecorder/browsertrix-cloud.git
cd browsertrix-cloud
```

2. Optional: Create a copy of the [inventory directory] and name it what you like (alternatively edit the sample files in place)
```zsh
cp -r ansible/inventory/sample-k3s ansible/inventory/my-deployment
```

1. [Look at the configuration options](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/inventory/sample-k3s/group_vars/all.yml) and modify them to match your setup 

2. Change the [hosts IP address](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/inventory/sample-k3s/hosts.ini) in your just created inventory

4. You may need to make modifications to the playbook itself based on your configuration. The playbook lists sections that can be removed or changed based on whether you'd like to install a multi-node or single-node k3s installation for your Browsertrix deployment. By default the playbook assumes you'll run in a single-node environment deploying directly to `localhost`

5. Run the playbook:
```zsh
ansible-playbook -i inventory/my-deployment/hosts.ini install_k3s.yml
```

#### Upgrading

1. Run `git pull`

2. Run the playbook:
```zsh
ansible-playbook -i inventory/hosts install_k3s.yml -t helm_upgrade
```
