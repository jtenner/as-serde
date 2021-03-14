export enum AS_SERDE_INSTRUCTION_TYPE {
  PUSH,
  POP,
  VALUE,
  CIRCULAR,
  ARRAY
}

@unmanaged
export class __arraySegment {
  type: AS_SERDE_INSTRUCTION_TYPE;
  isStaticArray: bool;
  offset: usize;
  id: u32;
}

@unmanaged
export class __valueSegment<T> {
  type: AS_SERDE_INSTRUCTION_TYPE;
  size: i32;
  offset: usize;
  value: T;
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
