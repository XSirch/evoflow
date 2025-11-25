import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mod = require('pdf-parse');

console.log('typeof module:', typeof mod);
console.log('keys:', Object.keys(mod));
console.log('default typeof:', typeof mod.default);

if (typeof mod === 'function') {
  console.log('callable: direct');
} else if (typeof mod.default === 'function') {
  console.log('callable: default');
}

if (typeof mod.PDFParse === 'function') {
  console.log('PDFParse is a function/class');
  console.log('PDFParse prototype keys:', Object.getOwnPropertyNames(mod.PDFParse.prototype));
}

