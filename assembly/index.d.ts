/// <reference path="../node_modules/assemblyscript/std/assembly/index.d.ts" />
declare module "as-serde" {
  export class Serializer {
    put<T>(value: T): void;
    digestBinary(): StaticArray<u8>;
  }
}
