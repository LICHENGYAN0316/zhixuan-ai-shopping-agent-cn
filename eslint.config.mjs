import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.vinext/**', '.venv/**', 'out/**', 'build/**', 'dist/**', 'Coze/**', '.playwright-cli/**', 'public/data/**', 'next-env.d.ts']),
]);

export default eslintConfig;
