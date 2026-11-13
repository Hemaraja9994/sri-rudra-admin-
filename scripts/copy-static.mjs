// Copies the theme files (static/__srr) next to the built dashboards: dist/__srr.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
cpSync('static/__srr', 'dist/__srr', { recursive: true });
console.log('copied static/__srr -> dist/__srr');
