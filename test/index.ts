/// <reference path="../assembly/index.d.ts" />
class Test {
  a: f32 = 64;
  b: StaticArray<u8> = [1, 2, 3, 4, 5];
  c: Test | null = null;
}
let a = new Test();
a.c = a;

// @ts-ignore
let s = new Serializer();
s.put(a);
let output = s.digestBinary();


