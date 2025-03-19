let config = {
    type: Phaser.AUTO,
    width: 400,
    height: 400,
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 400,
        height: 400
    },
    render: {
        pixelArt: true,
        antialias: false
    }
};

let game = new Phaser.Game(config);
let npcCount = 3;
let stealTimer = null;
let map;
let remainingTime = 30;

function preload() {
    this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
    this.load.image('npc', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
    this.load.tilemapTiledJSON('map', '/assets/city.json');
    this.load.image('tileset', '/assets/tilemap.png');
    this.load.image('door', '/assets/door.png');

    this.load.on('complete', () => {
        console.log('Loading complete');
    });
    this.load.on('loaderror', (file) => {
        console.error('Error loading:', file.key);
    });
}

function create() {
    console.log('Creating map...');
    map = this.make.tilemap({ key: 'map' });
    if (!map) {
        console.error('Map not created! Check city.json file');
        return;
    }
    console.log('Map created:', map);
    console.log('Map size:', map.widthInPixels, map.heightInPixels);

    const tileset = map.addTilesetImage('city-tileset', 'tileset', 8, 8, 0, 1);
    if (!tileset) {
        console.error('Error: Tileset "city-tileset" not found.');
        return;
    }
    console.log('Tileset loaded:', tileset);

    this.cameras.main.setBackgroundColor('#000000');

    const collisionLayer = map.createLayer('colisao', tileset, 0, 0);
    const groundLayer = map.createLayer('chao', tileset, 0, 0);
    const buildingsLayer = map.createLayer('predios', tileset, 0, 0);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    const scaleX = this.scale.width / map.widthInPixels;
    const scaleY = this.scale.height / map.heightInPixels;
    const zoom = Math.min(scaleX, scaleY);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);

    this.player = this.physics.add.sprite(map.widthInPixels / 2, map.widthInPixels / 2, 'player')
        .setScale(1)
        .setOrigin(0.5, 0.5)
        .setTint(0xff0000);
    this.player.setCollideWorldBounds(true);

    this.npcs = this.physics.add.group();
    for (let i = 0; i < npcCount; i++) {
        let x = Phaser.Math.Between(50, map.widthInPixels - 50);
        let y = Phaser.Math.Between(50, map.heightInPixels - 50);
        let npc = this.npcs.create(x, y, 'npc')
            .setScale(1)
            .setOrigin(0.5, 0.5);
        npc.setCollideWorldBounds(true);
        npc.setBounce(1);
        moveNpc.call(this, npc);
    }

    this.stealText = this.add.text(50, 10, '', { fontSize: '16px', fill: '#fff' }).setScrollFactor(0).setVisible(true);
    this.escapeText = this.add.text(10, 30, '', { fontSize: '12px', fill: '#fff' }).setScrollFactor(0).setVisible(true);
    this.timerText = this.add.text(10, 50, 'Time: 30', { fontSize: '16px', fill: '#fff' }).setScrollFactor(0).setVisible(true);
    this.bloodScreen = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xff0000).setOrigin(0).setAlpha(0).setScrollFactor(0);

    this.stealKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.runKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.escapeZone = this.physics.add.sprite(map.widthInPixels / 2, map.heightInPixels / 2, 'door')
        .setScale(0.5)
        .setAlpha(0);
    this.physics.add.overlap(this.player, this.escapeZone, escape, null, this);

    this.targetNpc = null;
    this.escapeEnabled = false;
    this.isEscaping = false;
    this.isJumping = false;

    remainingTime = 30;
    this.timer = this.time.addEvent({
        delay: 1000,
        callback: () => {
            remainingTime--;
            this.timerText.setText('Time: ' + remainingTime);
            if (remainingTime <= 0 && !this.isEscaping) {
                explode.call(this);
            }
        },
        callbackScope: this,
        loop: true
    });

    this.scale.on('resize', resize, this);
    document.addEventListener('fullscreenchange', () => {
        resize.call(this, this.scale);
    });

    resize.call(this, this.scale);
}

function update() {
    let speed = 90;
    if (this.runKey.isDown) {
        speed = 150;
    }

    const cursor = this.input.keyboard.createCursorKeys();

    if (cursor.left.isDown) {
        this.player.setVelocityX(-speed);
    } else if (cursor.right.isDown) {
        this.player.setVelocityX(speed);
    } else {
        this.player.setVelocityX(0);
    }

    if (cursor.up.isDown) {
        this.player.setVelocityY(-speed);
    } else if (cursor.down.isDown) {
        this.player.setVelocityY(speed);
    } else {
        this.player.setVelocityY(0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) && !this.isJumping) {
        this.isJumping = true;
        let initialY = this.player.y;
        this.tweens.add({
            targets: this.player,
            y: initialY - 50,
            duration: 200,
            ease: 'Quad.easeOut',
            yoyo: true,
            onComplete: () => {
                this.isJumping = false;
            }
        });
    }

    let closeNpc = null;
    this.npcs.children.iterate(npc => {
        let distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
        if (distance < 50) {
            closeNpc = npc;
        }
    });

    if (closeNpc) {
        this.stealText.setText('Press E to steal');
        this.targetNpc = closeNpc;

        if (!stealTimer && !this.isEscaping) {
            stealTimer = this.time.delayedCall(1000, () => {
                explode.call(this);
            }, [], this);
        }
    } else {
        this.stealText.setText('');
        this.targetNpc = null;
        if (stealTimer) {
            stealTimer.remove();
            stealTimer = null;
        }
    }

    if (Phaser.Input.Keyboard.JustDown(this.stealKey) && this.targetNpc) {
        steal.call(this);
    }

    if (this.npcs.countActive(true) === 0 && this.escapeZone.alpha === 0) {
        enableEscape.call(this);
    }
}

function resize(scale) {
    const width = scale.width;
    const height = scale.height;

    this.cameras.main.setViewport(0, 0, width, height);
    const scaleX = width / map.widthInPixels;
    const scaleY = height / map.heightInPixels;
    const zoom = Math.min(scaleX, scaleY);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);

    this.escapeZone.setPosition(map.widthInPixels / 2, map.widthInPixels / 2);
    this.stealText.setPosition(50, 10);
    this.escapeText.setPosition(10, 30);
    this.timerText.setPosition(10, 50);
    this.bloodScreen.setSize(width, height);
}

function moveNpc(npc) {
    if (!npc.active) return;

    let dirX = Phaser.Math.Between(-50, 50);
    let dirY = Phaser.Math.Between(-50, 50);
    npc.setVelocity(dirX, dirY);

    this.time.delayedCall(1000, () => {
        if (!npc.active) return;
        npc.setVelocity(0, 0);
        this.time.delayedCall(1000, () => {
            if (npc.active) {
                moveNpc.call(this, npc);
            }
        });
    });
}

function steal() {
    if (this.targetNpc) {
        this.stealText.setText('');
        let npcToRemove = this.targetNpc;
        this.npcs.remove(npcToRemove, true, true);
        npcToRemove.destroy();
        this.targetNpc = null;

        if (stealTimer) {
            stealTimer.remove();
            stealTimer = null;
        }
    }
}

function explode() {
    this.escapeText.setText('You exploded! Restarting...');
    this.player.setVelocity(0, 0);
    this.tweens.add({
        targets: this.player,
        alpha: 0,
        duration: 500,
        ease: 'Linear'
    });
    this.tweens.add({
        targets: this.bloodScreen,
        alpha: 0.7,
        duration: 300,
        yoyo: true,
        hold: 200,
        onComplete: () => {
            this.time.delayedCall(1000, () => {
                this.scene.restart();
                npcCount = 3;
                remainingTime = 30;
            });
        }
    });
}

function enableEscape() {
    this.escapeText.setText('All robbed! Run to the exit!');
    this.escapeZone.setAlpha(1);
    this.escapeEnabled = true;
}

function escape() {
    if (this.escapeZone.alpha === 1 && this.escapeEnabled && !this.isEscaping) {
        this.isEscaping = true;
        this.escapeText.setText('Stage complete! Loading next stage...');
        this.tweens.add({
            targets: [this.escapeZone, this.escapeText],
            alpha: 0,
            duration: 1000,
            ease: 'Linear',
            onComplete: () => {
                this.escapeZone.destroy();
                this.time.delayedCall(1000, () => {
                    loadNextStage.call(this);
                });
            }
        });
    }
}

function loadNextStage() {
    this.isEscaping = false;
    npcCount += 2;
    remainingTime = 30;
    this.scene.restart();
}