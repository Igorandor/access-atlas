import 'dotenv/config';
import { createApp } from './app.js';
import { readConfiguration } from './configuration.js';
const configuration = readConfiguration(process.env);
const application = createApp(configuration);
const listener = application.listen(configuration.port, configuration.host, () =>
  console.log('Access Atlas ready on port ' + configuration.port),
);
process.once('SIGTERM', () => listener.close(() => process.exit(0)));
process.once('SIGINT', () => listener.close(() => process.exit(0)));
