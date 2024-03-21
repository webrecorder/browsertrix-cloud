# Microk8s

*Playbook Path: [ansible/playbooks/install_microk8s.yml](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/playbooks/install_microk8s.yml)*

This playbook provides an easy way to install Browsertrix on Ubuntu (tested on Jammy Jellyfish) and RedHat 9 (tested on Rocky Linux 9). It automatically sets up Browsertrix with Letsencrypt certificates.

### Requirements

To run this ansible playbook, you need to:

- Have a server / VPS where browsertrix will run.
- Configure a DNS A Record to point at your server's IP address.
- Make sure you can ssh to it, with a sudo user: ssh <your-user>@<your-domain>
- Install Ansible on your local machine (the control machine).

!!! note

    Ansible requires an SSH key with no password. You cannot use a passphrase.
		Sudo must similarly be available without a passphrase for ansible to work

??? info Debian Users

		You will need to install `acl` on the target Ansible machine to set permissions: 
		`sudo apt-get install acl`

#### Install

1. Clone the repo:
```zsh
git clone https://github.com/webrecorder/browsertrix-cloud.git
cd browsertrix-cloud/ansible
```

2. [Look at the configuration options](https://github.com/webrecorder/browsertrix-cloud/blob/main/ansible/group_vars/microk8s/main.yml) and modify them or pass them as extra variables as shown below. 

3. Add your IP address above to a new file called [inventory/hosts]

4. Run the playbook:
```zsh
ansible-playbook -i inventory/hosts install_microk8s.yml -e host_ip="1.2.3.4" -e domain_name="yourdomain.com" -e your_user="your_vps_admin_user"
```

#### Upgrading

1. Run `git pull`

2. Run the playbook:
```zsh
ansible-playbook -i inventory/hosts install_microk8s.yml -e host_ip="1.2.3.4" -e domain_name="yourdomain.com" -t helm_upgrade
```
