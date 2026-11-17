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
  distanceWalked: number;
  animFrame: number;
  pose: 'side' | 'front' | 'back';
}

interface Tower {
  x: number;
  y: number;
  kind: TowerKind;
  level: number;
  invested: number;
  cooldown: number;
  sprite: Phaser.GameObjects.Image;
  barrel: Phaser.GameObjects.Image;
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
  q: Phaser.Input.Keyboard.Key;
  p: Phaser.Input.Keyboard.Key;
  escape: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
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
  private patrolTangent: Point = { x: 1, y: 0 };
  private patrolOrigin: Point = { x: 0, y: 0 };
  private patrolAlong = 0;
  private patrolDir: 1 | -1 = 1;
  private patrolSpan: number = GAMEPLAY_CONFIG.player.patrolSpan;

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
  private slotMenu: Phaser.GameObjects.Container | null = null;
  private slotMenuTarget: BuildSlot | null = null;
  private towerCard: Phaser.GameObjects.Container | null = null;
  private cardTower: Tower | null = null;
  private cardInfo: Phaser.GameObjects.Text | null = null;
  private cardUpgradeLabel: Phaser.GameObjects.Text | null = null;
  private cardSellLabel: Phaser.GameObjects.Text | null = null;
  private portrait!: Phaser.GameObjects.Image;
  private portraitCooldown!: Phaser.GameObjects.Text;
  private portraitHealth!: Phaser.GameObjects.Text;
  private hand!: Phaser.GameObjects.Image;
  private handFlash!: Phaser.GameObjects.Arc;
  private handTime = 0;
  private handClickTimer = 0;
  private handBuilt = false;
  private handWaved = false;
  private baseLivesBar!: Phaser.GameObjects.Graphics;
  private upcomingText!: Phaser.GameObjects.Text;

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
  private statusText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private shopPanel!: Phaser.GameObjects.Container;
  private shopOpen = false;
  private heroSkinOwned = false;
  private charmActive = false;
  private shopSkinLabel!: Phaser.GameObjects.Text;
  private shopCharmLabel!: Phaser.GameObjects.Text;
  private bestWave = 0;

  constructor() {
    super('DefenseScene');
  }

  preload(): void {
    for (const key of [
      'tile-grass', 'tile-path', 'tile-path-edge', 'tile-slot',
      'hero', 'hero-cape', 'base',
      ...this.enemyTextureKeys(),
      'tower-cannon', 'tower-rapid', 'tower-cryo', 'tower-homing',
      'tower-cannon-barrel', 'tower-rapid-barrel', 'tower-cryo-barrel', 'tower-homing-barrel',
      'projectile-homing', 'hand',
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
    this.handBuilt = this.readStoredFlag('last-line-hand-built');
    this.handWaved = this.readStoredFlag('last-line-hand-waved');
    this.showMenu();
  }

  update(_time: number, delta: number): void {
    if (this.mode === 'phase-transition') {
      this.hand.setVisible(false);
      this.updatePhaseTransition(delta);
      return;
    }

    if (this.mode !== 'playing') {
      this.hand.setVisible(false);
      this.updatePausedKeys();
      return;
    }

    const seconds = Math.min(delta / 1000, GAMEPLAY_CONFIG.scene.deltaLimitSeconds);
    this.updateHand(seconds);
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - seconds);
    this.playerDamageCooldown = Math.max(0, this.playerDamageCooldown - seconds);
    this.pulseCooldown = Math.max(0, this.pulseCooldown - seconds);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - seconds);

    this.readCombatKeys();
    this.patrolHero(seconds);
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
      maxY: scene.height - GAMEPLAY_CONFIG.hud.bottomReserve - gen.hudPadding,
      minX: gen.slotMargin,
      maxX: scene.width - gen.slotMargin,
      turnCount: gen.turnCount,
      minLeg: gen.minLeg,
      slotCount: gen.slotCount,
      slotOffset: gen.slotOffset,
      corridorHalfWidth: gen.corridorHalfWidth,
      slotRadius: gen.slotRadius,
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
    const lives = GAMEPLAY_CONFIG.hud.livesBar;
    const waveButton = GAMEPLAY_CONFIG.hud.waveButton;

    this.add.rectangle(width / 2, top / 2, width, top, 0x111d21).setDepth(10);
    this.add.rectangle(width / 2, top, width, 2, 0x405450).setDepth(11);
    this.createPortrait(top);
    this.coinsText = this.add.text(78, 12, 'МОНЕТЫ 110', this.hudStyle(13, '#f3cf79')).setDepth(12);
    this.baseLivesBar = this.add.graphics().setDepth(12);
    this.baseText = this.add.text(lives.x + lives.width + 8, 12, '100', this.hudStyle(13, '#91e0b4')).setDepth(12);
    this.waveText = this.add.text(390, 12, 'ВОЛНА 00', this.hudStyle(13, '#e5e8d2')).setDepth(12);
    this.phaseText = this.add.text(490, 13, 'ФАЗА 1', this.hudStyle(11, '#f3cf79')).setDepth(12);

    const shopButton = this.add.rectangle(640, top / 2, 88, 26, 0x3a3420)
      .setStrokeStyle(1, 0xf3cf79).setInteractive({ useHandCursor: true }).setDepth(12);
    shopButton.on('pointerdown', () => this.toggleShop());
    this.add.text(640, top / 2, 'ЛАВКА', this.hudStyle(11, '#f3cf79')).setOrigin(0.5).setDepth(13);

    const pause = this.add.rectangle(888, top / 2, 78, 26, 0x293b3b)
      .setStrokeStyle(1, 0x759182).setInteractive({ useHandCursor: true }).setDepth(12);
    pause.on('pointerdown', () => this.togglePause());
    this.add.text(888, top / 2, 'ПАУЗА', this.hudStyle(10, '#e5efe5')).setOrigin(0.5).setDepth(13);

    this.statusText = this.add.text(16, top + 8, 'Кликни площадку, чтобы выбрать башню.', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '12px', color: '#c5d6cc',
      wordWrap: { width: 520 },
    }).setDepth(12);
    this.createShop(width, height);

    this.add.rectangle(waveButton.x, waveButton.y, waveButton.width, waveButton.height, 0x8a3d32)
      .setStrokeStyle(2, 0xf3cf79).setInteractive({ useHandCursor: true }).setDepth(20)
      .on('pointerdown', () => this.callNextWaveEarly());
    this.add.text(waveButton.x, waveButton.y, 'ВОЛНА', this.hudStyle(13, '#fff0d9')).setOrigin(0.5).setDepth(21);
    this.upcomingText = this.add.text(waveButton.x, waveButton.y - 22, '', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#f8e7b0',
      align: 'center', wordWrap: { width: waveButton.width + 20 },
    }).setOrigin(0.5, 1).setDepth(21);
    this.drawBaseLives();
  }

  private createPortrait(top: number): void {
    const button = this.add.rectangle(30, top / 2, 40, 32, 0x142126)
      .setStrokeStyle(2, 0x7de0ca)
      .setInteractive({ useHandCursor: true })
      .setDepth(12);
    button.on('pointerdown', () => this.usePulse());
    this.portrait = this.add.image(30, top / 2, 'hero').setScale(0.5).setDepth(13);
    this.portraitCooldown = this.add.text(30, top - 1, '', this.hudStyle(8, '#d5fff3')).setOrigin(0.5, 1).setDepth(14);
    this.portraitHealth = this.add.text(30, top - 2, String(GAMEPLAY_CONFIG.player.maxHealth), this.hudStyle(8, '#ff9f8e'))
      .setOrigin(0.5, 0)
      .setDepth(14);
  }

  private drawBaseLives(): void {
    const bar = GAMEPLAY_CONFIG.hud.livesBar;
    const ratio = Phaser.Math.Clamp(this.baseHealth / GAMEPLAY_CONFIG.base.maxHealth, 0, 1);
    this.baseLivesBar.clear();
    this.baseLivesBar.fillStyle(0x1a2a28, 1);
    this.baseLivesBar.fillRect(bar.x, bar.y, bar.width, bar.height);
    this.baseLivesBar.fillStyle(ratio > 0.35 ? 0x91e0b4 : 0xe05a4f, 1);
    this.baseLivesBar.fillRect(bar.x, bar.y, bar.width * ratio, bar.height);
    this.baseLivesBar.lineStyle(1, 0x405450, 1);
    this.baseLivesBar.strokeRect(bar.x, bar.y, bar.width, bar.height);
  }

  private towerKinds(): TowerKind[] {
    return ['cannon', 'rapid', 'cryo', 'homing'];
  }

  private menuAnchor(x: number, y: number, menuWidth: number, menuHeight: number): Point {
    const margin = GAMEPLAY_CONFIG.hud.slotMenu.pad;
    const left = x + 28 + menuWidth > GAMEPLAY_CONFIG.scene.width - margin
      ? x - 28 - menuWidth
      : x + 28;
    const top = Phaser.Math.Clamp(
      y - menuHeight / 2,
      GAMEPLAY_CONFIG.hud.topHeight + margin,
      GAMEPLAY_CONFIG.scene.height - menuHeight - margin,
    );
    return { x: left, y: top };
  }

  private closeSlotMenu(): void {
    this.slotMenu?.destroy(true);
    this.slotMenu = null;
    this.slotMenuTarget = null;
  }

  private closeTowerCard(): void {
    this.towerCard?.destroy(true);
    this.towerCard = null;
    this.cardTower = null;
    this.cardInfo = null;
    this.cardUpgradeLabel = null;
    this.cardSellLabel = null;
  }

  private openSlotMenu(slot: BuildSlot): void {
    this.closeTowerCard();
    this.setShop(false);
    this.closeSlotMenu();
    const menu = GAMEPLAY_CONFIG.hud.slotMenu;
    const height = this.towerKinds().length * menu.rowHeight + menu.pad;
    const anchor = this.menuAnchor(slot.x, slot.y, menu.width, height);
    const container = this.add.container(anchor.x, anchor.y).setDepth(30);
    container.add(this.add.rectangle(menu.width / 2, height / 2, menu.width, height, 0x182428)
      .setStrokeStyle(1, 0x8fbf9a)
      .setInteractive());
    this.towerKinds().forEach((kind, index) => container.add(this.slotMenuRow(slot, kind, index)));
    this.slotMenu = container;
    this.slotMenuTarget = slot;
  }

  private slotMenuRow(slot: BuildSlot, kind: TowerKind, index: number): Phaser.GameObjects.Container {
    const menu = GAMEPLAY_CONFIG.hud.slotMenu;
    const spec = GAMEPLAY_CONFIG.tower[kind];
    const y = menu.pad + menu.rowHeight / 2 + index * menu.rowHeight;
    const row = this.add.container(0, 0);
    const button = this.add.rectangle(menu.width / 2, y, menu.width - 12, menu.rowHeight - 4, 0x263b38)
      .setStrokeStyle(2, spec.color)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => this.buildTower(slot, kind));
    row.add([
      button,
      this.add.image(24, y, `tower-${kind}`).setScale(0.42),
      this.add.text(46, y, `${spec.shortLabel} ${spec.cost}`, this.hudStyle(11, '#d9e8dc')).setOrigin(0, 0.5),
    ]);
    return row;
  }

  private openTowerCard(tower: Tower): void {
    this.closeSlotMenu();
    this.closeTowerCard();
    this.selectTower(tower);
    const card = GAMEPLAY_CONFIG.hud.towerCard;
    const anchor = this.menuAnchor(tower.x, tower.y, card.width, card.height);
    const container = this.add.container(anchor.x, anchor.y).setDepth(30);
    container.add(this.add.rectangle(card.width / 2, card.height / 2, card.width, card.height, 0x182428)
      .setStrokeStyle(1, GAMEPLAY_CONFIG.tower[tower.kind].color)
      .setInteractive());
    this.cardInfo = this.add.text(card.width / 2, 18, '', this.hudStyle(11, '#f4f5dd')).setOrigin(0.5);
    const upgrade = this.add.rectangle(card.width / 2, 46, card.width - 16, 26, 0x263b38)
      .setStrokeStyle(1, 0x8fbf9a)
      .setInteractive({ useHandCursor: true });
    this.cardUpgradeLabel = this.add.text(card.width / 2, 46, '', this.hudStyle(10, '#d9e8dc')).setOrigin(0.5);
    const sell = this.add.rectangle(card.width / 2, 74, card.width - 16, 24, 0x3a2a28)
      .setStrokeStyle(1, 0xc98474)
      .setInteractive({ useHandCursor: true });
    this.cardSellLabel = this.add.text(card.width / 2, 74, '', this.hudStyle(10, '#f0c2b6')).setOrigin(0.5);
    upgrade.on('pointerdown', () => this.upgradeSelectedTower());
    sell.on('pointerdown', () => this.sellSelectedTower());
    container.add([this.cardInfo, upgrade, this.cardUpgradeLabel, sell, this.cardSellLabel]);
    this.towerCard = container;
    this.cardTower = tower;
    this.fillTowerCard(tower);
  }

  private fillTowerCard(tower: Tower): void {
    this.cardInfo?.setText(`УР. ${tower.level}  ·  РАДИУС ${Math.round(this.towerRange(tower))}`);
    const maxed = tower.level >= GAMEPLAY_CONFIG.tower.upgradeMaximumLevel;
    this.cardUpgradeLabel?.setText(maxed ? 'МАКС.' : `УЛУЧШИТЬ ${this.towerUpgradeCost(tower)}`);
    this.cardSellLabel?.setText(`ПРОДАТЬ ${this.towerSellRefund(tower)}`);
  }

  private towerRange(tower: Tower): number {
    const spec = GAMEPLAY_CONFIG.tower[tower.kind];
    const gain = tower.kind === 'rapid'
      ? GAMEPLAY_CONFIG.tower.rapidRangePerLevel
      : GAMEPLAY_CONFIG.tower.otherRangePerLevel;
    return spec.range + (tower.level - 1) * gain;
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
    if (!this.shopOpen) {
      this.closeSlotMenu();
      this.closeTowerCard();
    }
    this.setShop(!this.shopOpen);
  }

  private setShop(open: boolean): void {
    this.shopOpen = open;
    const openY = GAMEPLAY_CONFIG.scene.height
      - GAMEPLAY_CONFIG.hud.bottomReserve
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
    this.portrait.setTexture(texture);
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

  private hudStyle(fontSize: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold', color };
  }

  private createActors(): void {
    this.player = this.add.image(this.playerX, this.playerY, 'hero').setDepth(7);
    this.handFlash = this.add.circle(0, 0, GAMEPLAY_CONFIG.tutorial.handLift / 3, 0xfff6c4, 0).setDepth(24);
    this.hand = this.add.image(0, 0, 'hand').setDepth(25).setVisible(false);
  }

  private handTarget(): Point | null {
    if (!this.handBuilt) {
      const slot = this.slots.find((item) => item.tower === null);
      return slot ? { x: slot.x, y: slot.y } : null;
    }
    if (this.handWaved) return null;
    const button = GAMEPLAY_CONFIG.hud.waveButton;
    return { x: button.x, y: button.y };
  }

  private updateHand(seconds: number): void {
    const target = this.mode === 'playing' ? this.handTarget() : null;
    if (!target) {
      this.hand.setVisible(false);
      this.handFlash.setAlpha(0);
      return;
    }
    this.hand.setVisible(true);
    this.handTime += seconds;
    const tutorial = GAMEPLAY_CONFIG.tutorial;
    const bob = Math.sin((this.handTime * Math.PI * 2) / tutorial.bobSeconds) * tutorial.bobPixels;
    this.hand.setPosition(target.x, target.y - tutorial.handLift + bob);
    this.handClickTimer += seconds;
    if (this.handClickTimer < tutorial.clickEverySeconds) return;
    this.handClickTimer = 0;
    this.playHandClick(target.x, target.y);
  }

  private rememberHandBuilt(): void {
    if (this.handBuilt) return;
    this.handBuilt = true;
    this.writeStoredFlag('last-line-hand-built');
  }

  private rememberHandWaved(): void {
    if (!this.handBuilt || this.handWaved) return;
    this.handWaved = true;
    this.writeStoredFlag('last-line-hand-waved');
  }

  private readStoredFlag(key: string): boolean {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private writeStoredFlag(key: string): void {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }

  private playHandClick(x: number, y: number): void {
    const tutorial = GAMEPLAY_CONFIG.tutorial;
    this.tweens.killTweensOf(this.hand);
    this.hand.setScale(1);
    this.tweens.add({
      targets: this.hand,
      scaleX: tutorial.squashX,
      scaleY: tutorial.squashY,
      duration: 90,
      yoyo: true,
    });
    this.handFlash.setPosition(x, y).setAlpha(0.85).setScale(0.35);
    this.tweens.killTweensOf(this.handFlash);
    this.tweens.add({
      targets: this.handFlash,
      alpha: 0,
      scale: 1.3,
      duration: tutorial.flashMs,
    });
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.keys = this.input.keyboard.addKeys({
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      r: Phaser.Input.Keyboard.KeyCodes.R,
    }) as Keys;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.mode !== 'playing' || currentlyOver.length > 0) return;
      this.closeSlotMenu();
      this.closeTowerCard();
      this.selectedTower = null;
      this.showTowerRange(null);
    });
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
      'Кликни площадку — стройка   •   ВОЛНА — следующая волна   •   Портрет — ЭМИ   •   P — пауза', {
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
    this.playerFireCooldown = 0;
    this.playerDamageCooldown = 0;
    this.pulseCooldown = 0;
    this.phase = 1;
    this.phaseAnnouncementRemaining = 0;
    this.selectedTowerKind = 'cannon';
    this.selectedTower = null;
    this.closeSlotMenu();
    this.closeTowerCard();
    this.setShop(false);
    this.charmActive = false;
    this.refreshShopLabels();
    this.anchorPatrol();
    this.player.setPosition(this.playerX, this.playerY).setVisible(true).clearTint().setRotation(0).setFlipX(false);
    this.statusText.setText('Герой патрулирует дорогу. Кликни площадку, чтобы строить.');
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
      tower.barrel.destroy();
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

  private readCombatKeys(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.escape) || Phaser.Input.Keyboard.JustDown(this.keys.p)) {
      this.togglePause();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.usePulse();
  }

  private anchorPatrol(): void {
    let bestLength = 0;
    let best: { x: number; y: number; tx: number; ty: number; nx: number; ny: number; length: number } = {
      x: GAMEPLAY_CONFIG.player.start.x,
      y: GAMEPLAY_CONFIG.player.start.y,
      tx: 1,
      ty: 0,
      nx: 0,
      ny: -1,
      length: GAMEPLAY_CONFIG.player.patrolSpan,
    };
    for (let index = 0; index < this.route.length - 1; index += 1) {
      const start = this.route[index];
      const end = this.route[index + 1];
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      if (Math.abs(dx) < Math.abs(dy) || length <= bestLength) continue;
      bestLength = length;
      best = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        tx: dx / length,
        ty: dy / length,
        nx: -dy / length,
        ny: dx / length,
        length,
      };
    }
    const offset = GAMEPLAY_CONFIG.player.patrolOffset;
    this.patrolOrigin = { x: best.x + best.nx * offset, y: best.y + best.ny * offset };
    this.patrolTangent = { x: best.tx, y: best.ty };
    this.patrolSpan = Math.min(GAMEPLAY_CONFIG.player.patrolSpan, best.length * 0.7);
    this.patrolAlong = 0;
    this.patrolDir = 1;
    this.playerX = this.patrolOrigin.x;
    this.playerY = this.patrolOrigin.y;
  }

  private patrolHero(seconds: number): void {
    this.patrolAlong += this.patrolDir * GAMEPLAY_CONFIG.player.patrolSpeed * seconds;
    if (this.patrolAlong > this.patrolSpan / 2) {
      this.patrolAlong = this.patrolSpan / 2;
      this.patrolDir = -1;
    } else if (this.patrolAlong < -this.patrolSpan / 2) {
      this.patrolAlong = -this.patrolSpan / 2;
      this.patrolDir = 1;
    }
    this.playerX = this.patrolOrigin.x + this.patrolTangent.x * this.patrolAlong;
    this.playerY = this.patrolOrigin.y + this.patrolTangent.y * this.patrolAlong;
    this.player.setPosition(this.playerX, this.playerY).setRotation(0);
    this.player.setFlipX(this.patrolTangent.x * this.patrolDir < 0);
    const target = this.findClosestEnemy(this.playerX, this.playerY, GAMEPLAY_CONFIG.player.targetRange);
    if (target && this.playerFireCooldown <= 0) this.fireHeroShot(target);
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

  private fireHeroShot(target: Enemy): void {
    const spec = GAMEPLAY_CONFIG.weapon.pulse;
    this.fireProjectile(
      this.playerX,
      this.playerY,
      target,
      this.heroWeaponDamage(spec.damage),
      spec.speed,
      'player',
      { color: spec.color },
    );
    this.playerFireCooldown = spec.cooldown;
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
      const moved = this.moveEnemy(enemy, seconds);
      this.stepSprite(enemy, moved);
      this.faceEnemy(enemy);
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

  private enemyTextureKeys(): string[] {
    const kinds: EnemyKind[] = ['scout', 'raider', 'brute', 'boss', 'flyer'];
    return kinds.flatMap((kind) => {
      const frames = Array.from({ length: GAMEPLAY_CONFIG.enemy.walkFrames }, (_, frame) => `enemy-${kind}-${frame}`);
      return kind === 'flyer' ? frames : [...frames, `enemy-${kind}-front`, `enemy-${kind}-back`];
    });
  }

  private stepSprite(enemy: Enemy, moved: number): void {
    if (enemy.kind !== 'flyer' && !this.pathStep(enemy).horizontal) return;
    enemy.distanceWalked += moved;
    const stride = enemy.kind === 'flyer'
      ? GAMEPLAY_CONFIG.enemy.flyerFlapDistance
      : GAMEPLAY_CONFIG.enemy.stepDistance;
    enemy.animFrame = Math.floor(enemy.distanceWalked / stride) % GAMEPLAY_CONFIG.enemy.walkFrames;
  }

  private pathStep(enemy: Enemy): { dx: number; dy: number; horizontal: boolean } {
    const current = this.route[enemy.segment];
    const next = this.route[enemy.segment + 1] ?? current;
    const dx = (next?.x ?? enemy.body.x) - (current?.x ?? enemy.body.x);
    const dy = (next?.y ?? enemy.body.y) - (current?.y ?? enemy.body.y);
    return { dx, dy, horizontal: Math.abs(dx) >= Math.abs(dy) };
  }

  private faceEnemy(enemy: Enemy): void {
    enemy.body.setRotation(0);
    if (enemy.kind === 'flyer') {
      enemy.pose = 'side';
      enemy.body.setFlipX(this.basePoint.x - enemy.body.x < 0);
      enemy.body.setTexture(this.enemyFrame(enemy));
      return;
    }
    const step = this.pathStep(enemy);
    if (step.horizontal) {
      enemy.pose = 'side';
      enemy.body.setFlipX(step.dx < 0);
    } else {
      enemy.pose = step.dy >= 0 ? 'front' : 'back';
      enemy.body.setFlipX(false);
    }
    enemy.body.setTexture(this.enemyFrame(enemy));
  }

  private enemyFrame(enemy: Enemy): string {
    if (enemy.kind === 'flyer' || enemy.pose === 'side') return `enemy-${enemy.kind}-${enemy.animFrame}`;
    return `enemy-${enemy.kind}-${enemy.pose}`;
  }

  private moveEnemy(enemy: Enemy, seconds: number): number {
    return enemy.kind === 'flyer'
      ? this.moveFlyingEnemy(enemy, seconds)
      : this.moveEnemyAlongRoute(enemy, seconds);
  }

  private enemyMoveSpeed(enemy: Enemy): number {
    return enemy.slowTimer > 0 ? enemy.speed * enemy.slowFactor : enemy.speed;
  }

  private moveFlyingEnemy(enemy: Enemy, seconds: number): number {
    const dx = this.basePoint.x - enemy.body.x;
    const dy = this.basePoint.y - enemy.body.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= GAMEPLAY_CONFIG.wave.flyingArrivalRadius) {
      enemy.segment = this.route.length - 1;
      return 0;
    }
    const step = Math.min(this.enemyMoveSpeed(enemy) * seconds, distance);
    enemy.body.x += (dx / distance) * step;
    enemy.body.y += (dy / distance) * step;
    return step;
  }

  private routeProgress(enemy: Enemy): number {
    let progress = 0;
    for (let index = 0; index < enemy.segment && index < this.route.length - 1; index += 1) {
      const start = this.route[index];
      const end = this.route[index + 1];
      if (!start || !end) continue;
      progress += Math.hypot(end.x - start.x, end.y - start.y);
    }
    const start = this.route[enemy.segment];
    if (!start) return progress;
    return progress + Math.hypot(enemy.body.x - start.x, enemy.body.y - start.y);
  }

  private marchRoom(enemy: Enemy): number {
    const progress = this.routeProgress(enemy);
    const index = this.enemies.indexOf(enemy);
    let room = Number.POSITIVE_INFINITY;
    this.enemies.forEach((other, otherIndex) => {
      if (other === enemy || other.kind === 'flyer') return;
      const delta = this.routeProgress(other) - progress;
      const otherIsAhead = delta > 0.5 || (Math.abs(delta) <= 0.5 && otherIndex < index);
      if (!otherIsAhead) return;
      room = Math.min(room, Math.max(delta, 0) - GAMEPLAY_CONFIG.enemy.marchGap);
    });
    return Math.max(0, room);
  }

  private moveEnemyAlongRoute(enemy: Enemy, seconds: number): number {
    let distanceLeft = Math.min(this.enemyMoveSpeed(enemy) * seconds, this.marchRoom(enemy));
    let moved = 0;
    while (distanceLeft > 0 && enemy.segment < this.route.length - 1) {
      const next = this.route[enemy.segment + 1];
      if (!next) return moved;
      const dx = next.x - enemy.body.x;
      const dy = next.y - enemy.body.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance <= distanceLeft) {
        enemy.body.setPosition(next.x, next.y);
        distanceLeft -= distance;
        moved += distance;
        enemy.segment += 1;
      } else {
        enemy.body.x += (dx / distance) * distanceLeft;
        enemy.body.y += (dy / distance) * distanceLeft;
        moved += distanceLeft;
        distanceLeft = 0;
      }
    }
    return moved;
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

      tower.barrel.setRotation(Phaser.Math.Angle.Between(tower.x, tower.y, target.body.x, target.body.y));
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
        || projectile.body.y > GAMEPLAY_CONFIG.scene.height) {
        projectile.body.destroy();
        this.projectiles.splice(index, 1);
      }
    }
  }

  private syncEnemyHealthBar(enemy: Enemy): void {
    const width = enemy.kind === 'boss' ? 44 : enemy.kind === 'brute' ? 36 : 32;
    const height = 5;
    const lift = enemy.kind === 'boss' ? 36 : enemy.kind === 'brute' ? 34 : 30;
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
    this.enqueueWave(this.wave);
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

  private waveEnemyCount(wave: number): number {
    return Math.min(
      GAMEPLAY_CONFIG.wave.initialEnemyCount + wave * GAMEPLAY_CONFIG.wave.enemiesPerWave,
      GAMEPLAY_CONFIG.wave.maxEnemies,
    );
  }

  private enqueueWave(wave: number): void {
    const count = this.waveEnemyCount(wave);
    for (let index = 0; index < count; index += 1) {
      this.spawnQueue.push(this.enemyKindForSpawn(index, count, wave));
    }
  }

  private callNextWaveEarly(): void {
    if (this.mode !== 'playing') return;
    const fieldClear = this.spawnQueue.length === 0 && this.enemies.length === 0;
    if (this.phase === 1 && this.wave === GAMEPLAY_CONFIG.phaseTwo.startsAfterWave) {
      if (!fieldClear) {
        this.statusText.setText('СНАЧАЛА ЗАКОНЧИ ВОЛНУ — ДАЛЬШЕ ФАЗА 2');
        return;
      }
      this.beginPhaseTwoTransition();
      this.rememberHandWaved();
      return;
    }
    if (fieldClear) {
      this.launchWave();
    } else {
      this.wave += 1;
      this.enqueueWave(this.wave);
      this.statusText.setText(`ВОЛНА ${this.wave} ВЫЗВАНА РАНЬШЕ`);
    }
    this.rememberHandWaved();
    this.refreshHud();
  }

  private upcomingLabel(): string {
    const waitingForPhase = this.phase === 1 && this.wave === GAMEPLAY_CONFIG.phaseTwo.startsAfterWave;
    if (waitingForPhase) return 'ФАЗА 2';
    return this.compositionText(this.wave + 1);
  }

  private compositionText(wave: number): string {
    const count = this.waveEnemyCount(wave);
    const totals = new Map<EnemyKind, number>();
    for (let index = 0; index < count; index += 1) {
      const kind = this.enemyKindForSpawn(index, count, wave);
      totals.set(kind, (totals.get(kind) ?? 0) + 1);
    }
    const names: Record<EnemyKind, string> = {
      scout: 'разведчик',
      raider: 'налётчик',
      brute: 'громила',
      flyer: 'летун',
      boss: 'босс',
    };
    const order: EnemyKind[] = ['scout', 'raider', 'brute', 'flyer', 'boss'];
    return order
      .filter((kind) => (totals.get(kind) ?? 0) > 0)
      .map((kind) => `${names[kind]} ${totals.get(kind) ?? 0}`)
      .join('\n');
  }

  private enemyKindForSpawn(index: number, count: number, wave = this.wave): EnemyKind {
    const rules = GAMEPLAY_CONFIG.wave;
    if (wave % rules.bossEvery === 0 && index === count - 1) return 'boss';
    if (wave >= rules.bruteStartWave && index % rules.bruteEvery === rules.bruteEvery - 1) return 'brute';
    if (wave >= rules.raiderStartWave && index % rules.raiderEvery === rules.raiderEvery - 1) return 'raider';
    if (wave >= rules.flyingStartWave && index % rules.flyingEvery === rules.flyingEvery - 1) return 'flyer';
    return 'scout';
  }

  private flyingSpawnPoint(): Point {
    const minY = GAMEPLAY_CONFIG.hud.topHeight + GAMEPLAY_CONFIG.wave.flyingSpawnPadding;
    const maxY = GAMEPLAY_CONFIG.scene.height
      - GAMEPLAY_CONFIG.hud.bottomReserve
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
    const body = this.add.image(start.x, start.y, `enemy-${kind}-0`).setDepth(5).setRotation(0);
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
      distanceWalked: 0,
      animFrame: 0,
      pose: 'side',
    };
    this.enemies.push(enemy);
    this.syncEnemyHealthBar(enemy);
  }

  private selectOrBuildTower(x: number, y: number): void {
    if (this.mode !== 'playing') return;
    const slot = this.slots.find((item) => item.x === x && item.y === y);
    if (!slot) return;
    if (slot.tower) {
      this.openTowerCard(slot.tower);
      return;
    }
    if (this.slotMenuTarget === slot) {
      this.closeSlotMenu();
      return;
    }
    this.openSlotMenu(slot);
  }

  private buildTower(slot: BuildSlot, kind: TowerKind): void {
    if (this.mode !== 'playing' || slot.tower) return;
    const spec = GAMEPLAY_CONFIG.tower[kind];
    if (this.coins < spec.cost) {
      this.statusText.setText(`НУЖНО ${spec.cost} МОНЕТ ДЛЯ ${spec.name.toUpperCase()}`);
      return;
    }
    this.coins -= spec.cost;
    this.selectedTowerKind = kind;
    this.rememberHandBuilt();
    const tower = this.placeTower(slot, kind, spec.cost);
    this.closeSlotMenu();
    this.statusText.setText(`${spec.name.toUpperCase()} УСТАНОВЛЕНА · УР. 1`);
    this.openTowerCard(tower);
    this.refreshHud();
  }

  private placeTower(slot: BuildSlot, kind: TowerKind, invested: number): Tower {
    const spec = GAMEPLAY_CONFIG.tower[kind];
    const rangeRing = this.add.circle(slot.x, slot.y, spec.range, spec.color, 0.08)
      .setStrokeStyle(1, spec.color, 0.6).setVisible(false).setDepth(1);
    const sprite = this.add.image(slot.x, slot.y, `tower-${kind}`)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    const barrel = this.add.image(slot.x, slot.y - 6, `tower-${kind}-barrel`)
      .setOrigin(0.12, 0.5)
      .setDepth(5.5);
    const levelLabel = this.add.text(slot.x, slot.y + 26, '1', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#f4f5dd',
    }).setOrigin(0.5).setDepth(6);
    const tower: Tower = {
      x: slot.x,
      y: slot.y,
      kind,
      level: 1,
      invested,
      cooldown: GAMEPLAY_CONFIG.tower.initialCooldown,
      sprite,
      barrel,
      levelLabel,
      rangeRing,
    };
    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
      event.stopPropagation();
      this.openTowerCard(tower);
    });
    slot.tower = tower;
    slot.marker.setVisible(false);
    slot.label.setVisible(false);
    this.towers.push(tower);
    return tower;
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
    const scale = 1 + (tower.level - 1) * 0.08;
    tower.sprite.setScale(scale);
    tower.barrel.setScale(scale);
    if (tower.level === GAMEPLAY_CONFIG.tower.upgradeMaximumLevel) {
      const tint = Phaser.Display.Color.ValueToColor(spec.color).darken(GAMEPLAY_CONFIG.tower.maximumLevelDarken).color;
      tower.sprite.setTint(tint);
      tower.barrel.setTint(tint);
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
    tower.barrel.destroy();
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
    if (!this.cardTower || !this.cardInfo) return;
    if (!this.towers.includes(this.cardTower)) {
      this.closeTowerCard();
      return;
    }
    this.fillTowerCard(this.cardTower);
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.setShop(false);
      this.closeSlotMenu();
      this.closeTowerCard();
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
    this.closeSlotMenu();
    this.closeTowerCard();
    this.mode = 'gameover';
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
    this.baseText.setText(String(this.baseHealth));
    this.coinsText.setText(`МОНЕТЫ ${this.coins}`);
    this.phaseText.setText(this.phase === 2 ? 'ФАЗА 2' : 'ФАЗА 1');
    this.upcomingText.setText(this.upcomingLabel());
    this.drawBaseLives();
    this.portraitHealth.setText(String(this.playerHealth));
    this.portraitCooldown.setText(this.pulseCooldown > 0 ? this.pulseCooldown.toFixed(0) : '');
    this.portrait.setAlpha(this.mode === 'playing' && this.pulseCooldown <= 0 ? 1 : 0.55);
    this.refreshUpgradeButton();
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