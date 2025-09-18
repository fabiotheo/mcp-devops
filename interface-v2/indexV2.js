#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import AppV2 from './components/AppV2.jsx';

// Clear console and show app
console.clear();

const { waitUntilExit } = render(<AppV2 />);

waitUntilExit().then(() => {
    console.log('\nGoodbye! 👋');
    process.exit(0);
});