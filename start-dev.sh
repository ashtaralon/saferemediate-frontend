#!/bin/bash
export PATH="/usr/local/bin:$PATH"
exec /usr/local/bin/node node_modules/.bin/next dev --port 3001
