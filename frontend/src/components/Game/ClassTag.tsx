import React from "react";
import { CharacterClass } from "../../types/message";

interface ClassTagProps {
  classId: string | undefined;
  classes: CharacterClass[] | undefined;
  className?: string;
}

/**
 * Which class a fighter plays, in the same small mono type as every other
 * label. The class's own colour is a 6px square and nothing more, the way a
 * spell's element is on the bar: saturated colour on this screen is kept for
 * what a click is about to do.
 */
export const ClassTag: React.FC<ClassTagProps> = ({
  classId,
  classes,
  className = "",
}) => {
  const cls = classes?.find((c) => c.id === classId);
  if (!cls) return null;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 font-mono text-[9.5px] uppercase tracking-label text-muted ${className}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none -translate-y-px"
        style={{ backgroundColor: cls.palette.primary }}
      />
      {cls.name}
    </span>
  );
};
