(node_declaration
  "node" @context
  name: (type_identifier) @name) @item

(edge_declaration
  "edge" @context
  name: (type_identifier) @name) @item

(interface_declaration
  "interface" @context
  name: (type_identifier) @name) @item

(property
  name: (identifier) @name) @item
