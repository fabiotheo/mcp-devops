#!/usr/bin/env node

import crypto from 'crypto';

// Test different hash methods
const user = 'fabio';

// Method 1: SHA256 hex
const sha256 = crypto.createHash('sha256').update(user).digest('hex');
console.log('SHA256 hex:', sha256.toUpperCase());

// Method 2: MD5 hex
const md5 = crypto.createHash('md5').update(user).digest('hex');
console.log('MD5 hex:', md5.toUpperCase());

// From your data
console.log('\nUser IDs in database:');
console.log('005A3BA138E6217F17238A46C1F612E0');
console.log('02B2665483A93ACF17C5AD2C9DFA9797');