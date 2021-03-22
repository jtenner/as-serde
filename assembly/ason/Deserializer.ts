/// <reference path="../../node_modules/assemblyscript/std/assembly/rt/index.d.ts" />
import { ASON_INSTRUCTION_TYPE, __arraySegment, __circularSegment, __dataSegment, __endSegment, __nullSegment, __popSegment, __referenceSegment, __valueSegment } from "./util";
import { ASON_ERROR } from "./Error";

class Box<T> { constructor(public value: T) {}}

@global
export class Deserializer {
  stackIndex: i32 = -1;
  stack: StaticArray<usize> = new StaticArray<usize>(1000);
  binaryIndex: i32 = 0;
  binary: StaticArray<u8> = [];
  seen: Map<u32, usize> = new Map<u32, usize>();

  deserialize<T>(binary: StaticArray<u8>): T {
    this.binary = binary;
    this.binaryIndex = 0;
    let box = new Box<T>(
      isInteger<T>() || isFloat<T>()
        ? <T>0
        : changetype<T>(0)
    );
    unchecked(this.stack[0] = changetype<usize>(box));
    this.stackIndex = 0;
    let token = this.peek();

    // assuming object/array
    switch(token) {

      case ASON_INSTRUCTION_TYPE.ARRAY: {
        if (!this.tryConsumeArray(token)) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
        break;
      }
      case ASON_INSTRUCTION_TYPE.REFERENCE: {
        if (!this.tryConsumeReference(token)) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
        break;
      }
      default: throw new Error(ASON_ERROR.E_TYPE_MISMATCH);
    }
    this.consumeEnd();
    return box.value;
  }

  private peek(): ASON_INSTRUCTION_TYPE {
    return load<ASON_INSTRUCTION_TYPE>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  /**
   * Pushes the stack index +1, assembles a buffer, then creates an array, then returns it.
   *
   * @param {ASON_INSTRUCTION_TYPE} token - Peeked token, so it doesn't need to `peek()`
   */
  private tryConsumeArray(token: ASON_INSTRUCTION_TYPE): bool {
    // will only consume an array
    if (token != ASON_INSTRUCTION_TYPE.ARRAY) return false;
    let stackIndex = this.stackIndex;

    let arraySegment = this.arraySegment;
    let arrayOffset = arraySegment.offset;
    let arrayAlign = arraySegment.align;
    let arrayLength = arraySegment.length;
    let arrayIsStaticArray = arraySegment.isStaticArray;
    let arrayClassId = arraySegment.classId;
    let arrayEntryId = arraySegment.entryId;
    trace("entry id", 1, arrayEntryId);
    let arrayValueIsNullable = arraySegment.isValueNullable;

    // advance the parser, no turning back now
    this.binaryIndex += offsetof<__arraySegment>();

    token = this.peek();
    let parentPtr = this.stack[stackIndex];
    let arrayByteLength = <usize>arrayLength << arrayAlign;
    let result: usize = 0;

    switch (token) {
      case ASON_INSTRUCTION_TYPE.DATA: {
        let dataSegment = this.dataSegment;
        let array: usize;
        let dataStart = changetype<usize>(dataSegment) + offsetof<__dataSegment>();

        if (arrayIsStaticArray) {
          array = __new(arrayByteLength, arrayClassId);
          memory.copy(array, dataStart, arrayByteLength);
        } else {
          // fast path, new array
          array = __newArray(arrayLength, arrayAlign, arrayClassId, dataStart);
        }
        // always link. every item on the stack is garunteed to be managed
        __link(parentPtr, array, false);

        trace("setting seen", 2, arrayEntryId, array);
        this.seen.set(arrayEntryId, array);
        result = array;
        // store it on the parent (or at the result pointer)
        store<usize>(parentPtr + arrayOffset, array);

        this.binaryIndex += <i32>(offsetof<__dataSegment>() + arrayByteLength); // advance the buffer
        break;
      }
      case ASON_INSTRUCTION_TYPE.CIRCULAR:
      case ASON_INSTRUCTION_TYPE.REFERENCE:
      case ASON_INSTRUCTION_TYPE.NULL:
      case ASON_INSTRUCTION_TYPE.ARRAY: {
        let result: usize = 0;
        // allocate the right kind of "buffer"
        let buffer = arrayIsStaticArray
          ? __new(arrayByteLength, arrayClassId)
          : __new(arrayByteLength, idof<ArrayBuffer>());
        __pin(buffer);

        // push the stack
        let workingIndex = ++this.stackIndex;

        // We will be writing to the "buffer"
        this.stack[workingIndex] = buffer; // data is written to this buffer

        // If this is a static array the "buffer" is the result
        if (arrayIsStaticArray) {
          result = buffer;
        } else {
          // we need to allocate another reference for the array itself
          result = __new(offsetof<Array<usize>>(), arrayClassId);
          // immediately pin and link the array to the buffer
          __pin(result);
          __link(result, buffer, false);
          // now we can unpin the buffer
          __unpin(buffer);

          // TODO: Assemble the array properties here
          // private buffer: ArrayBuffer;
          store<usize>(result, buffer, offsetof<Array<usize>>("buffer"));
          //private dataStart: usize;
          store<usize>(result, buffer, offsetof<Array<usize>>("dataStart"));
          // private byteLength: i32;
          store<i32>(result, <i32>arrayByteLength, offsetof<Array<usize>>("byteLength"));
          // private length_: i32;
          store<i32>(result, <i32>arrayLength, offsetof<Array<usize>>());

        }
        // we could consume circular references
        this.seen.set(arrayEntryId, result);
        while (
          this.tryConsumeCircular(token)
          || this.tryConsumeReference(token)
          || this.tryConsumeArray(token)
          || (arrayValueIsNullable && this.tryConsumeNull(token))
        ) {
          token = this.peek();
        }
        this.stackIndex--;

        break;
      }
      default: throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    }

    store<usize>(parentPtr + arrayOffset, result);
    __link(parentPtr, result, false);

    this.consumePop();
    return true;
  }

  private tryConsumeReference(token: ASON_INSTRUCTION_TYPE): bool {
    if (token != ASON_INSTRUCTION_TYPE.REFERENCE) return false;
    let referenceSegment = this.referenceSegment;

    let referenceByteLength = referenceSegment.byteLength;
    let referenceClassId = referenceSegment.classId;
    let referenceEntryId = referenceSegment.entryId;
    let referenceOffset = referenceSegment.offset;

    let stackIndex = this.stackIndex;
    let parentPointer = this.stack[stackIndex];

    let ref = __pin(__new(referenceByteLength, referenceClassId));

    store<usize>(parentPointer + referenceOffset, ref);
    __link(parentPointer, ref, false);


    if (this.seen.has(referenceEntryId)) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    trace("ref is", 2, <f64>referenceEntryId, <f64>ref);
    this.seen.set(referenceEntryId, ref);
    let currentStackIndex = stackIndex + 1;
    this.stackIndex = currentStackIndex;
    this.stack[currentStackIndex] = ref;

    this.binaryIndex += offsetof<__referenceSegment>();

    token = this.peek();
    while (
      this.tryConsumeArray(token)
      || this.tryConsumeCircular(token)
      || this.tryConsumeNull(token)
      || this.tryConsumeReference(token)
      || this.tryConsumeValue(token)
    ) {
      token = this.peek();
    }

    this.stackIndex = stackIndex;
    this.consumePop();
    return true;
  }

  private tryConsumeValue(token: ASON_INSTRUCTION_TYPE): bool {
    if (token != ASON_INSTRUCTION_TYPE.VALUE) return false;

    // consume the valueSegment
    let nextIndex = this.binaryIndex + offsetof<__valueSegment>();
    if (nextIndex >= this.binary.length) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    let valueSegment = this.valueSegment;

    // used as top level validation
    // let valueIsFloat = valueSegment.isFloat;
    let valueOffset = valueSegment.offset;
    let valueSize = valueSegment.size;
    let valuePointer = changetype<usize>(valueSegment) + offsetof<__valueSegment>("value");
    let parentPointer = this.stack[this.stackIndex];

    switch (valueSize) {
      case 1: {
        store<u8>(parentPointer + valueOffset, load<u8>(valuePointer));
        break;
      }
      case 2: {
        store<u16>(parentPointer + valueOffset, load<u16>(valuePointer));
        break;
      }
      case 4: {
        store<u32>(parentPointer + valueOffset, load<u32>(valuePointer));
        break;
      }
      case 8: {
        store<u64>(parentPointer + valueOffset, load<u64>(valuePointer));
        break;
      }
    }
    // cannot obtain the value exactly
    // let value = valueSegment.value;
    this.binaryIndex = nextIndex;
    return true;
  }

  private consumePop(): void {
    if (this.peek() != ASON_INSTRUCTION_TYPE.POP) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    let nextIndex = this.binaryIndex + offsetof<__popSegment>();
    if (nextIndex >= this.binary.length) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    this.binaryIndex = nextIndex;
  }

  private tryConsumeNull(token: ASON_INSTRUCTION_TYPE): bool {
    if (token != ASON_INSTRUCTION_TYPE.NULL) return false;
    let nullSegment = this.nullSegment;
    let parent = this.stack[this.stackIndex];
    store<usize>(parent + nullSegment.offset, 0);
    let nextIndex = this.binaryIndex + offsetof<__nullSegment>();
    if (nextIndex >= this.binary.length) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    this.binaryIndex = nextIndex;
    return true;
  }

  private tryConsumeCircular(token: ASON_INSTRUCTION_TYPE): bool {
    if (token != ASON_INSTRUCTION_TYPE.CIRCULAR) return false;
    trace("found circular");
    let circularSegment = this.circularSegment;
    let circularSegmentID = circularSegment.id;
    let circularSegmentOffset = circularSegment.offset;

    let parent = this.stack[this.stackIndex];
    if (!this.seen.has(circularSegmentID)) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    let child = this.seen.get(circularSegmentID);

    trace("circularInfo", 4,
      <f64>circularSegmentID,
      <f64>circularSegmentOffset,
      <f64>parent,
      <f64>child,
    );
    store<usize>(parent + circularSegmentOffset, child);
    __link(parent, child, true);
    this.binaryIndex += offsetof<__circularSegment>();
    return true;
  }

  private consumeEnd(): void {
    if (this.peek() != ASON_INSTRUCTION_TYPE.END
      || (this.binaryIndex + offsetof<__endSegment>()) != this.binary.length
      ) throw new Error(ASON_ERROR.E_INVALID_DATA_FORMAT);
    this.binaryIndex = this.binary.length; // all consumed
  }

  private get valueSegment(): __valueSegment {
    return changetype<__valueSegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  private get arraySegment(): __arraySegment {
    return changetype<__arraySegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  private get nullSegment(): __nullSegment {
    return changetype<__nullSegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  private get circularSegment(): __circularSegment {
    return changetype<__circularSegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  private get referenceSegment(): __referenceSegment {
    return changetype<__referenceSegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }

  private get dataSegment(): __dataSegment {
    return changetype<__dataSegment>(changetype<usize>(this.binary) + <usize>this.binaryIndex);
  }
}
