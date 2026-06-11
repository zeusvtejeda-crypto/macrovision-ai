#!/bin/sh
set -e

echo "🚀 MacroVision AI — iniciando..."
echo "📦 Entorno: $NODE_ENV"

echo "✅ Iniciando servidor..."
exec node dist/main
