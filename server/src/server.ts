import {
  createConnection,
  TextDocuments,
  Diagnostic,
  // DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticReportKind,
  type DocumentDiagnosticReport,
  DiagnosticSeverity,
  DocumentFormattingParams,
  Position,
  Range,
  TextEdit,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  CompletionList,
  InsertReplaceEdit,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Compiler, JackCompilerError } from "jack-compiler/out/index";
import * as prettier from "prettier";
import { JackPlugin } from "prettier-plugin-jack/out/index";
import * as path from "path";
import * as fs from "fs";
import { URI } from "vscode-uri";
import { assert } from "console";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  connection.console.log("Server on init...");
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
      documentFormattingProvider: true,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["."],
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document !== undefined) {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: await validateTextDocument(document),
    } satisfies DocumentDiagnosticReport;
  } else {
    // We don't know the document. We can either try to read it from disk
    // or we don't report problems for it.
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: [],
    } satisfies DocumentDiagnosticReport;
  }
});

// Validate text on change
documents.onDidChangeContent((change) => {
  connection.console.log("Server on change...");
  validateTextDocument(change.document);
});
async function validateTextDocument(
  textDocument: TextDocument
): Promise<Diagnostic[]> {
  const text = textDocument.getText();
  const compiler = new Compiler();
  const selectedFilePath = URI.parse(textDocument.uri).fsPath;
  const dir = path.dirname(selectedFilePath);

  const parsedOrErrors = compiler.parse(text);
  if (Array.isArray(parsedOrErrors)) {
    return parsedOrErrors.map((m) => toDiagnostics(textDocument, m));
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".jack"))
    .map((file) => path.join(dir, file));
  for (const filePath of files) {
    if (filePath == selectedFilePath) continue;
    const content = fs.readFileSync(filePath, { encoding: "utf8", flag: "r" });
    const treeOrErrors = compiler.parse(content);
    if (!Array.isArray(treeOrErrors)) {
      compiler.bind(treeOrErrors);
    }
  }

  const bindedOrErrors = compiler.bind(parsedOrErrors);
  if (Array.isArray(bindedOrErrors)) {
    return bindedOrErrors.map((m) => toDiagnostics(textDocument, m));
  }
  const classNameFromFilename = selectedFilePath.substring(
    selectedFilePath.lastIndexOf(path.sep) + 1,
    selectedFilePath.indexOf(".jack")
  );
  const validatedOrErrors = compiler.validate(
    bindedOrErrors,
    classNameFromFilename
  );
  if (Array.isArray(validatedOrErrors)) {
    connection.console.log("Errors: " + validatedOrErrors);
    return validatedOrErrors.map((m) => toDiagnostics(textDocument, m));
  }
  return [];
}

function toDiagnostics(textDocument: TextDocument, e: JackCompilerError) {
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: textDocument.positionAt(e.span.start),
      end: textDocument.positionAt(e.span.end),
    },
    message: e.msg,
  };
}

connection.onDocumentFormatting(
  async (formatParams: DocumentFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(formatParams.textDocument.uri);

    if (!document) {
      return [];
    }

    try {
      const text = document.getText();
      const formatted = await prettier.format(text, {
        parser: "jack",
        plugins: [JackPlugin],
        tabWidth: formatParams.options.tabSize,
        singleQuote: false,
        useTabs: !formatParams.options.insertSpaces,
      });
      connection.console.log("Formatting document: " + formatted);
      return [
        TextEdit.replace(
          Range.create(Position.create(0, 0), document.positionAt(text.length)),
          formatted
        ),
      ];
    } catch (error) {
      if (typeof error == "string")
        connection.console.error("Error formatting document:" + error);
      if (error instanceof Error) {
        connection.console.error("Error formatting document:" + error.message);
      }
      return [];
    }
  }
);
// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const textDocument = documents.get(_textDocumentPosition.textDocument.uri);
    if (textDocument == null) {
      return [];
    }
    const pos = _textDocumentPosition.position;
    const line = textDocument
      .getText()
      .substring(
        textDocument.offsetAt({ line: pos.line, character: 0 }),
        textDocument.offsetAt(pos)
      );
    const matches = line.matchAll(/([A-Z]([A-Za-z0-9_])*\.)$/g);
    const idStart = matches.next();
    if (idStart.value == null || idStart.value.length == 0) {
      return [];
    }
    const symbols = createGlobalSymbolTable(textDocument.uri);
    const matchedSubroutines = Object.entries(symbols).filter(([k, v]) =>
      k.startsWith(idStart.value[0])
    );
    return matchedSubroutines.map(([k, v], i) => {
      const label = k.substring(k.indexOf(".") + 1);
      const params = v.subroutineInfo?.paramNames
        .map((v, i) => {
          return "${" + i+1 + ":" + v + "}";
        })
        .join(",");
      connection.console.log("Parameters: " + params)
      return {
        label: label,
        kind: CompletionItemKind.Function,
        data: k,
        insertText: label + "(" + params + ")",
        insertTextFormat: InsertTextFormat.Snippet,
      } as CompletionItem;
    });
  }
);
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

//Utils

function createGlobalSymbolTable(textDocumentUri: string) {
  const compiler = new Compiler();
  const selectedFilePath = URI.parse(textDocumentUri).fsPath;
  const dir = path.dirname(selectedFilePath);
  //TODO: resolve this
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".jack"))
    .map((file) => path.join(dir, file));
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, {
      encoding: "utf8",
      flag: "r",
    });
    const treeOrErrors = compiler.parse(content);
    if (!Array.isArray(treeOrErrors)) {
      compiler.bind(treeOrErrors);
    }
  }
  assert(
    Object.keys(compiler.globalSymbolTable).length,
    "Global symbol table shouldn't be empty"
  );
  return compiler.globalSymbolTable;
}
