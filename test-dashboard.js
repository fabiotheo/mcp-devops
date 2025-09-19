#!/usr/bin/env node

/**
 * Test script for Phase 3 Dashboard
 * Tests all API endpoints and WebSocket functionality
 */

import chalk from 'chalk';
import { io } from 'socket.io-client';

class DashboardTester {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.socket = null;
        this.testResults = [];
    }

    async runAllTests() {
        console.log(chalk.cyan.bold('\n🧪 Phase 3 Dashboard Tests\n'));
        console.log('═'.repeat(50));

        try {
            // Test REST API endpoints
            await this.testHealthEndpoint();
            await this.testStatsEndpoint();
            await this.testHistoryEndpoint();
            await this.testTopCommandsEndpoint();
            await this.testSearchEndpoint();

            // Test WebSocket functionality
            await this.testWebSocket();

            // Test static files
            await this.testStaticFiles();

            // Show results
            this.showResults();

        } catch (error) {
            console.error(chalk.red('\n❌ Test suite failed:'), error);
        }
    }

    async testHealthEndpoint() {
        console.log(chalk.blue('\n1️⃣ Testing Health Check API...'));

        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            const data = await response.json();

            if (response.ok && data.status === 'healthy') {
                this.logSuccess('Health check', data);
                this.testResults.push({ test: 'Health API', status: 'PASS' });
            } else {
                this.logError('Health check failed', response.status);
                this.testResults.push({ test: 'Health API', status: 'FAIL' });
            }
        } catch (error) {
            this.logError('Health check', error.message);
            this.testResults.push({ test: 'Health API', status: 'ERROR' });
        }
    }

    async testStatsEndpoint() {
        console.log(chalk.blue('\n2️⃣ Testing Stats API...'));

        try {
            const response = await fetch(`${this.baseUrl}/api/stats/overview`);
            const data = await response.json();

            if (response.ok && typeof data.totalCommands === 'number') {
                this.logSuccess('Stats API', {
                    totalCommands: data.totalCommands,
                    syncedCommands: data.syncedCommands,
                    pendingCommands: data.pendingCommands,
                    activeMachines: data.activeMachines
                });
                this.testResults.push({ test: 'Stats API', status: 'PASS' });
            } else {
                this.logError('Stats API failed', response.status);
                this.testResults.push({ test: 'Stats API', status: 'FAIL' });
            }
        } catch (error) {
            this.logError('Stats API', error.message);
            this.testResults.push({ test: 'Stats API', status: 'ERROR' });
        }
    }

    async testHistoryEndpoint() {
        console.log(chalk.blue('\n3️⃣ Testing History API...'));

        try {
            const response = await fetch(`${this.baseUrl}/api/history?limit=5`);
            const data = await response.json();

            if (response.ok && Array.isArray(data)) {
                this.logSuccess('History API', `${data.length} commands returned`);
                this.testResults.push({ test: 'History API', status: 'PASS' });
            } else {
                this.logError('History API failed', response.status);
                this.testResults.push({ test: 'History API', status: 'FAIL' });
            }
        } catch (error) {
            this.logError('History API', error.message);
            this.testResults.push({ test: 'History API', status: 'ERROR' });
        }
    }

    async testTopCommandsEndpoint() {
        console.log(chalk.blue('\n4️⃣ Testing Top Commands API...'));

        try {
            const response = await fetch(`${this.baseUrl}/api/top-commands?days=7`);
            const data = await response.json();

            if (response.ok && Array.isArray(data)) {
                this.logSuccess('Top Commands API', `${data.length} top commands returned`);
                this.testResults.push({ test: 'Top Commands API', status: 'PASS' });
            } else {
                this.logError('Top Commands API failed', response.status);
                this.testResults.push({ test: 'Top Commands API', status: 'FAIL' });
            }
        } catch (error) {
            this.logError('Top Commands API', error.message);
            this.testResults.push({ test: 'Top Commands API', status: 'ERROR' });
        }
    }

    async testSearchEndpoint() {
        console.log(chalk.blue('\n5️⃣ Testing Search API...'));

        try {
            const response = await fetch(`${this.baseUrl}/api/history/search?q=test`);
            const data = await response.json();

            if (response.ok && Array.isArray(data)) {
                this.logSuccess('Search API', `${data.length} results for 'test'`);
                this.testResults.push({ test: 'Search API', status: 'PASS' });
            } else {
                this.logError('Search API failed', response.status);
                this.testResults.push({ test: 'Search API', status: 'FAIL' });
            }
        } catch (error) {
            this.logError('Search API', error.message);
            this.testResults.push({ test: 'Search API', status: 'ERROR' });
        }
    }

    async testWebSocket() {
        console.log(chalk.blue('\n6️⃣ Testing WebSocket Connection...'));

        return new Promise((resolve) => {
            try {
                this.socket = io(this.baseUrl);

                const timeout = setTimeout(() => {
                    this.logError('WebSocket', 'Connection timeout');
                    this.testResults.push({ test: 'WebSocket', status: 'TIMEOUT' });
                    resolve();
                }, 5000);

                this.socket.on('connect', () => {
                    clearTimeout(timeout);
                    this.logSuccess('WebSocket', 'Connected successfully');
                    this.testResults.push({ test: 'WebSocket', status: 'PASS' });

                    // Test stats request
                    this.socket.emit('request-stats');
                });

                this.socket.on('stats-update', (data) => {
                    this.logSuccess('WebSocket Stats', 'Received real-time stats');
                    this.socket.disconnect();
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    clearTimeout(timeout);
                    this.logError('WebSocket', error.message);
                    this.testResults.push({ test: 'WebSocket', status: 'ERROR' });
                    resolve();
                });

            } catch (error) {
                this.logError('WebSocket', error.message);
                this.testResults.push({ test: 'WebSocket', status: 'ERROR' });
                resolve();
            }
        });
    }

    async testStaticFiles() {
        console.log(chalk.blue('\n7️⃣ Testing Static Files...'));

        const files = ['/', '/style.css', '/app.js'];
        let passCount = 0;

        for (const file of files) {
            try {
                const response = await fetch(`${this.baseUrl}${file}`);
                if (response.ok) {
                    passCount++;
                    this.logSuccess(`Static file ${file}`, 'Loaded successfully');
                } else {
                    this.logError(`Static file ${file}`, response.status);
                }
            } catch (error) {
                this.logError(`Static file ${file}`, error.message);
            }
        }

        const status = passCount === files.length ? 'PASS' : 'PARTIAL';
        this.testResults.push({ test: 'Static Files', status });
    }

    showResults() {
        console.log(chalk.cyan.bold('\n📊 Test Results Summary'));
        console.log('═'.repeat(50));

        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const total = this.testResults.length;

        this.testResults.forEach(result => {
            const statusColor = result.status === 'PASS' ? 'green' :
                               result.status === 'FAIL' ? 'red' :
                               result.status === 'ERROR' ? 'red' :
                               'yellow';

            console.log(
                chalk.gray(`  ${result.test.padEnd(20)}`),
                chalk[statusColor](`[${result.status}]`)
            );
        });

        console.log('\n' + '─'.repeat(50));

        if (passed === total) {
            console.log(chalk.green.bold(`\n✅ ALL TESTS PASSED! (${passed}/${total})`));
            console.log(chalk.green('\n🎉 Dashboard is ready for use!'));
            console.log(chalk.cyan('\n🌐 Open http://localhost:3000 in your browser'));
        } else {
            console.log(chalk.yellow.bold(`\n⚠️  ${passed}/${total} tests passed`));
            if (passed > 0) {
                console.log(chalk.yellow('\n🎯 Dashboard partially functional'));
            }
        }

        console.log(chalk.blue.bold('\n🚀 Phase 3 Dashboard Testing Complete!\n'));
    }

    logSuccess(test, details) {
        console.log(chalk.green(`   ✅ ${test}:`), chalk.gray(JSON.stringify(details).substring(0, 80)));
    }

    logError(test, error) {
        console.log(chalk.red(`   ❌ ${test}:`), chalk.gray(error));
    }
}

// Run tests
const tester = new DashboardTester();
tester.runAllTests().catch(console.error);