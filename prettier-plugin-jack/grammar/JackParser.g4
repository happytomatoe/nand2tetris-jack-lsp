parser grammar JackParser;

options {
	tokenVocab = JackLexer;
}
program: classDeclaration EOF;
classDeclaration:
	CLASS className LBRACE classVarDec* subroutineDeclaration* rBrace;
className: IDENTIFIER;
classVarDec: (STATIC | FIELD) fieldList SEMICOLON;
fieldList: varType fieldName ( COMMA fieldName)*;
fieldName: IDENTIFIER;
subroutineDeclaration:
	subroutineType subroutineDecWithoutType;
subroutineType: CONSTRUCTOR | METHOD | FUNCTION;
subroutineDecWithoutType:
	subroutineReturnType subroutineName LPAREN parameterList RPAREN subroutineBody;
subroutineName: IDENTIFIER;
subroutineReturnType: varType | VOID;

varType: INT | CHAR | BOOLEAN | IDENTIFIER;

parameterList: (parameter (COMMA parameter)*)?;
parameter: varType parameterName;
parameterName: IDENTIFIER;
subroutineBody: LBRACE varDeclaration* statements rBrace;
rBrace: RBRACE;
varDeclaration:
	VAR varType varNameInDeclaration (COMMA varNameInDeclaration)* SEMICOLON;
varNameInDeclaration: IDENTIFIER;
statements: statement*;
statement:
	letStatement
	| ifElseStatement
	| whileStatement
	| doStatement
	| returnStatement;

letStatement:
	LET (varName | arrayAccess) equals expression SEMICOLON;
equals: EQUALS;
ifElseStatement
	locals[endLabel:string=""]: ifStatement elseStatement?;
ifStatement
	locals[endLabel:string=""]:
	IF LPAREN ifExpression RPAREN LBRACE statements rBrace;
ifExpression: expression;
elseStatement: ELSE LBRACE statements rBrace;

whileStatement
	locals[startLabel:string="";endLabel:string="";]:
	WHILE LPAREN whileExpression RPAREN LBRACE statements rBrace;
whileExpression: expression;
doStatement: DO subroutineCall SEMICOLON;

subroutineCall: subroutineId LPAREN expressionList RPAREN;
subroutineId: ((className | THIS_LITERAL) DOT)? subroutineName;
returnStatement: RETURN expression? SEMICOLON;

expressionList: (expression (COMMA expression)*)?;

expression:
	constant
	| varName
	| subroutineCall
	| arrayAccess
	| unaryOperation
	| expression binaryOperator expression
	| groupedExpression;

constant:
	INTEGER_LITERAL
	| STRING_LITERAL
	| booleanLiteral
	| NULL_LITERAL
	| THIS_LITERAL;
varName: IDENTIFIER;
arrayAccess: varName LBRACKET expression RBRACKET;
unaryOperation: unaryOperator expression;
groupedExpression: LPAREN expression RPAREN;

booleanLiteral: TRUE | FALSE;
unaryOperator: TILDE | MINUS;
binaryOperator:
	PLUS
	| MINUS
	| MUL
	| DIV
	| AND
	| OR
	| LESS_THAN
	| GREATER_THAN
	| EQUALS;