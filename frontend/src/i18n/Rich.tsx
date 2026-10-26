import React from "react";

/**
 * A translated sentence with words in bold, written `<b>like this</b>`. The
 * bold words move with the language — French puts them elsewhere in the
 * sentence than English does — so they belong in the translation rather than
 * in the markup around it.
 */
export const Rich: React.FC<{ text: string; boldClassName?: string }> = ({
  text,
  boldClassName = "text-ink",
}) => (
  <>
    {text.split(/<b>(.*?)<\/b>/g).map((part, i) =>
      i % 2 === 1 ? (
        <b key={i} className={boldClassName}>
          {part}
        </b>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )}
  </>
);
