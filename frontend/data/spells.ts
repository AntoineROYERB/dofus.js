export interface Spell {
  id: number;
  name: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  APCost: number;
  range: number;
  needsLineOfSight: boolean;
  maxCastsPerTurn: number;
  damage: number;
  areaOfEffect: "none" | "circle" | "cross" | "line";
  type: "Fire" | "Water" | "Air" | "Earth" | "Neutral";
  description?: string;
  criticalChance?: number; // in %
  criticalDamage?: number;
  castInLineOnly?: boolean;
  castOnEmptyCell?: boolean;
  cooldown?: number; // in turns
  isWeapon?: boolean;
}

export const SPELLS: Spell[] = [
  {
    id: 1,
    name: "Fireball",
    bgColor: "bg-red-100",
    borderColor: "border-red-600",
    icon: "🔥",
    APCost: 4,
    range: 6,
    needsLineOfSight: true,
    maxCastsPerTurn: 2,
    areaOfEffect: "circle",
    damage: 30,
    description:
      "🔴 Type: Fire\n🧪 Damage: 30 (45 crit.)\n💧 Cost: 4 AP\n🎯 Range: 6\n📏 AoE: Circle\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Fire",
    criticalChance: 15,
    criticalDamage: 45,
    castInLineOnly: false,
    castOnEmptyCell: false,
    cooldown: 1,
    isWeapon: false,
  },
  {
    id: 2,
    name: "Ice Spike",
    bgColor: "bg-blue-100",
    borderColor: "border-blue-600",
    icon: "❄️",
    APCost: 3,
    range: 5,
    needsLineOfSight: true,
    maxCastsPerTurn: 3,
    areaOfEffect: "line",
    damage: 20,
    description:
      "🔵 Type: Water\n🧪 Damage: 20 (30 crit.)\n💧 Cost: 3 AP\n🎯 Range: 5\n📏 AoE: Line\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Water",
    criticalChance: 10,
    criticalDamage: 30,
    castInLineOnly: true,
    castOnEmptyCell: false,
    cooldown: 0,
    isWeapon: false,
  },
  {
    id: 3,
    name: "Poison Dart",
    bgColor: "bg-green-100",
    borderColor: "border-green-700",
    icon: "☠️",
    APCost: 2,
    range: 4,
    needsLineOfSight: true,
    maxCastsPerTurn: 4,
    areaOfEffect: "none",
    damage: 10,
    description:
      "🟢 Type: Air\n🧪 Damage: 10 (15 crit.)\n💧 Cost: 2 AP\n🎯 Range: 4\n📏 AoE: None\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Air",
    criticalChance: 20,
    criticalDamage: 15,
    castInLineOnly: false,
    castOnEmptyCell: true,
    cooldown: 0,
    isWeapon: false,
  },

  {
    id: 4,
    name: "Gwendo na Gwendo",
    bgColor: "bg-brown-100",
    borderColor: "border-brown-600",
    icon: "🐸",
    APCost: 5,
    range: 3,
    needsLineOfSight: false,
    maxCastsPerTurn: 1,
    areaOfEffect: "cross",
    damage: -1,
    description:
      "🟤 Type: Earth\n🧪 Damage: 25 (40 crit.)\n💧 Cost: 5 AP\n🎯 Range: 3\n📏 AoE: Cross\n👁️ Line of Sight: No\n♻️ Cooldown: 2 turns",
    type: "Earth",
    criticalChance: 15,
    criticalDamage: 40,
    castOnEmptyCell: false,
    cooldown: 2,
    isWeapon: false,
  },
];
