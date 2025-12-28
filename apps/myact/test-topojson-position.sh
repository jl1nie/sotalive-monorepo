#!/bin/bash

# TopoJSON Popup Position Fix Test Runner
# This script runs the specific TopoJSON position displacement test

echo "🏞️ Starting TopoJSON Popup Position Fix Test"
echo "=================================================="

# Check if server is running
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ Development server not running at http://localhost:5173"
    echo "Please start the server with: npm run dev"
    exit 1
fi

echo "✅ Development server is running"

# Run the specific TopoJSON position test
echo "🧪 Running TopoJSON popup position displacement test..."
npx playwright test e2e/topojson-popup-position-fix.spec.ts --headed

# Check test results
if [ $? -eq 0 ]; then
    echo "✅ TopoJSON position fix test PASSED"
    echo "🎉 The TopoJSON popup position displacement issue has been resolved!"
else
    echo "❌ TopoJSON position fix test FAILED"
    echo "🔍 Check the test output for details on remaining issues"
    exit 1
fi

echo "=================================================="
echo "🏞️ TopoJSON Position Test Complete"