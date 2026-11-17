// Pastikan .dev.vars (rahasia lokal untuk Worker saat `npm run dev`) ada. Tidak menimpa file yang sudah ada.
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.dev.vars')) {
  copyFileSync('.dev.vars.example', '.dev.vars');
  console.log('[dev] .dev.vars dibuat dari .dev.vars.example');
}
