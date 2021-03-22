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
s.put<Test>(a);
let output = s.digestBinary();

let d = new Deserializer();
let t: Test = d.deserialize<Test>(output);

trace("t.a", 1, t.a);
trace("t.b", 5, <f64>t.b[0], <f64>t.b[1], <f64>t.b[2], <f64>t.b[3], <f64>t.b[4]);
assert(t.a == 64);
assert(t.b);
for (let i = 0; i < 5; i++) {
  assert(a.b[i] == t.b[i]);
}
assert(t.c == t, "circular");
