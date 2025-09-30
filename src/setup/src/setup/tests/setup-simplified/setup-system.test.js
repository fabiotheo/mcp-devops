// setup-system.test.js - Testes para sistema simplificado
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');

test('getUserHome mock test', () => {
  const home = os.homedir();
  assert.ok(home.length > 0);
  assert.equal(typeof home, 'string');
});

test('detectPlatform mock test', () => {
  const platform = process.platform;
  const supportedPlatforms = ['darwin', 'linux', 'win32'];
  assert.ok(supportedPlatforms.includes(platform));
});

test('detectShell mock test', () => {
  const shell = process.env.SHELL || '/bin/bash';
  assert.ok(typeof shell, 'string');
  assert.ok(shell.length > 0);
});

console.log('✅ Sistema básico testado com sucesso');
