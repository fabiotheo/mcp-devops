#!/bin/bash

# MCP Terminal Assistant - Dashboard Starter
# Phase 3: Web Dashboard

echo "🚀 Starting MCP Terminal Assistant Dashboard..."
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Check if dashboard server exists
if [ ! -f "libs/dashboard-server.js" ]; then
    echo "❌ Dashboard server not found. Run from project root directory."
    exit 1
fi

# Start dashboard server
echo "🌐 Starting dashboard server on http://localhost:3000..."
echo ""
echo "📊 Features available:"
echo "   • Real-time command statistics"
echo "   • 24-hour activity chart"
echo "   • Command search and history"
echo "   • Sync status monitoring"
echo "   • Data export functionality"
echo ""
echo "⌨️  Press Ctrl+C to stop the server"
echo ""

# Start the server
node libs/dashboard-server.js