import React from "react";
import { Modal } from "../Overlay";
import { Keycap } from "./PhoneHud";
import { SHORTCUT_SHEET } from "../../utils/shortcuts";
import { t } from "../../i18n/lang";

/**
 * Every key the fight answers to, on one card. H opens it, as does the Keys
 * link beside the deck; a player should never have to guess that Space ends
 * the turn.
 */
export const ShortcutSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal
    onClose={onClose}
    labelledBy="shortcuts-title"
    className="max-w-md rounded-3xl border-2 border-gold/70 bg-panel p-6 shadow-[0_0_40px_rgb(var(--night)/0.8)]"
  >
    <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
      {t("Keyboard")}
    </div>
    <h2
      id="shortcuts-title"
      className="mt-2 pr-8 font-display text-[24px] font-bold leading-none"
    >
      {t("Play from the keys")}
    </h2>
    <dl className="mt-4">
      {SHORTCUT_SHEET.map((row) => (
        <div
          key={row.does}
          className="flex items-baseline gap-4 border-b border-hairline py-2 last:border-b-0"
        >
          <dt className="flex w-[104px] flex-none flex-wrap items-center gap-1">
            {row.keys.map((key) =>
              key === "–" ? (
                <span key={key} className="text-muted">
                  –
                </span>
              ) : (
                <Keycap key={key}>{key === "Space" ? t("Space") : key === "Right-click" ? t("Right-click") : key}</Keycap>
              )
            )}
          </dt>
          <dd className="text-[13.5px] leading-snug text-graphite">{t(row.does)}</dd>
        </div>
      ))}
    </dl>
  </Modal>
);

export default ShortcutSheet;
