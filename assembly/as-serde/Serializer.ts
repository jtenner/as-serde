import { OBJECT, TOTAL_OVERHEAD } from "rt/common";
import {
  AS_SERDE_INSTRUCTION_TYPE,
  __circularSegment,
  __valueSegment,
  __arraySegment,
  __referenceSegment,
  __popSegment,
} from "./util";


export class Serializer {
  id: u32 = 0;
  ptr: usize = heap.alloc(1000);
  length: usize = 0;
  size: usize = 1000;

  ensureSize(size: usize): void {
    if (this.size < size) {
      this.ptr = heap.realloc(this.ptr, size);
      this.size = size;
    }
  }

  put<T>(value: T, offset: usize, seen: Map<usize, u32> = new Map<usize, u32>()): void {
    if (isInteger(value) || isFloat(value)) {
      this.writeValue(value, offset);
    }
    let ptr = changetype<usize>(value);
    if (seen.has(ptr)) {
      // circular reference
      this.writeCircular(value, offset, seen);
    } else if (isArray(value) || value instanceof StaticArray) {
      this.writeArray(value, offset, seen);
    } else {
      this.writeReference(value, offset, seen);
    }
  }

  writeCircular<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    let len = this.length;
    let ptr = changetype<usize>(value);
    let nextSize = len + offsetof<__circularSegment>();
    this.ensureSize(nextSize);
    let ref = changetype<__circularSegment>(this.ptr + len);
    ref.id = seen.get(ptr);
    ref.isManaged = isManaged(value);
    ref.offset = offset;
    ref.type = AS_SERDE_INSTRUCTION_TYPE.CIRCULAR;
    this.length = nextSize;
  }

  writeValue<T>(value: T, offset: usize): void {
    let len = this.length;
    let next = len + offsetof<__valueSegment>();
    this.ensureSize(next);
    let ref = changetype<__valueSegment>(this.ptr + len);
    ref.type = AS_SERDE_INSTRUCTION_TYPE.VALUE;
    ref.size = sizeof<T>();
    ref.offset = offset;
    // pack the bytes into the `value` property (has 8 in total)
    store<T>(changetype<usize>(ref), value, offsetof<__valueSegment>("value"));
    this.length = next;
  }

  writeArray<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    let id = this.id++;
    seen.set(changetype<usize>(value), id);
    let len = this.length;
    // write the array instruction segment
    let next = len + offsetof<__arraySegment>();
    this.ensureSize(next);
    let ref = changetype<__arraySegment>(this.ptr + len);
    ref.type = AS_SERDE_INSTRUCTION_TYPE.ARRAY;
    ref.isStaticArray = value instanceof StaticArray;
    ref.offset = offset;
    this.length = next;

    // serialize the children
    // @ts-ignore: obtaining length on static array or array
    let arrayLength = value.length;
    // @ts-ignore: valueof<T> returns the generic type in the array
    let size = sizeof<valueof<T>>();
    for (let i = 0; i < arrayLength; i++) {
      // @ts-ignore: unchecked get on array or static array
      this.put(unchecked(value[i]), i * size, seen);
    }

    // add a pop segment
    this.writePop();
  }

  writeReference<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    let ptr = changetype<usize>(value);
    let len = this.length;
    let id = this.id++;
    seen.set(ptr, id);
    let nextSize = len + offsetof<__referenceSegment>();
    this.ensureSize(nextSize);
    let ref = changetype<__referenceSegment>(this.ptr + len);
    ref.classId = isManaged<T>() ? idof<T>() : 0;
    ref.isManaged = isManaged<T>();
    ref.id = isManaged<T>() ? idof<T>() : 0;
    ref.offset = offset;
    ref.size = isManaged<T>()
      ? changetype<OBJECT>(ptr - TOTAL_OVERHEAD).rtSize
      : offsetof<T>();
    ref.type = AS_SERDE_INSTRUCTION_TYPE.PUSH;
    this.length = nextSize;

    // @ts-ignore: write it's children. This method is added by the transform to every class
    value.__serdePut(this, seen);

    this.writePop();
  }

  writePop(): void {
    let len = this.length;
    let nextSize = len + offsetof<__popSegment>();
    this.ensureSize(nextSize);
    let popref = changetype<__popSegment>(this.ptr + len);
    popref.type = AS_SERDE_INSTRUCTION_TYPE.POP;
    this.length = nextSize;
  }

  digest(): StaticArray<u8> {
    let ptr = this.ptr;
    this.ptr = 0;
    let length = this.length;
    let result = new StaticArray<u8>(length);
    memory.copy(changetype<usize>(result), ptr, length);
    heap.free(ptr);
    this.length = 0;
    this.size = 0;
    return result;
  }
}
