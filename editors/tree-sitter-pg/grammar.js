// Tree-sitter grammar for the OmniGraph schema language (.pg).
//
// Mirrors crates/omnigraph-compiler/src/schema/schema.pest. Body-level
// constraints (@key, @unique, …) and property annotations are parsed as one
// `annotation` shape — the distinction the compiler draws is semantic, not
// lexical, and an editor grammar only needs the lexical shape.

function sep1(rule, delimiter) {
  return seq(rule, repeat(seq(delimiter, rule)));
}

module.exports = grammar({
  name: "pg",

  extras: ($) => [/\s/, $.comment, $.block_comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($._declaration),

    _declaration: ($) =>
      choice($.interface_declaration, $.node_declaration, $.edge_declaration),

    interface_declaration: ($) =>
      seq("interface", field("name", $.type_identifier), $.declaration_body),

    node_declaration: ($) =>
      seq(
        "node",
        field("name", $.type_identifier),
        repeat($.annotation),
        optional($.implements_clause),
        $.declaration_body,
      ),

    implements_clause: ($) => seq("implements", sep1($.type_identifier, ",")),

    edge_declaration: ($) =>
      seq(
        "edge",
        field("name", $.type_identifier),
        ":",
        field("from", $.type_identifier),
        "->",
        field("to", $.type_identifier),
        repeat($.annotation),
        optional($.declaration_body),
      ),

    declaration_body: ($) =>
      seq("{", repeat(choice($.property, $.annotation)), "}"),

    // Trailing annotations bind to the property (prec.right); a body-level
    // constraint on the next line parses as if attached to the previous
    // property, which is indistinguishable for highlighting purposes.
    property: ($) =>
      prec.right(
        seq(
          field("name", $.identifier),
          ":",
          field("type", $.type),
          repeat($.annotation),
        ),
      ),

    type: ($) => seq($._core_type, optional($.nullable_marker)),

    nullable_marker: (_) => "?",

    _core_type: ($) => choice($.list_type, $.enum_type, $.named_type),

    list_type: ($) => seq("[", $._core_type, "]"),

    enum_type: ($) => seq("enum", "(", sep1($.enum_value, ","), ")"),

    // Covers plain scalars (String, I64, Date, …) and Vector(768).
    named_type: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(seq("(", $.integer, ")")),
      ),

    annotation: ($) =>
      prec.right(
        seq(
          "@",
          field("name", $.identifier),
          optional($.annotation_arguments),
        ),
      ),

    annotation_arguments: ($) =>
      seq("(", optional(sep1($._annotation_argument, ",")), ")"),

    _annotation_argument: ($) =>
      choice($.range, $.kwarg, $._literal, $.identifier),

    kwarg: ($) => seq(field("name", $.identifier), "=", $._literal),

    range: ($) =>
      choice(
        seq($._number, "..", optional($._number)),
        seq("..", $._number),
      ),

    _literal: ($) => choice($.string, $.float, $.integer, $.boolean),

    _number: ($) => choice($.float, $.integer),

    enum_value: (_) => /[A-Za-z0-9_-]+/,

    string: (_) => token(seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')),

    float: (_) => /-?\d+\.\d+/,

    integer: (_) => /-?\d+/,

    boolean: (_) => choice("true", "false"),

    type_identifier: (_) => /[A-Z][A-Za-z0-9_]*/,

    identifier: (_) => /[a-z_][A-Za-z0-9_]*/,

    comment: (_) => token(seq("//", /[^\n]*/)),

    block_comment: (_) =>
      token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
  },
});
