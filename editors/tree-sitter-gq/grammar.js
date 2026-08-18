// Tree-sitter grammar for the OmniGraph query language (.gq).
//
// Mirrors crates/omnigraph-compiler/src/query/query.pest. As with
// tree-sitter-pg, the grammar captures the lexical shape and leaves
// semantic restrictions to the compiler: every built-in (search, fuzzy,
// match_text, bm25, rrf, nearest, now, date, datetime, count, sum, avg,
// min, max) parses as one `function_call` shape, and positional rules
// (rrf's rank-expression arguments, nearest being order-only) are the
// linter's job.
//
// The binding/traversal/filter ambiguity after a leading `$var` resolves
// the same way query.pest resolves it — lexically. `$p:` starts a binding,
// `$p $w` starts an edge-bound traversal, `$p.` starts a filter, and a
// lowercase identifier continues a traversal. An undirected edge `<knows>`
// is one token so the lexer's longest match separates it from the `<`
// comparison operator.

function sep1(rule, delimiter) {
  return seq(rule, repeat(seq(delimiter, rule)));
}

module.exports = grammar({
  name: "gq",

  extras: ($) => [/\s/, $.comment, $.block_comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($.query_declaration),

    query_declaration: ($) =>
      seq(
        "query",
        field("name", $.identifier),
        "(",
        optional($.parameter_list),
        ")",
        repeat($.annotation),
        "{",
        $._query_body,
        "}",
      ),

    annotation: ($) =>
      seq("@", field("name", $.identifier), "(", $.string, ")"),

    parameter_list: ($) => sep1($.parameter, ","),

    parameter: ($) =>
      seq(field("name", $.variable), ":", field("type", $.type)),

    type: ($) => seq($._core_type, optional($.nullable_marker)),

    nullable_marker: (_) => "?",

    _core_type: ($) => choice($.list_type, $.named_type),

    list_type: ($) => seq("[", $._core_type, "]"),

    // Covers plain scalars (String, I64, Date, …) and Vector(768).
    named_type: ($) =>
      seq(field("name", $.type_identifier), optional(seq("(", $.integer, ")"))),

    _query_body: ($) => choice($.read_query_body, $.mutation_body),

    read_query_body: ($) =>
      seq(
        $.match_clause,
        $.return_clause,
        optional($.order_clause),
        optional($.limit_clause),
      ),

    mutation_body: ($) => repeat1($._mutation_statement),

    _mutation_statement: ($) =>
      choice($.insert_statement, $.update_statement, $.delete_statement),

    insert_statement: ($) =>
      seq(
        "insert",
        field("type", $.type_identifier),
        "{",
        repeat1($.assignment),
        "}",
      ),

    update_statement: ($) =>
      seq(
        "update",
        field("type", $.type_identifier),
        "set",
        "{",
        repeat1($.assignment),
        "}",
        "where",
        $.predicate,
      ),

    delete_statement: ($) =>
      seq("delete", field("type", $.type_identifier), "where", $.predicate),

    // Shared by insert/update bodies and binding property blocks:
    // `name: value` with an optional trailing comma.
    assignment: ($) =>
      seq(field("name", $.identifier), ":", $._value, optional(",")),

    predicate: ($) =>
      seq(field("name", $.identifier), $.comparison_operator, $._value),

    // Literal | variable | a call like now() or date("…").
    _value: ($) => choice($._literal, $.variable, $.function_call),

    match_clause: ($) => seq("match", "{", repeat1($._clause), "}"),

    // A bare function_call clause is a text-search call (search / fuzzy /
    // match_text); which functions are legal there is the compiler's concern.
    _clause: ($) =>
      choice($.negation, $.binding, $.traversal, $.filter, $.function_call),

    negation: ($) => seq("not", "{", repeat1($._clause), "}"),

    binding: ($) =>
      seq(
        field("name", $.variable),
        ":",
        field("type", $.type_identifier),
        // repeat, not repeat1: the compiler requires at least one entry, but
        // an editor grammar tolerating `{ }` mid-edit is harmless leniency.
        optional(seq("{", repeat($.assignment), "}")),
      ),

    traversal: ($) =>
      seq(
        field("from", $.variable),
        optional($.edge_binding),
        field("edge", choice($.undirected_edge, $.identifier)),
        optional($.traversal_bounds),
        field("to", $.variable),
      ),

    edge_binding: ($) => seq(field("name", $.variable), ":"),

    undirected_edge: (_) => token(seq("<", /[a-z_][A-Za-z0-9_]*/, ">")),

    traversal_bounds: ($) =>
      seq("{", $.integer, ",", optional($.integer), "}"),

    filter: ($) => seq($._expression, $.filter_operator, $._expression),

    return_clause: ($) => seq("return", "{", repeat1($.projection), "}"),

    projection: ($) =>
      seq(
        $._expression,
        optional(seq("as", field("alias", $.identifier))),
        optional(","),
      ),

    order_clause: ($) => seq("order", "{", sep1($.ordering, ","), "}"),

    ordering: ($) => seq($._expression, optional($.order_direction)),

    order_direction: (_) => choice("asc", "desc"),

    limit_clause: ($) => seq("limit", $.integer),

    _expression: ($) =>
      choice(
        $.function_call,
        $.property_access,
        $.variable,
        $._literal,
        $.identifier,
      ),

    function_call: ($) =>
      seq(
        field("function", $.identifier),
        "(",
        optional(sep1($._expression, ",")),
        ")",
      ),

    property_access: ($) =>
      seq(field("object", $.variable), ".", field("property", $.identifier)),

    comparison_operator: (_) =>
      choice(">=", "<=", "!=", ">", "<", "="),

    filter_operator: ($) =>
      choice($.comparison_operator, "starts_with", "contains"),

    _literal: ($) =>
      choice($.list, $.string, $.float, $.integer, $.boolean),

    list: ($) => seq("[", optional(sep1($._literal, ",")), "]"),

    variable: (_) => /\$[a-z_][A-Za-z0-9_]*/,

    type_identifier: (_) => /[A-Z][A-Za-z0-9_]*/,

    identifier: (_) => /[a-z_][A-Za-z0-9_]*/,

    string: (_) => token(seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')),

    float: (_) => /\d+\.\d+/,

    integer: (_) => /\d+/,

    boolean: (_) => choice("true", "false"),

    comment: (_) => token(seq("//", /[^\n]*/)),

    block_comment: (_) => token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
  },
});
