#!/bin/sh
set -e

echo "🚀 MacroVision AI — iniciando..."
echo "📦 Entorno: $NODE_ENV"

# Ejecutar migraciones pendientes contra Supabase
echo "🗄️  Aplicando migraciones de base de datos..."
npx prisma migrate deploy --schema prisma/prod/schema.prisma

echo "✅ Migraciones aplicadas. Iniciando servidor..."
exec node dist/main
