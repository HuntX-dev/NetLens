declare module '*?raw' {
  const value: string;
  export default value;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}
