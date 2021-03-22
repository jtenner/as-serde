export enum ASON_INSTRUCTION_TYPE {
  NULL,
  REFERENCE,
  POP,
  VALUE,
  CIRCULAR,
  ARRAY,
  DATA,
  END,
}

@unmanaged
export class __endSegment {
  type: ASON_INSTRUCTION_TYPE;
}

@unmanaged
export class __arraySegment {
  type: ASON_INSTRUCTION_TYPE;
  isStaticArray: bool;
  offset: usize;
  length: i32;
  align: usize;
  isValueNullable: bool;
  entryId: u32;
  classId: u32;
}

@unmanaged
export class __valueSegment {
  type: ASON_INSTRUCTION_TYPE;
  size: i32;
  isFloat: bool;
  offset: usize;
  value: u64;
}

@unmanaged
export class __circularSegment {
  type: ASON_INSTRUCTION_TYPE;
  offset: usize;
  isManaged: bool;
  id: u32;
}

@unmanaged
export class __referenceSegment {
  type: ASON_INSTRUCTION_TYPE;
  classId: u32;
  offset: usize;
  byteLength: usize;
  isManaged: bool;
  entryId: u32;
}

@unmanaged
export class __popSegment {
  type: ASON_INSTRUCTION_TYPE;
}

@unmanaged
export class __dataSegment {
  type: ASON_INSTRUCTION_TYPE;
  byteLength: usize;
  // data segment follows
  // dataStart: usize;
}

@unmanaged
export class __nullSegment {
  type: ASON_INSTRUCTION_TYPE;
  offset: usize;
}
