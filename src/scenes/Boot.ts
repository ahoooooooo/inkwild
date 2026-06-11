import { Scene } from 'phaser';

export class Boot extends Scene {
    constructor() {
        super('Boot');
    }

    preload(): void {
        this.cameras.main.setBackgroundColor('#14110c');
        this.load.setPath('assets');
        this.load.image('title_bg', 'title_bg.png');
        this.load.image('logo', 'logo.png');
        this.load.image('beast_ninetails', 'beast_ninetails.png');
        this.load.image('hunter', 'hunter.png');
        this.load.image('slash', 'slash.png');
        this.load.image('beast_foxling', 'beast_foxling.png');
        this.load.image('forge_bg', 'forge_bg.png');
        this.load.image('pet_crane', 'pet_crane.png');
    }

    create(): void {
        this.scene.start('Title');
    }
}
