import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // The @nestjs v12 stack ships ESM only, so Jest must run in ESM mode
  // (launched with `node --experimental-vm-modules`, see the "test" script).
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // ts-jest compiles in-memory as ESM; declaration output is irrelevant here
    // and, combined with the project's inferred rootDir, would trip TS5011.
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          declaration: false,
          rootDir: '.',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
    ],
  },
  moduleNameMapper: {
    // Allow ESM-style ".js" specifiers to resolve to their ".ts" source.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
