#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import App from './components/App.jsx';

// Clear console and show app
console.clear();

const { waitUntilExit } = render(React.createElement(App));

waitUntilExit().then(() => {
    console.log('\nGoodbye! 👋');
    process.exit(0);
});