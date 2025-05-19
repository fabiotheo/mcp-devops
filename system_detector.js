// ~/.mcp-terminal/system-detector.js
import { execSync } from 'child_process';
import fs from 'fs';

class SystemDetector {
    constructor() {
        this.systemInfo = null;
        this.installedPackages = null;
        this.detectSystem();
    }

    detectSystem() {
        try {
            const info = {
                os: this.getOS(),
                distro: this.getDistribution(),
                version: this.getVersion(),
                packageManager: this.getPackageManager(),
                shell: this.getShell(),
                architecture: this.getArchitecture(),
                kernel: this.getKernel()
            };

            this.systemInfo = info;
            return info;
        } catch (error) {
            console.error('Erro ao detectar sistema:', error);
            return null;
        }
    }

    getOS() {
        try {
            return execSync('uname -s', { encoding: 'utf8' }).trim();
        } catch {
            return 'Unknown';
        }
    }

    getDistribution() {
        // Tenta várias formas de detectar a distribuição
        const methods = [
            () => {
                const content = fs.readFileSync('/etc/os-release', 'utf8');
                const match = content.match(/^ID="?([^"\n]*)"?/m);
                return match ? match[1] : null;
            },
            () => {
                const content = fs.readFileSync('/etc/lsb-release', 'utf8');
                const match = content.match(/DISTRIB_ID=(.+)/);
                return match ? match[1] : null;
            },
            () => {
                if (fs.existsSync('/etc/debian_version')) return 'debian';
                if (fs.existsSync('/etc/redhat-release')) return 'redhat';
                if (fs.existsSync('/etc/arch-release')) return 'arch';
                if (fs.existsSync('/etc/gentoo-release')) return 'gentoo';
                return null;
            },
            () => execSync('lsb_release -si', { encoding: 'utf8' }).trim(),
            () => execSync('hostnamectl | grep "Operating System"', { encoding: 'utf8' }).split(':')[1]?.trim()
        ];

        for (const method of methods) {
            try {
                const result = method();
                if (result) return result.toLowerCase();
            } catch {}
        }

        return 'unknown';
    }

    getVersion() {
        try {
            // Tenta pegar versão específica da distro
            if (fs.existsSync('/etc/os-release')) {
                const content = fs.readFileSync('/etc/os-release', 'utf8');
                const versionMatch = content.match(/VERSION_ID="?([^"\n]*)"?/);
                if (versionMatch) return versionMatch[1];
            }

            // Fallback para versão do kernel
            return execSync('uname -r', { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    getPackageManager() {
        const managers = [
            { cmd: 'apt', distros: ['ubuntu', 'debian', 'mint'] },
            { cmd: 'yum', distros: ['rhel', 'centos', 'fedora'] },
            { cmd: 'dnf', distros: ['fedora', 'rhel'] },
            { cmd: 'pacman', distros: ['arch', 'manjaro'] },
            { cmd: 'zypper', distros: ['opensuse', 'suse'] },
            { cmd: 'emerge', distros: ['gentoo'] },
            { cmd: 'xbps-install', distros: ['void'] }
        ];

        // Verifica por distro
        const distro = this.systemInfo?.distro || this.getDistribution();
        for (const manager of managers) {
            if (manager.distros.includes(distro)) {
                try {
                    execSync(`which ${manager.cmd}`, { stdio: 'ignore' });
                    return manager.cmd;
                } catch {}
            }
        }

        // Verifica qual está disponível
        for (const manager of managers) {
            try {
                execSync(`which ${manager.cmd}`, { stdio: 'ignore' });
                return manager.cmd;
            } catch {}
        }

        return 'unknown';
    }

    getShell() {
        return process.env.SHELL?.split('/').pop() || 'unknown';
    }

    getArchitecture() {
        try {
            return execSync('uname -m', { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    getKernel() {
        try {
            return execSync('uname -r', { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    // Comandos específicos por sistema
    getSystemCommands() {
        const base = {
            listProcesses: 'ps aux',
            diskUsage: 'df -h',
            memoryUsage: 'free -h',
            networkInfo: 'ip addr show || ifconfig',
        };

        const distroSpecific = {
            ubuntu: {
                ...base,
                install: 'sudo apt install',
                update: 'sudo apt update && sudo apt upgrade',
                search: 'apt search',
                removePackage: 'sudo apt remove',
                listInstalled: 'apt list --installed',
                serviceStatus: 'systemctl status',
                serviceStart: 'sudo systemctl start',
                serviceStop: 'sudo systemctl stop',
                listServices: 'systemctl list-units --type=service'
            },
            arch: {
                ...base,
                install: 'sudo pacman -S',
                update: 'sudo pacman -Syu',
                search: 'pacman -Ss',
                removePackage: 'sudo pacman -R',
                listInstalled: 'pacman -Q',
                serviceStatus: 'systemctl status',
                serviceStart: 'sudo systemctl start',
                serviceStop: 'sudo systemctl stop',
                listServices: 'systemctl list-units --type=service'
            },
            fedora: {
                ...base,
                install: 'sudo dnf install',
                update: 'sudo dnf update',
                search: 'dnf search',
                removePackage: 'sudo dnf remove',
                listInstalled: 'dnf list installed',
                serviceStatus: 'systemctl status',
                serviceStart: 'sudo systemctl start',
                serviceStop: 'sudo systemctl stop',
                listServices: 'systemctl list-units --type=service'
            }
        };

        return distroSpecific[this.systemInfo.distro] || base;
    }

    // Detecta pacotes instalados no sistema
    detectInstalledPackages() {
        if (this.installedPackages) {
            return this.installedPackages;
        }

        const packages = {
            firewalls: this.detectFirewalls(),
            webServers: this.detectWebServers(),
            databases: this.detectDatabases(),
            containerTools: this.detectContainerTools(),
            monitoringTools: this.detectMonitoringTools()
        };

        this.installedPackages = packages;
        return packages;
    }

    // Detecta firewalls instalados
    detectFirewalls() {
        const firewalls = [];

        // Verifica UFW (Uncomplicated Firewall)
        try {
            execSync('which ufw', { stdio: 'ignore' });
            const status = execSync('ufw status', { encoding: 'utf8' }).trim();
            firewalls.push({
                name: 'ufw',
                active: !status.includes('inactive'),
                details: status
            });
        } catch {}

        // Verifica FirewallD
        try {
            execSync('which firewall-cmd', { stdio: 'ignore' });
            const status = execSync('firewall-cmd --state', { encoding: 'utf8' }).trim();
            firewalls.push({
                name: 'firewalld',
                active: status === 'running',
                details: `FirewallD is ${status}`
            });
        } catch {}

        // Verifica iptables
        try {
            execSync('which iptables', { stdio: 'ignore' });
            const rules = execSync('iptables -L', { encoding: 'utf8' }).trim();
            firewalls.push({
                name: 'iptables',
                active: true,
                details: 'iptables is available'
            });
        } catch {}

        return firewalls;
    }

    // Detecta servidores web instalados
    detectWebServers() {
        const webServers = [];

        // Verifica Nginx
        try {
            execSync('which nginx', { stdio: 'ignore' });
            let status = 'installed';
            try {
                status = execSync('systemctl is-active nginx', { encoding: 'utf8' }).trim();
            } catch {}
            webServers.push({
                name: 'nginx',
                active: status === 'active',
                details: `Nginx is ${status}`
            });
        } catch {}

        // Verifica Apache
        try {
            const apacheCommands = ['apache2', 'httpd'];
            for (const cmd of apacheCommands) {
                try {
                    execSync(`which ${cmd}`, { stdio: 'ignore' });
                    let status = 'installed';
                    try {
                        status = execSync(`systemctl is-active ${cmd}`, { encoding: 'utf8' }).trim();
                    } catch {}
                    webServers.push({
                        name: cmd,
                        active: status === 'active',
                        details: `${cmd} is ${status}`
                    });
                    break;
                } catch {}
            }
        } catch {}

        return webServers;
    }

    // Detecta bancos de dados instalados
    detectDatabases() {
        const databases = [];

        // Lista de bancos de dados comuns
        const dbServices = [
            { cmd: 'mysql', name: 'MySQL' },
            { cmd: 'mariadb', name: 'MariaDB' },
            { cmd: 'postgresql', name: 'PostgreSQL' },
            { cmd: 'mongod', name: 'MongoDB' },
            { cmd: 'redis-server', name: 'Redis' }
        ];

        for (const db of dbServices) {
            try {
                execSync(`which ${db.cmd}`, { stdio: 'ignore' });
                let status = 'installed';
                try {
                    status = execSync(`systemctl is-active ${db.cmd}`, { encoding: 'utf8' }).trim();
                } catch {}
                databases.push({
                    name: db.name,
                    active: status === 'active',
                    details: `${db.name} is ${status}`
                });
            } catch {}
        }

        return databases;
    }

    // Detecta ferramentas de contêiner
    detectContainerTools() {
        const containerTools = [];

        // Verifica Docker
        try {
            execSync('which docker', { stdio: 'ignore' });
            let status = 'installed';
            try {
                status = execSync('systemctl is-active docker', { encoding: 'utf8' }).trim();
            } catch {}
            containerTools.push({
                name: 'docker',
                active: status === 'active',
                details: `Docker is ${status}`
            });
        } catch {}

        // Verifica Podman
        try {
            execSync('which podman', { stdio: 'ignore' });
            containerTools.push({
                name: 'podman',
                active: true,
                details: 'Podman is installed'
            });
        } catch {}

        // Verifica Kubernetes tools
        try {
            execSync('which kubectl', { stdio: 'ignore' });
            containerTools.push({
                name: 'kubectl',
                active: true,
                details: 'Kubernetes CLI is installed'
            });
        } catch {}

        return containerTools;
    }

    // Detecta ferramentas de monitoramento
    detectMonitoringTools() {
        const monitoringTools = [];

        // Lista de ferramentas de monitoramento comuns
        const tools = [
            { cmd: 'prometheus', name: 'Prometheus' },
            { cmd: 'grafana-server', name: 'Grafana' },
            { cmd: 'nagios', name: 'Nagios' },
            { cmd: 'zabbix_server', name: 'Zabbix' }
        ];

        for (const tool of tools) {
            try {
                execSync(`which ${tool.cmd}`, { stdio: 'ignore' });
                let status = 'installed';
                try {
                    status = execSync(`systemctl is-active ${tool.cmd}`, { encoding: 'utf8' }).trim();
                } catch {}
                monitoringTools.push({
                    name: tool.name,
                    active: status === 'active',
                    details: `${tool.name} is ${status}`
                });
            } catch {}
        }

        return monitoringTools;
    }

    // Verifica se um pacote específico está instalado
    isPackageInstalled(packageName) {
        const packageManager = this.systemInfo.packageManager;

        try {
            switch (packageManager) {
                case 'apt':
                    execSync(`dpkg -l ${packageName} | grep -q ^ii`, { stdio: 'ignore' });
                    return true;
                case 'yum':
                case 'dnf':
                    execSync(`rpm -q ${packageName}`, { stdio: 'ignore' });
                    return true;
                case 'pacman':
                    execSync(`pacman -Q ${packageName}`, { stdio: 'ignore' });
                    return true;
                case 'zypper':
                    execSync(`rpm -q ${packageName}`, { stdio: 'ignore' });
                    return true;
                default:
                    // Tenta verificar se o comando existe
                    execSync(`which ${packageName}`, { stdio: 'ignore' });
                    return true;
            }
        } catch {
            return false;
        }
    }

    // Gera contexto para o LLM
    getSystemContext() {
        // Detecta pacotes instalados se ainda não tiver feito
        if (!this.installedPackages) {
            this.detectInstalledPackages();
        }

        return {
            ...this.systemInfo,
            commands: this.getSystemCommands(),
            capabilities: this.getSystemCapabilities(),
            installedPackages: this.installedPackages
        };
    }

    getSystemCapabilities() {
        const capabilities = [];

        // Verifica capacidades do sistema
        try {
            execSync('which systemctl', { stdio: 'ignore' });
            capabilities.push('systemd');
        } catch {}

        try {
            execSync('which docker', { stdio: 'ignore' });
            capabilities.push('docker');
        } catch {}

        try {
            execSync('which git', { stdio: 'ignore' });
            capabilities.push('git');
        } catch {}

        try {
            execSync('which curl', { stdio: 'ignore' });
            capabilities.push('curl');
        } catch {}

        return capabilities;
    }

    // Método para comandos comuns específicos do sistema
    getCommand(action, ...args) {
        const commands = this.getSystemCommands();

        switch (action) {
            case 'listDirectoriesBySize':
                return this.getListDirectoriesBySizeCommand(args[0] || '.');
            case 'findLargeFiles':
                return `find ${args[0] || '.'} -type f -exec ls -lh {} \\; | sort -k5 -hr | head -20`;
            case 'processInfo':
                return `ps aux | grep ${args[0]} | head -10`;
            case 'portInfo':
                return `sudo netstat -tlnp | grep ${args[0]}`;
            default:
                return commands[action] || null;
        }
    }

    getListDirectoriesBySizeCommand(path = '.') {
        // Comando específico para cada sistema
        const distroCommands = {
            ubuntu: `du -sh ${path}/* 2>/dev/null | sort -hr`,
            debian: `du -sh ${path}/* 2>/dev/null | sort -hr`,
            arch: `du -sh ${path}/* 2>/dev/null | sort -hr`,
            fedora: `du -sh ${path}/* 2>/dev/null | sort -hr`,
            centos: `du -sh ${path}/* 2>/dev/null | sort -hr`,
            rhel: `du -sh ${path}/* 2>/dev/null | sort -hr`
        };

        return distroCommands[this.systemInfo.distro] || `du -sh ${path}/* 2>/dev/null | sort -hr`;
    }
}

export default SystemDetector;
