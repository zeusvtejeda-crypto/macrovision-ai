import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // TZ fija: las pruebas del formulario deben detectar si una hora local se trata como UTC.
  test: { environment: 'node', include: ['tests/**/*.test.js'], env: { TZ: 'America/Mexico_City' } },
});
