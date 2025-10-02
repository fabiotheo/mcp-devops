#!/usr/bin/env node

/**
 * MachineIdentityManager - Sistema de identificação única de máquinas
 * Gera e gerencia IDs únicos para cada máquina no sistema distribuído
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Options for MachineIdentityManager
 */
interface MachineIdentityOptions {
  cacheDir?: string;
  debug?: boolean;
}

/**
 * Hardware information used to generate machine ID
 */
interface HardwareInfo {
  platform: string;
  hostname: string;
  cpus: string[];
  networkInterfaces: string[];
  totalMemory: number;
  homeDir: string;
  username: string;
  machineId?: string;
  serialNumber?: string;
  uuid?: string;
}

export default class MachineIdentityManager {
  private cacheDir: string;
  private cacheFile: string;
  private debug: boolean;

  constructor(options: MachineIdentityOptions = {}) {
    this.cacheDir =
      options.cacheDir || path.join(os.homedir(), '.mcp-terminal');
    this.cacheFile = path.join(this.cacheDir, 'machine-id');
    this.debug = options.debug || false;
  }

  /**
   * Obtém o ID único da máquina (do cache ou gera novo)
   */
  async getMachineId() {
    // Tentar cache primeiro
    if (existsSync(this.cacheFile)) {
      try {
        const cachedId = await fs.readFile(this.cacheFile, 'utf8');
        if (cachedId && cachedId.trim()) {
          if (this.debug)
            console.log('Machine ID loaded from cache:', cachedId.trim());
          return cachedId.trim();
        }
      } catch (error) {
        console.error('Error reading cached machine ID:', error.message);
      }
    }

    // Gerar novo ID
    const id = await this.generateMachineId();

    // Salvar em cache
    await this.saveMachineId(id);

    return id;
  }

  /**
   * Gera um novo ID único para a máquina
   */
  async generateMachineId() {
    const components = [];

    // 1. Hostname
    const hostname = os.hostname();
    components.push(hostname);
    if (this.debug) console.log('Hostname:', hostname);

    // 2. MAC Address principal
    const mac = await this.getPrimaryMacAddress();
    if (mac) {
      components.push(mac);
      if (this.debug) console.log('Primary MAC:', mac);
    }

    // 3. System machine-id (Linux/systemd)
    const systemId = await this.getSystemMachineId();
    if (systemId) {
      components.push(systemId);
      if (this.debug) console.log('System ID:', systemId);
    } else {
      // Fallback: usar timestamp + random
      const fallback = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      components.push(fallback);
      if (this.debug) console.log('Fallback ID:', fallback);
    }

    // 4. Adicionar informações do sistema operacional
    const osInfo = `${os.platform()}-${os.arch()}`;
    components.push(osInfo);

    // Gerar hash SHA256
    const hash = crypto.createHash('sha256');
    hash.update(components.join('-'));
    const machineId = hash.digest('hex');

    if (this.debug) {
      console.log('Generated Machine ID:', machineId);
      console.log('Components:', components);
    }

    return machineId;
  }

  /**
   * Obtém o MAC address da interface de rede principal
   */
  async getPrimaryMacAddress() {
    try {
      const interfaces = os.networkInterfaces();

      // Prioridade de interfaces
      const priorityInterfaces = ['eth0', 'en0', 'enp0s3', 'wlan0', 'wlp2s0'];

      // Tentar interfaces prioritárias primeiro
      for (const name of priorityInterfaces) {
        if (interfaces[name]) {
          for (const iface of interfaces[name]) {
            if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
              return iface.mac;
            }
          }
        }
      }

      // Se não encontrar, pegar a primeira interface não-loopback
      for (const [name, ifaces] of Object.entries(interfaces)) {
        // Pular loopback e interfaces virtuais
        if (
          name === 'lo' ||
          name.startsWith('docker') ||
          name.startsWith('veth')
        )
          continue;

        for (const iface of ifaces) {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
            return iface.mac;
          }
        }
      }
    } catch (error) {
      if (this.debug) console.error('Error getting MAC address:', error);
      return null;
    }

    return null;
  }

  /**
   * Obtém o machine-id do sistema (Linux)
   */
  async getSystemMachineId() {
    const possiblePaths = [
      '/etc/machine-id', // systemd
      '/var/lib/dbus/machine-id', // D-Bus
      '/sys/class/dmi/id/product_uuid', // Hardware UUID (requer sudo)
    ];

    for (const filepath of possiblePaths) {
      try {
        if (existsSync(filepath)) {
          const content = await fs.readFile(filepath, 'utf8');
          const id = content.trim();
          if (id) return id;
        }
      } catch (error) {
        // Continuar para próximo path
        if (this.debug)
          console.log(`Could not read ${filepath}:`, error.message);
      }
    }

    // macOS: tentar IOPlatformUUID
    if (os.platform() === 'darwin') {
      try {
        const { stdout } = await execAsync(
          'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
        );
        const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      } catch (error) {
        if (this.debug) console.log('Could not get macOS UUID:', error.message);
      }
    }

    return null;
  }

  /**
   * Salva o ID da máquina em cache
   */
  async saveMachineId(id) {
    try {
      // Garantir que o diretório existe
      await this.ensureDirectory();

      // Salvar o ID
      await fs.writeFile(this.cacheFile, id, 'utf8');

      // Definir permissões restritivas (apenas leitura pelo usuário)
      await fs.chmod(this.cacheFile, 0o600);

      if (this.debug) console.log('Machine ID saved to cache');
    } catch (error) {
      console.error('Error saving machine ID:', error);
      // Não falhar se não conseguir salvar cache
    }
  }

  /**
   * Garante que o diretório de cache existe
   */
  async ensureDirectory() {
    if (!existsSync(this.cacheDir)) {
      await fs.mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Registra a máquina no banco de dados Turso
   */
  async registerMachine(tursoClient) {
    const machineId = await this.getMachineId();

    // Coletar informações do sistema
    const osInfo = {
      platform: os.platform(),
      release: os.release(),
      version: os.version ? os.version() : 'N/A',
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMem: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
      hostname: os.hostname(),
      uptime: Math.round(os.uptime() / 3600) + ' hours',
    };

    // Obter IP da máquina
    const ipAddress = this.getLocalIpAddress();

    try {
      await tursoClient.execute({
        sql: `INSERT INTO machines (machine_id, hostname, ip_address, os_info, first_seen, last_seen)
                      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
                      ON CONFLICT(machine_id) DO UPDATE SET
                        last_seen = unixepoch(),
                        hostname = excluded.hostname,
                        ip_address = excluded.ip_address,
                        os_info = excluded.os_info`,
        args: [machineId, os.hostname(), ipAddress, JSON.stringify(osInfo)],
      });

      if (this.debug) console.log('Machine registered successfully');
    } catch (error) {
      console.error('Error registering machine:', error);
      throw error;
    }

    return machineId;
  }

  /**
   * Obtém o IP local da máquina
   */
  getLocalIpAddress() {
    const interfaces = os.networkInterfaces();

    for (const [name, ifaces] of Object.entries(interfaces)) {
      // Pular loopback
      if (name === 'lo' || name.startsWith('docker')) continue;

      for (const iface of ifaces) {
        // IPv4 e não interno
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }

    return '127.0.0.1';
  }

  /**
   * Obtém informações detalhadas da máquina
   */
  async getMachineInfo() {
    const machineId = await this.getMachineId();

    return {
      machineId,
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      networkInterfaces: os.networkInterfaces(),
      userInfo: os.userInfo(),
      ipAddress: this.getLocalIpAddress(),
    };
  }

  /**
   * Invalida o cache do ID da máquina
   */
  async invalidateCache() {
    try {
      if (existsSync(this.cacheFile)) {
        await fs.unlink(this.cacheFile);
        if (this.debug) console.log('Machine ID cache invalidated');
      }
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  /**
   * Verifica se o ID da máquina está em cache
   */
  async hasCachedId() {
    return existsSync(this.cacheFile);
  }
}

// Export para uso direto via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const manager = new MachineIdentityManager({ debug: true });

    const command = process.argv[2];

    switch (command) {
      case 'generate':
        const id = await manager.getMachineId();
        console.log('\nMachine ID:', id);
        break;

      case 'info':
        const info = await manager.getMachineInfo();
        console.log('\nMachine Information:');
        console.log(JSON.stringify(info, null, 2));
        break;

      case 'invalidate':
        await manager.invalidateCache();
        console.log('Cache invalidated. New ID will be generated on next use.');
        break;

      default:
        console.log(
          'Usage: node machine-identity.js [generate|info|invalidate]',
        );
        console.log('  generate   - Generate and display machine ID');
        console.log('  info       - Show detailed machine information');
        console.log('  invalidate - Clear cached machine ID');
    }
  })();
}
