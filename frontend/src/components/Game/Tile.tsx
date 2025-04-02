import React, { CSSProperties } from "react";
import { Position } from "../../types/game";

interface TileProps {
  x: number;
  y: number;
  isSelected: boolean;
  playerOnCell: any; // Type could be more specific based on your Player type
  selectedColor?: string;
  onCellClick: ({ x, y }: Position) => void;
  onMouseEnter: (x: number, y: number) => void;
  onMouseLeave: () => void;
  style: CSSProperties;
}

export const Tile: React.FC<TileProps> = ({
  x,
  y,
  isSelected,
  playerOnCell,
  selectedColor,
  onCellClick,
  onMouseEnter,
  onMouseLeave,
  style,
}) => (
  <div
    onClick={() => onCellClick({ x, y })}
    onMouseEnter={() => onMouseEnter(x, y)}
    onMouseLeave={onMouseLeave}
    className={`
      w-full pt-[100%] relative cursor-pointer 
      transition-colors border border-gray-200
      ${!playerOnCell && !isSelected ? "bg-gray-100 hover:bg-blue-100" : ""}
    `}
    style={style}
  >
    {playerOnCell && (
      <div className="absolute inset-0 flex items-center justify-center text-white font-bold">
        {playerOnCell.character.symbol}
      </div>
    )}
  </div>
);
