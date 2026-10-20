export type EnemyKind = 'scout' | 'raider' | 'brute' | 'boss';
export type TowerKind = 'cannon' | 'rapid' | 'cryo';
export type WeaponKind = 'pulse' | 'rail' | 'scatter';

export interface Point {
  x: number;
  y: number;
}

export interface EnemySpec {
  hp: number;
  speed: number;
  bounty: number;
  radius: number;
  color: number;
}

export interface TowerSpec {
  name: string;
  shortLabel: string;
  cost: number;
  color: number;
  projectileColor: number;
  damage: number;
  fireInterval: number;
  range: number;
  upgradeDescription: string;
}

export interface WeaponSpec {
  damage: number;
  speed: number;
  cooldown: number;
  color: number;
  lifetime?: number;
  pierce?: number;
  pelletCount?: number;
  spreadAngle?: number;
}

export const GAMEPLAY_CONFIG = {
  scene: {
    width: 960,
    height: 640,
    deltaLimitSeconds: 0.05,
  },
  player: {
    speed: 230,
    maxHealth: 100,
    start: { x: 88, y: 340 },
    bounds: { left: 20, right: 22, top: 126, bottom: 24 },
    radius: 15,
    barrelOffset: 15,
    barrelLength: 22,
    barrelThickness: 6,
    targetRange: 310,
    touchMoveThreshold: 14,
    collisionRange: 28,
    damage: 12,
    bossDamage: 22,
    damageCooldown: 0.75,
    invulnerabilityDuration: 0.25,
  },
  base: {
    maxHealth: 100,
    breachDamage: 10,
    bruteBreachDamage: 18,
    bossBreachDamage: 30,
  },
  economy: {
    startingCoins: 110,
    bossKillBonus: 40,
    upgradeBaseCostMultiplier: 0.65,
    upgradeCostPerLevel: 20,
  },
  pulse: {
    radius: 128,
    cooldown: 8,
    damage: 42,
    effectDurationMs: 220,
  },
  phaseTwo: {
    startsAfterWave: 2,
    announcementSeconds: 3,
    enemySpeedMultiplier: 1.3,
    spawnIntervalMultiplier: 0.75,
  },
  wave: {
    initialEnemyCount: 5,
    enemiesPerWave: 2,
    maxEnemies: 22,
    bossEvery: 10,
    bruteStartWave: 4,
    bruteEvery: 5,
    raiderStartWave: 2,
    raiderEvery: 3,
    initialSpawnDelay: 0.4,
    baseSpawnInterval: 1.1,
    spawnIntervalReductionPerWave: 0.035,
    minimumSpawnInterval: 0.34,
    interWaveDelay: 3,
    healthScalePerWave: 0.08,
    speedScalePerWave: 0.015,
    bossBaseHealth: 460,
    bossHealthPerWave: 28,
  },
  enemy: {
    scout: { hp: 36, speed: 56, bounty: 5, radius: 11, color: 0xe5c36d },
    raider: { hp: 26, speed: 96, bounty: 7, radius: 10, color: 0xe89562 },
    brute: { hp: 100, speed: 35, bounty: 12, radius: 16, color: 0xc97067 },
    boss: { hp: 460, speed: 28, bounty: 35, radius: 23, color: 0xc17193 },
    collisionRadius: 12,
    bossExtraCollisionRadius: 20,
    regularExtraCollisionRadius: 10,
  } satisfies Record<EnemyKind, EnemySpec> & {
    collisionRadius: number;
    bossExtraCollisionRadius: number;
    regularExtraCollisionRadius: number;
  },
  projectile: {
    playerRadius: 5,
    towerRadius: 4,
    defaultLifetime: 1.3,
    defaultPierce: 0,
    defaultSplashRadius: 0,
    defaultSlowFactor: 1,
    defaultSlowDuration: 0,
    splashDamageMultiplier: 0.55,
  },
  weapon: {
    pulse: {
      damage: 25, speed: 500, cooldown: 0.34, color: 0xffd078,
    },
    rail: {
      damage: 62, speed: 920, cooldown: 0.78, color: 0x9ce8ff, pierce: 2, lifetime: 1.05,
    },
    scatter: {
      damage: 11, speed: 465, cooldown: 0.72, color: 0xffa778,
      pelletCount: 5, spreadAngle: 0.12, lifetime: 0.55,
    },
  } satisfies Record<WeaponKind, WeaponSpec>,
  tower: {
    cannon: {
      name: 'Пушка', shortLabel: 'ПУШКА', cost: 35, color: 0xc77b54, projectileColor: 0xffbd75,
      damage: 31, fireInterval: 1.08, range: 158, upgradeDescription: 'урон +12, радиус взрыва +12',
    },
    rapid: {
      name: 'Скорострел', shortLabel: 'РАПИД', cost: 50, color: 0x4ea88d, projectileColor: 0x8ef5c8,
      damage: 13, fireInterval: 0.34, range: 138, upgradeDescription: 'скорострельность +18%, дальность +10',
    },
    cryo: {
      name: 'Крио-башня', shortLabel: 'КРИО', cost: 60, color: 0x598fc2, projectileColor: 0x8bdcff,
      damage: 10, fireInterval: 0.88, range: 162, upgradeDescription: 'замедление сильнее и дольше',
    },
    rapidProjectileSpeed: 560,
    projectileSpeed: 390,
    initialCooldown: 0.2,
    baseRadius: 18,
    baseRadiusPerLevel: 1,
    coreRadius: 7,
    coreRadiusPerLevel: 1,
    maximumLevelDarken: 18,
    rapidRangePerLevel: 12,
    otherRangePerLevel: 20,
    rapidDamagePerLevel: 5,
    otherDamagePerLevel: 4,
    cannonDamagePerLevel: 12,
    rapidFireIntervalMultiplier: 0.82,
    minimumRapidFireInterval: 0.2,
    otherFireIntervalReductionPerLevel: 0.1,
    minimumOtherFireInterval: 0.48,
    cannonSplashBaseRadius: 34,
    cannonSplashRadiusPerLevel: 9,
    cryoBaseSlowFactor: 0.64,
    cryoSlowFactorPerLevel: 0.12,
    cryoMinimumSlowFactor: 0.34,
    cryoBaseSlowDuration: 1.3,
    cryoSlowDurationPerLevel: 0.45,
    upgradeMaximumLevel: 3,
  } satisfies Record<TowerKind, TowerSpec> & Record<string, number | string | TowerSpec>,
  route: [
    { x: -18, y: 188 },
    { x: 208, y: 188 },
    { x: 208, y: 438 },
    { x: 438, y: 438 },
    { x: 438, y: 164 },
    { x: 690, y: 164 },
    { x: 690, y: 470 },
    { x: 978, y: 470 },
  ] satisfies Point[],
  buildSlots: [
    { x: 100, y: 320 },
    { x: 300, y: 300 },
    { x: 300, y: 540 },
    { x: 360, y: 320 },
    { x: 560, y: 120 },
    { x: 580, y: 320 },
    { x: 820, y: 320 },
    { x: 840, y: 560 },
  ] satisfies Point[],
  ui: {
    unselectedButtonAlpha: 0.82,
  },
} as const;
