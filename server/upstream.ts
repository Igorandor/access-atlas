// Stable boundary used by the Atlas capture domain and native integration probes.
export { AtlasTransport as IrisClient, irisError, validateOperation } from './atlas-transport.js';
export { ApiError, type Operation } from './atlas-errors.js';
export { redact } from '../shared/redaction.js';
