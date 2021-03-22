import { Transform } from "assemblyscript/cli/transform";
import {
  Parser,
  Source,
  NodeKind,
  Statement,
  ClassDeclaration,
  NamespaceDeclaration,
} from "assemblyscript";
import { createPutMethod } from "./createPutFunction";

export = class ASONTransform extends Transform {
  afterParse(parser: Parser): void {
    // For backwards compatibility
    let sources: Source[] = (parser as any).program
      ? (parser as any).program.sources
      : parser.sources;
    // for each program source
    for (const source of sources) {
      traverseStatements(source.statements);
    }
  }
};

function traverseStatements(statements: Statement[]): void {
  // for each statement in the source
  for (const statement of statements) {
    // find each class declaration
    if (statement.kind === NodeKind.CLASSDECLARATION) {
      // cast and create a serialize and deserialize function
      const classDeclaration = <ClassDeclaration>statement;
      classDeclaration.members.push(createPutMethod(classDeclaration));
    } else if (statement.kind === NodeKind.NAMESPACEDECLARATION) {
      const namespaceDeclaration = <NamespaceDeclaration>statement;
      traverseStatements(namespaceDeclaration.members);
    }
  }
}
