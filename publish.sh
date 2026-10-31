#!/bin/sh
# Export the deciduous graph for the site. Run after changing the graph, then commit and push.
set -e
cd "$(dirname "$0")"
deciduous graph > docs/graph-data.json
echo "docs/graph-data.json: $(grep -c '"node_type"' docs/graph-data.json) nodes"
