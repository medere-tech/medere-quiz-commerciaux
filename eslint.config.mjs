import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    // `functions/lib` est du JavaScript compilé par tsc : on lint la source,
    // pas sa sortie.
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'functions/lib/**',
      'functions/node_modules/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
