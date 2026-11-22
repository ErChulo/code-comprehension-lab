#!/usr/bin/env bash
# Render diagrams/*.mmd to diagrams/png/*.png (needs Mermaid CLI: npm i -g @mermaid-js/mermaid-cli)
set -euo pipefail
cd "$(dirname "$0")/../diagrams"; mkdir -p png
for f in *.mmd; do mmdc -i "$f" -o "png/${f%.mmd}.png" -s 3 -b white -q; done
echo done
