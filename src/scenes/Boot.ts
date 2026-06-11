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
    }

    create(): void {
        this.scene.start('Title');
    }
}
