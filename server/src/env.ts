import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4108),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: (() => {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret === 'CHANGE_ME') {
      throw new Error('JWT_SECRET must be set to a non-placeholder value');
    }
    return secret;
  })(),
  jwtIssuer: process.env.JWT_ISSUER ?? 'nuvik-vet',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'nuvik-vet-api',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  clientOrigins: Array.from(new Set(
    (process.env.CLIENT_ORIGIN ?? 'http://localhost:5178,http://127.0.0.1:5178,http://localhost:8090,http://127.0.0.1:8090,https://localhost:8449,https://127.0.0.1:8449')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  )),
};
