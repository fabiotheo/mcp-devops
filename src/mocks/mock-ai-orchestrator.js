#!/usr/bin/env node

/**
 * Mock AI Orchestrator for testing the new interface
 * Simulates responses from the real ai_orchestrator.js
 */

import { EventEmitter } from 'events';

export class MockAIOrchestrator extends EventEmitter {
    constructor(options = {}) {
        super();
        this.delay = options.delay || 100;
        this.simulateErrors = options.simulateErrors || false;
        this.simulateStreaming = options.simulateStreaming || true;
        this.responses = this.loadMockResponses();
    }

    loadMockResponses() {
        return {
            // Pattern-based responses
            patterns: [
                {
                    pattern: /fail2ban|blocked|ips?/i,
                    response: {
                        commands: [
                            { command: 'sudo fail2ban-client status', output: 'Status\n|- Number of jail:\t3\n`- Jail list:\tsshd, apache-auth, nginx-http-auth' },
                            { command: 'sudo fail2ban-client status sshd', output: 'Currently banned: 3\nBanned IP list: 192.168.1.100 10.0.0.50 172.16.0.25' },
                            { command: 'sudo fail2ban-client status apache-auth', output: 'Currently banned: 2\nBanned IP list: 203.0.113.45 198.51.100.78' },
                            { command: 'sudo fail2ban-client status nginx-http-auth', output: 'Currently banned: 1\nBanned IP list: 172.217.0.14' }
                        ],
                        finalAnswer: 'There are 6 IPs currently blocked across all fail2ban jails:\n- sshd: 3 IPs\n- apache-auth: 2 IPs\n- nginx-http-auth: 1 IP'
                    }
                },
                {
                    pattern: /docker|container/i,
                    response: {
                        commands: [
                            { command: 'docker ps', output: 'CONTAINER ID   IMAGE          STATUS\nabc123         nginx:latest   Up 2 hours\ndef456         redis:alpine   Up 5 days' },
                            { command: 'docker ps -a --format "table {{.Names}}\t{{.Status}}"', output: 'NAMES           STATUS\nweb-server      Up 2 hours\ncache-server    Up 5 days\ndb-backup       Exited (0) 3 days ago' }
                        ],
                        finalAnswer: 'You have 2 running containers (web-server, cache-server) and 1 stopped container (db-backup).'
                    }
                },
                {
                    pattern: /disk|space|storage/i,
                    response: {
                        commands: [
                            { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       100G   45G   50G  48% /\n/dev/sda2       500G  350G  125G  74% /home' }
                        ],
                        finalAnswer: 'Disk usage summary:\n- Root partition (/): 45GB used of 100GB (48%)\n- Home partition (/home): 350GB used of 500GB (74%)'
                    }
                },
                {
                    pattern: /help|commands?/i,
                    response: {
                        commands: [],
                        finalAnswer: 'Available commands:\n/help - Show this help\n/status - Show system status\n/clear - Clear screen\n/exit - Exit the assistant'
                    }
                }
            ],
            // Default responses
            defaults: [
                'I understand your request. Let me help you with that.',
                'Processing your command...',
                'Here\'s what I found:',
                'Task completed successfully.'
            ]
        };
    }

    async processCommand(command, context = {}) {
        return new Promise((resolve) => {
            // Simulate processing delay
            setTimeout(async () => {
                // Check if we should simulate an error
                if (this.simulateErrors && Math.random() > 0.8) {
                    this.emit('error', new Error('Simulated AI processing error'));
                    resolve({ error: 'Simulated error for testing' });
                    return;
                }

                // Find matching pattern
                const match = this.responses.patterns.find(p => p.pattern.test(command));

                if (match) {
                    // Simulate streaming response
                    if (this.simulateStreaming) {
                        await this.streamResponse(match.response);
                    }
                    resolve({
                        success: true,
                        response: match.response.finalAnswer,
                        commands: match.response.commands
                    });
                } else {
                    // Return a default response
                    const defaultResponse = this.responses.defaults[
                        Math.floor(Math.random() * this.responses.defaults.length)
                    ];

                    if (this.simulateStreaming) {
                        await this.streamText(defaultResponse);
                    }

                    resolve({
                        success: true,
                        response: defaultResponse,
                        commands: []
                    });
                }
            }, this.delay);
        });
    }

    async streamResponse(response) {
        // Simulate command execution
        for (const cmd of response.commands) {
            this.emit('command', { command: cmd.command });
            await this.delay(200);
            this.emit('output', { output: cmd.output });
            await this.delay(100);
        }

        // Stream final answer
        await this.streamText(response.finalAnswer);
    }

    async streamText(text) {
        const words = text.split(' ');
        for (const word of words) {
            this.emit('token', word + ' ');
            await this.delayMs(50);
        }
        this.emit('complete', text);
    }

    delayMs(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Simulate pattern matching
    async detectPattern(input) {
        await this.delayMs(100);

        const patterns = [
            { type: 'fail2ban', confidence: 0.9, matched: /fail2ban|blocked/i.test(input) },
            { type: 'docker', confidence: 0.85, matched: /docker|container/i.test(input) },
            { type: 'disk', confidence: 0.8, matched: /disk|space/i.test(input) }
        ];

        const matched = patterns.filter(p => p.matched);
        if (matched.length > 0) {
            this.emit('pattern-detected', matched[0]);
            return matched[0];
        }

        return null;
    }

    // Simulate web search
    async searchWeb(query) {
        await this.delayMs(500);

        return {
            results: [
                {
                    title: 'Mock Search Result 1',
                    snippet: `Information about ${query}...`,
                    url: 'https://example.com/1'
                },
                {
                    title: 'Mock Search Result 2',
                    snippet: `How to ${query} in Linux...`,
                    url: 'https://example.com/2'
                }
            ]
        };
    }

    // Get system status
    getStatus() {
        return {
            connected: true,
            model: 'mock-ai-model',
            provider: 'mock',
            features: {
                patterns: true,
                streaming: this.simulateStreaming,
                webSearch: true,
                commands: true
            },
            stats: {
                requestsProcessed: Math.floor(Math.random() * 100),
                averageResponseTime: `${Math.floor(Math.random() * 500)}ms`,
                uptime: '2h 15m'
            }
        };
    }

    // Simulate initialization
    async initialize() {
        await this.delayMs(200);
        this.emit('ready', { message: 'Mock AI Orchestrator ready' });
        return true;
    }

    // Cleanup
    destroy() {
        this.removeAllListeners();
    }
}

// If run directly, create a test instance
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Starting Mock AI Orchestrator in test mode...\n');

    const orchestrator = new MockAIOrchestrator({
        delay: 100,
        simulateErrors: false,
        simulateStreaming: true
    });

    // Set up event listeners
    orchestrator.on('command', ({ command }) => {
        console.log(`[CMD] ${command}`);
    });

    orchestrator.on('output', ({ output }) => {
        console.log(`[OUT] ${output}`);
    });

    orchestrator.on('token', (token) => {
        process.stdout.write(token);
    });

    orchestrator.on('complete', () => {
        console.log('\n[COMPLETE]');
    });

    orchestrator.on('pattern-detected', (pattern) => {
        console.log(`[PATTERN] Detected: ${pattern.type} (confidence: ${pattern.confidence})`);
    });

    orchestrator.on('error', (error) => {
        console.error(`[ERROR] ${error.message}`);
    });

    // Initialize and run test commands
    (async () => {
        await orchestrator.initialize();
        console.log('Status:', orchestrator.getStatus());
        console.log('\nTesting commands:\n');

        const testCommands = [
            'How many IPs are blocked in fail2ban?',
            'Show docker containers',
            'Check disk space',
            'help'
        ];

        for (const cmd of testCommands) {
            console.log(`\n> ${cmd}`);
            await orchestrator.detectPattern(cmd);
            const result = await orchestrator.processCommand(cmd);
            console.log('\nResult:', result.success ? '✓' : '✗');
        }

        console.log('\n\nMock testing complete!');
        orchestrator.destroy();
    })();
}

export default MockAIOrchestrator;