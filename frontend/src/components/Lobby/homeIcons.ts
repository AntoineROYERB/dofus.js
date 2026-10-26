/** The home screen's line icons, as 24px stroke paths. */
export const ICONS = {
  swords: "M14.5 4H20v5.5L9 20.5 3.5 15zM6 13l5 5M4 20l2.5-2.5",
  games: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  gear: "M9 4l3 2 3-2 5 3-2 4-2-1v10H8V10l-2 1-2-4z",
  dream: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  menu: "M4 6h16M4 12h16M4 18h16",
  trophy: "M8 4h8v4a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 12v4M8 20h8M9 20l1-4h4l1 4",
  world: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.5-6 8-6s7 2 8 6",
  chevron: "M9 5l7 7-7 7",
  options: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
} as const;

export type HomeIcon = keyof typeof ICONS;
