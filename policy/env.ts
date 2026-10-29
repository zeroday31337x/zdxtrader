import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env', override: true });

export function envText(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; set it in .env`);
  return value;
}
export function envNumber(name: string): number {
  const value = Number(envText(name));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}; expected a finite number`);
  return value;
}
export function envBoolean(name: string): boolean {
  const value = envText(name);
  if (value !== 'true' && value !== 'false') throw new Error(`Invalid ${name}; expected true or false`);
  return value === 'true';
}
