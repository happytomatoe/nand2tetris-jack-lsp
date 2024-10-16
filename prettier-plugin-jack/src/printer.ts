import { ProgramContext } from "jack-compiler";
import { AstPath, Doc, ParserOptions } from "prettier";
import { JackFormatterVisitor } from "./formatter.visitor";
import { CommonTokenStream } from "antlr4ng";

export function print<T>(
  path: AstPath<T>,
  _options: ParserOptions<T>,
  _print: (path: AstPath<T>) => Doc,
  _args?: unknown
): Doc {
  // console.log("Inside printer");
  const [tree, tokenStream] = path.node as [ProgramContext, CommonTokenStream];
  const val = tree.accept(new JackFormatterVisitor(tokenStream));
  // console.log("Doc",JSON.stringify(val, null, 2));
  return val ?? "";
}
