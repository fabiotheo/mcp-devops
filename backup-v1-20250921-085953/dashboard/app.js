/**
 * MCP Terminal Assistant Dashboard - Frontend JavaScript
 * Phase 3: Real-time Dashboard Application
 */

class Dashboard {
    constructor() {
        this.socket = null;
        this.activityChart = null;
        this.isConnected = false;
        this.lastStatsUpdate = null;

        // DOM elements
        this.elements = {
            connectionStatus: document.getElementById('connection-status'),
            syncStatus: document.getElementById('sync-status'),
            totalCommands: document.getElementById('total-commands'),
            syncedCommands: document.getElementById('synced-commands'),
            pendingCommands: document.getElementById('pending-commands'),
            activeMachines: document.getElementById('active-machines'),
            topCommandsList: document.getElementById('top-commands-list'),
            recentCommands: document.getElementById('recent-commands'),
            searchInput: document.getElementById('search-input'),
            searchBtn: document.getElementById('search-btn'),
            forceSyncBtn: document.getElementById('force-sync-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            exportBtn: document.getElementById('export-btn'),
            cacheStatus: document.getElementById('cache-status'),
            tursoStatus: document.getElementById('turso-status'),
            lastSync: document.getElementById('last-sync'),
            connectedClients: document.getElementById('connected-clients'),
            notifications: document.getElementById('notifications')
        };

        this.init();
    }

    async init() {
        console.log('🚀 Initializing MCP Dashboard...');

        // Initialize Socket.IO connection
        this.initSocket();

        // Setup event listeners
        this.setupEventListeners();

        // Initialize charts
        this.initCharts();

        // Load initial data
        await this.loadInitialData();

        console.log('✅ Dashboard initialized');
    }

    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('🔌 Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.socket.emit('request-stats');
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus(false);
        });

        this.socket.on('stats-update', (stats) => {
            console.log('📊 Received stats update:', stats);
            this.updateStats(stats);
        });

        this.socket.on('history-update', (history) => {
            console.log('📜 Received history update');
            this.updateRecentCommands(history);
        });

        this.socket.on('search-results', (results) => {
            console.log('🔍 Received search results');
            this.displaySearchResults(results);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error);
            this.showNotification('Connection failed', 'error');
        });
    }

    setupEventListeners() {
        // Search functionality
        this.elements.searchBtn.addEventListener('click', () => this.performSearch());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Clear search when input is empty
        this.elements.searchInput.addEventListener('input', (e) => {
            if (e.target.value === '') {
                this.loadRecentCommands();
            }
        });

        // Action buttons
        this.elements.forceSyncBtn.addEventListener('click', () => this.forceSync());
        this.elements.refreshBtn.addEventListener('click', () => this.refresh());
        this.elements.exportBtn.addEventListener('click', () => this.exportData());

        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (this.isConnected) {
                this.socket.emit('request-stats');
            }
        }, 30000);
    }

    initCharts() {
        const ctx = document.getElementById('activity-chart').getContext('2d');

        this.activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Commands per Hour',
                    data: new Array(24).fill(0),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#334155'
                        },
                        ticks: {
                            color: '#cbd5e1',
                            maxRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#334155'
                        },
                        ticks: {
                            color: '#cbd5e1'
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 4,
                        hoverRadius: 6
                    }
                }
            }
        });
    }

    async loadInitialData() {
        try {
            // Load overview stats
            const statsResponse = await fetch('/api/stats/overview');
            const stats = await statsResponse.json();
            this.updateStats(stats);

            // Load top commands
            const topCommandsResponse = await fetch('/api/top-commands');
            const topCommands = await topCommandsResponse.json();
            this.updateTopCommands(topCommands);

            // Load recent commands
            await this.loadRecentCommands();

            // Load system health
            const healthResponse = await fetch('/api/health');
            const health = await healthResponse.json();
            this.updateSystemStatus(health);

        } catch (error) {
            console.error('❌ Failed to load initial data:', error);
            this.showNotification('Failed to load dashboard data', 'error');
        }
    }

    updateConnectionStatus(connected) {
        const status = this.elements.connectionStatus;
        if (connected) {
            status.textContent = '🟢 Online';
            status.className = 'status online';
        } else {
            status.textContent = '🔴 Offline';
            status.className = 'status offline';
        }
    }

    updateStats(stats) {
        this.lastStatsUpdate = Date.now();

        // Update stat cards
        this.elements.totalCommands.textContent = stats.totalCommands?.toLocaleString() || '0';
        this.elements.syncedCommands.textContent = stats.syncedCommands?.toLocaleString() || '0';
        this.elements.pendingCommands.textContent = stats.pendingCommands?.toLocaleString() || '0';
        this.elements.activeMachines.textContent = stats.activeMachines || '0';

        // Update sync status
        if (stats.pendingCommands > 0) {
            this.elements.syncStatus.textContent = `⏳ ${stats.pendingCommands} pending`;
            this.elements.syncStatus.className = 'status';
        } else {
            this.elements.syncStatus.textContent = '✅ All synced';
            this.elements.syncStatus.className = 'status';
        }

        // Update activity chart
        if (this.activityChart && stats.last24hActivity) {
            this.activityChart.data.datasets[0].data = stats.last24hActivity;
            this.activityChart.update('none'); // No animation for real-time updates
        }

        // Update last sync time
        if (stats.lastSync) {
            const syncTime = new Date(stats.lastSync).toLocaleTimeString();
            this.elements.lastSync.textContent = syncTime;
        }
    }

    async updateTopCommands(topCommands) {
        const container = this.elements.topCommandsList;

        if (!topCommands || topCommands.length === 0) {
            container.innerHTML = '<div class="loading">No commands found</div>';
            return;
        }

        const html = topCommands.map(cmd => `
            <div class="command-item">
                <div class="command-text">${this.escapeHtml(cmd.command)}</div>
                <div class="command-count">${cmd.count}</div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    async loadRecentCommands() {
        try {
            const response = await fetch('/api/history?limit=20');
            const history = await response.json();
            this.updateRecentCommands(history);
        } catch (error) {
            console.error('❌ Failed to load recent commands:', error);
        }
    }

    updateRecentCommands(commands) {
        const container = this.elements.recentCommands;

        if (!commands || commands.length === 0) {
            container.innerHTML = '<div class="loading">No commands found</div>';
            return;
        }

        const html = commands.map(cmd => {
            const time = new Date(cmd.timestamp).toLocaleTimeString();
            const statusClass = cmd.sync_status === 'synced' ? 'synced' : 'pending';
            const statusText = cmd.sync_status === 'synced' ? '✓' : '⏳';

            return `
                <div class="command-row">
                    <div class="command-text-full" title="${this.escapeHtml(cmd.command)}">
                        ${this.escapeHtml(cmd.command)}
                    </div>
                    <div class="command-time">${time}</div>
                    <div class="command-status ${statusClass}">${statusText}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    performSearch() {
        const query = this.elements.searchInput.value.trim();
        if (query && this.socket) {
            this.socket.emit('search', query);
        } else if (!query) {
            this.loadRecentCommands();
        }
    }

    displaySearchResults(results) {
        this.updateRecentCommands(results);

        if (results.length === 0) {
            this.elements.recentCommands.innerHTML =
                '<div class="loading">No results found for your search</div>';
        }
    }

    async forceSync() {
        try {
            this.elements.forceSyncBtn.disabled = true;
            this.elements.forceSyncBtn.textContent = '🔄 Syncing...';

            const response = await fetch('/api/sync/force', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                this.showNotification(
                    `Sync completed: ↑${result.uploaded} ↓${result.downloaded}`,
                    'success'
                );
            } else {
                this.showNotification(`Sync failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('❌ Force sync failed:', error);
            this.showNotification('Sync request failed', 'error');
        } finally {
            this.elements.forceSyncBtn.disabled = false;
            this.elements.forceSyncBtn.textContent = '🔄 Force Sync';
        }
    }

    async refresh() {
        this.showNotification('Refreshing dashboard...', 'success');

        if (this.socket) {
            this.socket.emit('request-stats');
        }

        await this.loadInitialData();
    }

    async exportData() {
        try {
            this.elements.exportBtn.disabled = true;
            this.elements.exportBtn.textContent = '📊 Exporting...';

            const response = await fetch('/api/history?limit=1000');
            const data = await response.json();

            const csv = this.convertToCSV(data);
            this.downloadCSV(csv, 'mcp-commands-export.csv');

            this.showNotification('Data exported successfully', 'success');
        } catch (error) {
            console.error('❌ Export failed:', error);
            this.showNotification('Export failed', 'error');
        } finally {
            this.elements.exportBtn.disabled = false;
            this.elements.exportBtn.textContent = '📊 Export Data';
        }
    }

    updateSystemStatus(health) {
        this.elements.cacheStatus.textContent = health.cache || 'unknown';
        this.elements.tursoStatus.textContent = health.turso || 'unknown';
        this.elements.connectedClients.textContent = health.connectedClients || '0';
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        this.elements.notifications.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';

        const headers = ['timestamp', 'command', 'response', 'machine_id', 'sync_status'];
        const csvContent = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => {
                    const value = row[header] || '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            )
        ].join('\n');

        return csvContent;
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting MCP Terminal Assistant Dashboard - Phase 3');
    new Dashboard();
});