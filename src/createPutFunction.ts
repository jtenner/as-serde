import {
  ArrayLiteralExpression,
  AssertionKind,
  BlockStatement,
  CallExpression,
  ClassDeclaration,
  CommonFlags,
  Expression,
  FieldDeclaration,
  FunctionTypeNode,
  IfStatement,
  MethodDeclaration,
  NodeKind,
  ParameterKind,
  ParameterNode,
  Range,
  Statement,
  Token,
  TypeNode,
} from "assemblyscript";
import { djb2Hash } from "./djb2hash";

export function createPutMethod(
  classDeclaration: ClassDeclaration,
): MethodDeclaration {
  return TypeNode.createMethodDeclaration(
    TypeNode.createIdentifierExpression("__asonPut", classDeclaration.range),
    null,
    // if the class is generic, we need to specify the method is generic too
    CommonFlags.PUBLIC |
      CommonFlags.INSTANCE |
      (classDeclaration.isGeneric ? CommonFlags.GENERIC_CONTEXT : 0),
    null,
    createFunctionType(classDeclaration),
    createBody(classDeclaration),
    classDeclaration.range,
  );
}

export function createFunctionType(
  classDeclaration: ClassDeclaration,
): FunctionTypeNode {
  // __asonPut(ser: Serializer, seen: Map<usize, u32>, names: StaticArray<u32> = []): void
  return TypeNode.createFunctionType(
    [
      createSerializerParameter(classDeclaration),
      createSeenParameter(classDeclaration),
      createNamesParameter(classDeclaration),
    ],
    TypeNode.createNamedType(
      TypeNode.createSimpleTypeName("void", classDeclaration.range),
      null,
      false,
      classDeclaration.range,
    ),
    null,
    false,
    classDeclaration.range,
  );
}

export function createSerializerParameter(
  classDeclaration: ClassDeclaration,
): ParameterNode {
  return TypeNode.createParameter(
    ParameterKind.DEFAULT,
    TypeNode.createIdentifierExpression("ser", classDeclaration.range),
    TypeNode.createNamedType(
      TypeNode.createSimpleTypeName("Serializer", classDeclaration.range),
      null,
      false,
      classDeclaration.range,
    ),
    null,
    classDeclaration.range,
  );
}

export function createSeenParameter(
  classDeclaration: ClassDeclaration,
): ParameterNode {
  return TypeNode.createParameter(
    ParameterKind.DEFAULT,
    TypeNode.createIdentifierExpression("seen", classDeclaration.range),
    // Map<usize, u32>
    TypeNode.createNamedType(
      TypeNode.createSimpleTypeName("Map", classDeclaration.range),
      [
        TypeNode.createNamedType(
          TypeNode.createSimpleTypeName("usize", classDeclaration.range),
          null,
          false,
          classDeclaration.range,
        ),
        TypeNode.createNamedType(
          TypeNode.createSimpleTypeName("u32", classDeclaration.range),
          null,
          false,
          classDeclaration.range,
        ),
      ],
      false,
      classDeclaration.range,
    ),
    null,
    classDeclaration.range,
  );
}

export function createNamesParameter(
  classDeclaration: ClassDeclaration,
): ParameterNode {
  // names: StaticArray<u32>
  return TypeNode.createParameter(
    ParameterKind.OPTIONAL,
    TypeNode.createIdentifierExpression("names", classDeclaration.range),
    TypeNode.createNamedType(
      TypeNode.createSimpleTypeName("StaticArray", classDeclaration.range),
      [
        TypeNode.createNamedType(
          TypeNode.createSimpleTypeName("u32", classDeclaration.range),
          null,
          false,
          classDeclaration.range,
        ),
      ],
      false,
      classDeclaration.range,
    ),
    TypeNode.createArrayLiteralExpression([], classDeclaration.range),
    classDeclaration.range,
  );
}

export function createBody(classDeclaration: ClassDeclaration): BlockStatement {
  const body = [] as Statement[];
  const names = [] as string[];
  for (const member of classDeclaration.members) {
    // if it's an instance member, regardless of access modifier
    if (member.is(CommonFlags.INSTANCE)) {
      switch (member.kind) {
        // field declarations, both public and private must be serialized
        case NodeKind.FIELDDECLARATION: {
          const field = member as FieldDeclaration;
          body.push(createAsonPutCall(classDeclaration, field));
          names.push(field.name.text);
        }
      }
    }
  }

  if (classDeclaration.extendsType) {
    body.push(createSuperPut(classDeclaration, names));
  }

  return TypeNode.createBlockStatement(body, classDeclaration.range);
}

export function createSuperPut(
  classDeclaration: ClassDeclaration,
  names: string[],
): IfStatement {
  return TypeNode.createIfStatement(
    TypeNode.createCallExpression(
      TypeNode.createIdentifierExpression("isDefined", classDeclaration.range),
      null,
      [
        TypeNode.createPropertyAccessExpression(
          TypeNode.createSuperExpression(classDeclaration.range),
          TypeNode.createIdentifierExpression(
            "__asonPut",
            classDeclaration.range,
          ),
          classDeclaration.range,
        ),
      ],
      classDeclaration.range,
    ),
    // super.__asonPut(ser: Serializer, seen: Map<usize, u32>, names: StaticArray<u32> = [])
    TypeNode.createExpressionStatement(
      TypeNode.createCallExpression(
        TypeNode.createPropertyAccessExpression(
          TypeNode.createSuperExpression(classDeclaration.range),
          TypeNode.createIdentifierExpression(
            "__asonPut",
            classDeclaration.range,
          ),
          classDeclaration.range,
        ),
        null,
        [
          TypeNode.createIdentifierExpression("ser", classDeclaration.range),
          TypeNode.createIdentifierExpression("seen", classDeclaration.range),
          // names.concat([...hashes])
          TypeNode.createCallExpression(
            TypeNode.createPropertyAccessExpression(
              TypeNode.createIdentifierExpression(
                "names",
                classDeclaration.range,
              ),
              TypeNode.createIdentifierExpression(
                "concat",
                classDeclaration.range,
              ),
              classDeclaration.range,
            ),
            null,
            [createHashArrayLiteral(names, classDeclaration.range)],
            classDeclaration.range,
          ),
        ],
        classDeclaration.range,
      ),
    ),
    null,
    classDeclaration.range,
  );
}

export function createAsonPutCall(
  classDeclaration: ClassDeclaration,
  field: FieldDeclaration,
): IfStatement {
  // if (!names.includes(propHash)) ser.put(this.prop, offsetof<T>("prop"), seen);
  return TypeNode.createIfStatement(
    TypeNode.createUnaryPrefixExpression(
      Token.EXCLAMATION,
      TypeNode.createCallExpression(
        TypeNode.createPropertyAccessExpression(
          TypeNode.createIdentifierExpression("names", field.range),
          TypeNode.createIdentifierExpression("includes", field.range),
          field.range,
        ),
        null,
        [
          TypeNode.createAssertionExpression(
            AssertionKind.AS,
            TypeNode.createIntegerLiteralExpression(
              f64_as_i64(djb2Hash(field.name.text)),
              field.range,
            ),
            TypeNode.createNamedType(
              TypeNode.createSimpleTypeName("u32", field.range),
              null,
              false,
              field.range,
            ),
            field.range
          ),
        ],
        field.range,
      ),
      field.range,
    ),
    // set.put(this.prop, offsetof<T>("prop"), seen)
    TypeNode.createExpressionStatement(
      TypeNode.createCallExpression(
        TypeNode.createPropertyAccessExpression(
          TypeNode.createIdentifierExpression("ser", field.range),
          TypeNode.createIdentifierExpression("put", field.range),
          field.range,
        ),
        null,
        [
          // this.prop
          TypeNode.createPropertyAccessExpression(
            TypeNode.createThisExpression(field.range),
            TypeNode.createIdentifierExpression(field.name.text, field.range),
            field.range,
          ),
          // offsetof<T...>(fieldName)
          createFieldOffsetOfCall(classDeclaration, field),
          TypeNode.createIdentifierExpression("seen", field.range),
        ],
        field.range,
      ),
    ),
    null,
    field.range,
  );
}

export function createFieldOffsetOfCall(
  classDeclaration: ClassDeclaration,
  field: FieldDeclaration,
): CallExpression {
  return TypeNode.createCallExpression(
    TypeNode.createIdentifierExpression("offsetof", field.range),
    [
      TypeNode.createNamedType(
        TypeNode.createSimpleTypeName(classDeclaration.name.text, field.range),
        classDeclaration.isGeneric
          ? createGenericTypeParameters(classDeclaration, field.range)
          : null,
        false,
        field.range,
      ),
    ],
    [TypeNode.createStringLiteralExpression(field.name.text, field.range)],
    field.range,
  );
}

export function createGenericTypeParameters(
  classDeclaration: ClassDeclaration,
  range: Range,
): TypeNode[] {
  let result = [] as TypeNode[];
  for (const typeNode of classDeclaration.typeParameters!) {
    result.push(
      TypeNode.createNamedType(
        TypeNode.createSimpleTypeName(typeNode.name.text, range),
        null,
        false,
        range,
      ),
    );
  }
  return result;
}

export function createHashArrayLiteral(
  names: string[],
  range: Range,
): ArrayLiteralExpression {
  let elements = [] as Expression[];
  for (const name of names) {
    elements.push(
      TypeNode.createIntegerLiteralExpression(
        f64_as_i64(djb2Hash(name)),
        range,
      ),
    );
  }
  return TypeNode.createArrayLiteralExpression(elements, range);
}
