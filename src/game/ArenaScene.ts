import Phaser from 'phaser';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;
const ARENA = { left: 34, right: 926, top: 92, bottom: 610 };
const PLAYER_RADIUS = 16;
const STARTING_HEALTH = 100;

type Mode = 'menu' | 'playing' | 'upgrade' | 'epic' | 'paused' | 'gameover';
type EnemyKind = 'scrap' | 'runner' | 'tank' | 'boss';
type UpgradeId = 'damage' | 'rapid' | 'armor' | 'speed' | 'pierce' | 'magnet' | 'epic_arc' | 'epic_overclock' | 'epic_reactor';

interface Enemy {
  body: Phaser.GameObjects.Arc;
  kind: EnemyKind;
  health: number;
  speed: number;
  radius: number;
  xp: number;
}

interface Projectile {
  body: Phaser.GameObjects.Arc;
  velocityX: number;
  velocityY: number;
  damage: number;
  pierce: number;
  hit: Set<Enemy>;
  lifetime: number;
}

interface ExperienceOrb {
  body: Phaser.GameObjects.Arc;
  value: number;
}

interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  color: number;
}

interface GameKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
  escape: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
}

const COMMON_UPGRADES: Upgrade[] = [
  { id: 'damage', name: 'Усиленный импульс', description: '+6 урона каждому выстрелу', color: 0x48d6be },
  { id: 'rapid', name: 'Разгон катушки', description: 'Атака срабатывает на 18% чаще', color: 0x48d6be },
  { id: 'armor', name: 'Реакторный корпус', description: '+25 к максимуму здоровья и лечение на 25', color: 0x48d6be },
  { id: 'speed', name: 'Инерционные сопла', description: '+16% к скорости передвижения', color: 0x48d6be },
  { id: 'pierce', name: 'Сквозной разряд', description: 'Импульс пробивает ещё одного врага', color: 0x48d6be },
  { id: 'magnet', name: 'Магнитный сборщик', description: 'Кристаллы опыта притягиваются дальше', color: 0x48d6be },
];

const EPIC_UPGRADES: Upgrade[] = [
  { id: 'epic_arc', name: 'Цепная молния', description: '+2 пробития и +12 урона импульса', color: 0xc084fc },
  { id: 'epic_overclock', name: 'Красная зона', description: 'Скорость атаки ×1,45 и +8 урона', color: 0xc084fc },
  { id: 'epic_reactor', name: 'Сердце титана', description: '+60 здоровья и полное восстановление', color: 0xc084fc },
];

export class ArenaScene extends Phaser.Scene {
  private mode: Mode = 'menu';
  private player!: Phaser.GameObjects.Arc;
  private playerCore!: Phaser.GameObjects.Arc;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private experienceOrbs: ExperienceOrb[] = [];
  private epicDrop: Phaser.GameObjects.Arc | null = null;
  private modal: Phaser.GameObjects.Container | null = null;
  private keys!: GameKeys;

  private wave = 0;
  private level = 1;
  private xp = 0;
  private xpToNextLevel = 6;
  private kills = 0;
  private health = STARTING_HEALTH;
  private maxHealth = STARTING_HEALTH;
  private moveSpeed = 230;
  private attackDamage = 16;
  private attackInterval = 0.72;
  private projectileSpeed = 520;
  private projectilePierce = 0;
  private pickupRadius = 34;
  private attackTimer = 0;
  private contactCooldown = 0;
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveBreakTimer = 0;
  private playerX = GAME_WIDTH / 2;
  private playerY = GAME_HEIGHT / 2;
  private pointerTarget: Phaser.Math.Vector2 | null = null;
  private bestWave = 0;

  private waveText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private healthFill!: Phaser.GameObjects.Rectangle;
  private xpFill!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('ArenaScene');
  }

  create(): void {
    this.drawArena();
    this.createActors();
    this.createHud();
    this.createInput();
    this.bestWave = this.readBestWave();
    this.showStartScreen();
  }

  update(_time: number, delta: number): void {
    if (this.mode !== 'playing') {
      this.updateMenuKeys();
      return;
    }

    const seconds = Math.min(delta / 1000, 0.05);
    this.attackTimer -= seconds;
    this.contactCooldown = Math.max(0, this.contactCooldown - seconds);
    if (this.contactCooldown === 0) this.player.setFillStyle(0x40d9bd);

    this.movePlayer(seconds);
    if (this.mode !== 'playing') return;

    this.spawnEnemies(seconds);
    this.moveEnemies(seconds);
    if (this.mode !== 'playing') return;

    this.updateProjectiles(seconds);
    if (this.mode !== 'playing') return;

    this.collectExperience(seconds);
    if (this.mode !== 'playing') return;

    this.updateWaveFlow(seconds);
    this.updateHud();
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor('#0b1117');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101a21);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1c2a30, 0.65);
    for (let x = ARENA.left + 24; x < ARENA.right; x += 48) {
      grid.lineBetween(x, ARENA.top, x, ARENA.bottom);
    }
    for (let y = ARENA.top + 24; y < ARENA.bottom; y += 48) {
      grid.lineBetween(ARENA.left, y, ARENA.right, y);
    }
    grid.lineStyle(2, 0x3c5558, 0.9);
    grid.strokeRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top);

    [[66, 122], [894, 122], [66, 580], [894, 580]].forEach(([x, y]) => {
      this.add.rectangle(x, y, 20, 20, 0x25393d).setStrokeStyle(2, 0x58746d);
    });

    this.add.text(34, 18, 'CORE//BREAKER', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#b5f3d9',
    });
    this.add.text(GAME_WIDTH - 34, 20, 'ENDLESS PROTOCOL', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '12px', color: '#80959a',
    }).setOrigin(1, 0);
  }

  private createActors(): void {
    this.player = this.add.circle(this.playerX, this.playerY, PLAYER_RADIUS, 0x40d9bd)
      .setStrokeStyle(3, 0xbaffeb).setDepth(5);
    this.playerCore = this.add.circle(this.playerX, this.playerY, 5, 0xf4fff8).setDepth(6);
  }

  private createHud(): void {
    this.waveText = this.add.text(34, 52, 'ВОЛНА 0', this.hudStyle(16, '#f5f1df'));
    this.levelText = this.add.text(175, 54, 'УР. 1', this.hudStyle(14, '#b5f3d9'));
    this.healthText = this.add.text(34, 78, 'ЯДРО 100 / 100', this.hudStyle(12, '#ff988b'));
    this.xpText = this.add.text(352, 54, 'ОПЫТ 0 / 6', this.hudStyle(12, '#b5f3d9'));

    this.add.rectangle(155, 102, 230, 7, 0x26363a).setOrigin(0, 0.5);
    this.healthFill = this.add.rectangle(155, 102, 230, 7, 0xf07465).setOrigin(0, 0.5);
    this.add.rectangle(460, 58, 160, 6, 0x26363a).setOrigin(0, 0.5);
    this.xpFill = this.add.rectangle(460, 58, 160, 6, 0x43d9b6).setOrigin(0, 0.5).setScale(0, 1);

    this.statusText = this.add.text(700, 82, '', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '14px', color: '#d8e6df',
      backgroundColor: '#111c20', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setVisible(false);

    this.bossText = this.add.text(GAME_WIDTH / 2, 116, '', this.hudStyle(13, '#f0a0ff'))
      .setOrigin(0.5, 0).setVisible(false);

    const pauseButton = this.add.rectangle(GAME_WIDTH - 74, 54, 92, 34, 0x26383b)
      .setStrokeStyle(1, 0x65817a).setInteractive({ useHandCursor: true });
    pauseButton.on('pointerdown', () => this.togglePause());
    this.add.text(GAME_WIDTH - 74, 54, 'ПАУЗА', this.hudStyle(11, '#d4e4dc')).setOrigin(0.5);
  }

  private hudStyle(fontSize: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold', color };
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
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      escape: Phaser.Input.Keyboard.KeyCodes.ESC,
      r: Phaser.Input.Keyboard.KeyCodes.R,
    }) as GameKeys;

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.mode === 'playing' && pointer.y > 112) {
        this.pointerTarget = new Phaser.Math.Vector2(pointer.x, pointer.y);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.mode === 'playing' && pointer.isDown && this.pointerTarget) {
        this.pointerTarget.set(pointer.x, pointer.y);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { this.pointerTarget = null; });
  }

  private showStartScreen(): void {
    this.mode = 'menu';
    this.modal?.destroy(true);
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x071015, 0.84);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 660, 410, 0x142126).setStrokeStyle(2, 0x4ad8b8);
    const title = this.add.text(GAME_WIDTH / 2, 205, 'CORE//BREAKER', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#c3ffdf',
    }).setOrigin(0.5);
    const subtitle = this.add.text(GAME_WIDTH / 2, 254, 'АРЕНА НЕ ОСТАНОВИТСЯ. ТВОИ УЛУЧШЕНИЯ — ТОЖЕ.', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px', color: '#9eb9b1',
    }).setOrigin(0.5);
    const pitch = this.add.text(GAME_WIDTH / 2, 310,
      'Уничтожай дронов автоматическими импульсами.\nСобирай опыт, выбирай сборку и переживи босса каждой 10-й волны.', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '17px', color: '#dbe8df', align: 'center', lineSpacing: 9,
      }).setOrigin(0.5);
    const controls = this.add.text(GAME_WIDTH / 2, 375, 'WASD / стрелки — движение     •     На телефоне — удерживай направление', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '12px', color: '#859b97',
    }).setOrigin(0.5);
    this.modal.add([overlay, panel, title, subtitle, pitch, controls]);
    this.addActionButton(this.modal, GAME_WIDTH / 2, 438, 190, 48, 'В БОЙ', () => this.startRun(), 0x208e76);
  }

  private addActionButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: () => void,
    color: number,
  ): void {
    const button = this.add.rectangle(x, y, width, height, color)
      .setStrokeStyle(2, 0xc8ffe7).setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    const text = this.add.text(x, y, label, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#f4fff8',
    }).setOrigin(0.5);
    container.add([button, text]);
  }

  private startRun(): void {
    this.modal?.destroy(true);
    this.modal = null;
    this.clearRunObjects();
    this.mode = 'playing';
    this.wave = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = 6;
    this.kills = 0;
    this.health = STARTING_HEALTH;
    this.maxHealth = STARTING_HEALTH;
    this.moveSpeed = 230;
    this.attackDamage = 16;
    this.attackInterval = 0.72;
    this.projectileSpeed = 520;
    this.projectilePierce = 0;
    this.pickupRadius = 34;
    this.attackTimer = 0;
    this.contactCooldown = 0;
    this.playerX = GAME_WIDTH / 2;
    this.playerY = GAME_HEIGHT / 2;
    this.player.setPosition(this.playerX, this.playerY).setVisible(true).setFillStyle(0x40d9bd);
    this.playerCore.setPosition(this.playerX, this.playerY).setVisible(true);
    this.pointerTarget = null;
    this.statusText.setVisible(false);
    this.startNextWave();
    this.updateHud();
  }

  private clearRunObjects(): void {
    this.enemies.forEach(({ body }) => body.destroy());
    this.projectiles.forEach(({ body }) => body.destroy());
    this.experienceOrbs.forEach(({ body }) => body.destroy());
    this.enemies = [];
    this.projectiles = [];
    this.experienceOrbs = [];
    this.epicDrop?.destroy();
    this.epicDrop = null;
    this.spawnQueue = [];
  }

  private updateMenuKeys(): void {
    if (this.mode === 'menu' && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
      this.startRun();
    } else if (this.mode === 'paused' && Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
      this.resumeRun();
    } else if (this.mode === 'gameover' && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.startRun();
    }
  }

  private movePlayer(seconds: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
      this.togglePause();
      return;
    }

    let dx = Number(this.keys.right.isDown || this.keys.d.isDown) - Number(this.keys.left.isDown || this.keys.a.isDown);
    let dy = Number(this.keys.down.isDown || this.keys.s.isDown) - Number(this.keys.up.isDown || this.keys.w.isDown);

    if (dx === 0 && dy === 0 && this.pointerTarget) {
      dx = this.pointerTarget.x - this.playerX;
      dy = this.pointerTarget.y - this.playerY;
      if (Math.hypot(dx, dy) < 14) {
        this.pointerTarget = null;
        dx = 0;
        dy = 0;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.playerX += (dx / length) * this.moveSpeed * seconds;
      this.playerY += (dy / length) * this.moveSpeed * seconds;
    }

    this.playerX = Phaser.Math.Clamp(this.playerX, ARENA.left + PLAYER_RADIUS, ARENA.right - PLAYER_RADIUS);
    this.playerY = Phaser.Math.Clamp(this.playerY, ARENA.top + PLAYER_RADIUS, ARENA.bottom - PLAYER_RADIUS);
    this.player.setPosition(this.playerX, this.playerY);
    this.playerCore.setPosition(this.playerX, this.playerY);

    if (this.attackTimer <= 0) this.fireAtNearestEnemy();
  }

  private fireAtNearestEnemy(): void {
    let target: Enemy | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      const distance = Phaser.Math.Distance.Between(this.playerX, this.playerY, enemy.body.x, enemy.body.y);
      if (distance < nearestDistance) {
        target = enemy;
        nearestDistance = distance;
      }
    }
    if (!target) return;

    const directionX = target.body.x - this.playerX;
    const directionY = target.body.y - this.playerY;
    const distance = Math.hypot(directionX, directionY) || 1;
    const body = this.add.circle(this.playerX, this.playerY, 6, 0xffd078)
      .setStrokeStyle(2, 0xfff0c1).setDepth(4);
    this.projectiles.push({
      body,
      velocityX: (directionX / distance) * this.projectileSpeed,
      velocityY: (directionY / distance) * this.projectileSpeed,
      damage: this.attackDamage,
      pierce: this.projectilePierce,
      hit: new Set<Enemy>(),
      lifetime: 1.5,
    });
    this.attackTimer = this.attackInterval;
  }

  private startNextWave(): void {
    this.wave += 1;
    this.waveBreakTimer = 0;
    this.spawnQueue = [];
    if (this.wave % 10 === 0) {
      this.spawnQueue.push('boss', 'scrap', 'runner', 'scrap', 'tank');
      this.statusText.setText(`ВОЛНА ${this.wave}: БОСС РЕАКТОРА`);
    } else {
      const count = Math.min(4 + this.wave, 16);
      for (let index = 0; index < count; index += 1) {
        this.spawnQueue.push(index % 6 === 5 ? 'tank' : index % 3 === 2 ? 'runner' : 'scrap');
      }
      this.statusText.setText(`ВОЛНА ${this.wave} — ВРАГИ НА ПОДХОДЕ`);
    }
    this.statusText.setVisible(true);
    this.spawnTimer = 0.45;
  }

  private spawnEnemies(seconds: number): void {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= seconds;
    if (this.spawnTimer > 0) return;
    const kind = this.spawnQueue.shift();
    if (kind) this.createEnemy(kind);
    this.spawnTimer = Math.max(0.24, 0.78 - this.wave * 0.025);
  }

  private createEnemy(kind: EnemyKind): void {
    const position = this.randomEdgePosition();
    const isBoss = kind === 'boss';
    const radius = isBoss ? 30 : kind === 'tank' ? 18 : 13;
    const color = isBoss ? 0xd86c98 : kind === 'tank' ? 0xef8668 : kind === 'runner' ? 0xe8b85c : 0xc6d36b;
    const body = this.add.circle(position.x, position.y, radius, color)
      .setStrokeStyle(isBoss ? 4 : 2, 0xffded0).setDepth(3);
    const waveScale = 1 + Math.max(0, this.wave - 1) * 0.065;
    const stats = {
      scrap: { health: 30, speed: 64, xp: 1 },
      runner: { health: 20, speed: 105, xp: 1 },
      tank: { health: 74, speed: 42, xp: 2 },
      boss: { health: 360 + this.wave * 9, speed: 52, xp: 10 },
    }[kind];
    this.enemies.push({
      body,
      kind,
      health: stats.health * waveScale,
      speed: stats.speed * (isBoss ? 1 : 1 + this.wave * 0.012),
      radius,
      xp: stats.xp,
    });
  }

  private randomEdgePosition(): Phaser.Math.Vector2 {
    const edge = Phaser.Math.Between(0, 3);
    const x = Phaser.Math.Between(ARENA.left + 30, ARENA.right - 30);
    const y = Phaser.Math.Between(ARENA.top + 30, ARENA.bottom - 30);
    if (edge === 0) return new Phaser.Math.Vector2(x, ARENA.top + 8);
    if (edge === 1) return new Phaser.Math.Vector2(x, ARENA.bottom - 8);
    if (edge === 2) return new Phaser.Math.Vector2(ARENA.left + 8, y);
    return new Phaser.Math.Vector2(ARENA.right - 8, y);
  }

  private moveEnemies(seconds: number): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (!enemy) continue;
      const dx = this.playerX - enemy.body.x;
      const dy = this.playerY - enemy.body.y;
      const distance = Math.hypot(dx, dy) || 1;
      enemy.body.x += (dx / distance) * enemy.speed * seconds;
      enemy.body.y += (dy / distance) * enemy.speed * seconds;
      if (distance <= enemy.radius + PLAYER_RADIUS && this.contactCooldown <= 0) {
        this.damagePlayer(enemy.kind === 'boss' ? 24 : enemy.kind === 'tank' ? 18 : 12);
      }
    }
  }

  private updateProjectiles(seconds: number): void {
    for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = this.projectiles[projectileIndex];
      if (!projectile) continue;
      projectile.body.x += projectile.velocityX * seconds;
      projectile.body.y += projectile.velocityY * seconds;
      projectile.lifetime -= seconds;
      let removeProjectile = projectile.lifetime <= 0
        || projectile.body.x < ARENA.left || projectile.body.x > ARENA.right
        || projectile.body.y < ARENA.top || projectile.body.y > ARENA.bottom;

      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0 && !removeProjectile; enemyIndex -= 1) {
        const enemy = this.enemies[enemyIndex];
        if (!enemy || projectile.hit.has(enemy)) continue;
        const distance = Phaser.Math.Distance.Between(projectile.body.x, projectile.body.y, enemy.body.x, enemy.body.y);
        if (distance > enemy.radius + 7) continue;
        projectile.hit.add(enemy);
        enemy.health -= projectile.damage;
        if (enemy.health <= 0) this.destroyEnemy(enemy);
        if (projectile.pierce > 0) projectile.pierce -= 1;
        else removeProjectile = true;
        if (this.mode !== 'playing') return;
      }

      if (removeProjectile) {
        projectile.body.destroy();
        this.projectiles.splice(projectileIndex, 1);
      }
    }
  }

  private destroyEnemy(enemy: Enemy): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    const { x, y } = enemy.body;
    enemy.body.destroy();
    this.enemies.splice(index, 1);
    this.kills += 1;
    this.createExperienceOrb(x, y, enemy.xp);
    if (enemy.kind === 'boss') {
      this.epicDrop = this.add.circle(x, y, 15, 0xb875e8)
        .setStrokeStyle(3, 0xf1cbff).setDepth(4);
      this.statusText.setText('БОСС ПОВЕРЖЕН — ЗАБЕРИ ЭПИЧЕСКИЙ МОДУЛЬ');
      this.statusText.setVisible(true);
    }
  }

  private createExperienceOrb(x: number, y: number, value: number): void {
    const body = this.add.circle(x, y, value > 1 ? 8 : 6, 0x6fe4aa)
      .setStrokeStyle(2, 0xc8ffdc).setDepth(2);
    this.experienceOrbs.push({ body, value });
  }

  private collectExperience(seconds: number): void {
    for (let index = this.experienceOrbs.length - 1; index >= 0; index -= 1) {
      const orb = this.experienceOrbs[index];
      if (!orb) continue;
      const dx = this.playerX - orb.body.x;
      const dy = this.playerY - orb.body.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < this.pickupRadius + 100) {
        const pullSpeed = distance < this.pickupRadius + 24 ? 280 : 125;
        orb.body.x += (dx / distance) * pullSpeed * seconds;
        orb.body.y += (dy / distance) * pullSpeed * seconds;
      }
      if (distance <= this.pickupRadius) {
        orb.body.destroy();
        this.experienceOrbs.splice(index, 1);
        this.gainExperience(orb.value);
        if (this.mode !== 'playing') return;
      }
    }

    if (this.epicDrop) {
      const distance = Phaser.Math.Distance.Between(this.playerX, this.playerY, this.epicDrop.x, this.epicDrop.y);
      if (distance <= 34) {
        this.epicDrop.destroy();
        this.epicDrop = null;
        this.showUpgradeChoices(true);
      }
    }
  }

  private gainExperience(amount: number): void {
    this.xp += amount;
    this.checkLevelUp();
  }

  private checkLevelUp(): void {
    if (this.mode !== 'playing' || this.xp < this.xpToNextLevel) return;
    this.xp -= this.xpToNextLevel;
    this.level += 1;
    this.xpToNextLevel = 6 + this.level * 4;
    this.showUpgradeChoices(false);
  }

  private showUpgradeChoices(epic: boolean): void {
    this.mode = epic ? 'epic' : 'upgrade';
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x071015, 0.86);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 820, 370, 0x142126)
      .setStrokeStyle(2, epic ? 0xc084fc : 0x48d6be);
    const title = this.add.text(GAME_WIDTH / 2, 174, epic ? 'ЭПИЧЕСКИЙ МОДУЛЬ' : `УРОВЕНЬ ${this.level}`, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '28px', fontStyle: 'bold',
      color: epic ? '#e9c7ff' : '#c3ffdf',
    }).setOrigin(0.5);
    const subtitle = this.add.text(GAME_WIDTH / 2, 211,
      epic ? 'Трофей босса. Выбери один уникальный эффект.' : 'Выбери один модуль. Выбор меняет стиль сборки.', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '14px', color: '#a7bbb3',
      }).setOrigin(0.5);
    this.modal.add([overlay, panel, title, subtitle]);

    const choices = epic ? EPIC_UPGRADES : this.pickCommonUpgrades();
    choices.forEach((upgrade, index) => {
      const x = GAME_WIDTH / 2 + (index - 1) * 250;
      const card = this.add.rectangle(x, 354, 222, 190, 0x1d3034)
        .setStrokeStyle(2, upgrade.color).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => this.chooseUpgrade(upgrade, epic));
      const tag = this.add.text(x, 293, epic ? 'ЭПИЧЕСКИЙ' : `МОДУЛЬ 0${index + 1}`, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', fontStyle: 'bold',
        color: `#${upgrade.color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
      const name = this.add.text(x, 333, upgrade.name, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#eff9f2',
        align: 'center', wordWrap: { width: 190 },
      }).setOrigin(0.5);
      const description = this.add.text(x, 382, upgrade.description, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px', color: '#a9c0b8',
        align: 'center', wordWrap: { width: 184 },
      }).setOrigin(0.5, 0);
      const hint = this.add.text(x, 431, 'НАЖМИ, ЧТОБЫ ВЫБРАТЬ', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '9px', color: '#718985',
      }).setOrigin(0.5);
      this.modal?.add([card, tag, name, description, hint]);
    });
  }

  private pickCommonUpgrades(): Upgrade[] {
    const pool = [...COMMON_UPGRADES];
    const choices: Upgrade[] = [];
    while (choices.length < 3 && pool.length > 0) {
      const index = Phaser.Math.Between(0, pool.length - 1);
      const [upgrade] = pool.splice(index, 1);
      if (upgrade) choices.push(upgrade);
    }
    return choices;
  }

  private chooseUpgrade(upgrade: Upgrade, epic: boolean): void {
    this.applyUpgrade(upgrade.id);
    this.modal?.destroy(true);
    this.modal = null;
    this.mode = 'playing';
    this.statusText.setText(`${upgrade.name.toUpperCase()} УСТАНОВЛЕН`);
    this.statusText.setVisible(true);
    this.updateHud();
    if (!epic) this.checkLevelUp();
  }

  private applyUpgrade(id: UpgradeId): void {
    switch (id) {
      case 'damage': this.attackDamage += 6; break;
      case 'rapid': this.attackInterval = Math.max(0.2, this.attackInterval * 0.82); break;
      case 'armor':
        this.maxHealth += 25;
        this.health = Math.min(this.maxHealth, this.health + 25);
        break;
      case 'speed': this.moveSpeed *= 1.16; break;
      case 'pierce': this.projectilePierce += 1; break;
      case 'magnet': this.pickupRadius += 45; break;
      case 'epic_arc': this.projectilePierce += 2; this.attackDamage += 12; break;
      case 'epic_overclock':
        this.attackInterval = Math.max(0.16, this.attackInterval / 1.45);
        this.attackDamage += 8;
        break;
      case 'epic_reactor': this.maxHealth += 60; this.health = this.maxHealth; break;
    }
  }

  private damagePlayer(amount: number): void {
    if (this.contactCooldown > 0 || this.mode !== 'playing') return;
    this.health = Math.max(0, this.health - amount);
    this.contactCooldown = 0.68;
    this.player.setFillStyle(0xff8876);
    this.statusText.setText(`ЯДРО ПОВРЕЖДЕНО −${amount}`);
    this.statusText.setVisible(true);
    if (this.health <= 0) this.endRun();
  }

  private updateWaveFlow(seconds: number): void {
    const boss = this.enemies.find((enemy) => enemy.kind === 'boss');
    if (boss) {
      const bossMaxHealth = (360 + this.wave * 9) * (1 + Math.max(0, this.wave - 1) * 0.065);
      this.bossText.setText(`БАСТИОН ${Math.max(0, Math.ceil((boss.health / bossMaxHealth) * 100))}%`);
      this.bossText.setVisible(true);
    } else {
      this.bossText.setVisible(false);
    }

    if (this.spawnQueue.length > 0 || this.enemies.length > 0 || this.epicDrop) {
      this.waveBreakTimer = 0;
      return;
    }
    this.waveBreakTimer += seconds;
    if (this.waveBreakTimer >= 2) this.startNextWave();
  }

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.pointerTarget = null;
      this.modal = this.add.container(0, 0).setDepth(100);
      const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x071015, 0.78);
      const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 430, 240, 0x142126).setStrokeStyle(2, 0x48d6be);
      const title = this.add.text(GAME_WIDTH / 2, 258, 'ПАУЗА', this.hudStyle(28, '#c3ffdf')).setOrigin(0.5);
      this.modal.add([overlay, panel, title]);
      this.addActionButton(this.modal, GAME_WIDTH / 2, 330, 210, 46, 'ПРОДОЛЖИТЬ', () => this.resumeRun(), 0x208e76);
    } else if (this.mode === 'paused') {
      this.resumeRun();
    }
  }

  private resumeRun(): void {
    this.modal?.destroy(true);
    this.modal = null;
    this.mode = 'playing';
  }

  private endRun(): void {
    this.mode = 'gameover';
    const isRecord = this.wave > this.bestWave;
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.writeBestWave(this.bestWave);
    this.pointerTarget = null;
    this.modal = this.add.container(0, 0).setDepth(100);
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x071015, 0.86);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 620, 350, 0x142126).setStrokeStyle(2, 0xf07465);
    const title = this.add.text(GAME_WIDTH / 2, 227, 'ЯДРО ПОГАСЛО', this.hudStyle(32, '#ff988b')).setOrigin(0.5);
    const stats = this.add.text(GAME_WIDTH / 2, 290,
      `Достигнута волна ${this.wave}\nУничтожено дронов: ${this.kills}\nРекорд: ${this.bestWave}${isRecord ? '  •  НОВЫЙ' : ''}`, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '16px', color: '#c4d8ce', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5);
    this.modal.add([overlay, panel, title, stats]);
    this.addActionButton(this.modal, GAME_WIDTH / 2, 420, 210, 48, 'НОВЫЙ ЗАБЕГ', () => this.startRun(), 0x208e76);
  }

  private updateHud(): void {
    this.waveText.setText(`ВОЛНА ${String(this.wave).padStart(2, '0')}`);
    this.levelText.setText(`УР. ${this.level}`);
    this.healthText.setText(`ЯДРО ${Math.ceil(this.health)} / ${this.maxHealth}`);
    this.xpText.setText(`ОПЫТ ${this.xp} / ${this.xpToNextLevel}`);
    this.healthFill.setScale(Math.max(0.01, this.health / this.maxHealth), 1);
    this.xpFill.setScale(Math.max(0.01, this.xp / this.xpToNextLevel), 1);
  }

  private readBestWave(): number {
    try {
      return Number(window.localStorage.getItem('core-breaker-best-wave') ?? 0);
    } catch {
      return 0;
    }
  }

  private writeBestWave(wave: number): void {
    try {
      window.localStorage.setItem('core-breaker-best-wave', String(wave));
    } catch {
      // Local storage may be unavailable in private browsing.
    }
  }
}