import React, { useEffect, useRef } from "react";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <section className="border-t border-hairline pt-3">
    <h3 className="font-mono text-[9.5px] uppercase tracking-label text-muted">
      {label}
    </h3>
    <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-graphite">
      {children}
    </div>
  </section>
);

const facts: [string, string][] = [
  ["Board", "15 × 15 isometric, 113 cells"],
  ["Spells", "8, across four elements"],
  ["Turn", "45 seconds"],
  ["Server", "Go, one goroutine pair per connection"],
  ["Client", "React, TypeScript, no game engine"],
];

/**
 * Everything the landing page used to say in three paragraphs and two lists.
 * It is a dialog rather than a page because none of it is needed to start
 * playing: it is here for the visitor who wants to know how it is built.
 */
export const AboutDialog: React.FC<AboutDialogProps> = ({ open, onClose }) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop lands on the dialog itself, never on its panel.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-0 max-h-none h-full w-full max-w-none bg-paper p-0 text-ink backdrop:bg-ink/50 sm:mx-auto sm:my-[6vh] sm:h-auto sm:max-h-[88vh] sm:w-[min(560px,92vw)] sm:border-2 sm:border-ink"
    >
      <div className="flex h-full max-h-full flex-col">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink px-5 pb-2 pt-4 sm:px-7">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            About the project
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <h2 className="font-display text-[34px] font-bold leading-none tracking-tight">
            Dofus.js
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
            A study of the combat system from Dofus, rebuilt for the browser: an
            isometric board, action and movement points, line of sight, cover,
            and a catalogue of spells that each answer a different question.
          </p>

          <div className="mt-6 space-y-5">
            <Section label="How it works">
              <p>
                The server is the referee. Whose turn it is, whether a cell is in
                range, whether a spell is affordable — every rule is decided in
                Go and broadcast as one authoritative snapshot. The client draws
                that snapshot and asks for things; it is never trusted to decide
                anything.
              </p>
              <p>
                Identity comes from the connection: inbound messages carry no
                user id at all, so nobody can act as another player. A resume
                token brings a reload back as the same character.
              </p>
            </Section>

            <Section label="In the game">
              <p>
                Six action points and five movement points a turn. Cover blocks
                both movement and line of sight, and pathing walks around it.
                Spells carry cooldowns, critical hits, areas of effect and status
                effects — poison, shields, regeneration. A turn lasts 45 seconds,
                so nobody can freeze a match by walking away.
              </p>
              <p>
                With no one else around, the computer opponent plays a full
                match on the same clock, one action at a time.
              </p>
            </Section>

            <Section label="Built with">
              <p>
                Go and gorilla/websocket on the server, React and TypeScript on
                the client, Tailwind for the look, Docker to ship it. The
                isometric projection, the back-to-front draw order, the
                screen-to-grid hit test and the sprite animation are all
                hand-written, and the geometry is unit-tested.
              </p>
            </Section>

            <Section label="Numbers">
              <dl className="mt-1">
                {facts.map(([term, value]) => (
                  <div
                    key={term}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-1.5 last:border-b-0"
                  >
                    <dt className="font-mono text-[9.5px] uppercase tracking-label text-muted">
                      {term}
                    </dt>
                    <dd className="text-right font-mono text-[11px] text-graphite">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          </div>
        </div>

        <div className="flex flex-none items-center gap-4 border-t-2 border-ink px-5 py-3 sm:px-7">
          <a
            href="https://github.com/AntoineROYERB/dofus.js"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
          >
            Source on GitHub
          </a>
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-label text-muted">
            MIT
          </span>
        </div>
      </div>
    </dialog>
  );
};

export default AboutDialog;
