export enum AS_SERDE_INSTRUCTION_TYPE {
  NULL,
  REFERENCE,
  POP,
  VALUE,
  CIRCULAR,
  ARRAY,
  DATA,
}

@unmanaged
export class __arraySegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  isStaticArray: bool;
  offset: usize;
  id: u32;
  classId: u32;
}

@unmanaged
export class __valueSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  size: i32;
  isFloat: bool;
  offset: usize;
  value: u64;
}

@unmanaged
export class __circularSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  offset: usize;
  isManaged: bool;
  id: u32;
}

@unmanaged
export class __referenceSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  classId: u32;
  offset: usize;
  size: usize;
  isManaged: bool;
  id: u32;
}

@unmanaged
export class __popSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
}

@unmanaged
export class __dataSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  byteLength: usize;
  // dataStart: usize;
}

@unmanaged
export class __nullSegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  offset: usize;
}
