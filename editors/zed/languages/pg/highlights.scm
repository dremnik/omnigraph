(comment) @comment
(block_comment) @comment

[
  "node"
  "edge"
  "interface"
  "implements"
  "enum"
] @keyword

(type_identifier) @type

(property
  name: (identifier) @property)

(annotation
  "@" @attribute
  name: (identifier) @attribute)

(kwarg
  name: (identifier) @variable.parameter)

(enum_value) @constant

(string) @string
(integer) @number
(float) @number
(boolean) @boolean

(nullable_marker) @operator
"->" @operator
".." @operator
"=" @operator

[
  ":"
  ","
] @punctuation.delimiter

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.bracket
