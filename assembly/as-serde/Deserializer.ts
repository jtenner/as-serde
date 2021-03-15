/// <reference path="../../node_modules/assemblyscript/std/assembly/rt/index.d.ts" />
import { OBJECT, TOTAL_OVERHEAD } from "rt/common";
import { AS_SERDE_INSTRUCTION_TYPE, __arraySegment, __referenceSegment, __valueSegment } from "./util";

class Box<T> {
  constructor(public value : T) {}
}

export class Deserializer {
  private seen: Map<u32, usize> = new Map<u32, usize>();
  private start: usize = 0;
  private length: usize = 0;
  private workPtr: usize = 0;
  private resultPtr: usize = 0;

  public constructor() {}

  public consume<T>(data: StaticArray<u8>): T {
    this.start = changetype<usize>(data);
    this.length = data.length;

    let token = this.peek();
    // top level consume
    switch (token) {
      case AS_SERDE_INSTRUCTION_TYPE.POP:
      case AS_SERDE_INSTRUCTION_TYPE.CIRCULAR:
      case AS_SERDE_INSTRUCTION_TYPE.DATA:
        assert(false);
        unreachable();
      case AS_SERDE_INSTRUCTION_TYPE.NULL: {
        assert(isReference<T>());
        assert(isNullable<T>());
        return changetype<T>(0); // null reference T
      }
      case AS_SERDE_INSTRUCTION_TYPE.VALUE: {
        let segment = changetype<__valueSegment>(data);
        assert(!isReference<T>());
        assert(segment.size == sizeof<T>());
        assert(segment.isFloat == isFloat<T>());
        return load<T>(changetype<usize>(data), offsetof<__valueSegment>("value"));
      }
      case AS_SERDE_INSTRUCTION_TYPE.REFERENCE: {
        this.workPtr = __pin(__new(offsetof<Box<T>>(), idof<Box<T>>()));
        assert(this.tryConsumeReference(token));
        break;
      }
      case AS_SERDE_INSTRUCTION_TYPE.ARRAY: {
        assert(this.tryConsumeArraySegment(token));
        break;
      }
    }
    let box = changetype<Box<T>>(this.workPtr);
    let value = box.value;
    if (isManaged<T>()) {
      let obj = changetype<OBJECT>(changetype<usize>(value) - TOTAL_OVERHEAD);
      assert(obj.rtId == idof<T>());
    }
    __unpin(changetype<usize>(box));
    return value;
  }

  private peek(): AS_SERDE_INSTRUCTION_TYPE {
    return load<AS_SERDE_INSTRUCTION_TYPE>(this.start);
  }

  private tryConsumeReference(token: AS_SERDE_INSTRUCTION_TYPE): bool {
    // this must be a reference segment to parse it
    if (token != AS_SERDE_INSTRUCTION_TYPE.REFERENCE) return false;

    // the segment is a reference segment
    let segment = changetype<__referenceSegment>(this.start);

    // advance the buffer start to exactly the next spot
    this.start = changetype<usize>(segment) + offsetof<__referenceSegment>();

    // get the working pointer
    let previousWorkPtr = this.workPtr;
    let ptr: usize = 0;
    if (segment.isManaged) {
      ptr = this.workPtr = __pin(__new(segment.size, segment.classId));
    } else {
      ptr = this.workPtr = heap.alloc(segment.size);
    }

    store<usize>(previousWorkPtr + segment.offset, ptr);
    __link(previousWorkPtr, ptr, false);

    // Cache the reference
    this.seen.set(segment.id, ptr);

    // consume and work with the binary until a POP instruction is found
    while ((token = this.peek()) != AS_SERDE_INSTRUCTION_TYPE.POP) {
      assert(this.start < this.length);
      assert(
        this.tryConsumeNull(token)
          || this.tryConsumeArray(token)
          || this.tryConsumeReference(token)
          || this.tryConsumeValue(token)
      );
    }

    // perform the child set
    store<usize>(previousWorkPtr + segment.offset, ptr);
    if (segment.isManaged) {
      // setup the link, and unpin the reference now
      __link(previousWorkPtr, ptr, false);
      __unpin(ptr);
    }
    this.workPtr = previousWorkPtr;
    this.resultPtr = ptr;

    return true;
  }

  private tryConsumeNull(token: AS_SERDE_INSTRUCTION_TYPE): bool {
    if (token != AS_SERDE_INSTRUCTION_TYPE.NULL) return false;
    let ptr = 
  }
}