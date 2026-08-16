// core/ids.ts
export function newId(): string {
  return crypto.randomUUID();
}
