import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export default async function enforceRedistributionAudit(context) {
  const projectDir = context.packager.projectDir;
  execFileSync(
    process.execPath,
    [resolve(projectDir, 'scripts/audit-third-party-assets.mjs'), '--release'],
    {
      cwd: projectDir,
      stdio: 'inherit',
    },
  );
}
