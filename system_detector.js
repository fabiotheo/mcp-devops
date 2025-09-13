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

    getSystemInfo() {
        if (!this.systemInfo) {
            this.detectSystem();
        }
        return this.systemInfo;
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
            monitoringTools: this.detectMonitoringTools(),
            asterisk: this.detectAsterisk(),
            pm2: this.detectPM2(),
            awsCLI: this.detectAWSCLI()
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
                details: status,
                getBlockedIPs: () => this.getUFWBlockedIPs()
            });
        } catch {}

        // Verifica FirewallD
        try {
            execSync('which firewall-cmd', { stdio: 'ignore' });
            const status = execSync('firewall-cmd --state', { encoding: 'utf8' }).trim();
            firewalls.push({
                name: 'firewalld',
                active: status === 'running',
                details: `FirewallD is ${status}`,
                getBlockedIPs: () => this.getFirewallDBlockedIPs()
            });
        } catch {}

        // Verifica iptables
        try {
            execSync('which iptables', { stdio: 'ignore' });
            const rules = execSync('iptables -L', { encoding: 'utf8' }).trim();
            firewalls.push({
                name: 'iptables',
                active: true,
                details: 'iptables is available',
                getBlockedIPs: () => this.getIptablesBlockedIPs()
            });
        } catch {}

        // Verifica fail2ban
        try {
            execSync('which fail2ban-client', { stdio: 'ignore' });
            let status = 'installed';
            try {
                status = execSync('systemctl is-active fail2ban', { encoding: 'utf8' }).trim();
            } catch {}
            firewalls.push({
                name: 'fail2ban',
                active: status === 'active',
                details: `fail2ban is ${status}`,
                getBlockedIPs: () => this.getFail2banBlockedIPs()
            });
        } catch {}

        // Verifica CSF (ConfigServer Firewall)
        try {
            if (existsSync('/etc/csf')) {
                let status = 'installed';
                try {
                    status = execSync('systemctl is-active csf', { encoding: 'utf8' }).trim();
                } catch {}
                firewalls.push({
                    name: 'csf',
                    active: status === 'active',
                    details: `ConfigServer Firewall is ${status}`,
                    getBlockedIPs: () => this.getCSFBlockedIPs()
                });
            }
        } catch {}

        // Verifica Shorewall
        try {
            execSync('which shorewall', { stdio: 'ignore' });
            let status = 'installed';
            try {
                status = execSync('systemctl is-active shorewall', { encoding: 'utf8' }).trim();
            } catch {}
            firewalls.push({
                name: 'shorewall',
                active: status === 'active',
                details: `Shorewall is ${status}`,
                getBlockedIPs: () => this.getShorewallBlockedIPs()
            });
        } catch {}

        // Verifica pf (BSD Packet Filter)
        try {
            execSync('which pfctl', { stdio: 'ignore' });
            let status = 'unknown';
            try {
                const pfStatus = execSync('pfctl -s info', { encoding: 'utf8' }).trim();
                status = pfStatus.includes('Status: Enabled') ? 'active' : 'inactive';
            } catch {}
            firewalls.push({
                name: 'pf',
                active: status === 'active',
                details: `BSD Packet Filter is ${status}`,
                getBlockedIPs: () => this.getPFBlockedIPs()
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
    getSystemContext(includeBlockedIPs = false) {
        // Detecta pacotes instalados se ainda não tiver feito
        if (!this.installedPackages) {
            this.detectInstalledPackages();
        }

        const context = {
            ...this.systemInfo,
            commands: this.getSystemCommands(),
            capabilities: this.getSystemCapabilities(),
            installedPackages: this.installedPackages
        };

        // Adiciona informações de IPs bloqueados se solicitado
        if (includeBlockedIPs) {
            // Verifica se há firewalls ativos
            const activeFirewalls = this.installedPackages.firewalls.filter(fw => fw.active);

            if (activeFirewalls.length > 0) {
                context.firewallDetails = {
                    activeFirewalls: activeFirewalls.map(fw => fw.name),
                    blockedIPs: this.getAllBlockedIPs()
                };
            }
        }

        return context;
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

    // Métodos para obter IPs bloqueados por diferentes firewalls

    // Obtém IPs bloqueados pelo UFW
    getUFWBlockedIPs() {
        try {
            // Obtém regras do UFW
            const rawRules = execSync('ufw status numbered', { encoding: 'utf8' }).trim();
            const verboseRules = execSync('ufw status verbose', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];
            const lines = rawRules.split('\n');

            // Pula o cabeçalho
            for (let i = 4; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Procura por regras DENY ou REJECT
                if (line.includes('DENY') || line.includes('REJECT')) {
                    // Extrai o IP da linha
                    const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/);
                    if (ipMatch) {
                        const direction = line.includes('OUT') ? 'saída' : 'entrada';
                        blockedIPs.push({
                            ip: ipMatch[0],
                            rule: line.replace(/^\[\d+\]\s+/, ''), // Remove o número da regra
                            direction,
                            type: 'permanente'
                        });
                    }
                }
            }

            return {
                success: true,
                command: 'ufw status numbered',
                blockedIPs,
                rawOutput: rawRules,
                defaultPolicy: verboseRules.includes('Default: deny') ? 'deny' : 'allow'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'ufw status numbered'
            };
        }
    }

    // Obtém IPs bloqueados pelo FirewallD
    getFirewallDBlockedIPs() {
        try {
            // Obtém zonas e regras do FirewallD
            const zones = execSync('firewall-cmd --list-all-zones', { encoding: 'utf8' }).trim();
            const richRules = execSync('firewall-cmd --list-rich-rules', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];

            // Processa regras ricas
            if (richRules) {
                const rules = richRules.split('\n');
                for (const rule of rules) {
                    if (rule.includes('drop') || rule.includes('reject')) {
                        const ipMatch = rule.match(/source address="([^"]+)"/);
                        if (ipMatch) {
                            blockedIPs.push({
                                ip: ipMatch[1],
                                rule,
                                direction: 'entrada', // FirewallD geralmente bloqueia entrada
                                type: 'permanente'
                            });
                        }
                    }
                }
            }

            // Processa zonas para encontrar IPs bloqueados
            const zoneBlocks = zones.split('\n\n');
            for (const zone of zoneBlocks) {
                if (zone.includes('target: DROP') || zone.includes('target: REJECT')) {
                    const sources = zone.match(/sources: (.+)/);
                    if (sources && sources[1] && sources[1] !== '') {
                        const sourceIPs = sources[1].split(' ');
                        for (const ip of sourceIPs) {
                            if (ip.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/)) {
                                blockedIPs.push({
                                    ip,
                                    rule: `Zone: ${zone.split('\n')[0]} (target: DROP/REJECT)`,
                                    direction: 'entrada',
                                    type: 'permanente'
                                });
                            }
                        }
                    }
                }
            }

            return {
                success: true,
                command: 'firewall-cmd --list-rich-rules, firewall-cmd --list-all-zones',
                blockedIPs,
                rawOutput: richRules
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'firewall-cmd commands'
            };
        }
    }

    // Obtém IPs bloqueados pelo iptables
    getIptablesBlockedIPs() {
        try {
            // Obtém regras do iptables
            const rawRules = execSync('iptables -L -n -v', { encoding: 'utf8' }).trim();
            const saveRules = execSync('iptables-save', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];
            const lines = rawRules.split('\n');

            // Processa as linhas para encontrar regras DROP ou REJECT
            for (const line of lines) {
                if (line.includes('DROP') || line.includes('REJECT')) {
                    // Extrai o IP da linha
                    const sourceMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/);
                    if (sourceMatch) {
                        const direction = line.includes('OUTPUT') ? 'saída' : 'entrada';
                        blockedIPs.push({
                            ip: sourceMatch[0],
                            rule: line.trim(),
                            direction,
                            type: 'permanente'
                        });
                    }
                }
            }

            // Processa iptables-save para encontrar regras adicionais
            const saveLines = saveRules.split('\n');
            for (const line of saveLines) {
                if ((line.includes('-j DROP') || line.includes('-j REJECT')) && line.includes('-s ')) {
                    const sourceMatch = line.match(/-s\s+(\S+)/);
                    if (sourceMatch && sourceMatch[1].match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/)) {
                        const direction = line.includes('-o') ? 'saída' : 'entrada';
                        // Verifica se este IP já foi adicionado
                        const exists = blockedIPs.some(item => item.ip === sourceMatch[1]);
                        if (!exists) {
                            blockedIPs.push({
                                ip: sourceMatch[1],
                                rule: line.trim(),
                                direction,
                                type: 'permanente'
                            });
                        }
                    }
                }
            }

            return {
                success: true,
                command: 'iptables -L -n -v, iptables-save',
                blockedIPs,
                rawOutput: rawRules
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'iptables commands'
            };
        }
    }

    // Obtém IPs bloqueados pelo fail2ban
    getFail2banBlockedIPs() {
        try {
            // Obtém status do fail2ban
            const status = execSync('fail2ban-client status', { encoding: 'utf8' }).trim();

            // Extrai as jails ativas
            const jailsMatch = status.match(/Jail list:\s+(.+)/);
            if (!jailsMatch) {
                return {
                    success: true,
                    command: 'fail2ban-client status',
                    blockedIPs: [],
                    message: 'Nenhuma jail ativa encontrada'
                };
            }

            const jails = jailsMatch[1].split(', ');
            const blockedIPs = [];

            // Para cada jail, obtém os IPs bloqueados
            for (const jail of jails) {
                try {
                    const jailStatus = execSync(`fail2ban-client status ${jail}`, { encoding: 'utf8' }).trim();

                    // Extrai os IPs bloqueados
                    const bannedMatch = jailStatus.match(/Banned IP list:\s+(.+)/);
                    if (bannedMatch && bannedMatch[1] && bannedMatch[1] !== '') {
                        const bannedIPs = bannedMatch[1].split(' ');
                        for (const ip of bannedIPs) {
                            if (ip.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
                                // Tenta obter informações adicionais sobre o banimento
                                let banInfo = {};
                                try {
                                    const banData = execSync(`fail2ban-client get ${jail} banip ${ip}`, { encoding: 'utf8' }).trim();
                                    // Extrai tempo restante se disponível
                                    const timeMatch = banData.match(/(\d+)d (\d+)h (\d+)m (\d+)s/);
                                    if (timeMatch) {
                                        const days = parseInt(timeMatch[1]);
                                        const hours = parseInt(timeMatch[2]);
                                        const minutes = parseInt(timeMatch[3]);
                                        const seconds = parseInt(timeMatch[4]);
                                        const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
                                        banInfo.remainingTime = totalSeconds;
                                        banInfo.formattedTime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                                    }
                                } catch {}

                                blockedIPs.push({
                                    ip,
                                    rule: `Jail: ${jail}`,
                                    direction: 'entrada',
                                    type: 'temporário',
                                    ...banInfo
                                });
                            }
                        }
                    }
                } catch {}
            }

            return {
                success: true,
                command: 'fail2ban-client status',
                blockedIPs,
                jails
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'fail2ban-client status'
            };
        }
    }

    // Obtém IPs bloqueados pelo CSF (ConfigServer Firewall)
    getCSFBlockedIPs() {
        try {
            // Verifica se o arquivo de IPs bloqueados existe
            if (!existsSync('/etc/csf/csf.deny')) {
                return {
                    success: true,
                    command: 'cat /etc/csf/csf.deny',
                    blockedIPs: [],
                    message: 'Arquivo csf.deny não encontrado'
                };
            }

            // Lê o arquivo de IPs bloqueados
            const denyContent = execSync('cat /etc/csf/csf.deny', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];
            const lines = denyContent.split('\n');

            for (const line of lines) {
                // Ignora comentários
                if (line.startsWith('#')) continue;

                const parts = line.split('#');
                const ipData = parts[0].trim().split(' ');

                if (ipData[0] && ipData[0].match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
                    blockedIPs.push({
                        ip: ipData[0],
                        rule: line,
                        direction: 'entrada/saída', // CSF bloqueia ambas as direções por padrão
                        type: 'permanente',
                        comment: parts[1] ? parts[1].trim() : ''
                    });
                }
            }

            // Verifica também IPs temporariamente bloqueados
            if (existsSync('/etc/csf/csf.tempban')) {
                try {
                    const tempContent = execSync('cat /etc/csf/csf.tempban', { encoding: 'utf8' }).trim();
                    const tempLines = tempContent.split('\n');

                    for (const line of tempLines) {
                        if (line.startsWith('#')) continue;

                        const parts = line.split('#');
                        const ipData = parts[0].trim().split(' ');

                        if (ipData[0] && ipData[0].match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
                            blockedIPs.push({
                                ip: ipData[0],
                                rule: line,
                                direction: 'entrada/saída',
                                type: 'temporário',
                                comment: parts[1] ? parts[1].trim() : ''
                            });
                        }
                    }
                } catch {}
            }

            return {
                success: true,
                command: 'cat /etc/csf/csf.deny, cat /etc/csf/csf.tempban',
                blockedIPs
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'CSF commands'
            };
        }
    }

    // Obtém IPs bloqueados pelo Shorewall
    getShorewallBlockedIPs() {
        try {
            // Obtém regras do Shorewall
            const status = execSync('shorewall status', { encoding: 'utf8' }).trim();
            const rules = execSync('shorewall show blacklists', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];

            // Processa as regras para encontrar IPs bloqueados
            const lines = rules.split('\n');
            for (const line of lines) {
                // Ignora cabeçalhos e linhas vazias
                if (line.startsWith('Blacklisted') || line.trim() === '') continue;

                const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/);
                if (ipMatch) {
                    blockedIPs.push({
                        ip: ipMatch[0],
                        rule: line.trim(),
                        direction: 'entrada', // Shorewall geralmente bloqueia entrada
                        type: 'permanente'
                    });
                }
            }

            // Verifica também as regras de bloqueio dinâmicas
            try {
                const dynamicRules = execSync('shorewall show dynamic', { encoding: 'utf8' }).trim();
                const dynamicLines = dynamicRules.split('\n');

                for (const line of dynamicLines) {
                    if (line.includes('DROP') || line.includes('REJECT')) {
                        const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/);
                        if (ipMatch) {
                            blockedIPs.push({
                                ip: ipMatch[0],
                                rule: line.trim(),
                                direction: line.includes('OUTPUT') ? 'saída' : 'entrada',
                                type: 'dinâmico'
                            });
                        }
                    }
                }
            } catch {}

            return {
                success: true,
                command: 'shorewall show blacklists, shorewall show dynamic',
                blockedIPs,
                rawOutput: rules
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'Shorewall commands'
            };
        }
    }

    // Obtém IPs bloqueados pelo pf (BSD Packet Filter)
    getPFBlockedIPs() {
        try {
            // Obtém regras do pf
            const tables = execSync('pfctl -s Tables', { encoding: 'utf8' }).trim();
            const rules = execSync('pfctl -s rules', { encoding: 'utf8' }).trim();

            // Extrai IPs bloqueados
            const blockedIPs = [];

            // Processa as tabelas para encontrar listas de bloqueio
            const tablesList = tables.split('\n');
            for (const table of tablesList) {
                if (table.includes('block') || table.includes('blacklist')) {
                    try {
                        const tableContent = execSync(`pfctl -t ${table} -T show`, { encoding: 'utf8' }).trim();
                        const ips = tableContent.split('\n');

                        for (const ip of ips) {
                            if (ip.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/)) {
                                blockedIPs.push({
                                    ip,
                                    rule: `Table: ${table}`,
                                    direction: 'entrada/saída', // pf pode bloquear ambas as direções
                                    type: 'permanente'
                                });
                            }
                        }
                    } catch {}
                }
            }

            // Processa as regras para encontrar bloqueios diretos
            const rulesList = rules.split('\n');
            for (const rule of rulesList) {
                if ((rule.includes('block') || rule.includes('drop')) && !rule.includes('table')) {
                    const ipMatch = rule.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/);
                    if (ipMatch) {
                        const direction = rule.includes('out') ? 'saída' : 'entrada';
                        blockedIPs.push({
                            ip: ipMatch[0],
                            rule,
                            direction,
                            type: 'permanente'
                        });
                    }
                }
            }

            return {
                success: true,
                command: 'pfctl -s Tables, pfctl -s rules',
                blockedIPs,
                rawOutput: rules
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: 'pfctl commands'
            };
        }
    }

    // Método para obter todos os IPs bloqueados de todos os firewalls
    getAllBlockedIPs() {
        const firewalls = this.detectFirewalls();
        const results = {};

        for (const firewall of firewalls) {
            if (firewall.active && typeof firewall.getBlockedIPs === 'function') {
                results[firewall.name] = firewall.getBlockedIPs();
            }
        }

        return results;
    }

    // Detecta Asterisk (servidor VoIP)
    detectAsterisk() {
        try {
            // Verifica se o Asterisk está instalado
            execSync('which asterisk', { stdio: 'ignore' });

            // Verifica status do serviço
            let status = 'installed';
            let version = '';
            let activeChannels = 0;
            let registeredPeers = 0;
            let details = {};

            try {
                // Verifica se o serviço está ativo
                status = execSync('systemctl is-active asterisk', { encoding: 'utf8' }).trim();
            } catch {
                // Tenta verificar se o processo está rodando
                try {
                    const processCheck = execSync('pgrep -l asterisk', { encoding: 'utf8' }).trim();
                    if (processCheck) {
                        status = 'running';
                    }
                } catch {}
            }

            // Se estiver ativo, tenta obter mais informações
            if (status === 'active' || status === 'running') {
                try {
                    // Obtém versão
                    const versionOutput = execSync('asterisk -rx "core show version"', { encoding: 'utf8' }).trim();
                    const versionMatch = versionOutput.match(/Asterisk\s+([\d\.]+)/);
                    if (versionMatch) {
                        version = versionMatch[1];
                    }

                    // Obtém número de canais ativos
                    const channelsOutput = execSync('asterisk -rx "core show channels count"', { encoding: 'utf8' }).trim();
                    const channelsMatch = channelsOutput.match(/(\d+)\s+active/);
                    if (channelsMatch) {
                        activeChannels = parseInt(channelsMatch[1]);
                    }

                    // Obtém número de peers SIP registrados
                    const peersOutput = execSync('asterisk -rx "sip show peers"', { encoding: 'utf8' }).trim();
                    const peersMatch = peersOutput.match(/(\d+)\s+sip peers/i);
                    if (peersMatch) {
                        registeredPeers = parseInt(peersMatch[1]);
                    }

                    // Obtém informações de configuração
                    details = {
                        configPath: '/etc/asterisk',
                        logPath: '/var/log/asterisk',
                        moduleStatus: execSync('asterisk -rx "module show"', { encoding: 'utf8' }).includes('modules loaded'),
                        uptime: execSync('asterisk -rx "core show uptime"', { encoding: 'utf8' }).trim()
                    };
                } catch (e) {
                    // Ignora erros ao obter informações detalhadas
                }
            }

            return {
                name: 'Asterisk',
                active: status === 'active' || status === 'running',
                version,
                details: `Asterisk is ${status}${version ? `, version ${version}` : ''}`,
                activeChannels,
                registeredPeers,
                configDetails: details,
                getCommands: () => this.getAsteriskCommands()
            };
        } catch {
            // Asterisk não está instalado
            return null;
        }
    }

    // Retorna comandos específicos para Asterisk
    getAsteriskCommands() {
        return {
            status: 'systemctl status asterisk',
            restart: 'systemctl restart asterisk',
            showPeers: 'asterisk -rx "sip show peers"',
            showRegistry: 'asterisk -rx "sip show registry"',
            showChannels: 'asterisk -rx "core show channels"',
            reloadSIP: 'asterisk -rx "sip reload"',
            reloadAll: 'asterisk -rx "core reload"',
            gracefulRestart: 'asterisk -rx "core restart gracefully"',
            logs: 'tail -f /var/log/asterisk/full',
            checkConfig: 'asterisk -T',
            showVersion: 'asterisk -rx "core show version"',
            showUptime: 'asterisk -rx "core show uptime"',
            showModules: 'asterisk -rx "module show"',
            showHelp: 'asterisk -rx "core show help"',
            showDialplan: 'asterisk -rx "dialplan show"'
        };
    }

    // Detecta PM2 (Process Manager para Node.js)
    detectPM2() {
        try {
            // Verifica se o PM2 está instalado
            execSync('which pm2', { stdio: 'ignore' });

            // Informações básicas
            let status = 'installed';
            let version = '';
            let runningApps = 0;
            let details = {};

            try {
                // Obtém versão
                const versionOutput = execSync('pm2 --version', { encoding: 'utf8' }).trim();
                if (versionOutput) {
                    version = versionOutput;
                }

                // Obtém lista de aplicações
                const listOutput = execSync('pm2 list --no-color', { encoding: 'utf8' }).trim();

                // Verifica se há aplicações rodando
                if (listOutput.includes('online')) {
                    status = 'active';

                    // Conta aplicações online
                    const onlineMatches = listOutput.match(/online/g);
                    if (onlineMatches) {
                        runningApps = onlineMatches.length;
                    }

                    // Obtém mais detalhes
                    try {
                        // Tenta obter informações de uso de recursos
                        const jlist = execSync('pm2 jlist', { encoding: 'utf8' }).trim();
                        try {
                            const apps = JSON.parse(jlist);
                            details = {
                                apps: apps.map(app => ({
                                    name: app.name,
                                    status: app.pm2_env.status,
                                    memory: app.monit ? app.monit.memory : 'N/A',
                                    cpu: app.monit ? app.monit.cpu : 'N/A',
                                    uptime: app.pm2_env.pm_uptime ? new Date(app.pm2_env.pm_uptime) : 'N/A',
                                    restarts: app.pm2_env.restart_time
                                })).slice(0, 5) // Limita a 5 apps para não sobrecarregar
                            };
                        } catch (e) {
                            // Erro ao parsear JSON
                        }
                    } catch (e) {
                        // Ignora erros ao obter detalhes
                    }
                }
            } catch (e) {
                // Ignora erros ao obter informações detalhadas
            }

            return {
                name: 'PM2',
                active: status === 'active',
                version,
                details: `PM2 is ${status}${version ? `, version ${version}` : ''}${runningApps ? `, ${runningApps} apps running` : ''}`,
                runningApps,
                appDetails: details,
                getCommands: () => this.getPM2Commands()
            };
        } catch {
            // PM2 não está instalado
            return null;
        }
    }

    // Retorna comandos específicos para PM2
    getPM2Commands() {
        return {
            list: 'pm2 list',
            status: 'pm2 status',
            monit: 'pm2 monit',
            logs: 'pm2 logs',
            logsApp: 'pm2 logs [app-name]',
            restart: 'pm2 restart [app-name]',
            reload: 'pm2 reload [app-name]',
            stop: 'pm2 stop [app-name]',
            delete: 'pm2 delete [app-name]',
            startup: 'pm2 startup',
            save: 'pm2 save',
            show: 'pm2 show [app-name]',
            startApp: 'pm2 start app.js --name [app-name]',
            startWithOptions: 'pm2 start app.js --name [app-name] --watch --max-memory-restart 300M',
            flush: 'pm2 flush',
            reloadLogs: 'pm2 reloadLogs',
            ping: 'pm2 ping',
            update: 'pm2 update',
            ecosystem: 'pm2 ecosystem',
            startEcosystem: 'pm2 start ecosystem.config.js'
        };
    }

    // Detecta AWS CLI com foco em S3
    detectAWSCLI() {
        try {
            // Verifica se o AWS CLI está instalado
            execSync('which aws', { stdio: 'ignore' });

            // Informações básicas
            let version = '';
            let configured = false;
            let defaultRegion = '';
            let buckets = [];
            let details = {};

            try {
                // Obtém versão
                const versionOutput = execSync('aws --version', { encoding: 'utf8' }).trim();
                const versionMatch = versionOutput.match(/aws-cli\/(\S+)/);
                if (versionMatch) {
                    version = versionMatch[1];
                }

                // Verifica se está configurado
                try {
                    // Tenta obter a região padrão
                    const configOutput = execSync('aws configure get region', { encoding: 'utf8' }).trim();
                    if (configOutput && configOutput !== '') {
                        configured = true;
                        defaultRegion = configOutput;

                        // Tenta listar buckets
                        try {
                            const bucketsOutput = execSync('aws s3 ls', { encoding: 'utf8' }).trim();
                            if (bucketsOutput) {
                                // Extrai nomes dos buckets
                                const bucketLines = bucketsOutput.split('\n');
                                buckets = bucketLines.map(line => {
                                    const match = line.match(/\S+\s+(.+)/);
                                    return match ? match[1].trim() : null;
                                }).filter(Boolean);

                                // Limita a quantidade de buckets para não sobrecarregar
                                buckets = buckets.slice(0, 10);
                            }
                        } catch (e) {
                            // Ignora erros ao listar buckets (pode ser permissão)
                        }

                        // Obtém mais detalhes de configuração
                        try {
                            details = {
                                profile: execSync('aws configure get profile', { encoding: 'utf8' }).trim() || 'default',
                                outputFormat: execSync('aws configure get output', { encoding: 'utf8' }).trim() || 'json',
                                s3Config: {
                                    defaultRegion,
                                    bucketCount: buckets.length
                                }
                            };
                        } catch (e) {
                            // Ignora erros ao obter detalhes
                        }
                    }
                } catch (e) {
                    // AWS CLI não está configurado
                }
            } catch (e) {
                // Ignora erros ao obter informações detalhadas
            }

            return {
                name: 'AWS CLI',
                active: configured,
                version,
                details: `AWS CLI ${version ? `v${version}` : 'installed'}${configured ? ', configured' : ', not configured'}${defaultRegion ? `, region: ${defaultRegion}` : ''}`,
                configured,
                defaultRegion,
                buckets,
                configDetails: details,
                getCommands: () => this.getAWSS3Commands()
            };
        } catch {
            // AWS CLI não está instalado
            return null;
        }
    }

    // Retorna comandos específicos para AWS S3
    getAWSS3Commands() {
        return {
            listBuckets: 'aws s3 ls',
            listObjects: 'aws s3 ls s3://[bucket-name]',
            listObjectsRecursive: 'aws s3 ls s3://[bucket-name] --recursive',
            createBucket: 'aws s3 mb s3://[bucket-name]',
            removeBucket: 'aws s3 rb s3://[bucket-name]',
            copyToS3: 'aws s3 cp [local-file] s3://[bucket-name]/[path]',
            copyFromS3: 'aws s3 cp s3://[bucket-name]/[path] [local-file]',
            moveToS3: 'aws s3 mv [local-file] s3://[bucket-name]/[path]',
            moveFromS3: 'aws s3 mv s3://[bucket-name]/[path] [local-file]',
            syncToS3: 'aws s3 sync [local-dir] s3://[bucket-name]/[path]',
            syncFromS3: 'aws s3 sync s3://[bucket-name]/[path] [local-dir]',
            removeObject: 'aws s3 rm s3://[bucket-name]/[path]',
            removePrefix: 'aws s3 rm s3://[bucket-name]/[path] --recursive',
            presignUrl: 'aws s3 presign s3://[bucket-name]/[path] --expires-in [seconds]',
            getBucketSize: 'aws s3 ls s3://[bucket-name] --recursive --human-readable --summarize',
            getBucketPolicy: 'aws s3api get-bucket-policy --bucket [bucket-name]',
            setBucketPolicy: 'aws s3api put-bucket-policy --bucket [bucket-name] --policy file://policy.json',
            configureConcurrency: 'aws configure set default.s3.max_concurrent_requests [number]',
            configureChunkSize: 'aws configure set default.s3.multipart_chunksize [size]',
            enableAcceleration: 'aws s3 cp --endpoint-url=https://s3-accelerate.amazonaws.com'
        };
    }
}

export default SystemDetector;
