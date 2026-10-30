import { ensureBucket } from '../src/lib/storage';

await ensureBucket();
console.log('Bucket de almacenamiento listo.');
process.exit(0);
