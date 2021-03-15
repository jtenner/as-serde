# Rules

- DigestedBuffer -> (Null | Array | Object | Value)
  - Assert: Offset is 0
  - Match Array | Object -> Assert: classId matches `idof<T>()`
- Null -> NullSegment
- Array -> ArraySegment (DataSegment | Object:* | Array:*) Pop
- Object -> ObjectSegment (Null | Array | Object | Value):* Pop
- Value -> ValueSegment
