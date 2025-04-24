import React from "react";

interface CharacterProps {
  color: string;
  symbol: string;
  tileSize: {
    width: number;
    height: number;
  };
}

export const Character: React.FC<CharacterProps> = ({
  color,
  symbol,
  tileSize,
}) => {
  return (
    <g>
      {/* Character base */}
      <ellipse
        cx={tileSize.width / 2}
        cy={tileSize.height / 2 + 2}
        rx={tileSize.width / 5}
        ry={tileSize.height / 5}
        fill={color}
        stroke="#000"
        strokeWidth="0.5"
      />

      {/* Character symbol */}
      <text
        x={tileSize.width / 2}
        y={tileSize.height / 2 + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontWeight="bold"
        fontSize={tileSize.height / 2.5}
        style={{ textShadow: "0px 0px 1px #000" }}
      >
        {symbol}
      </text>
    </g>
  );
};
