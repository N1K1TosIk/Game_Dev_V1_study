import Phaser from 'phaser';
import {
  generateRoute,
  type RouteRules,
} from './generateRoute';
import {
  GAMEPLAY_CONFIG,
  type EnemyKind,
  type EnemySpec,
  type Point,
  type TowerKind,
  type TowerSpec,
  type WeaponKind,
} from './gameplayConfig';

type Mode = 'menu' | 'playing' | 'phase-transition' | 'paused' | 'gameover';

interface Enemy {
  body: Phaser.GameObjects.Image;
  healthBar: Phaser.GameObjects.Graphics;
  kind: EnemyKind;
  health: number;
  maxHealth: number;
  speed: number;
  bounty: number;
  segment: number;
  slowTimer: number;
  slowFactor: number;
  animTime: number;
  animFrame: number;
}

interface Tower {
  x: number;
  y: number;
  kind: TowerKind;
  level: number;
  invested: number;
  cooldown: number;
  sprite: Phaser.GameObjects.Image;
  levelLabel: Phaser.GameObjects.Text;
  rangeRing: Phaser.GameObjects.Arc;
}

interface BuildSlot {
  x: number;
  y: number;
  marker: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  tower: Tower | null;
}

interface Projectile {
  body: Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  source: 'player' | 'tower';
  lifetime: number;
  pierce: number;
  hit: Set<Enemy>;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;
  speed: number;
  turnRate: number;
  steerTarget: Enemy | null;
}

interface Keys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  q: Phaser.Input.Keyboard.Key;
  p: Phaser.Input.Keyboard.Key;
  escape: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  one: Phaser.Input.Keyboard.Key;
  two: Phaser.Input.Keyboard.Key;
  three: Phaser.Input.Keyboard.Key;
  b: Phaser.Input.Keyboard.Key;
}

export class DefenseScene extends Phaser.Scene {
  private mode: Mode = 'menu';
  private keys!: Keys;
  private player!: Phaser.GameObjects.Image;
  private playerHealth: number = GAMEPLAY_CONFIG.player.maxHealth;
  private playerX: number = GAMEPLAY_CONFIG.player.start.x;
  private playerY: number = GAMEPLAY_CONFIG.player.start.y;
  private playerFireCooldown = 0;
  private playerDamageCooldown = 0;
  private pulseCooldown = 0;
  private pulseButtonHeld = false;
  private fireButtonHeld = false;
  private pointerTarget: Phaser.Math.Vector2 | null = null;

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private slots: BuildSlot[] = [];
  private route: Point[] = [];
  private basePoint: Point = { x: GAMEPLAY_CONFIG.base.x, y: GAMEPLAY_CONFIG.base.y };
  private pathTiles: Phaser.GameObjects.Image[] = [];
  private baseSprite!: Phaser.GameObjects.Image;
  private baseLabel!: Phaser.GameObjects.Text;
  private projectiles: Projectile[] = [];
  private spawnQueue: EnemyKind[] = [];
  private selectedTower: Tower | null = null;
  private selectedTowerKind: TowerKind = 'cannon';
  private selectedWeapon: WeaponKind = 'pulse';
  private towerTypeButtons: Phaser.GameObjects.Rectangle[] = [];
  private buildSheet!: Phaser.GameObjects.Container;
  private buildButton!: Phaser.GameObjects.Rectangle;
  private buildSheetOpen = false;
  private weaponButtons: Phaser.GameObjects.Rectangle[] = [];

  private wave = 0;
  private baseHealth: number = GAMEPLAY_CONFIG.base.maxHealth;
  private coins = GAMEPLAY_CONFIG.economy.startingCoins;
  private kills = 0;
  private spawnCooldown = 0;
  private waveDelay = 0;
  private invulnerableTimer = 0;
  private phase: 1 | 2 = 1;
  private phaseAnnouncementRemaining = 0;
  private pulseEffect: Phaser.GameObjects.Arc | null = null;
  private modal: Phaser.GameObjects.Container | null = null;

  private waveText!: Phaser.GameObjects.Text;
  private baseText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private playerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private upgradeButton!: Phaser.GameObjects.Rectangle;
  private upgradeLabel!: Phaser.GameObjects.Text;
  private sellButton!: Phaser.GameObjects.Rectangle;
  private sellLabel!: Phaser.GameObjects.Text;
  private shopPanel!: Phaser.GameObjects.Container;
  private shopOpen = false;
  private heroSkinOwned = false;
  private charmActive = false;
  private shopSkinLabel!: Phaser.GameObjects.Text;
  private shopCharmLabel!: Phaser.GameObjects.Text;
  private fireCooldownText!: Phaser.GameObjects.Text;
  private fireKeyButton!: Phaser.GameObjects.Rectangle;
  private pulseKeyButton!: Phaser.GameObjects.Rectangle;
  private pulseKeyLabel!: Phaser.GameObjects.Text;
  private bestWave = 0;

  constructor() {
    super('DefenseScene');
  }

  preload(): void {
    for (const key of [
      'tile-grass', 'tile-path', 'tile-path-edge', 'tile-slot',
      'hero', 'hero-cape', 'base',
      'enemy-scout', 'enemy-scout-step', 'enemy-raider', 'enemy-raider-step',
      'enemy-brute', 'enemy-brute-step', 'enemy-boss', 'enemy-boss-step', 'enemy-flyer', 'enemy-flyer-flap',
      'tower-cannon', 'tower-rapid', 'tower-cryo', 'tower-homing', 'projectile-homing',
    ]) {
      this.load.image(key, `assets/${key}.png`);
    }
  }

  create(): void {
    this.heroSkinOwned = this.readHeroSkin();
    this.drawMap();
    this.createHud();
    this.createActors();
    this.applyHeroSkin();
    this.refreshShopLabels();
    this.createInput();
    this.bestWave = this.readBestWave();
    this.showMenu();
  }

  update(_time: number, delta: number): void {
    if (this.mode === 'phase-transition') {
      this.updatePhaseTransition(delta);
      return;
    }

    if (this.mode !== 'playing') {
      this.updatePausedKeys();
      return;
    }

    const seconds = Math.min(delta / 1000, GAMEPLAY_CONFIG.scene.deltaLimitSeconds);
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - seconds);
    this.playerDamageCooldown = Math.max(0, this.playerDamageCooldown - seconds);
    this.pulseCooldown = Math.max(0, this.pulseCooldown - seconds);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - seconds);

    this.movePlayer(seconds);
    this.updateEnemies(seconds);
    this.updateTowerFire(seconds);
    this.updateProjectiles(seconds);
    this.updateWave(seconds);
    this.updateHud();
  }

  private drawMap(): void {
    this.cameras.main.setBackgroundColor('#1d5a38');
    const width = GAMEPLAY_CONFIG.scene.width;
    const height = GAMEPLAY_CONFIG.scene.height;
    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass').setDepth(0);

    this.add.text(22, GAMEPLAY_CONFIG.hud.topHeight + 14, 'МАРШРУТ ВРАГА', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#d5e7c8',
    }).setDepth(2);

    this.baseSprite = this.add.image(this.basePoint.x, this.basePoint.y, 'base').setDepth(4);
    this.baseLabel = this.add.text(this.basePoint.x, this.basePoint.y + GAMEPLAY_CONFIG.routeGen.baseLabelOffset, 'БАЗА', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#c6e9d4',
    }).setOrigin(0.5).setDepth(5);
    this.rollMap();
  }

  private routeRules(): RouteRules {
    const gen = GAMEPLAY_CONFIG.routeGen;
    const scene = GAMEPLAY_CONFIG.scene;
    return {
      startX: gen.startX,
      baseX: scene.width - gen.baseInset,
      endX: scene.width - gen.baseInset + gen.endPastBase,
      minY: GAMEPLAY_CONFIG.hud.topHeight + gen.hudPadding,
      maxY: scene.height - GAMEPLAY_CONFIG.hud.dockHeight - gen.hudPadding,
      minX: gen.slotMargin,
      maxX: scene.width - gen.slotMargin,
      turnCount: gen.turnCount,
      minLeg: gen.minLeg,
      slotCount: gen.slotCount,
      slotOffset: gen.slotOffset,
      corridorHalfWidth: gen.corridorHalfWidth,
    };
  }

  private rollMap(): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
    const layout = generateRoute(seed, this.routeRules());
    this.route = layout.route;
    this.basePoint = layout.base;
    this.pathTiles.forEach((tile) => tile.destroy());
    this.pathTiles = [];
    this.stampPath();
    this.baseSprite.setPosition(this.basePoint.x, this.basePoint.y);
    this.baseLabel.setPosition(this.basePoint.x, this.basePoint.y + GAMEPLAY_CONFIG.routeGen.baseLabelOffset);
    this.rebuildSlots(layout.slots);
  }

  private rebuildSlots(points: Point[]): void {
    this.slots.forEach((slot) => {
      slot.marker.destroy();
      slot.label.destroy();
    });
    this.slots = points.map((point) => this.createSlot(point.x, point.y));
  }

  private createSlot(x: number, y: number): BuildSlot {
    const marker = this.add.image(x, y, 'tile-slot')
      .setDisplaySize(40, 40)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    marker.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
      event.stopPropagation();
      this.selectOrBuildTower(x, y);
    });
    const label = this.add.text(x, y, '+', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#cde8c1',
    }).setOrigin(0.5).setDepth(3);
    return { x, y, marker, label, tower: null };
  }

  private stampPath(): void {
    for (let index = 0; index < this.route.length - 1; index += 1) {
      const start = this.route[index];
      const end = this.route[index + 1];
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const steps = Math.ceil(length / 16);
      const nx = -dy / length;
      const ny = dx / length;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = start.x + dx * t;
        const y = start.y + dy * t;
        for (const offset of [-18, 0, 18]) {
          const texture = offset === 0 ? 'tile-path' : 'tile-path-edge';
          this.pathTiles.push(this.add.image(x + nx * offset, y + ny * offset, texture).setDepth(1));
        }
      }
    }
  }

  private createHud(): void {
    const width = GAMEPLAY_CONFIG.scene.width;
    const height = GAMEPLAY_CONFIG.scene.height;
    const top = GAMEPLAY_CONFIG.hud.topHeight;
    const dock = GAMEPLAY_CONFIG.hud.dockHeight;
    const dockTop = height - dock;
    const actionY = dockTop + 48;

    this.add.rectangle(width / 2, top / 2, width, top, 0x111d21).setDepth(10);
    this.add.rectangle(width / 2, top, width, 2, 0x405450).setDepth(11);
    this.add.text(16, 9, 'LAST LINE', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#d8f4dd',
    }).setDepth(12);
    this.waveText = this.add.text(132, 12, 'ВОЛНА 0', this.hudStyle(12, '#e5e8d2')).setDepth(12);
    this.coinsText = this.add.text(250, 12, 'МОНЕТЫ 110', this.hudStyle(12, '#f3cf79')).setDepth(12);
    this.baseText = this.add.text(400, 12, 'БАЗА 100', this.hudStyle(12, '#91e0b4')).setDepth(12);
    this.playerText = this.add.text(520, 12, 'ГЕРОЙ 100', this.hudStyle(12, '#ff9f8e')).setDepth(12);
    this.phaseText = this.add.text(650, 13, 'ФАЗА 1', this.hudStyle(10, '#f3cf79')).setDepth(12);

    const pause = this.add.rectangle(902, top / 2, 78, 26, 0x293b3b)
      .setStrokeStyle(1, 0x759182).setInteractive({ useHandCursor: true }).setDepth(12);
    pause.on('pointerdown', () => this.togglePause());
    this.add.text(902, top / 2, 'ПАУЗА', this.hudStyle(10, '#e5efe5')).setOrigin(0.5).setDepth(13);

    this.add.rectangle(width / 2, dockTop + dock / 2, width, dock, 0x111d21).setDepth(10);
    this.add.rectangle(width / 2, dockTop, width, 2, 0x405450).setDepth(11);
    this.statusText = this.add.text(16, dockTop + 8, 'Нажми B, чтобы открыть строительство', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '12px', color: '#c5d6cc',
      wordWrap: { width: 500 },
    }).setDepth(12);
    const shopButton = this.add.rectangle(598, dockTop + 18, 96, 24, 0x3a3420)
      .setStrokeStyle(1, 0xf3cf79).setInteractive({ useHandCursor: true }).setDepth(12);
    shopButton.on('pointerdown', () => this.toggleShop());
    this.add.text(598, dockTop + 18, 'ЛАВКА', this.hudStyle(10, '#f3cf79')).setOrigin(0.5).setDepth(13);

    this.addWeaponButton('pulse', 168, actionY);
    this.addWeaponButton('rail', 292, actionY);
    this.addWeaponButton('scatter', 416, actionY);
    this.buildButton = this.add.rectangle(560, actionY, 124, 32, 0x263b38)
      .setStrokeStyle(1, 0x8fbf9a).setInteractive({ useHandCursor: true }).setDepth(12);
    this.buildButton.on('pointerdown', () => this.toggleBuildSheet());
    this.add.text(560, actionY, 'B СТРОИТЬ', this.hudStyle(10, '#d9e8dc')).setOrigin(0.5).setDepth(13);
    this.fireKeyButton = this.add.rectangle(700, dockTop + 18, 92, 24, 0x263b38)
      .setStrokeStyle(1, 0xf1b57d).setDepth(12);
    this.fireCooldownText = this.add.text(700, dockTop + 18, 'SPACE', this.hudStyle(10, '#fff0d9')).setOrigin(0.5).setDepth(13);
    this.pulseKeyButton = this.add.rectangle(804, dockTop + 18, 64, 24, 0x263b38)
      .setStrokeStyle(1, 0x7de0ca).setDepth(12);
    this.pulseKeyLabel = this.add.text(804, dockTop + 18, 'Q', this.hudStyle(12, '#d5fff3')).setOrigin(0.5).setDepth(13);
    this.createBuildSheet(width, height);
    this.createShop(width, height);

    this.upgradeButton = this.add.rectangle(760, actionY, 116, 32, 0x263b38)
      .setStrokeStyle(1, 0x637d70).setInteractive({ useHandCursor: true }).setDepth(12);
    this.upgradeButton.on('pointerdown', () => this.upgradeSelectedTower());
    this.upgradeLabel = this.add.text(760, actionY, 'УЛУЧШИТЬ', this.hudStyle(9, '#a6b8ae'))
      .setOrigin(0.5).setDepth(13);
    this.sellButton = this.add.rectangle(888, actionY, 116, 32, 0x3a2a28)
      .setStrokeStyle(1, 0xc98474).setInteractive({ useHandCursor: true }).setDepth(12);
    this.sellButton.on('pointerdown', () => this.sellSelectedTower());
    this.sellLabel = this.add.text(888, actionY, 'ПРОДАТЬ', this.hudStyle(9, '#f0c2b6'))
      .setOrigin(0.5).setDepth(13);
    this.refreshHotkeyHighlights();
  }

  private createBuildSheet(width: number, height: number): void {
    const sheetHeight = GAMEPLAY_CONFIG.hud.buildSheetHeight;
    this.buildSheet = this.add.container(0, height).setDepth(15);
    const panel = this.add.rectangle(width / 2, sheetHeight / 2, width, sheetHeight, 0x182428)
      .setStrokeStyle(1, 0x405450)
      .setInteractive();
    const title = this.add.text(24, sheetHeight / 2, 'СТРОИТЕЛЬСТВО', this.hudStyle(11, '#d5e7c8')).setOrigin(0, 0.5);
    this.buildSheet.add([panel, title]);
    this.towerKinds().forEach((kind, index) => {
      this.addTowerTypeButton(kind, 250 + index * 155, sheetHeight / 2);
    });
  }

  private towerKinds(): TowerKind[] {
    return ['cannon', 'rapid', 'cryo', 'homing'];
  }

  private addTowerTypeButton(kind: TowerKind, x: number, y: number): void {
    const spec = GAMEPLAY_CONFIG.tower[kind];
    const button = this.add.rectangle(x, y, 136, 34, 0x263b38)
      .setStrokeStyle(2, spec.color)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => this.selectTowerKind(kind));
    const label = this.add.text(x, y, `${spec.shortLabel} · ${spec.cost}`, this.hudStyle(11, '#d9e8dc')).setOrigin(0.5);
    this.buildSheet.add([button, label]);
    this.towerTypeButtons.push(button);
  }

  private toggleBuildSheet(): void {
    if (this.mode !== 'playing') return;
    if (!this.buildSheetOpen) this.setShop(false);
    this.setBuildSheet(!this.buildSheetOpen, true);
  }

  private createShop(width: number, height: number): void {
    const panelHeight = GAMEPLAY_CONFIG.shop.panelHeight;
    this.shopPanel = this.add.container(0, height).setDepth(16);
    const panel = this.add.rectangle(width / 2, panelHeight / 2, width, panelHeight, 0x241e12)
      .setStrokeStyle(1, 0x8a7040)
      .setInteractive();
    const title = this.add.text(24, panelHeight / 2, 'ЛАВКА', this.hudStyle(11, '#f3cf79')).setOrigin(0, 0.5);
    this.shopPanel.add([panel, title]);
    this.shopSkinLabel = this.addShopOffer(280, panelHeight / 2, () => this.buyHeroSkin());
    this.shopCharmLabel = this.addShopOffer(620, panelHeight / 2, () => this.buyCharm());
    this.refreshShopLabels();
  }

  private addShopOffer(x: number, y: number, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add.rectangle(x, y, 250, 34, 0x3a3420)
      .setStrokeStyle(2, 0xf3cf79)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', onClick);
    const label = this.add.text(x, y, '', this.hudStyle(11, '#f8e7b0')).setOrigin(0.5);
    this.shopPanel.add([button, label]);
    return label;
  }

  private toggleShop(): void {
    if (this.mode !== 'playing') return;
    if (!this.shopOpen) this.setBuildSheet(false, true);
    this.setShop(!this.shopOpen);
  }

  private setShop(open: boolean): void {
    this.shopOpen = open;
    const openY = GAMEPLAY_CONFIG.scene.height
      - GAMEPLAY_CONFIG.hud.dockHeight
      - GAMEPLAY_CONFIG.shop.panelHeight;
    const y = open ? openY : GAMEPLAY_CONFIG.scene.height;
    this.tweens.killTweensOf(this.shopPanel);
    this.tweens.add({
      targets: this.shopPanel,
      y,
      duration: 160,
      ease: 'Quad.easeOut',
    });
  }

  private buyHeroSkin(): void {
    if (this.heroSkinOwned) {
      this.statusText.setText('ПЛАЩ УЖЕ КУПЛЕН');
      return;
    }
    const price = GAMEPLAY_CONFIG.shop.heroSkin.price;
    if (!this.spendCoins(price)) return;
    this.heroSkinOwned = true;
    this.saveHeroSkin();
    this.applyHeroSkin();
    this.statusText.setText('ПЛАЩ КУПЛЕН');
    this.refreshShopLabels();
    this.refreshHud();
  }

  private buyCharm(): void {
    if (this.charmActive) {
      this.statusText.setText('АМУЛЕТ УЖЕ ДЕЙСТВУЕТ В ЭТОМ ЗАБЕГЕ');
      return;
    }
    const price = GAMEPLAY_CONFIG.shop.charm.price;
    if (!this.spendCoins(price)) return;
    this.charmActive = true;
    this.statusText.setText('АМУЛЕТ УСИЛИЛ ОРУЖИЕ ГЕРОЯ НА ЭТОТ ЗАБЕГ');
    this.refreshShopLabels();
    this.refreshHud();
  }

  private spendCoins(price: number): boolean {
    if (this.mode !== 'playing') return false;
    if (this.coins < price) {
      this.statusText.setText(`НУЖНО ${price} МОНЕТ`);
      return false;
    }
    this.coins -= price;
    return true;
  }

  private refreshShopLabels(): void {
    const skin = GAMEPLAY_CONFIG.shop.heroSkin;
    const charm = GAMEPLAY_CONFIG.shop.charm;
    this.shopSkinLabel.setText(this.heroSkinOwned ? `${skin.name} · КУПЛЕНО` : `${skin.name} · ${skin.price}`);
    this.shopCharmLabel.setText(this.charmActive ? `${charm.name} · АКТИВЕН` : `${charm.name} · ${charm.price}`);
  }

  private applyHeroSkin(): void {
    const texture = this.heroSkinOwned ? GAMEPLAY_CONFIG.shop.heroSkin.texture : 'hero';
    this.player.setTexture(texture);
  }

  private readHeroSkin(): boolean {
    try {
      return window.localStorage.getItem('last-line-hero-skin') === GAMEPLAY_CONFIG.shop.heroSkin.id;
    } catch {
      return false;
    }
  }

  private saveHeroSkin(): void {
    try {
      window.localStorage.setItem('last-line-hero-skin', GAMEPLAY_CONFIG.shop.heroSkin.id);
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }

  private setBuildSheet(open: boolean, animate: boolean): void {
    this.buildSheetOpen = open;
    const openY = GAMEPLAY_CONFIG.scene.height
      - GAMEPLAY_CONFIG.hud.dockHeight
      - GAMEPLAY_CONFIG.hud.buildSheetHeight;
    const y = open ? openY : GAMEPLAY_CONFIG.scene.height;
    this.tweens.killTweensOf(this.buildSheet);
    if (!animate) {
      this.buildSheet.y = y;
      return;
    }
    this.tweens.add({
      targets: this.buildSheet,
      y,
      duration: 160,
      ease: 'Quad.easeOut',
    });
  }

  private addWeaponButton(kind: WeaponKind, x: number, y: number): void {
    const labels: Record<WeaponKind, string> = {
      pulse: '1 КАРАБИН',
      rail: '2 РЕЛЬСА',
      scatter: '3 ДРОБЬ',
    };
    const button = this.add.rectangle(x, y, 110, 32, 0x263b38)
      .setStrokeStyle(1, 0x759182).setInteractive({ useHandCursor: true }).setDepth(12);
    button.on('pointerdown', () => this.selectWeapon(kind));
    this.add.text(x, y, labels[kind], this.hudStyle(9, '#d9e8dc')).setOrigin(0.5).setDepth(13);
    this.weaponButtons.push(button);
  }

  private hudStyle(fontSize: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold', color };
  }

  private createActors(): void {
    this.player = this.add.image(this.playerX, this.playerY, 'hero').setDepth(7);
    this.createMobileButtons();
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      b: Phaser.Input.Keyboard.KeyCodes.B,
    }) as Keys;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      const dockTop = GAMEPLAY_CONFIG.scene.height - GAMEPLAY_CONFIG.hud.dockHeight;
      if (this.mode !== 'playing' || currentlyOver.length > 0
        || pointer.y < GAMEPLAY_CONFIG.hud.topHeight || pointer.y > dockTop) return;
      this.pointerTarget = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.mode === 'playing' && pointer.isDown && this.pointerTarget) {
        this.pointerTarget.set(pointer.x, pointer.y);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { this.pointerTarget = null; });
  }

  private createMobileButtons(): void {
    if (!this.sys.game.device.input.touch) return;
    const buttonY = GAMEPLAY_CONFIG.scene.height - GAMEPLAY_CONFIG.hud.dockHeight - 46;
    const fire = this.add.circle(884, buttonY, 34, 0x8b593e, 0.9)
      .setStrokeStyle(2, 0xf1b57d).setInteractive().setDepth(20);
    const pulse = this.add.circle(805, buttonY, 29, 0x315b61, 0.9)
      .setStrokeStyle(2, 0x7de0ca).setInteractive().setDepth(20);
    this.add.text(884, buttonY, 'ОГОНЬ', this.hudStyle(9, '#fff0d9')).setOrigin(0.5).setDepth(21);
    this.add.text(805, buttonY, 'Q', this.hudStyle(15, '#d5fff3')).setOrigin(0.5).setDepth(21);
    fire.on('pointerdown', () => { this.fireButtonHeld = true; });
    fire.on('pointerup', () => { this.fireButtonHeld = false; });
    fire.on('pointerout', () => { this.fireButtonHeld = false; });
    pulse.on('pointerdown', () => { this.pulseButtonHeld = true; });
    pulse.on('pointerup', () => { this.pulseButtonHeld = false; });
    pulse.on('pointerout', () => { this.pulseButtonHeld = false; });
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.modal?.destroy(true);
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      GAMEPLAY_CONFIG.scene.width,
      GAMEPLAY_CONFIG.scene.height,
      0x071015,
      0.86,
    );
    const panel = this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      630,
      380,
      0x142126,
    )
      .setStrokeStyle(2, 0x4ad8b8);
    const title = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 212, 'LAST LINE', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '42px', fontStyle: 'bold', color: '#c3ffdf',
    }).setOrigin(0.5);
    const pitch = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 282,
      'Сдержи колонну на пути к базе.\nСтрой оборону, усиливай башни и лично вступай в бой.', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: '#dbe8df',
        align: 'center', lineSpacing: 9,
      }).setOrigin(0.5);
    const controls = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 350,
      'WASD — движение   •   1 2 3 — оружие   •   Пробел — огонь   •   Q — ЭМИ   •   B — стройка   •   P — пауза', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '12px', color: '#91aaa0',
      }).setOrigin(0.5);
    this.modal.add([overlay, panel, title, pitch, controls]);
    this.addButton(
      this.modal,
      GAMEPLAY_CONFIG.scene.width / 2,
      420,
      190,
      48,
      'НАЧАТЬ ОБОРОНУ',
      () => this.startGame(),
      0x208e76,
    );
  }

  private addButton(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    callback: () => void,
    color: number,
  ): void {
    const button = this.add.rectangle(x, y, width, height, color)
      .setStrokeStyle(2, 0xc8ffe7).setInteractive({ useHandCursor: true });
    button.on('pointerdown', callback);
    const text = this.add.text(x, y, label, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f4fff8',
    }).setOrigin(0.5);
    parent.add([button, text]);
  }

  private startGame(): void {
    this.modal?.destroy(true);
    this.modal = null;
    this.clearRun();
    this.rollMap();
    this.mode = 'playing';
    this.wave = 0;
    this.baseHealth = GAMEPLAY_CONFIG.base.maxHealth;
    this.coins = GAMEPLAY_CONFIG.economy.startingCoins;
    this.kills = 0;
    this.playerHealth = GAMEPLAY_CONFIG.player.maxHealth;
    this.playerX = GAMEPLAY_CONFIG.player.start.x;
    this.playerY = GAMEPLAY_CONFIG.player.start.y;
    this.playerFireCooldown = 0;
    this.playerDamageCooldown = 0;
    this.pulseCooldown = 0;
    this.phase = 1;
    this.phaseAnnouncementRemaining = 0;
    this.selectedTowerKind = 'cannon';
    this.selectedWeapon = 'pulse';
    this.selectedTower = null;
    this.setBuildSheet(false, false);
    this.setShop(false);
    this.charmActive = false;
    this.refreshShopLabels();
    this.refreshTowerTypeButtons();
    this.refreshWeaponButtons();
    this.player.setPosition(this.playerX, this.playerY).setVisible(true).clearTint().setRotation(0);
    this.pointerTarget = null;
    this.statusText.setText('Построй башни на площадках или отбивай врагов лично.');
    this.launchWave();
    this.refreshHud();
  }

  private clearRun(): void {
    this.enemies.forEach((enemy) => {
      enemy.body.destroy();
      enemy.healthBar.destroy();
    });
    this.towers.forEach((tower) => {
      tower.sprite.destroy();
      tower.levelLabel.destroy();
      tower.rangeRing.destroy();
    });
    this.projectiles.forEach((projectile) => projectile.body.destroy());
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.selectedTower = null;
    this.slots.forEach((slot) => {
      slot.tower = null;
      slot.marker.setVisible(true);
      slot.label.setVisible(true);
    });
    this.pulseEffect?.destroy();
    this.pulseEffect = null;
  }

  private updatePausedKeys(): void {
    if (this.mode === 'menu' && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
      this.startGame();
    } else if (this.mode === 'paused'
      && (Phaser.Input.Keyboard.JustDown(this.keys.escape) || Phaser.Input.Keyboard.JustDown(this.keys.p))) {
      this.resumeGame();
    } else if (this.mode === 'gameover' && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.startGame();
    }
  }

  private movePlayer(seconds: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.escape) || Phaser.Input.Keyboard.JustDown(this.keys.p)) {
      this.togglePause();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.q) || this.pulseButtonHeld) {
      this.usePulse();
      this.pulseButtonHeld = false;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.b)) this.toggleBuildSheet();
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.selectWeapon('pulse');
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.selectWeapon('rail');
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.selectWeapon('scatter');

    let dx = Number(this.keys.right.isDown || this.keys.d.isDown) - Number(this.keys.left.isDown || this.keys.a.isDown);
    let dy = Number(this.keys.down.isDown || this.keys.s.isDown) - Number(this.keys.up.isDown || this.keys.w.isDown);
    if (dx === 0 && dy === 0 && this.pointerTarget) {
      dx = this.pointerTarget.x - this.playerX;
      dy = this.pointerTarget.y - this.playerY;
      if (Math.hypot(dx, dy) < GAMEPLAY_CONFIG.player.touchMoveThreshold) {
        this.pointerTarget = null;
        dx = 0;
        dy = 0;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.playerX += (dx / length) * GAMEPLAY_CONFIG.player.speed * seconds;
      this.playerY += (dy / length) * GAMEPLAY_CONFIG.player.speed * seconds;
    }
    this.playerX = Phaser.Math.Clamp(
      this.playerX,
      GAMEPLAY_CONFIG.player.bounds.left,
      GAMEPLAY_CONFIG.scene.width - GAMEPLAY_CONFIG.player.bounds.right,
    );
    this.playerY = Phaser.Math.Clamp(
      this.playerY,
      GAMEPLAY_CONFIG.player.bounds.top,
      GAMEPLAY_CONFIG.scene.height - GAMEPLAY_CONFIG.player.bounds.bottom,
    );
    this.player.setPosition(this.playerX, this.playerY);

    const target = this.findClosestEnemy(this.playerX, this.playerY, GAMEPLAY_CONFIG.player.targetRange);
    if (target) {
      this.player.setRotation(Phaser.Math.Angle.Between(this.playerX, this.playerY, target.body.x, target.body.y));
    } else if (dx !== 0 || dy !== 0) {
      this.player.setRotation(Math.atan2(dy, dx));
    }

    if ((this.keys.space.isDown || this.fireButtonHeld) && this.playerFireCooldown <= 0 && target) {
      this.fireHeroWeapon(target);
    }

    if (this.invulnerableTimer <= 0) this.player.clearTint();
  }

  private findClosestEnemy(x: number, y: number, range: number): Enemy | null {
    let target: Enemy | null = null;
    let closestDistance = range;
    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(x, y, enemy.body.x, enemy.body.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        target = enemy;
      }
    }
    return target;
  }

  private heroWeaponDamage(baseDamage: number): number {
    return this.charmActive ? baseDamage * GAMEPLAY_CONFIG.shop.charm.damageMultiplier : baseDamage;
  }

  private fireHeroWeapon(target: Enemy): void {
    const angle = Phaser.Math.Angle.Between(this.playerX, this.playerY, target.body.x, target.body.y);
    if (this.selectedWeapon === 'pulse') {
      const spec = GAMEPLAY_CONFIG.weapon.pulse;
      this.fireProjectile(this.playerX, this.playerY, target, this.heroWeaponDamage(spec.damage), spec.speed, 'player', { color: spec.color });
      this.playerFireCooldown = spec.cooldown;
      return;
    }

    if (this.selectedWeapon === 'rail') {
      const spec = GAMEPLAY_CONFIG.weapon.rail;
      this.fireProjectile(this.playerX, this.playerY, target, this.heroWeaponDamage(spec.damage), spec.speed, 'player', {
        color: spec.color,
        pierce: spec.pierce,
        lifetime: spec.lifetime,
      });
      this.playerFireCooldown = spec.cooldown;
      return;
    }

    const spec = GAMEPLAY_CONFIG.weapon.scatter;
    const pelletCount = spec.pelletCount ?? 1;
    for (let index = 0; index < pelletCount; index += 1) {
      const spreadIndex = index - (pelletCount - 1) / 2;
      this.fireProjectile(this.playerX, this.playerY, target, this.heroWeaponDamage(spec.damage), spec.speed, 'player', {
        color: spec.color,
        lifetime: spec.lifetime,
      }, angle + spreadIndex * (spec.spreadAngle ?? 0));
    }
    this.playerFireCooldown = spec.cooldown;
  }

  private selectTowerKind(kind: TowerKind): void {
    this.selectedTowerKind = kind;
    this.selectedTower = null;
    this.showTowerRange(null);
    this.refreshTowerTypeButtons();
    const spec = GAMEPLAY_CONFIG.tower[kind];
    this.statusText.setText(`${spec.name.toUpperCase()} · ${spec.cost} МОНЕТ · ${spec.upgradeDescription}`);
    this.refreshUpgradeButton();
  }

  private refreshTowerTypeButtons(): void {
    this.towerTypeButtons.forEach((button, index) => {
      const kind = this.towerKinds()[index];
      if (!kind) return;
      const selected = kind === this.selectedTowerKind;
      button.setFillStyle(selected ? GAMEPLAY_CONFIG.tower[kind].color : 0x263b38);
      button.setAlpha(selected ? 1 : GAMEPLAY_CONFIG.ui.unselectedButtonAlpha);
    });
  }

  private selectWeapon(kind: WeaponKind): void {
    this.selectedWeapon = kind;
    this.refreshWeaponButtons();
    const names: Record<WeaponKind, string> = {
      pulse: 'КАРАБИН: сбалансированный одиночный выстрел',
      rail: 'РЕЛЬСА: мощный пробивающий заряд',
      scatter: 'ДРОБОВИК: веер из пяти близких зарядов',
    };
    this.statusText.setText(names[kind]);
  }

  private refreshWeaponButtons(): void {
    const fireReady = this.playerFireCooldown <= 0;
    this.weaponButtons.forEach((button, index) => {
      const kind = (['pulse', 'rail', 'scatter'] as const)[index];
      if (!kind) return;
      const selected = kind === this.selectedWeapon;
      button.setFillStyle(selected ? 0x397960 : 0x263b38);
      button.setAlpha(selected
        ? (fireReady ? 1 : 0.45)
        : GAMEPLAY_CONFIG.ui.unselectedButtonAlpha);
      button.setStrokeStyle(selected && fireReady ? 2 : 1, selected ? 0xf3cf79 : 0x759182);
    });
  }

  private refreshHotkeyHighlights(): void {
    const playing = this.mode === 'playing';
    const fireReady = playing && this.playerFireCooldown <= 0;
    const pulseReady = playing && this.pulseCooldown <= 0;
    this.fireKeyButton.setFillStyle(fireReady ? 0x8b593e : 0x263b38);
    this.fireKeyButton.setAlpha(fireReady ? 1 : 0.45);
    this.fireCooldownText.setText(this.playerFireCooldown > 0 ? this.playerFireCooldown.toFixed(1) : 'SPACE');
    this.pulseKeyButton.setFillStyle(pulseReady ? 0x2f6d66 : 0x263b38);
    this.pulseKeyButton.setAlpha(pulseReady ? 1 : 0.45);
    this.pulseKeyLabel.setText(this.pulseCooldown > 0 ? this.pulseCooldown.toFixed(1) : 'Q');
    this.buildButton.setFillStyle(this.buildSheetOpen ? 0x2f6a52 : 0x263b38);
    this.buildButton.setAlpha(playing ? 1 : 0.5);
    this.buildButton.setStrokeStyle(2, this.buildSheetOpen ? 0xf3cf79 : 0x8fbf9a);
    this.refreshWeaponButtons();
  }

  private usePulse(): void {
    if (this.pulseCooldown > 0) return;
    this.pulseCooldown = GAMEPLAY_CONFIG.pulse.cooldown;
    [...this.enemies].forEach((enemy) => {
      const distance = Phaser.Math.Distance.Between(this.playerX, this.playerY, enemy.body.x, enemy.body.y);
      if (distance <= GAMEPLAY_CONFIG.pulse.radius) this.damageEnemy(enemy, GAMEPLAY_CONFIG.pulse.damage);
    });
    this.pulseEffect?.destroy();
    this.pulseEffect = this.add.circle(
      this.playerX,
      this.playerY,
      GAMEPLAY_CONFIG.pulse.radius,
      0x59e4c2,
      0.1,
    )
      .setStrokeStyle(3, 0x86ffe0, 0.9).setDepth(6);
    this.time.delayedCall(GAMEPLAY_CONFIG.pulse.effectDurationMs, () => {
      this.pulseEffect?.destroy();
      this.pulseEffect = null;
    });
  }

  private updateEnemies(seconds: number): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy) continue;
      if (enemy.slowTimer > 0) enemy.slowTimer = Math.max(0, enemy.slowTimer - seconds);
      this.moveEnemy(enemy, seconds);
      this.animateEnemy(enemy, seconds);
      this.syncEnemyHealthBar(enemy);
      if (enemy.segment >= this.route.length - 1) {
        enemy.body.destroy();
        enemy.healthBar.destroy();
        this.enemies.splice(index, 1);
        const breachDamage = enemy.kind === 'boss'
          ? GAMEPLAY_CONFIG.base.bossBreachDamage
          : enemy.kind === 'brute'
            ? GAMEPLAY_CONFIG.base.bruteBreachDamage
            : GAMEPLAY_CONFIG.base.breachDamage;
        this.baseHealth = Math.max(0, this.baseHealth - breachDamage);
        this.statusText.setText('ПРОРЫВ К БАЗЕ!');
        if (this.baseHealth <= 0) this.endGame('База разрушена');
        continue;
      }

      const distanceToHero = Phaser.Math.Distance.Between(this.playerX, this.playerY, enemy.body.x, enemy.body.y);
      if (distanceToHero < GAMEPLAY_CONFIG.player.collisionRange && this.playerDamageCooldown <= 0) {
        const damage = enemy.kind === 'boss'
          ? GAMEPLAY_CONFIG.player.bossDamage
          : GAMEPLAY_CONFIG.player.damage;
        this.playerHealth = Math.max(0, this.playerHealth - damage);
        this.playerDamageCooldown = GAMEPLAY_CONFIG.player.damageCooldown;
        this.invulnerableTimer = GAMEPLAY_CONFIG.player.invulnerabilityDuration;
        this.player.setTint(0xff776f);
        this.statusText.setText('ГЕРОЙ ПОЛУЧИЛ УРОН!');
        if (this.playerHealth <= 0) this.endGame('Герой повержен');
      }
    }
  }

  private animateEnemy(enemy: Enemy, seconds: number): void {
    enemy.animTime += seconds;
    const baseInterval = enemy.kind === 'flyer'
      ? GAMEPLAY_CONFIG.enemy.flyerFlapSeconds
      : GAMEPLAY_CONFIG.enemy.stepSeconds;
    const interval = baseInterval * (enemy.slowTimer > 0 ? 1.6 : 1);
    if (enemy.animTime < interval) return;
    enemy.animTime = 0;
    enemy.animFrame = enemy.animFrame === 0 ? 1 : 0;
    enemy.body.setTexture(this.enemyFrame(enemy));
  }

  private enemyFrame(enemy: Enemy): string {
    if (enemy.kind === 'flyer') return enemy.animFrame === 0 ? 'enemy-flyer' : 'enemy-flyer-flap';
    return enemy.animFrame === 0 ? `enemy-${enemy.kind}` : `enemy-${enemy.kind}-step`;
  }

  private moveEnemy(enemy: Enemy, seconds: number): void {
    if (enemy.kind === 'flyer') {
      this.moveFlyingEnemy(enemy, seconds);
      return;
    }
    this.moveEnemyAlongRoute(enemy, seconds);
  }

  private enemyMoveSpeed(enemy: Enemy): number {
    return enemy.slowTimer > 0 ? enemy.speed * enemy.slowFactor : enemy.speed;
  }

  private moveFlyingEnemy(enemy: Enemy, seconds: number): void {
    const goalX = this.basePoint.x;
    const goalY = this.basePoint.y;
    const dx = goalX - enemy.body.x;
    const dy = goalY - enemy.body.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= GAMEPLAY_CONFIG.wave.flyingArrivalRadius) {
      enemy.segment = this.route.length - 1;
      return;
    }
    const step = Math.min(this.enemyMoveSpeed(enemy) * seconds, distance);
    enemy.body.x += (dx / distance) * step;
    enemy.body.y += (dy / distance) * step;
  }

  private moveEnemyAlongRoute(enemy: Enemy, seconds: number): void {
    const speed = this.enemyMoveSpeed(enemy);
    let distanceLeft = speed * seconds;
    while (distanceLeft > 0 && enemy.segment < this.route.length - 1) {
      const next = this.route[enemy.segment + 1];
      if (!next) return;
      const dx = next.x - enemy.body.x;
      const dy = next.y - enemy.body.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance <= distanceLeft) {
        enemy.body.setPosition(next.x, next.y);
        distanceLeft -= distance;
        enemy.segment += 1;
      } else {
        enemy.body.x += (dx / distance) * distanceLeft;
        enemy.body.y += (dy / distance) * distanceLeft;
        distanceLeft = 0;
      }
    }
  }

  private updateTowerFire(seconds: number): void {
    this.towers.forEach((tower) => {
      tower.cooldown = Math.max(0, tower.cooldown - seconds);
      if (tower.cooldown > 0) return;
      const spec = GAMEPLAY_CONFIG.tower[tower.kind];
      const levelGain = tower.level - 1;
      const rangeGain = tower.kind === 'rapid'
        ? GAMEPLAY_CONFIG.tower.rapidRangePerLevel
        : GAMEPLAY_CONFIG.tower.otherRangePerLevel;
      const range = spec.range + levelGain * rangeGain;
      const target = this.findClosestEnemy(tower.x, tower.y, range);
      if (!target) return;

      tower.sprite.setRotation(Phaser.Math.Angle.Between(tower.x, tower.y, target.body.x, target.body.y));
      const damagePerLevel = tower.kind === 'cannon'
        ? GAMEPLAY_CONFIG.tower.cannonDamagePerLevel
        : tower.kind === 'rapid'
          ? GAMEPLAY_CONFIG.tower.rapidDamagePerLevel
          : GAMEPLAY_CONFIG.tower.otherDamagePerLevel;
      const damage = spec.damage + levelGain * damagePerLevel;
      const fireRate = tower.kind === 'rapid'
        ? Math.max(
          GAMEPLAY_CONFIG.tower.minimumRapidFireInterval,
          spec.fireInterval * Math.pow(GAMEPLAY_CONFIG.tower.rapidFireIntervalMultiplier, levelGain),
        )
        : Math.max(
          GAMEPLAY_CONFIG.tower.minimumOtherFireInterval,
          spec.fireInterval * (1 - levelGain * GAMEPLAY_CONFIG.tower.otherFireIntervalReductionPerLevel),
        );
      const effects = tower.kind === 'cannon'
        ? {
          color: spec.projectileColor,
          splashRadius: GAMEPLAY_CONFIG.tower.cannonSplashBaseRadius
            + tower.level * GAMEPLAY_CONFIG.tower.cannonSplashRadiusPerLevel,
        }
        : tower.kind === 'cryo'
          ? {
            color: spec.projectileColor,
            slowFactor: Math.max(
              GAMEPLAY_CONFIG.tower.cryoMinimumSlowFactor,
              GAMEPLAY_CONFIG.tower.cryoBaseSlowFactor - levelGain * GAMEPLAY_CONFIG.tower.cryoSlowFactorPerLevel,
            ),
            slowDuration: GAMEPLAY_CONFIG.tower.cryoBaseSlowDuration
              + levelGain * GAMEPLAY_CONFIG.tower.cryoSlowDurationPerLevel,
          }
          : tower.kind === 'homing'
            ? {
              color: spec.projectileColor,
              lifetime: GAMEPLAY_CONFIG.tower.homingProjectileLifetime,
              turnRate: GAMEPLAY_CONFIG.tower.homingTurnRate
                + levelGain * GAMEPLAY_CONFIG.tower.homingTurnRatePerLevel,
            }
            : { color: spec.projectileColor };
      const projectileSpeed = tower.kind === 'rapid'
        ? GAMEPLAY_CONFIG.tower.rapidProjectileSpeed
        : GAMEPLAY_CONFIG.tower.projectileSpeed;
      this.flashMuzzle(tower.x, tower.y, target.body.x, target.body.y, spec.projectileColor);
      this.fireProjectile(tower.x, tower.y, target, damage, projectileSpeed, 'tower', effects);
      tower.cooldown = fireRate;
    });
  }

  private fireProjectile(
    x: number,
    y: number,
    target: Enemy,
    damage: number,
    speed: number,
    source: Projectile['source'],
    options: {
      color?: number;
      pierce?: number;
      lifetime?: number;
      splashRadius?: number;
      slowFactor?: number;
      slowDuration?: number;
      turnRate?: number;
    } = {},
    angleOverride?: number,
  ): void {
    const angle = angleOverride ?? Phaser.Math.Angle.Between(x, y, target.body.x, target.body.y);
    const color = options.color ?? (source === 'player' ? 0xffd078 : 0x83e8cb);
    const radius = source === 'player'
      ? GAMEPLAY_CONFIG.projectile.playerRadius
      : GAMEPLAY_CONFIG.projectile.towerRadius;
    const turnRate = options.turnRate ?? 0;
    const body = turnRate > 0
      ? this.add.image(x, y, 'projectile-homing').setDepth(6).setRotation(angle)
      : this.add.circle(x, y, radius, color).setDepth(6);
    this.projectiles.push({
      body,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      damage,
      source,
      lifetime: options.lifetime ?? GAMEPLAY_CONFIG.projectile.defaultLifetime,
      pierce: options.pierce ?? GAMEPLAY_CONFIG.projectile.defaultPierce,
      hit: new Set<Enemy>(),
      splashRadius: options.splashRadius ?? GAMEPLAY_CONFIG.projectile.defaultSplashRadius,
      slowFactor: options.slowFactor ?? GAMEPLAY_CONFIG.projectile.defaultSlowFactor,
      slowDuration: options.slowDuration ?? GAMEPLAY_CONFIG.projectile.defaultSlowDuration,
      turnRate,
      steerTarget: turnRate > 0 ? target : null,
    });
  }

  private steerProjectile(projectile: Projectile, seconds: number): void {
    const target = projectile.steerTarget;
    if (!target || projectile.turnRate <= 0 || !this.enemies.includes(target)) return;
    const desired = Math.atan2(target.body.y - projectile.body.y, target.body.x - projectile.body.x);
    const current = Math.atan2(projectile.vy, projectile.vx);
    const next = this.rotateToward(current, desired, projectile.turnRate * seconds);
    projectile.vx = Math.cos(next) * projectile.speed;
    projectile.vy = Math.sin(next) * projectile.speed;
    this.aimHomingSprite(projectile);
  }

  private aimHomingSprite(projectile: Projectile): void {
    if (!(projectile.body instanceof Phaser.GameObjects.Image)) return;
    projectile.body.setRotation(Math.atan2(projectile.vy, projectile.vx));
  }

  private flashMuzzle(x: number, y: number, targetX: number, targetY: number, color: number): void {
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    const flash = this.add.circle(
      x + Math.cos(angle) * 20,
      y + Math.sin(angle) * 20,
      5,
      color,
      0.9,
    ).setDepth(6);
    this.time.delayedCall(GAMEPLAY_CONFIG.tower.muzzleFlashMs, () => flash.destroy());
  }

  private rotateToward(current: number, desired: number, maxStep: number): number {
    const fullTurn = Math.PI * 2;
    const delta = ((desired - current + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
    return current + Phaser.Math.Clamp(delta, -maxStep, maxStep);
  }

  private updateProjectiles(seconds: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
      this.steerProjectile(projectile, seconds);
      this.aimHomingSprite(projectile);
      projectile.body.x += projectile.vx * seconds;
      projectile.body.y += projectile.vy * seconds;
      projectile.lifetime -= seconds;
      let removeProjectile = false;
      for (const enemy of [...this.enemies]) {
        if (projectile.hit.has(enemy)) continue;
        const distance = Phaser.Math.Distance.Between(projectile.body.x, projectile.body.y, enemy.body.x, enemy.body.y);
        const collisionRadius = GAMEPLAY_CONFIG.enemy.collisionRadius
          + (enemy.kind === 'boss'
            ? GAMEPLAY_CONFIG.enemy.bossExtraCollisionRadius
            : GAMEPLAY_CONFIG.enemy.regularExtraCollisionRadius);
        if (distance <= collisionRadius) {
          projectile.hit.add(enemy);
          this.damageEnemy(enemy, projectile.damage);
          if (projectile.splashRadius > 0) {
            [...this.enemies].forEach((nearbyEnemy) => {
              if (nearbyEnemy === enemy) return;
              const splashDistance = Phaser.Math.Distance.Between(enemy.body.x, enemy.body.y, nearbyEnemy.body.x, nearbyEnemy.body.y);
              if (splashDistance <= projectile.splashRadius) {
                this.damageEnemy(nearbyEnemy, projectile.damage * GAMEPLAY_CONFIG.projectile.splashDamageMultiplier);
              }
            });
          }
          if (projectile.slowDuration > 0 && this.enemies.includes(enemy)) {
            enemy.slowFactor = projectile.slowFactor;
            enemy.slowTimer = Math.max(enemy.slowTimer, projectile.slowDuration);
          }
          if (projectile.pierce > 0) {
            projectile.pierce -= 1;
          } else {
            removeProjectile = true;
            break;
          }
        }
      }
      if (removeProjectile || projectile.lifetime <= 0 || projectile.body.x < 0
        || projectile.body.x > GAMEPLAY_CONFIG.scene.width
        || projectile.body.y < GAMEPLAY_CONFIG.hud.topHeight
        || projectile.body.y > GAMEPLAY_CONFIG.scene.height - GAMEPLAY_CONFIG.hud.dockHeight) {
        projectile.body.destroy();
        this.projectiles.splice(index, 1);
      }
    }
  }

  private syncEnemyHealthBar(enemy: Enemy): void {
    const width = enemy.kind === 'boss' ? 44 : enemy.kind === 'brute' ? 36 : 32;
    const height = 5;
    const lift = enemy.kind === 'boss' ? 30 : enemy.kind === 'brute' ? 26 : 22;
    const x = enemy.body.x - width / 2;
    const y = enemy.body.y - lift;
    const ratio = Phaser.Math.Clamp(enemy.health / enemy.maxHealth, 0, 1);
    enemy.healthBar.clear();
    enemy.healthBar.fillStyle(0x140e0c, 0.92);
    enemy.healthBar.fillRect(x - 1, y - 1, width + 2, height + 2);
    enemy.healthBar.fillStyle(ratio > 0.35 ? 0x7dce6a : 0xe05a4f, 1);
    enemy.healthBar.fillRect(x, y, Math.max(2, width * ratio), height);
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    enemy.health -= damage;
    if (enemy.health > 0) {
      this.syncEnemyHealthBar(enemy);
      return;
    }
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    enemy.healthBar.destroy();
    enemy.body.destroy();
    this.enemies.splice(index, 1);
    this.kills += 1;
    this.coins += enemy.bounty;
    if (enemy.kind === 'boss') {
      this.coins += GAMEPLAY_CONFIG.economy.bossKillBonus;
      this.statusText.setText('БОСС УНИЧТОЖЕН! +40 МОНЕТ');
    }
  }

  private launchWave(): void {
    this.wave += 1;
    this.waveDelay = 0;
    this.spawnQueue = [];
    const count = Math.min(
      GAMEPLAY_CONFIG.wave.initialEnemyCount + this.wave * GAMEPLAY_CONFIG.wave.enemiesPerWave,
      GAMEPLAY_CONFIG.wave.maxEnemies,
    );
    for (let index = 0; index < count; index += 1) {
      this.spawnQueue.push(this.enemyKindForSpawn(index, count));
    }
    this.spawnCooldown = GAMEPLAY_CONFIG.wave.initialSpawnDelay;
    this.statusText.setText(this.wave % GAMEPLAY_CONFIG.wave.bossEvery === 0
      ? `ВОЛНА ${this.wave}: БОСС В КОЛОННЕ`
      : `НАСТУПАЕТ ВОЛНА ${this.wave}`);
  }

  private updateWave(seconds: number): void {
    if (this.spawnQueue.length > 0) {
      this.spawnCooldown -= seconds;
      if (this.spawnCooldown <= 0) {
        const kind = this.spawnQueue.shift();
        if (kind) this.spawnEnemy(kind);
        this.spawnCooldown = this.enemySpawnInterval();
      }
      return;
    }
    if (this.enemies.length > 0) return;
    if (this.phase === 1 && this.wave === GAMEPLAY_CONFIG.phaseTwo.startsAfterWave) {
      this.beginPhaseTwoTransition();
      return;
    }
    if (this.waveDelay === 0) this.statusText.setText('МЕЖДУ ВОЛНАМИ МОЖНО ОТКРЫТЬ ЛАВКУ');
    this.waveDelay += seconds;
    if (this.waveDelay >= GAMEPLAY_CONFIG.wave.interWaveDelay) this.launchWave();
  }

  private beginPhaseTwoTransition(): void {
    this.phase = 2;
    this.enemies.forEach((enemy) => {
      enemy.speed *= GAMEPLAY_CONFIG.phaseTwo.enemySpeedMultiplier;
    });
    this.spawnCooldown = 0;
    this.waveDelay = 0;
    this.mode = 'phase-transition';
    this.phaseAnnouncementRemaining = GAMEPLAY_CONFIG.phaseTwo.announcementSeconds;

    this.modal?.destroy(true);
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      GAMEPLAY_CONFIG.scene.width,
      GAMEPLAY_CONFIG.scene.height,
      0x071015,
      0.94,
    ).setInteractive();
    const accent = this.add.rectangle(GAMEPLAY_CONFIG.scene.width / 2, 282, 360, 3, 0x4ad8b8);
    const title = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 320, 'ФАЗА 2', this.hudStyle(42, '#c3ffdf')).setOrigin(0.5);
    const subtitle = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 372, 'ВРАГИ БЫСТРЕЕ · ВОЛНЫ ЧАЩЕ', this.hudStyle(16, '#f3cf79'))
      .setOrigin(0.5);
    this.modal.add([overlay, accent, title, subtitle]);
  }

  private updatePhaseTransition(delta: number): void {
    this.phaseAnnouncementRemaining -= Math.min(delta / 1000, 0.05);
    if (this.phaseAnnouncementRemaining > 0) return;

    this.modal?.destroy(true);
    this.modal = null;
    this.mode = 'playing';
    this.statusText.setText('ФАЗА 2: ВРАГИ БЫСТРЕЕ, ВОЛНЫ ЧАЩЕ');
    this.launchWave();
  }

  private enemySpawnInterval(): number {
    const phaseMultiplier = this.phase === 2 ? GAMEPLAY_CONFIG.phaseTwo.spawnIntervalMultiplier : 1;
    const baseInterval = GAMEPLAY_CONFIG.wave.baseSpawnInterval
      - this.wave * GAMEPLAY_CONFIG.wave.spawnIntervalReductionPerWave;
    return Math.max(GAMEPLAY_CONFIG.wave.minimumSpawnInterval, baseInterval * phaseMultiplier);
  }

  private enemyKindForSpawn(index: number, count: number): EnemyKind {
    const wave = GAMEPLAY_CONFIG.wave;
    if (this.wave % wave.bossEvery === 0 && index === count - 1) return 'boss';
    if (this.wave >= wave.bruteStartWave && index % wave.bruteEvery === wave.bruteEvery - 1) return 'brute';
    if (this.wave >= wave.raiderStartWave && index % wave.raiderEvery === wave.raiderEvery - 1) return 'raider';
    if (this.wave >= wave.flyingStartWave && index % wave.flyingEvery === wave.flyingEvery - 1) return 'flyer';
    return 'scout';
  }

  private flyingSpawnPoint(): Point {
    const minY = GAMEPLAY_CONFIG.hud.topHeight + GAMEPLAY_CONFIG.wave.flyingSpawnPadding;
    const maxY = GAMEPLAY_CONFIG.scene.height
      - GAMEPLAY_CONFIG.hud.dockHeight
      - GAMEPLAY_CONFIG.wave.flyingSpawnPadding;
    return {
      x: GAMEPLAY_CONFIG.wave.flyingSpawnX,
      y: Phaser.Math.Between(minY, maxY),
    };
  }

  private spawnEnemy(kind: EnemyKind): void {
    const isBoss = kind === 'boss';
    const enemySpec = GAMEPLAY_CONFIG.enemy[kind];
    const stats = kind === 'boss'
      ? { ...enemySpec, hp: GAMEPLAY_CONFIG.wave.bossBaseHealth + this.wave * GAMEPLAY_CONFIG.wave.bossHealthPerWave }
      : enemySpec;
    const scale = 1 + this.wave * GAMEPLAY_CONFIG.wave.healthScalePerWave;
    const start = kind === 'flyer' ? this.flyingSpawnPoint() : this.route[0];
    const body = this.add.image(start.x, start.y, `enemy-${kind}`).setDepth(5);
    if (isBoss) body.setScale(1.05);
    const healthBar = this.add.graphics().setDepth(6);
    const enemy: Enemy = {
      body,
      healthBar,
      kind,
      health: stats.hp * scale,
      maxHealth: stats.hp * scale,
      speed: stats.speed * (1 + this.wave * GAMEPLAY_CONFIG.wave.speedScalePerWave)
        * (this.phase === 2 ? GAMEPLAY_CONFIG.phaseTwo.enemySpeedMultiplier : 1),
      bounty: stats.bounty,
      segment: 0,
      slowTimer: 0,
      slowFactor: 1,
      animTime: 0,
      animFrame: 0,
    };
    this.enemies.push(enemy);
    this.syncEnemyHealthBar(enemy);
  }

  private selectOrBuildTower(x: number, y: number): void {
    if (this.mode !== 'playing') return;
    const slot = this.slots.find((item) => item.x === x && item.y === y);
    if (!slot) return;
    if (slot.tower) {
      this.selectTower(slot.tower);
      this.setBuildSheet(false, true);
      return;
    }
    if (!this.buildSheetOpen) {
      this.statusText.setText('НАЖМИ B, ЧТОБЫ ОТКРЫТЬ СТРОИТЕЛЬСТВО');
      return;
    }
    const spec = GAMEPLAY_CONFIG.tower[this.selectedTowerKind];
    if (this.coins < spec.cost) {
      this.statusText.setText(`НУЖНО ${spec.cost} МОНЕТ ДЛЯ ${spec.name.toUpperCase()}`);
      return;
    }

    this.coins -= spec.cost;
    const rangeRing = this.add.circle(x, y, spec.range, spec.color, 0.08)
      .setStrokeStyle(1, spec.color, 0.6).setVisible(false).setDepth(1);
    const sprite = this.add.image(x, y, `tower-${this.selectedTowerKind}`)
      .setOrigin(0.4, 0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    const levelLabel = this.add.text(x, y + 22, '1', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#f4f5dd',
    }).setOrigin(0.5).setDepth(6);
    const tower: Tower = {
      x,
      y,
      kind: this.selectedTowerKind,
      level: 1,
      invested: spec.cost,
      cooldown: GAMEPLAY_CONFIG.tower.initialCooldown,
      sprite,
      levelLabel,
      rangeRing,
    };
    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
      event.stopPropagation();
      this.selectTower(tower);
    });
    slot.tower = tower;
    slot.marker.setVisible(false);
    slot.label.setVisible(false);
    this.towers.push(tower);
    this.selectedTower = tower;
    this.showTowerRange(tower);
    this.statusText.setText(`${spec.name.toUpperCase()} УСТАНОВЛЕНА · УР. 1`);
    this.setBuildSheet(false, true);
    this.refreshHud();
  }

  private selectTower(tower: Tower): void {
    this.selectedTower = tower;
    this.showTowerRange(tower);
    this.refreshUpgradeButton();
    this.statusText.setText(`БАШНЯ УР. ${tower.level} — МОЖНО УЛУЧШИТЬ`);
  }

  private showTowerRange(selected: Tower | null): void {
    this.towers.forEach((tower) => tower.rangeRing.setVisible(tower === selected));
  }

  private upgradeSelectedTower(): void {
    const tower = this.selectedTower;
    if (this.mode !== 'playing' || !tower) return;
    if (tower.level >= GAMEPLAY_CONFIG.tower.upgradeMaximumLevel) {
      this.statusText.setText('ЭТА БАШНЯ УЖЕ МАКСИМАЛЬНОГО УРОВНЯ');
      return;
    }
    const cost = this.towerUpgradeCost(tower);
    if (this.coins < cost) {
      this.statusText.setText(`НУЖНО ${cost} МОНЕТ ДЛЯ ПРОКАЧКИ`);
      return;
    }
    this.coins -= cost;
    tower.invested += cost;
    tower.level += 1;
    const spec = GAMEPLAY_CONFIG.tower[tower.kind];
    tower.sprite.setScale(1 + (tower.level - 1) * 0.08);
    if (tower.level === GAMEPLAY_CONFIG.tower.upgradeMaximumLevel) {
      tower.sprite.setTint(Phaser.Display.Color.ValueToColor(spec.color).darken(GAMEPLAY_CONFIG.tower.maximumLevelDarken).color);
    }
    tower.levelLabel.setText(String(tower.level));
    const rangeGain = tower.kind === 'rapid'
      ? GAMEPLAY_CONFIG.tower.rapidRangePerLevel
      : GAMEPLAY_CONFIG.tower.otherRangePerLevel;
    tower.rangeRing.setRadius(spec.range + (tower.level - 1) * rangeGain);
    this.statusText.setText(`${spec.name.toUpperCase()} · УР. ${tower.level}: ${spec.upgradeDescription.toUpperCase()}`);
    this.refreshHud();
  }

  private towerUpgradeCost(tower: Tower): number {
    return Math.round(GAMEPLAY_CONFIG.tower[tower.kind].cost * GAMEPLAY_CONFIG.economy.upgradeBaseCostMultiplier)
      + (tower.level - 1) * GAMEPLAY_CONFIG.economy.upgradeCostPerLevel;
  }

  private towerSellRefund(tower: Tower): number {
    return Math.round(tower.invested * GAMEPLAY_CONFIG.economy.sellRefundRatio);
  }

  private sellSelectedTower(): void {
    const tower = this.selectedTower;
    if (this.mode !== 'playing' || !tower) {
      this.statusText.setText('ВЫБЕРИ БАШНЮ, ЧТОБЫ ПРОДАТЬ');
      return;
    }
    const refund = this.towerSellRefund(tower);
    const slot = this.slots.find((item) => item.tower === tower);
    this.coins += refund;
    tower.sprite.destroy();
    tower.levelLabel.destroy();
    tower.rangeRing.destroy();
    this.towers = this.towers.filter((item) => item !== tower);
    if (slot) {
      slot.tower = null;
      slot.marker.setVisible(true);
      slot.label.setVisible(true);
    }
    this.selectedTower = null;
    this.showTowerRange(null);
    this.statusText.setText(`БАШНЯ ПРОДАНА · +${refund} МОНЕТ`);
    this.refreshHud();
  }

  private refreshUpgradeButton(): void {
    if (!this.selectedTower) {
      this.upgradeLabel.setText('УЛУЧШИТЬ');
      this.sellLabel.setText('ПРОДАТЬ');
      this.sellButton.setAlpha(0.45);
      return;
    }
    const refund = this.towerSellRefund(this.selectedTower);
    this.sellLabel.setText(`ПРОДАТЬ ${refund}`);
    this.sellButton.setAlpha(1);
    if (this.selectedTower.level >= GAMEPLAY_CONFIG.tower.upgradeMaximumLevel) {
      this.upgradeLabel.setText('МАКС.');
      return;
    }
    const cost = this.towerUpgradeCost(this.selectedTower);
    this.upgradeLabel.setText(`+УР ${cost}`);
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.setShop(false);
      this.setBuildSheet(false, false);
      this.mode = 'paused';
      this.modal = this.add.container(0, 0).setDepth(100);
      const overlay = this.add.rectangle(
        GAMEPLAY_CONFIG.scene.width / 2,
        GAMEPLAY_CONFIG.scene.height / 2,
        GAMEPLAY_CONFIG.scene.width,
        GAMEPLAY_CONFIG.scene.height,
        0x071015,
        0.8,
      );
      const panel = this.add.rectangle(
        GAMEPLAY_CONFIG.scene.width / 2,
        GAMEPLAY_CONFIG.scene.height / 2,
        430,
        240,
        0x142126,
      ).setStrokeStyle(2, 0x48d6be);
      const title = this.add.text(
        GAMEPLAY_CONFIG.scene.width / 2,
        258,
        'ПАУЗА',
        this.hudStyle(28, '#c3ffdf'),
      ).setOrigin(0.5);
      this.modal.add([overlay, panel, title]);
      this.addButton(
        this.modal,
        GAMEPLAY_CONFIG.scene.width / 2,
        330,
        210,
        46,
        'ПРОДОЛЖИТЬ',
        () => this.resumeGame(),
        0x208e76,
      );
    } else if (this.mode === 'paused') {
      this.resumeGame();
    }
  }

  private resumeGame(): void {
    this.modal?.destroy(true);
    this.modal = null;
    this.mode = 'playing';
  }

  private endGame(reason: string): void {
    if (this.mode === 'gameover') return;
    this.setShop(false);
    this.mode = 'gameover';
    this.pointerTarget = null;
    const newRecord = this.wave > this.bestWave;
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.saveBestWave(this.bestWave);
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      GAMEPLAY_CONFIG.scene.width,
      GAMEPLAY_CONFIG.scene.height,
      0x071015,
      0.86,
    );
    const panel = this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      590,
      330,
      0x142126,
    ).setStrokeStyle(2, 0xef886f);
    const title = this.add.text(
      GAMEPLAY_CONFIG.scene.width / 2,
      230,
      reason.toUpperCase(),
      this.hudStyle(27, '#ffac91'),
    ).setOrigin(0.5);
    const stats = this.add.text(GAMEPLAY_CONFIG.scene.width / 2, 296,
      `Волна: ${this.wave}   ·   Уничтожено врагов: ${this.kills}\nРекорд: ${this.bestWave}${newRecord ? '  ·  НОВЫЙ' : ''}`, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '16px', color: '#c4d8ce', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5);
    this.modal.add([overlay, panel, title, stats]);
    this.addButton(
      this.modal,
      GAMEPLAY_CONFIG.scene.width / 2,
      400,
      210,
      48,
      'ЗАНОВО',
      () => this.startGame(),
      0x208e76,
    );
  }

  private updateHud(): void {
    this.waveText.setText(`ВОЛНА ${String(this.wave).padStart(2, '0')}`);
    this.baseText.setText(`БАЗА ${this.baseHealth}`);
    this.coinsText.setText(`МОНЕТЫ ${this.coins}`);
    this.playerText.setText(`ГЕРОЙ ${this.playerHealth}`);
    this.phaseText.setText(this.phase === 2 ? 'ФАЗА 2' : 'ФАЗА 1');
    this.refreshUpgradeButton();
    this.refreshHotkeyHighlights();
  }

  private refreshHud(): void {
    this.updateHud();
  }

  private readBestWave(): number {
    try {
      return Number(window.localStorage.getItem('last-line-best-wave') ?? 0);
    } catch {
      return 0;
    }
  }

  private saveBestWave(wave: number): void {
    try {
      window.localStorage.setItem('last-line-best-wave', String(wave));
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }
}