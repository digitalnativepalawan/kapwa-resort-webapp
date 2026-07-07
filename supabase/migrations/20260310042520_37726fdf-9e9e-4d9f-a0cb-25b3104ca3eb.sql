UPDATE order_types SET source_table = 'resort_tables', input_mode = 'select', placeholder = 'Select table' WHERE id = 'a8269faf-a8aa-41d9-9615-4b96b43ad0cd';

UPDATE order_types SET source_table = NULL, input_mode = 'text', placeholder = 'Guest name or details' WHERE id = 'b83702a8-2998-4bb6-a3fb-e9228269b58b';