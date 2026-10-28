import {createHash} from 'node:crypto';
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, walk((v as Record<string, unknown>)[k])]));
    }
    throw new Error('Non-canonical value');
  };
  return JSON.stringify(walk(value));
}
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export function object(v: unknown): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected object');
  return v as Record<string, any>;
}
export function text(v: unknown, max = 65536): string {
  if (typeof v !== 'string' || !v.length || v.length > max) throw new Error('Invalid string');
  return v;
}
export function integer(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) throw new Error('Invalid unsigned integer');
  return v;
}
export function revision(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-f0-9]{40}$/.test(v)) throw new Error('Immutable commit SHA required');
  return v;
}
export function digest(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new Error('SHA-256 required');
  return v;
}
export function filePath(v: unknown): string {
  const p = text(v, 512);
  if (p.includes('\\') || p.includes('%') || /[?#\x00-\x1f]/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Invalid repository file path');
  return p;
}
