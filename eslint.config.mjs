import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-next` still ships eslintrc-style presets, so they are bridged
 * through FlatCompat rather than duplicated here. Without this file `next lint`
 * blocks on its interactive setup prompt instead of running.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'storage/**',
    ],
  },
];

export default config;
