(query_declaration
  "query" @context
  name: (identifier) @name) @item

(insert_statement
  "insert" @context
  type: (type_identifier) @name) @item

(update_statement
  "update" @context
  type: (type_identifier) @name) @item

(delete_statement
  "delete" @context
  type: (type_identifier) @name) @item
