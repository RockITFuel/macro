import { type SchemaType, schema } from '@loro-mirror/core';

const markdownNodeSchema = schema.LoroMap({
  $: schema.LoroMap({} as any, {
    required: false,
  }),
  text: schema.LoroText({
    required: false,
  }),
  ids: schema.LoroList(schema.String(), (idStr) => idStr, {
    required: false,
  }),
  children: schema.LoroMovableList(
    {} as SchemaType,
    (item) => {
      const id = item?.$?.id;
      if (!id) {
        console.error('no id for item', item);
      }
      return id;
    },
    {
      required: false,
    }
  ),
});

markdownNodeSchema.definition.children.itemSchema = markdownNodeSchema;

export const MARKDOWN_LORO_SCHEMA = schema({
  root: markdownNodeSchema,
  // Display width per embedded image or video document, keyed by its id
  // (apps/web features/inline-media). Not part of the text.
  mediaLayout: schema.LoroMap({}, { required: false, allowUnknown: true }),
});

export type MarkdownLoroSchemaType = typeof MARKDOWN_LORO_SCHEMA;
