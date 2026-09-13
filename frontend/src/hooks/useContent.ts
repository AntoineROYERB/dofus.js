import { useEffect, useState } from "react";
import { fetchContent } from "../lib/api";
import { ContentResponse } from "../types/message";

// One request per page load. Content only changes with a server restart, and
// every page that shows a class asks for the same thing.
let pending: Promise<ContentResponse> | null = null;

const load = (): Promise<ContentResponse> => {
  if (!pending) {
    pending = fetchContent().catch((err) => {
      pending = null; // let the next mount try again
      throw err;
    });
  }
  return pending;
};

/**
 * The classes and spells the server loaded. `content` stays null until they
 * arrive; `failed` says they are not coming, so a page can fall back to
 * letting the server pick rather than blocking the way in.
 */
export const useContent = (): {
  content: ContentResponse | null;
  failed: boolean;
} => {
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((loaded) => live && setContent(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return { content, failed };
};
