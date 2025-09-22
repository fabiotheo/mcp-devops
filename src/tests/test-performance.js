#!/usr/bin/env node

/**
 * Performance benchmark test for the new Ink interface
 * Measures responsiveness, memory usage, and rendering performance
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceBenchmark {
    constructor() {
        this.results = {
            startup: [],
            inputLatency: [],
            memoryUsage: [],
            renderingTime: [],
            pasteHandling: []
        };
        this.processes = [];
    }

    async runBenchmark() {
        console.log('🚀 Performance Benchmark for New Interface\n');
        console.log('═══════════════════════════════════════════\n');

        // Test 1: Startup time
        await this.testStartupTime();

        // Test 2: Input responsiveness
        await this.testInputLatency();

        // Test 3: Memory usage
        await this.testMemoryUsage();

        // Test 4: Large paste handling
        await this.testLargePaste();

        // Test 5: Command history performance
        await this.testHistoryPerformance();

        // Generate report
        this.generateReport();
    }

    async testStartupTime() {
        console.log('📊 Test 1: Startup Time\n');

        const iterations = 5;
        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();

            const proc = spawn('node', [
                path.join(__dirname, '..', 'indexV3.js')
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.processes.push(proc);

            await new Promise((resolve) => {
                proc.stdout.once('data', () => {
                    const endTime = performance.now();
                    this.results.startup.push(endTime - startTime);
                    proc.kill();
                    resolve();
                });
            });

            process.stdout.write(`  Run ${i + 1}/${iterations}: ${this.results.startup[i].toFixed(2)}ms\r`);
        }

        console.log('\n');
    }

    async testInputLatency() {
        console.log('📊 Test 2: Input Responsiveness\n');

        const proc = spawn('node', [
            path.join(__dirname, '..', 'indexV3.js')
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.processes.push(proc);

        // Wait for initialization
        await this.waitForReady(proc);

        const testInputs = [
            'a', 'quick', 'test', 'of', 'input', 'latency',
            'with', 'multiple', 'words', 'typed', 'quickly'
        ];

        for (const input of testInputs) {
            const startTime = performance.now();

            proc.stdin.write(input);

            await new Promise((resolve) => {
                proc.stdout.once('data', () => {
                    const endTime = performance.now();
                    this.results.inputLatency.push(endTime - startTime);
                    resolve();
                });
            });

            await this.delay(100);
        }

        const avgLatency = this.results.inputLatency.reduce((a, b) => a + b, 0) / this.results.inputLatency.length;
        console.log(`  Average latency: ${avgLatency.toFixed(2)}ms\n`);

        proc.kill();
    }

    async testMemoryUsage() {
        console.log('📊 Test 3: Memory Usage\n');

        const proc = spawn('node', [
            path.join(__dirname, '..', 'indexV3.js')
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.processes.push(proc);
        const pid = proc.pid;

        // Wait for initialization
        await this.waitForReady(proc);

        // Measure initial memory
        const initialMemory = await this.getMemoryUsage(pid);
        console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

        // Simulate usage
        const commands = Array(100).fill('test command');
        for (const cmd of commands) {
            proc.stdin.write(cmd + '\n');
            await this.delay(10);
        }

        // Measure after heavy usage
        const afterUsageMemory = await this.getMemoryUsage(pid);
        console.log(`  After 100 commands: ${(afterUsageMemory / 1024 / 1024).toFixed(2)} MB`);

        // Test memory after garbage collection pause
        await this.delay(2000);
        const finalMemory = await this.getMemoryUsage(pid);
        console.log(`  Final (after GC): ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);

        this.results.memoryUsage = {
            initial: initialMemory,
            afterUsage: afterUsageMemory,
            final: finalMemory,
            increase: ((afterUsageMemory - initialMemory) / initialMemory * 100).toFixed(2) + '%'
        };

        proc.kill();
        console.log();
    }

    async testLargePaste() {
        console.log('📊 Test 4: Large Paste Handling\n');

        const proc = spawn('node', [
            path.join(__dirname, '..', 'indexV3.js')
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.processes.push(proc);

        // Wait for initialization
        await this.waitForReady(proc);

        // Generate large paste content
        const largePasteTests = [
            { lines: 10, description: '10 lines' },
            { lines: 50, description: '50 lines' },
            { lines: 100, description: '100 lines' },
            { lines: 500, description: '500 lines' }
        ];

        for (const test of largePasteTests) {
            const content = Array(test.lines).fill('This is a test line').join('\n');
            const pasteSequence = `\x1b[200~${content}\x1b[201~`;

            const startTime = performance.now();
            proc.stdin.write(pasteSequence);

            await new Promise((resolve) => {
                let dataReceived = false;
                const handler = () => {
                    if (!dataReceived) {
                        dataReceived = true;
                        const endTime = performance.now();
                        this.results.pasteHandling.push({
                            lines: test.lines,
                            time: endTime - startTime
                        });
                        proc.stdout.removeListener('data', handler);
                        resolve();
                    }
                };
                proc.stdout.on('data', handler);
            });

            console.log(`  ${test.description}: ${this.results.pasteHandling[this.results.pasteHandling.length - 1].time.toFixed(2)}ms`);
            await this.delay(500);
        }

        proc.kill();
        console.log();
    }

    async testHistoryPerformance() {
        console.log('📊 Test 5: Command History Performance\n');

        const proc = spawn('node', [
            path.join(__dirname, '..', 'indexV3.js')
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.processes.push(proc);

        // Wait for initialization
        await this.waitForReady(proc);

        // Add many commands to history
        console.log('  Building history with 100 commands...');
        for (let i = 0; i < 100; i++) {
            proc.stdin.write(`command ${i}\n`);
            await this.delay(10);
        }

        // Test history navigation speed
        console.log('  Testing history navigation...');
        const navigationTests = [];

        for (let i = 0; i < 20; i++) {
            const startTime = performance.now();
            proc.stdin.write('\x1b[A'); // Up arrow

            await new Promise((resolve) => {
                proc.stdout.once('data', () => {
                    const endTime = performance.now();
                    navigationTests.push(endTime - startTime);
                    resolve();
                });
            });
        }

        const avgNavTime = navigationTests.reduce((a, b) => a + b, 0) / navigationTests.length;
        console.log(`  Average navigation time: ${avgNavTime.toFixed(2)}ms`);

        proc.kill();
        console.log();
    }

    async waitForReady(proc) {
        return new Promise((resolve) => {
            proc.stdout.once('data', () => {
                setTimeout(resolve, 500);
            });
        });
    }

    async getMemoryUsage(pid) {
        return new Promise((resolve) => {
            const memProc = spawn('ps', ['-o', 'rss=', '-p', pid]);
            let output = '';

            memProc.stdout.on('data', (data) => {
                output += data.toString();
            });

            memProc.on('close', () => {
                const memory = parseInt(output.trim()) * 1024; // Convert KB to bytes
                resolve(memory || 0);
            });

            memProc.on('error', () => {
                resolve(0);
            });
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateReport() {
        console.log('╔═══════════════════════════════════════════╗');
        console.log('║       PERFORMANCE BENCHMARK REPORT         ║');
        console.log('╚═══════════════════════════════════════════╝\n');

        // Startup time
        const avgStartup = this.results.startup.reduce((a, b) => a + b, 0) / this.results.startup.length;
        const minStartup = Math.min(...this.results.startup);
        const maxStartup = Math.max(...this.results.startup);

        console.log('🚀 Startup Performance:');
        console.log(`   Average: ${avgStartup.toFixed(2)}ms`);
        console.log(`   Min: ${minStartup.toFixed(2)}ms`);
        console.log(`   Max: ${maxStartup.toFixed(2)}ms`);
        console.log(`   ${this.getPerformanceRating(avgStartup, 500, 1000)}\n`);

        // Input latency
        const avgInput = this.results.inputLatency.reduce((a, b) => a + b, 0) / this.results.inputLatency.length;
        console.log('⌨️  Input Latency:');
        console.log(`   Average: ${avgInput.toFixed(2)}ms`);
        console.log(`   ${this.getPerformanceRating(avgInput, 50, 100)}\n`);

        // Memory usage
        console.log('💾 Memory Usage:');
        console.log(`   Initial: ${(this.results.memoryUsage.initial / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Peak: ${(this.results.memoryUsage.afterUsage / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Increase: ${this.results.memoryUsage.increase}`);
        console.log(`   ${this.getMemoryRating(this.results.memoryUsage.increase)}\n`);

        // Paste handling
        console.log('📋 Paste Handling:');
        this.results.pasteHandling.forEach(result => {
            const rating = this.getPerformanceRating(result.time, result.lines * 2, result.lines * 5);
            console.log(`   ${result.lines} lines: ${result.time.toFixed(2)}ms ${rating}`);
        });

        console.log('\n═══════════════════════════════════════════');

        // Overall assessment
        const overallScore = this.calculateOverallScore();
        console.log(`\n🏆 Overall Performance Score: ${overallScore}/100`);

        if (overallScore >= 90) {
            console.log('   ✅ EXCELLENT - Ready for production!');
        } else if (overallScore >= 70) {
            console.log('   ✅ GOOD - Acceptable for production');
        } else if (overallScore >= 50) {
            console.log('   ⚠️  FAIR - May need optimization');
        } else {
            console.log('   ❌ POOR - Requires optimization');
        }

        console.log('\n📝 Recommendations:');
        this.generateRecommendations();
    }

    getPerformanceRating(value, goodThreshold, badThreshold) {
        if (value <= goodThreshold) return '✅ Excellent';
        if (value <= badThreshold) return '⚠️  Good';
        return '❌ Needs improvement';
    }

    getMemoryRating(increase) {
        const value = parseFloat(increase);
        if (value < 10) return '✅ Excellent';
        if (value < 25) return '⚠️  Acceptable';
        return '❌ High memory growth';
    }

    calculateOverallScore() {
        let score = 100;

        // Deduct points based on performance
        const avgStartup = this.results.startup.reduce((a, b) => a + b, 0) / this.results.startup.length;
        if (avgStartup > 1000) score -= 20;
        else if (avgStartup > 500) score -= 10;

        const avgInput = this.results.inputLatency.reduce((a, b) => a + b, 0) / this.results.inputLatency.length;
        if (avgInput > 100) score -= 15;
        else if (avgInput > 50) score -= 5;

        const memIncrease = parseFloat(this.results.memoryUsage.increase);
        if (memIncrease > 25) score -= 15;
        else if (memIncrease > 10) score -= 5;

        // Check paste performance
        const largePaste = this.results.pasteHandling.find(p => p.lines === 500);
        if (largePaste && largePaste.time > 2500) score -= 10;

        return Math.max(0, score);
    }

    generateRecommendations() {
        const recommendations = [];

        const avgStartup = this.results.startup.reduce((a, b) => a + b, 0) / this.results.startup.length;
        if (avgStartup > 500) {
            recommendations.push('• Consider lazy loading non-critical components');
        }

        const avgInput = this.results.inputLatency.reduce((a, b) => a + b, 0) / this.results.inputLatency.length;
        if (avgInput > 50) {
            recommendations.push('• Optimize input handling with debouncing');
        }

        const memIncrease = parseFloat(this.results.memoryUsage.increase);
        if (memIncrease > 10) {
            recommendations.push('• Implement better memory management for history');
        }

        if (recommendations.length === 0) {
            recommendations.push('• Performance is optimal!');
        }

        recommendations.forEach(rec => console.log(rec));
    }

    cleanup() {
        // Kill any remaining processes
        this.processes.forEach(proc => {
            if (!proc.killed) {
                proc.kill();
            }
        });
    }
}

// Run benchmark
const benchmark = new PerformanceBenchmark();

benchmark.runBenchmark().catch(console.error).finally(() => {
    benchmark.cleanup();
    process.exit(0);
});

// Handle interruptions
process.on('SIGINT', () => {
    console.log('\n\nBenchmark interrupted!');
    benchmark.cleanup();
    process.exit(1);
});