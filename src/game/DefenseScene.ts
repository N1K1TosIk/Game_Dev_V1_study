import Phaser from 'phaser';
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
  body: Phaser.GameObjects.Arc;
  kind: EnemyKind;
  health: number;
  maxHealth: number;
  speed: number;
  bounty: number;
  segment: number;
  slowTimer: number;
  slowFactor: number;
}

interface Tower {
  x: number;
  y: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
  base: Phaser.GameObjects.Arc;
  barrel: Phaser.GameObjects.Rectangle;
  secondBarrel: Phaser.GameObjects.Rectangle | null;
  core: Phaser.GameObjects.Arc;
  typeLabel: Phaser.GameObjects.Text;
  rangeRing: Phaser.GameObjects.Arc;
}

interface BuildSlot {
  x: number;
  y: number;
  marker: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  tower: Tower | null;
}

interface Projectile {
  body: Phaser.GameObjects.Arc;
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
}

export class DefenseScene extends Phaser.Scene {
  private mode: Mode = 'menu';
  private keys!: Keys;
  private player!: Phaser.GameObjects.Arc;
  private playerBarrel!: Phaser.GameObjects.Rectangle;
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
  private projectiles: Projectile[] = [];
  private spawnQueue: EnemyKind[] = [];
  private selectedTower: Tower | null = null;
  private selectedTowerKind: TowerKind = 'cannon';
  private selectedWeapon: WeaponKind = 'pulse';
  private towerTypeButtons: Phaser.GameObjects.Rectangle[] = [];
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
  private fireCooldownText!: Phaser.GameObjects.Text;
  private weaponNameText!: Phaser.GameObjects.Text;
  private bestWave = 0;

  constructor() {
    super('DefenseScene');
  }

  create(): void {
    this.drawMap();
    this.createHud();
    this.createActors();
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
    this.cameras.main.setBackgroundColor('#0c1419');
    this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      GAMEPLAY_CONFIG.scene.height / 2,
      GAMEPLAY_CONFIG.scene.width,
      GAMEPLAY_CONFIG.scene.height,
      0x101a20,
    );

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1d2c30, 0.7);
    for (let x = 20; x < GAMEPLAY_CONFIG.scene.width; x += 40) {
      grid.lineBetween(x, 104, x, GAMEPLAY_CONFIG.scene.height);
    }
    for (let y = 120; y < GAMEPLAY_CONFIG.scene.height; y += 40) {
      grid.lineBetween(0, y, GAMEPLAY_CONFIG.scene.width, y);
    }

    const road = this.add.graphics();
    road.lineStyle(52, 0x3a4544, 1);
    for (let index = 0; index < GAMEPLAY_CONFIG.route.length - 1; index += 1) {
      const start = GAMEPLAY_CONFIG.route[index];
      const end = GAMEPLAY_CONFIG.route[index + 1];
      if (start && end) road.lineBetween(start.x, start.y, end.x, end.y);
    }
    road.lineStyle(2, 0x9eaa8e, 0.65);
    for (let index = 0; index < GAMEPLAY_CONFIG.route.length - 1; index += 1) {
      const start = GAMEPLAY_CONFIG.route[index];
      const end = GAMEPLAY_CONFIG.route[index + 1];
      if (start && end) road.lineBetween(start.x, start.y, end.x, end.y);
    }

    this.add.rectangle(
      GAMEPLAY_CONFIG.scene.width / 2,
      102,
      GAMEPLAY_CONFIG.scene.width,
      4,
      0x405450,
    ).setDepth(4);
    this.add.text(22, 113, 'МАРШРУТ ВРАГА', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#879890',
    });

    this.slots = GAMEPLAY_CONFIG.buildSlots.map(({ x, y }) => {
      const marker = this.add.circle(x, y, 20, 0x1b292b, 0.96)
        .setStrokeStyle(2, 0x8da491)
        .setInteractive({ useHandCursor: true });
      marker.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
        event.stopPropagation();
        this.selectOrBuildTower(x, y);
      });
      const label = this.add.text(x, y, '+', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#cde8c1',
      }).setOrigin(0.5).setDepth(1);
      return { x, y, marker, label, tower: null };
    });

    const base = this.add.rectangle(914, 470, 44, 58, 0x347e73).setStrokeStyle(3, 0xb6f3cd).setDepth(4);
    this.add.rectangle(914, 470, 17, 22, 0xbaffdc).setDepth(5);
    this.add.text(914, 510, 'БАЗА', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#c6e9d4',
    }).setOrigin(0.5).setDepth(5);
    base.setDepth(3);
  }

  private createHud(): void {
    this.add.rectangle(GAMEPLAY_CONFIG.scene.width / 2, 51, GAMEPLAY_CONFIG.scene.width, 102, 0x111d21).setDepth(10);
    this.add.rectangle(GAMEPLAY_CONFIG.scene.width / 2, 102, GAMEPLAY_CONFIG.scene.width, 2, 0x405450).setDepth(11);

    this.add.text(22, 14, 'LAST LINE', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#d8f4dd',
    }).setDepth(12);
    this.waveText = this.add.text(205, 17, 'ВОЛНА 0', this.hudStyle(13, '#e5e8d2')).setDepth(12);
    this.coinsText = this.add.text(326, 17, 'МОНЕТЫ 110', this.hudStyle(13, '#f3cf79')).setDepth(12);
    this.baseText = this.add.text(490, 17, 'БАЗА 100', this.hudStyle(13, '#91e0b4')).setDepth(12);
    this.playerText = this.add.text(630, 17, 'ГЕРОЙ 100', this.hudStyle(13, '#ff9f8e')).setDepth(12);

    const pause = this.add.rectangle(902, 28, 86, 34, 0x293b3b)
      .setStrokeStyle(1, 0x759182).setInteractive({ useHandCursor: true }).setDepth(12);
    pause.on('pointerdown', () => this.togglePause());
    this.add.text(902, 28, 'ПАУЗА', this.hudStyle(10, '#e5efe5')).setOrigin(0.5).setDepth(13);

    this.statusText = this.add.text(22, 56, 'Построй башню на свободной площадке', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', color: '#9eafa7',
    }).setDepth(12);
    this.phaseText = this.add.text(22, 80, 'ФАЗА 2 ПОСЛЕ ВОЛНЫ 2', this.hudStyle(10, '#f3cf79')).setDepth(12);

    this.addTowerTypeButton('cannon', 390);
    this.addTowerTypeButton('rapid', 510);
    this.addTowerTypeButton('cryo', 630);

    this.upgradeButton = this.add.rectangle(842, 71, 186, 32, 0x263b38)
      .setStrokeStyle(1, 0x637d70).setInteractive({ useHandCursor: true }).setDepth(12);
    this.upgradeButton.on('pointerdown', () => this.upgradeSelectedTower());
    this.upgradeLabel = this.add.text(842, 71, 'ВЫБЕРИ БАШНЮ', this.hudStyle(9, '#a6b8ae'))
      .setOrigin(0.5).setDepth(13);

    this.add.rectangle(GAMEPLAY_CONFIG.scene.width / 2, 613, GAMEPLAY_CONFIG.scene.width, 54, 0x111d21).setDepth(10);
    this.add.rectangle(GAMEPLAY_CONFIG.scene.width / 2, 586, GAMEPLAY_CONFIG.scene.width, 2, 0x405450).setDepth(11);
    this.weaponNameText = this.add.text(22, 603, 'ОРУЖИЕ', this.hudStyle(10, '#9eafa7')).setDepth(12);
    this.addWeaponButton('pulse', 178);
    this.addWeaponButton('rail', 326);
    this.addWeaponButton('scatter', 474);
    this.fireCooldownText = this.add.text(614, 604, 'SPACE: ОГОНЬ  ·  Q: ИМПУЛЬС', this.hudStyle(10, '#b6c9bc')).setDepth(12);
  }

  private addTowerTypeButton(kind: TowerKind, x: number): void {
    const spec = GAMEPLAY_CONFIG.tower[kind];
    const button = this.add.rectangle(x, 71, 112, 30, 0x263b38)
      .setStrokeStyle(1, spec.color).setInteractive({ useHandCursor: true }).setDepth(12);
    button.on('pointerdown', () => this.selectTowerKind(kind));
    this.add.text(x, 71, `${spec.shortLabel} · ${spec.cost}`, this.hudStyle(8, '#d9e8dc')).setOrigin(0.5).setDepth(13);
    this.towerTypeButtons.push(button);
  }

  private addWeaponButton(kind: WeaponKind, x: number): void {
    const labels: Record<WeaponKind, string> = {
      pulse: '1 · КАРАБИН',
      rail: '2 · РЕЛЬСА',
      scatter: '3 · ДРОБОВИК',
    };
    const button = this.add.rectangle(x, 613, 132, 32, 0x263b38)
      .setStrokeStyle(1, 0x759182).setInteractive({ useHandCursor: true }).setDepth(12);
    button.on('pointerdown', () => this.selectWeapon(kind));
    this.add.text(x, 613, labels[kind], this.hudStyle(9, '#d9e8dc')).setOrigin(0.5).setDepth(13);
    this.weaponButtons.push(button);
  }

  private hudStyle(fontSize: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold', color };
  }

  private createActors(): void {
    this.player = this.add.circle(this.playerX, this.playerY, GAMEPLAY_CONFIG.player.radius, 0x40d9bd)
      .setStrokeStyle(3, 0xd0ffdd).setDepth(7);
    this.playerBarrel = this.add.rectangle(
      this.playerX + GAMEPLAY_CONFIG.player.barrelOffset,
      this.playerY,
      GAMEPLAY_CONFIG.player.barrelLength,
      GAMEPLAY_CONFIG.player.barrelThickness,
      0xf4fff8,
    ).setDepth(8);
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
    }) as Keys;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.mode !== 'playing' || currentlyOver.length > 0 || pointer.y < 112) return;
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
    const fire = this.add.circle(884, 553, 34, 0x8b593e, 0.9)
      .setStrokeStyle(2, 0xf1b57d).setInteractive().setDepth(20);
    const pulse = this.add.circle(805, 553, 29, 0x315b61, 0.9)
      .setStrokeStyle(2, 0x7de0ca).setInteractive().setDepth(20);
    this.add.text(884, 553, 'ОГОНЬ', this.hudStyle(9, '#fff0d9')).setOrigin(0.5).setDepth(21);
    this.add.text(805, 553, 'Q', this.hudStyle(15, '#d5fff3')).setOrigin(0.5).setDepth(21);
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
      'WASD / стрелки — движение   •   Пробел — огонь   •   Q — ЭМИ   •   P / Esc — пауза', {
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
    this.refreshTowerTypeButtons();
    this.refreshWeaponButtons();
    this.player.setPosition(this.playerX, this.playerY).setVisible(true).setFillStyle(0x40d9bd);
    this.playerBarrel.setPosition(this.playerX + GAMEPLAY_CONFIG.player.barrelOffset, this.playerY).setVisible(true);
    this.pointerTarget = null;
    this.statusText.setText('Построй башни на площадках или отбивай врагов лично.');
    this.launchWave();
    this.refreshHud();
  }

  private clearRun(): void {
    this.enemies.forEach((enemy) => enemy.body.destroy());
    this.towers.forEach((tower) => {
      tower.base.destroy();
      tower.barrel.destroy();
      tower.secondBarrel?.destroy();
      tower.core.destroy();
      tower.typeLabel.destroy();
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
      slot.marker.setVisible(true).setFillStyle(0x1b292b);
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
      this.playerBarrel.setPosition(this.playerX, this.playerY)
        .setRotation(Phaser.Math.Angle.Between(this.playerX, this.playerY, target.body.x, target.body.y));
    }

    if ((this.keys.space.isDown || this.fireButtonHeld) && this.playerFireCooldown <= 0 && target) {
      this.fireHeroWeapon(target);
    }

    if (this.invulnerableTimer <= 0) this.player.setFillStyle(0x40d9bd);
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

  private fireHeroWeapon(target: Enemy): void {
    const angle = Phaser.Math.Angle.Between(this.playerX, this.playerY, target.body.x, target.body.y);
    if (this.selectedWeapon === 'pulse') {
      const spec = GAMEPLAY_CONFIG.weapon.pulse;
      this.fireProjectile(this.playerX, this.playerY, target, spec.damage, spec.speed, 'player', { color: spec.color });
      this.playerFireCooldown = spec.cooldown;
      return;
    }

    if (this.selectedWeapon === 'rail') {
      const spec = GAMEPLAY_CONFIG.weapon.rail;
      this.fireProjectile(this.playerX, this.playerY, target, spec.damage, spec.speed, 'player', {
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
      this.fireProjectile(this.playerX, this.playerY, target, spec.damage, spec.speed, 'player', {
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
      const kind = (['cannon', 'rapid', 'cryo'] as const)[index];
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
    this.weaponButtons.forEach((button, index) => {
      const kind = (['pulse', 'rail', 'scatter'] as const)[index];
      if (!kind) return;
      const selected = kind === this.selectedWeapon;
      button.setFillStyle(selected ? 0x397960 : 0x263b38);
      button.setAlpha(selected ? 1 : GAMEPLAY_CONFIG.ui.unselectedButtonAlpha);
    });
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
      this.moveEnemyAlongRoute(enemy, seconds);
      if (enemy.segment >= GAMEPLAY_CONFIG.route.length - 1) {
        enemy.body.destroy();
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
        this.player.setFillStyle(0xff776f);
        this.statusText.setText('ГЕРОЙ ПОЛУЧИЛ УРОН!');
        if (this.playerHealth <= 0) this.endGame('Герой повержен');
      }
    }
  }

  private moveEnemyAlongRoute(enemy: Enemy, seconds: number): void {
    const speed = enemy.slowTimer > 0 ? enemy.speed * enemy.slowFactor : enemy.speed;
    let distanceLeft = speed * seconds;
    while (distanceLeft > 0 && enemy.segment < GAMEPLAY_CONFIG.route.length - 1) {
      const next = GAMEPLAY_CONFIG.route[enemy.segment + 1];
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

      tower.barrel.setRotation(Phaser.Math.Angle.Between(tower.x, tower.y, target.body.x, target.body.y));
      tower.secondBarrel?.setRotation(tower.barrel.rotation);
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
          : { color: spec.projectileColor };
      const projectileSpeed = tower.kind === 'rapid'
        ? GAMEPLAY_CONFIG.tower.rapidProjectileSpeed
        : GAMEPLAY_CONFIG.tower.projectileSpeed;
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
    } = {},
    angleOverride?: number,
  ): void {
    const angle = angleOverride ?? Phaser.Math.Angle.Between(x, y, target.body.x, target.body.y);
    const color = options.color ?? (source === 'player' ? 0xffd078 : 0x83e8cb);
    const radius = source === 'player'
      ? GAMEPLAY_CONFIG.projectile.playerRadius
      : GAMEPLAY_CONFIG.projectile.towerRadius;
    const body = this.add.circle(x, y, radius, color)
      .setDepth(6);
    this.projectiles.push({
      body,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      source,
      lifetime: options.lifetime ?? GAMEPLAY_CONFIG.projectile.defaultLifetime,
      pierce: options.pierce ?? GAMEPLAY_CONFIG.projectile.defaultPierce,
      hit: new Set<Enemy>(),
      splashRadius: options.splashRadius ?? GAMEPLAY_CONFIG.projectile.defaultSplashRadius,
      slowFactor: options.slowFactor ?? GAMEPLAY_CONFIG.projectile.defaultSlowFactor,
      slowDuration: options.slowDuration ?? GAMEPLAY_CONFIG.projectile.defaultSlowDuration,
    });
  }

  private updateProjectiles(seconds: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
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
        || projectile.body.x > GAMEPLAY_CONFIG.scene.width || projectile.body.y < 112
        || projectile.body.y > GAMEPLAY_CONFIG.scene.height) {
        projectile.body.destroy();
        this.projectiles.splice(index, 1);
      }
    }
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    enemy.health -= damage;
    if (enemy.health > 0) return;
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
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
      if (this.wave % GAMEPLAY_CONFIG.wave.bossEvery === 0 && index === count - 1) {
        this.spawnQueue.push('boss');
      } else if (this.wave >= GAMEPLAY_CONFIG.wave.bruteStartWave
        && index % GAMEPLAY_CONFIG.wave.bruteEvery === GAMEPLAY_CONFIG.wave.bruteEvery - 1) {
        this.spawnQueue.push('brute');
      } else if (this.wave >= GAMEPLAY_CONFIG.wave.raiderStartWave
        && index % GAMEPLAY_CONFIG.wave.raiderEvery === GAMEPLAY_CONFIG.wave.raiderEvery - 1) {
        this.spawnQueue.push('raider');
      } else {
        this.spawnQueue.push('scout');
      }
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

  private spawnEnemy(kind: EnemyKind): void {
    const isBoss = kind === 'boss';
    const enemySpec = GAMEPLAY_CONFIG.enemy[kind];
    const stats = kind === 'boss'
      ? { ...enemySpec, hp: GAMEPLAY_CONFIG.wave.bossBaseHealth + this.wave * GAMEPLAY_CONFIG.wave.bossHealthPerWave }
      : enemySpec;
    const scale = 1 + this.wave * GAMEPLAY_CONFIG.wave.healthScalePerWave;
    const start = GAMEPLAY_CONFIG.route[0];
    const body = this.add.circle(start.x, start.y, stats.radius, stats.color)
      .setStrokeStyle(isBoss ? 4 : 2, 0xffe4c5).setDepth(5);
    this.enemies.push({
      body,
      kind,
      health: stats.hp * scale,
      maxHealth: stats.hp * scale,
      speed: stats.speed * (1 + this.wave * GAMEPLAY_CONFIG.wave.speedScalePerWave)
        * (this.phase === 2 ? GAMEPLAY_CONFIG.phaseTwo.enemySpeedMultiplier : 1),
      bounty: stats.bounty,
      segment: 0,
      slowTimer: 0,
      slowFactor: 1,
    });
  }

  private selectOrBuildTower(x: number, y: number): void {
    if (this.mode !== 'playing') return;
    const slot = this.slots.find((item) => item.x === x && item.y === y);
    if (!slot) return;
    if (slot.tower) {
      this.selectTower(slot.tower);
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
    const base = this.add.circle(x, y, 18, spec.color)
      .setStrokeStyle(3, 0xe5f3dc).setDepth(4).setInteractive({ useHandCursor: true });
    const barrel = this.add.rectangle(x + 14, y, this.selectedTowerKind === 'cannon' ? 24 : 21, 7, spec.projectileColor).setDepth(5);
    const secondBarrel = this.selectedTowerKind === 'rapid'
      ? this.add.rectangle(x + 14, y + 7, 19, 5, spec.projectileColor).setDepth(5)
      : null;
    const core = this.add.circle(x, y, 7, 0x172322).setStrokeStyle(2, spec.projectileColor).setDepth(6);
    const typeLabel = this.add.text(x, y - 27, this.selectedTowerKind === 'cannon' ? 'C' : this.selectedTowerKind === 'rapid' ? 'R' : 'F', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#f4f5dd',
    }).setOrigin(0.5).setDepth(6);
    const tower: Tower = {
      x,
      y,
      kind: this.selectedTowerKind,
      level: 1,
      cooldown: GAMEPLAY_CONFIG.tower.initialCooldown,
      base, barrel, secondBarrel, core, typeLabel, rangeRing,
    };
    base.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
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
    tower.level += 1;
    const spec = GAMEPLAY_CONFIG.tower[tower.kind];
    tower.base.setFillStyle(
      tower.level === GAMEPLAY_CONFIG.tower.upgradeMaximumLevel
        ? Phaser.Display.Color.ValueToColor(spec.color).darken(GAMEPLAY_CONFIG.tower.maximumLevelDarken).color
        : spec.color,
    );
    tower.base.setRadius(
      GAMEPLAY_CONFIG.tower.baseRadius + tower.level * GAMEPLAY_CONFIG.tower.baseRadiusPerLevel,
    );
    tower.core.setRadius(
      GAMEPLAY_CONFIG.tower.coreRadius + tower.level * GAMEPLAY_CONFIG.tower.coreRadiusPerLevel,
    );
    tower.typeLabel.setText(`${tower.kind === 'cannon' ? 'C' : tower.kind === 'rapid' ? 'R' : 'F'}${tower.level}`);
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

  private refreshUpgradeButton(): void {
    if (!this.selectedTower) {
      this.upgradeLabel.setText('ВЫБЕРИ БАШНЮ');
      return;
    }
    if (this.selectedTower.level >= GAMEPLAY_CONFIG.tower.upgradeMaximumLevel) {
      this.upgradeLabel.setText('МАКС. УРОВЕНЬ');
      return;
    }
    const cost = this.towerUpgradeCost(this.selectedTower);
    this.upgradeLabel.setText(`УЛУЧШИТЬ · ${cost}`);
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
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
    this.phaseText.setText(this.phase === 2
      ? 'ФАЗА 2 · ВРАГИ БЫСТРЕЕ · ВОЛНЫ ЧАЩЕ'
      : 'ФАЗА 2 ПОСЛЕ ВОЛНЫ 2');
    const weaponNames: Record<WeaponKind, string> = {
      pulse: 'КАРАБИН', rail: 'РЕЛЬСА', scatter: 'ДРОБОВИК',
    };
    const pulseStatus = this.pulseCooldown > 0 ? `ЭМИ: ${this.pulseCooldown.toFixed(1)}с` : 'ЭМИ: ГОТОВ';
    this.weaponNameText.setText(`ОРУЖИЕ: ${weaponNames[this.selectedWeapon]}`);
    this.fireCooldownText.setText(`ПРОБЕЛ: ОГОНЬ  ·  Q: ${pulseStatus}`);
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