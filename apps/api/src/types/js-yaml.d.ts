declare module "js-yaml" {
  // Minimal typings for js-yaml used in this project
  export function load<T = any>(str: string): T;
  export function dump(obj: any, options?: any): string;
}
