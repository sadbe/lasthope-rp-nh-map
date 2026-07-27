/**
 * Type declarations for `bcryptjs` — the package ships without its own
 * .d.ts file, so we declare the minimal surface we use here.
 */
declare module 'bcryptjs' {
  export function hash(input: string, saltOrRounds: string | number): Promise<string>;
  export function hashSync(input: string, saltOrRounds: string | number): string;
  export function compare(input: string, hash: string): Promise<boolean>;
  export function compareSync(input: string, hash: string): boolean;
  export function genSaltSync(rounds?: number): string;
  export function genSalt(rounds?: number): Promise<string>;
}
