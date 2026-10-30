import { execFileSync } from 'node:child_process';

export default async function globalSetup() {
  const env = { ...process.env, NODE_ENV: 'test' };
  execFileSync('bun', ['run', '--cwd', 'apps/api', 'db:migrate'], { stdio: 'inherit', env });
  execFileSync('bun', ['run', '--cwd', 'apps/api', 'db:seed'], { stdio: 'inherit', env });
}
