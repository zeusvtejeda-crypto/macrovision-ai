// Genera claves VAPID y CRON_SECRET. Cópialas a Vercel → Environment Variables (no las subas a git).
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:tu-correo@ejemplo.com');
console.log(`CRON_SECRET=${randomBytes(32).toString('base64url')}`);
