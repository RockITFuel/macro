import { useBinaryDocumentQuery } from '@queries/storage/binary-document';
import type { Accessor } from 'solid-js';

/**
 * A presigned read URL for a stored image or video, minted with the viewer's
 * rights. Pending and failed reads give no URL, so the caller never suspends.
 */
export function useMediaUrl(documentId: Accessor<string>) {
  const query = useBinaryDocumentQuery(documentId);
  return {
    url: () => (query.isSuccess ? query.data : undefined),
    failed: () => query.isError,
  };
}
