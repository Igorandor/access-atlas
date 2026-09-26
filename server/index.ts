import 'dotenv/config';
import { createApp } from './app.js';
const endpoint = process.env.IRIS_URL || 'http://127.0.0.1:52780';
const port = Number(process.env.PORT || 3200);
if (
  !['http:', 'https:'].includes(new URL(endpoint).protocol) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
)
  throw new Error('Atlas requires an HTTP(S) IRIS_URL and a valid TCP PORT.');
const application = createApp({
  irisUrl: endpoint,
  instanceId: process.env.ATLAS_INSTANCE_ID,
  origin: process.env.PUBLIC_ORIGIN,
  secure: process.env.COOKIE_SECURE === 'true',
});
const listener = application.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log('Access Atlas ready on port ' + port),
);
process.once('SIGTERM', () => listener.close(() => process.exit(0)));
process.once('SIGINT', () => listener.close(() => process.exit(0)));
