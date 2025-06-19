#!/bin/bash

echo "🔍 Search MCP Server Verification"
echo "================================="

# Check if build exists
if [ ! -d "dist" ]; then
    echo "❌ Build directory not found. Run 'npm run build' first."
    exit 1
fi

# Check if data directory exists
if [ ! -d "data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p data
fi

echo "✅ Build directory exists"
echo "✅ Data directory exists"

# Test TypeScript compilation
echo "🔨 Testing TypeScript compilation..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# Test Jest tests
echo "🧪 Running tests..."
npm test > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ All tests passed"
else
    echo "❌ Some tests failed"
    exit 1
fi

# Test MCP server startup
echo "🚀 Testing MCP server startup..."
node dist/index.js > /tmp/mcp_test.log 2>&1 &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null; then
    echo "✅ MCP server started successfully"
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null
elif grep -q "Search MCP Server started successfully" /tmp/mcp_test.log; then
    echo "✅ MCP server started successfully (completed initialization)"
else
    echo "❌ MCP server failed to start"
    cat /tmp/mcp_test.log
    exit 1
fi
rm -f /tmp/mcp_test.log

echo ""
echo "🎉 All verifications passed!"
echo ""
echo "📋 Summary:"
echo "   • TypeScript compilation: ✅"
echo "   • Unit tests: ✅"
echo "   • MCP server startup: ✅"
echo ""
echo "🚀 Ready to use! Start the server with:"
echo "   npm start"
echo ""
echo "📖 See README.md for configuration and usage instructions."