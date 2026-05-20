declare module 'node:child_process' {
  export function execFileSync(command: string, args?: readonly string[]): unknown;
}

declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
}
