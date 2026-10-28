import {
  loroSnapshotToMarkdown,
  markdownToLoroUpdate,
} from '@macro-inc/lexical-core/markdown-loro-update';
import { OpenAPIRoute } from 'chanfana';
import type { Context } from 'hono';
import { z } from 'zod';
import { handleEndpointError } from '../lib/error-handler';
import { standardErrorResponses } from '../lib/schemas';

const snapshot = z.string().base64().describe('Base64 Loro snapshot');

export class MarkdownUpdateEndpoint extends OpenAPIRoute {
  schema = {
    summary: 'Compute the Loro update that replaces a document with markdown',
    description:
      'Imports the snapshot, mirrors the markdown into it (unchanged blocks keep their identity) and returns the resulting update, or null when the document already holds that markdown.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ snapshot, markdown: z.string() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'The base64 Loro update, or null for no change',
        content: {
          'application/json': {
            schema: z.object({ update: z.string().nullable() }),
          },
        },
      },
      ...standardErrorResponses,
    },
  };

  async handle(c: Context) {
    try {
      const { body } = await this.getValidatedData<typeof this.schema>();
      const update = await markdownToLoroUpdate(
        Buffer.from(body.snapshot, 'base64'),
        body.markdown
      );
      return c.json({
        update: update ? Buffer.from(update).toString('base64') : null,
      });
    } catch (error) {
      return handleEndpointError(error, c);
    }
  }
}

export class SnapshotMarkdownEndpoint extends OpenAPIRoute {
  schema = {
    summary: 'Convert a Loro snapshot to markdown',
    description:
      'The external markdown of a document snapshot, as document text reads return it.',
    request: {
      body: {
        content: {
          'application/json': { schema: z.object({ snapshot }) },
        },
      },
    },
    responses: {
      200: {
        description: 'The markdown',
        content: {
          'application/json': {
            schema: z.object({ markdown: z.string() }),
          },
        },
      },
      ...standardErrorResponses,
    },
  };

  async handle(c: Context) {
    try {
      const { body } = await this.getValidatedData<typeof this.schema>();
      return c.json({
        markdown: loroSnapshotToMarkdown(Buffer.from(body.snapshot, 'base64')),
      });
    } catch (error) {
      return handleEndpointError(error, c);
    }
  }
}
