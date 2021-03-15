import { OBJECT, TOTAL_OVERHEAD } from "rt/common";
import {
  AS_SERDE_INSTRUCTION_TYPE,
  __circularSegment,
  __valueSegment,
  __dataSegment,
  __arraySegment,
  __referenceSegment,
  __popSegment,
  __nullSegment,
} from "./util";

@global
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

  put<T>(value: T, offset: usize = 0, seen: Map<usize, u32> = new Map<usize, u32>()): void {
    if (isInteger(value) || isFloat(value)) {
      this.writeValue(value, offset);
      return;
    }
    // strict null check
    let ptr = changetype<usize>(value);
    if (ptr == 0) {
      this.writeNull(offset);
      return;
    }
    if (seen.has(ptr)) {
      // circular reference
      this.writeCircular(value, offset, seen);
    } else if (isArray(value) || value instanceof StaticArray) {
      if (isNullable(value)) {
        // we have already asserted it isn't null
        this.writeArray(value!, offset, seen);
      } else {
        this.writeArray(value, offset, seen);
      }
    } else {
      if (isNullable(value)) {
        // we have already asserted it isn't null
        this.writeReference(value!, offset, seen);
      } else {
        this.writeReference(value, offset, seen);
      }
    }
  }

  writeCircular<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    trace("writing circular");
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
    trace("writing value");
    let len = this.length;
    let next = len + offsetof<__valueSegment>();
    this.ensureSize(next);
    let ref = changetype<__valueSegment>(this.ptr + len);
    ref.type = AS_SERDE_INSTRUCTION_TYPE.VALUE;
    ref.size = sizeof<T>();
    ref.offset = offset;
    ref.isFloat = isFloat<T>();

    // pack the bytes into the `value` property (has 8 in total)
    store<T>(changetype<usize>(ref), value, offsetof<__valueSegment>("value"));
    this.length = next;
  }

  writeArray<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    trace("writing array");
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
    ref.classId = idof<T>();
    this.length = next;

    // @ts-ignore T is garunteed to be StaticArray or Array
    if (isInteger<valueof<T>>() || isFloat<valueof<T>>()) {
      if (value instanceof StaticArray) {
        this.writeData(
          changetype<usize>(value),
          changetype<OBJECT>(changetype<usize>(value) - TOTAL_OVERHEAD).rtSize,
        );
      } else {
        // T is Array<valueof<T>>
        this.writeData(
          load<usize>(changetype<usize>(value), offsetof<T>("dataStart")),
          // @ts-ignore: value has length
          <usize>(value.length << (alignof<valueof<T>>())),
        );
      }
    } else {
      // serialize the children
      // @ts-ignore: obtaining length on static array or array
      let arrayLength = value.length;
      for (let i: usize = 0; i < arrayLength; i++) {
        // @ts-ignore: unchecked get on array or static array
        this.put(unchecked(value[i]), i * sizeof<valueof<T>>(), seen);
      }
    }

    // add a pop segment
    this.writePop();
  }

  writeReference<T>(value: T, offset: usize, seen: Map<usize, u32>): void {
    trace("writing reference");
    let ptr = changetype<usize>(value);
    let len = this.length;
    let id = this.id++;
    seen.set(ptr, id);
    let nextSize = len + offsetof<__referenceSegment>();
    this.ensureSize(nextSize);
    let ref = changetype<__referenceSegment>(this.ptr + len);
    ref.classId = isManaged<T>() ? idof<T>() : 0;
    ref.isManaged = isManaged<T>();
    ref.id = id;
    ref.offset = offset;
    ref.size = isManaged<T>()
      ? changetype<OBJECT>(ptr - TOTAL_OVERHEAD).rtSize
      : offsetof<T>();
    ref.type = AS_SERDE_INSTRUCTION_TYPE.REFERENCE;
    this.length = nextSize;

    // @ts-ignore: write it's children. This method is added by the transform to every class
    value.__serdePut(this, seen);

    this.writePop();
  }

  writePop(): void {
    trace("Writing Pop");
    let len = this.length;
    let nextSize = len + offsetof<__popSegment>();
    this.ensureSize(nextSize);
    let popref = changetype<__popSegment>(this.ptr + len);
    popref.type = AS_SERDE_INSTRUCTION_TYPE.POP;
    this.length = nextSize;
  }

  writeData(source: usize, byteLength: usize): void {
    trace("Writing segment");
    let len = this.length;
    let nextSize = len + offsetof<__dataSegment>() + byteLength;
    this.ensureSize(nextSize);
    let dataref = changetype<__dataSegment>(this.ptr + len);
    dataref.type = AS_SERDE_INSTRUCTION_TYPE.DATA;
    dataref.byteLength = byteLength;
    let target = changetype<usize>(dataref) + offsetof<__dataSegment>();
    memory.copy(target, source, byteLength);
    this.length = nextSize;
  }

  writeNull(offset: usize): void {
    let len = this.length;
    let nextSize = len + offsetof<__nullSegment>();
    this.ensureSize(nextSize);
    let nullref = changetype<__nullSegment>(this.ptr + len);
    nullref.type = AS_SERDE_INSTRUCTION_TYPE.NULL;
    nullref.offset = offset;
    this.length = nextSize;
  }

  digestBinary(): StaticArray<u8> {
    let ptr = this.ptr;
    this.ptr = 0;
    let length = this.length;
    let result = new StaticArray<u8>(<i32>length);
    memory.copy(changetype<usize>(result), ptr, length);
    heap.free(ptr);
    this.length = 0;
    this.size = 0;
    return result;
  }
}
