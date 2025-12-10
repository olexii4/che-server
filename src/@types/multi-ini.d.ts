/*
 * Type definitions for multi-ini
 */

declare module 'multi-ini' {
  export class Parser {
    parse(lines: string[]): any;
  }

  export class Serializer {
    serialize(data: any): string;
  }
}
