-- MacroVision AI — Inicialización de base de datos
-- Se ejecuta automáticamente cuando Docker crea el contenedor de PostgreSQL

-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Búsqueda de texto similar
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- Búsqueda sin acentos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- Generación de UUIDs

-- Base de datos shadow para Prisma (migraciones)
SELECT 'CREATE DATABASE macrovision_shadow OWNER macrovision'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'macrovision_shadow'
)\gexec

-- Base de datos de test
SELECT 'CREATE DATABASE macrovision_test OWNER macrovision'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'macrovision_test'
)\gexec

-- Dar privilegios completos al usuario
GRANT ALL PRIVILEGES ON DATABASE macrovision_db TO macrovision;
GRANT ALL PRIVILEGES ON DATABASE macrovision_shadow TO macrovision;
GRANT ALL PRIVILEGES ON DATABASE macrovision_test TO macrovision;
