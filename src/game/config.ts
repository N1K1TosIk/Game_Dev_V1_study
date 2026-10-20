import Phaser from 'phaser';
import { DefenseScene } from './DefenseScene';
import { GAMEPLAY_CONFIG } from './gameplayConfig';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAMEPLAY_CONFIG.scene.width,
    height: GAMEPLAY_CONFIG.scene.height,
    backgroundColor: '#0c1419',
    scene: [DefenseScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
