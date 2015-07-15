# -*- mode: ruby -*-
# vi: set ft=ruby :

VAGRANT_ROOT = File.dirname(File.expand_path(__FILE__))

OS = {
  box: 'ubuntu-1404',
  virtualbox: 'https://cloud-images.ubuntu.com/vagrant/trusty/current/trusty-server-cloudimg-amd64-vagrant-disk1.box'
}

Vagrant.configure('2') do |config|
  config.vm.box_url  = OS[:virtualbox]
  config.vm.box      = OS[:box]
  config.vm.hostname = "realtime-bus-sms-0"

  config.vm.provider(:virtualbox) do |vb|
    vb.customize ['modifyvm', :id, '--natdnshostresolver1', 'on']
    vb.customize ['modifyvm', :id, '--natdnsproxy1', 'on']
    vb.memory = 2048
    vb.cpus = 2
  end

  if Vagrant.has_plugin?("vagrant-cachier")
    config.cache.scope = :box
  end

  config.ssh.forward_agent = true

  config.vm.provision "shell", inline: "sudo apt-get -y install npm nodejs nodejs-legacy"

  config.vm.define "realtime_bus_sms_0" do |node|
    node.vm.network 'private_network', ip: '192.168.51.1'
    node.vm.synced_folder './', '/home/vagrant/realtime-bus-sms'

  end

end
