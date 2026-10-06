import Phaser from 'phaser';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 600;
const PLAYER_SPEED = 220;
const JUMP_SPEED = 520;
const GRAVITY = 1000;
const LEVEL_TIME = 60;

interface Spark {
  body: Phaser.GameObjects.Arc;
  minX: number;
  maxX: number;
  dir: number;
  speed: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private platforms!: Phaser.GameObjects.Rectangle[];
  private batteries!: Phaser.GameObjects.Arc[];
  private sparks!: Spark[];
  private finish!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private isGameOver = false;
  private timeLeft = LEVEL_TIME;
  private collected = 0;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftHeld = false;
  private rightHeld = false;
  private jumpPressed = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#0b1020');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x0b1020);

    this.platforms = [
      this.add.rectangle(180, 540, 360, 28, 0x4b5563),
      this.add.rectangle(610, 470, 260, 24, 0x4b5563),
      this.add.rectangle(980, 400, 220, 24, 0x4b5563),
      this.add.rectangle(1360, 470, 260, 24, 0x4b5563),
      this.add.rectangle(1700, 390, 210, 24, 0x4b5563),
      this.add.rectangle(1940, 540, 100, 28, 0x4b5563),
    ];

    this.platforms.forEach((platform) => {
      this.physics.add.existing(platform, true);
    });

    this.player = this.add.rectangle(120, 470, 32, 32, 0xf59e0b);
    this.player.setStrokeStyle(3, 0xfbbf24);
    this.physics.add.existing(this.player);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCollideWorldBounds(true);
    playerBody.setSize(28, 28);
    playerBody.setBounce(0);
    playerBody.setGravityY(GRAVITY);
    playerBody.setMaxVelocity(400, 900);

    this.physics.add.collider(this.player, this.platforms);

    this.finish = this.add.rectangle(1900, 330, 36, 90, 0xf8fafc);
    this.finish.setStrokeStyle(3, 0xe2e8f0);
    this.physics.add.existing(this.finish, true);

    this.batteries = [
      this.add.circle(680, 428, 10, 0x4ade80),
      this.add.circle(1080, 350, 10, 0x4ade80),
      this.add.circle(1720, 340, 10, 0x4ade80),
    ];

    this.batteries.forEach((battery) => {
      this.physics.add.existing(battery);
      const body = battery.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setCircle(10);
    });

    this.sparks = [
      { body: this.add.circle(820, 440, 12, 0xfacc15), minX: 760, maxX: 930, speed: 120, dir: 1 },
      { body: this.add.circle(1420, 440, 12, 0xfacc15), minX: 1360, maxX: 1530, speed: 140, dir: -1 },
    ];

    this.sparks.forEach((spark) => {
      this.physics.add.existing(spark.body);
      const body = spark.body.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setCircle(12);
    });

    if (!this.input.keyboard) {
      throw new Error('Keyboard input unavailable');
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.scoreText = this.add.text(18, 18, 'Батарейки: 0/3', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#f8fafc',
      backgroundColor: '#111827aa',
      padding: { x: 12, y: 8 },
    });

    this.timerText = this.add.text(18, 52, 'Время: 60', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#f8fafc',
      backgroundColor: '#111827aa',
      padding: { x: 12, y: 8 },
    });

    this.statusText = this.add.text(200, 20, 'Собери 3 батарейки и иди к розетке', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#e2e8f0',
      backgroundColor: '#111827aa',
      padding: { x: 12, y: 8 },
    });

    this.resetGame();
  }

  update(_time: number, delta: number): void {
    const seconds = delta / 1000;

    if (this.isGameOver) return;

    const moveLeft = this.cursors.left.isDown || this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A).isDown;
    const moveRight = this.cursors.right.isDown || this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D).isDown;
    const jumpPressed = this.cursors.up.isDown || this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W).isDown || this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).isDown;

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (moveLeft) {
      playerBody.setVelocityX(-PLAYER_SPEED);
    } else if (moveRight) {
      playerBody.setVelocityX(PLAYER_SPEED);
    } else {
      playerBody.setVelocityX(0);
    }

    if (jumpPressed && playerBody.blocked.down) {
      playerBody.setVelocityY(-JUMP_SPEED);
    }

    this.timeLeft = Math.max(0, this.timeLeft - seconds);
    this.timerText.setText(`Время: ${Math.ceil(this.timeLeft)}`);

    this.sparks.forEach((spark) => {
      spark.body.x += spark.dir * spark.speed * seconds;
      if (spark.body.x < spark.minX || spark.body.x > spark.maxX) {
        spark.dir *= -1;
      }

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, spark.body.x, spark.body.y);
      if (distance <= 24) {
        this.lose('Ты сгорел!');
      }
    });

    this.batteries.forEach((battery) => {
      if (!battery.visible) return;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, battery.x, battery.y);
      if (distance <= 26) {
        battery.setVisible(false);
        this.collected += 1;
        this.scoreText.setText(`Батарейки: ${this.collected}/3`);
      }
    });

    if (this.collected >= 3) {
      const finishDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.finish.x, this.finish.y);
      if (finishDistance <= 70) {
        this.win();
      }
    }

    if (this.player.y > WORLD_HEIGHT + 80) {
      this.lose('Ты сгорел!');
    }

    if (this.timeLeft <= 0) {
      this.lose('Время вышло');
    }

    this.cameras.main.setScroll(Math.max(0, this.player.x - 420), 0);
  }

  private resetGame(): void {
    this.collected = 0;
    this.timeLeft = LEVEL_TIME;
    this.isGameOver = false;
    this.player.setPosition(120, 470);
    this.player.setFillStyle(0xf59e0b);
    this.player.setVisible(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(true);

    this.batteries.forEach((battery) => battery.setVisible(true));
    this.scoreText.setText('Батарейки: 0/3');
    this.timerText.setText('Время: 60');
    this.statusText.setText('Собери 3 батарейки и иди к розетке');
    this.statusText.setVisible(true);
  }

  private win(): void {
    this.isGameOver = true;
    const score = this.collected * 100 + Math.ceil(this.timeLeft) * 10;
    const record = Number(localStorage.getItem('cat-electric-record') ?? '0');
    const best = Math.max(record, score);
    localStorage.setItem('cat-electric-record', String(best));

    this.statusText.setText(`Свет починен! Очки: ${score}. Рекорд: ${best}`);
    this.statusText.setVisible(true);
  }

  private lose(reason: string): void {
    this.isGameOver = true;
    const score = this.collected * 100 + Math.ceil(this.timeLeft) * 10;
    const record = Number(localStorage.getItem('cat-electric-record') ?? '0');
    const best = Math.max(record, score);
    localStorage.setItem('cat-electric-record', String(best));

    this.player.setFillStyle(0xf87171);
    this.statusText.setText(`${reason}. Очки: ${score}. Рекорд: ${best}. Нажми R для рестарта`);
    this.statusText.setVisible(true);

    this.input.keyboard?.on('keydown-R', () => this.resetGame());
  }
}
