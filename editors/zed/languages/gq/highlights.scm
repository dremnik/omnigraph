(comment) @comment
(block_comment) @comment

[
  "query"
  "match"
  "return"
  "order"
  "limit"
  "insert"
  "update"
  "delete"
  "set"
  "where"
  "not"
  "as"
] @keyword

(order_direction) @keyword

(query_declaration
  name: (identifier) @function)

(function_call
  function: (identifier) @function)

(annotation
  "@" @attribute
  name: (identifier) @attribute)

(variable) @variable

(type_identifier) @type

(property_access
  property: (identifier) @property)

(assignment
  name: (identifier) @property)

(predicate
  name: (identifier) @property)

(traversal
  edge: (identifier) @label)

(undirected_edge) @label

(projection
  alias: (identifier) @variable)

(string) @string
(integer) @number
(float) @number
(boolean) @boolean

(comparison_operator) @operator
(filter_operator) @operator
(nullable_marker) @operator

[
  ":"
  ","
  "."
] @punctuation.delimiter

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.bracket
