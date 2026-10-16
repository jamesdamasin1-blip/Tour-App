import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const outDir = '.tmp-regression-tests';
const tsconfigPath = `${outDir}/tsconfig.regression.json`;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        outDir: './build',
        rootDir: '..',
        baseUrl: '..',
        paths: {
          '@/*': ['./*'],
        },
        module: 'commonjs',
        moduleResolution: 'node',
        target: 'es2022',
        esModuleInterop: true,
        skipLibCheck: true,
        noEmitOnError: true,
        strict: true,
      },
      include: [
        '../tests/**/*.ts',
        '../src/utils/tripDates.ts',
        '../src/data/countryTimezones.ts',
        '../src/finance/wallet/walletGuard.ts',
        '../src/finance/wallet/walletRate.ts',
        '../src/finance/wallet/walletTypes.ts',
        '../src/finance/expense/expenseEngine.ts',
        '../src/finance/expense/expenseTypes.ts',
        '../src/features/inbox/inboxItems.ts',
        '../src/features/activity/hooks/createActivity.helpers.ts',
        '../src/store/cloudMutationErrors.ts',
        '../src/store/slices/settingsSlice.ts',
        '../src/sync/guards/deletion.guard.ts',
        '../src/sync/guards/version.guard.ts',
        '../src/sync/conflictResolver.ts',
        '../src/types/models.ts',
        '../src/utils/mathUtils.ts',
        '../src/utils/tripDisplayFields.ts',
      ],
    },
    null,
    2
  )
);

const tscResult = spawnSync(
  'npx',
  [
    'tsc',
    '-p',
    tsconfigPath,
  ],
  { stdio: 'inherit', shell: true }
);

if (tscResult.status !== 0) {
  process.exit(tscResult.status ?? 1);
}

const testResult = spawnSync(
  'node',
  ['--require', './scripts/regression-node-setup.cjs', '--test', `${outDir}/build/tests/*.test.js`],
  { stdio: 'inherit', shell: true }
);

rmSync(outDir, { recursive: true, force: true });

process.exit(testResult.status ?? 1);
