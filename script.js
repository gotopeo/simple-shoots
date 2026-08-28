const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartButton = document.getElementById('restartButton');

// ゲームの基本設定
canvas.width = 480;
canvas.height = 640;

// 星の背景
let stars = [];
for (let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 2 + 0.5
    });
}

// ボス
let boss = null;
const bossWidth = 120;
const bossHeight = 80;

// 当たり判定用関数 (円形判定)
function isColliding(obj1, obj2, r1, r2) {
    const dx = (obj1.x + (obj1.width || 0) / 2) - (obj2.x + (obj2.width || 0) / 2);
    const dy = (obj1.y + (obj1.height || 0) / 2) - (obj2.y + (obj2.height || 0) / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < r1 + r2;
}

// プレイヤー
const player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 60,
    width: 40,
    height: 40,
    radius: 12, // ヒットボックス
    color: '#00d4ff',
    speed: 5,
    dx: 0,
    lives: 3,
    powerUp: null, // 'wide', 'speed', 'barrier'
    powerUpTimer: 0,
    invincible: 0
};

// プレイヤーの弾
let playerBullets = [];
const playerBulletSpeed = 10;
let lastShootTime = 0;
const shootInterval = 200;

// 敵
let enemies = [];
const enemyWidth = 40;
const enemyHeight = 40;
const enemyRadius = 15;
const initialEnemySpeed = 2;
let enemySpeed = initialEnemySpeed;
let enemySpawnTimer = 0;
const initialEnemySpawnRate = 100;

// アイテム
let items = [];
const itemTypes = [
    { type: 'wide', color: '#ffff00', label: 'W' },
    { type: 'speed', color: '#00ff00', label: 'S' },
    { type: 'barrier', color: '#00ffff', label: 'B' }
];

// 敵の弾
let enemyBullets = [];
const enemyBulletSpeed = 5;
let enemyShootTimer = 0;
const initialEnemyShootRate = 70;

// パーティクル
let particles = [];

// スコア
let score = 0;
let lastBossScore = 0;
let gameOver = false;

// キー入力
const keys = {
    right: false,
    left: false,
    up: false,
    down: false,
    space: false
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowUp') keys.up = true;
    if (e.key === 'ArrowDown') keys.down = true;
    if (e.key === ' ') keys.space = true;
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowUp') keys.up = false;
    if (e.key === 'ArrowDown') keys.down = false;
    if (e.key === ' ') keys.space = false;
});

restartButton.addEventListener('click', resetGame);

// タッチ操作（スマホ用の仮想ボタン）
function bindTouchButton(id, keyName) {
    const btn = document.getElementById(id);
    const press = (e) => { e.preventDefault(); keys[keyName] = true; };
    const release = (e) => { e.preventDefault(); keys[keyName] = false; };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
}
bindTouchButton('btnLeft', 'left');
bindTouchButton('btnRight', 'right');
bindTouchButton('btnUp', 'up');
bindTouchButton('btnDown', 'down');
bindTouchButton('btnShot', 'space');

function drawStars() {
    ctx.fillStyle = 'white';
    stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

function moveStars() {
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });
}

function drawPlayer() {
    if (player.invincible > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;

    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    
    if (player.powerUp === 'barrier') {
        ctx.beginPath();
        ctx.arc(0, 0, player.width * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 2);
    ctx.lineTo(player.width / 2, player.height / 2);
    ctx.lineTo(0, player.height / 4);
    ctx.lineTo(-player.width / 2, player.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(-5, -10, 10, 15);

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'cyan';
    ctx.fillStyle = player.powerUp === 'speed' ? 'cyan' : 'orange';
    ctx.fillRect(-10, player.height / 3, 5, 10);
    ctx.fillRect(5, player.height / 3, 5, 10);
    
    ctx.restore();
}

function movePlayer() {
    player.dx = 0;
    let currentSpeed = player.speed;
    if (player.powerUp === 'speed') currentSpeed *= 1.6;

    if (keys.right && player.x < canvas.width - player.width) {
        player.dx = currentSpeed;
    }
    if (keys.left && player.x > 0) {
        player.dx = -currentSpeed;
    }
    player.x += player.dx;

    if (keys.up && player.y > 0) {
        player.y -= currentSpeed;
    }
    if (keys.down && player.y < canvas.height - player.height) {
        player.y += currentSpeed;
    }

    if (player.invincible > 0) player.invincible--;
    if (player.powerUpTimer > 0) {
        player.powerUpTimer--;
        if (player.powerUpTimer <= 0) player.powerUp = null;
    }
}

function playerShoot() {
    const now = Date.now();
    if (keys.space && now - lastShootTime > shootInterval) {
        if (player.powerUp === 'wide') {
            const angles = [-0.2, 0, 0.2];
            angles.forEach(angle => {
                playerBullets.push({
                    x: player.x + player.width / 2 - 2,
                    y: player.y,
                    width: 4,
                    height: 15,
                    color: '#fffb00',
                    vx: angle * 10,
                    vy: -playerBulletSpeed
                });
            });
        } else {
            playerBullets.push({
                x: player.x + player.width / 2 - 2,
                y: player.y,
                width: 4,
                height: 15,
                color: '#fffb00',
                vx: 0,
                vy: -playerBulletSpeed
            });
        }
        lastShootTime = now;
    }
}

function drawPlayerBullets() {
    playerBullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'yellow';
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        ctx.shadowBlur = 0;
    });
}

function movePlayerBullets() {
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const bullet = playerBullets[i];
        bullet.x += bullet.vx || 0;
        bullet.y += bullet.vy || -playerBulletSpeed;
        if (bullet.y < 0 || bullet.x < 0 || bullet.x > canvas.width) {
            playerBullets.splice(i, 1);
        }
    }
}

function spawnEnemies() {
    if (boss) return;
    
    enemySpawnTimer++;
    const currentSpawnRate = Math.max(25, initialEnemySpawnRate - Math.floor(score / 100) * 5);
    if (enemySpawnTimer > currentSpawnRate) {
        const x = Math.random() * (canvas.width - enemyWidth);
        const y = -enemyHeight;
        enemies.push({ x, y, width: enemyWidth, height: enemyHeight, color: '#ff3366' });
        enemySpawnTimer = 0;
    }

    if (score > 0 && score % 500 === 0 && score !== lastBossScore) {
        spawnBoss();
        lastBossScore = score;
    }
}

function spawnBoss() {
    boss = {
        x: canvas.width / 2 - bossWidth / 2,
        y: -bossHeight,
        targetY: 80,
        width: bossWidth,
        height: bossHeight,
        radius: 50,
        hp: 50 + (score / 500) * 30,
        maxHp: 50 + (score / 500) * 30,
        dx: 2,
        shootTimer: 0
    };
}

function moveBoss() {
    if (!boss) return;
    if (boss.y < boss.targetY) {
        boss.y += 1;
    } else {
        boss.x += boss.dx;
        if (boss.x <= 0 || boss.x >= canvas.width - boss.width) boss.dx *= -1;
    }
    boss.shootTimer++;
    if (boss.shootTimer > 60) {
        for (let i = -2; i <= 2; i++) {
            enemyBullets.push({
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height,
                width: 8,
                height: 15,
                color: '#ff00ff',
                vx: i * 1.5,
                vy: 4
            });
        }
        boss.shootTimer = 0;
    }
}

function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x + boss.width / 2, boss.y + boss.height / 2);
    ctx.fillStyle = '#9900cc';
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'purple';
    ctx.beginPath();
    ctx.moveTo(-boss.width / 2, -boss.height / 2);
    ctx.lineTo(boss.width / 2, -boss.height / 2);
    ctx.lineTo(boss.width / 3, boss.height / 2);
    ctx.lineTo(-boss.width / 3, boss.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = (Math.floor(Date.now() / 200) % 2 === 0) ? '#ff00ff' : '#660066';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const barWidth = 300, barHeight = 10;
    const barX = (canvas.width - barWidth) / 2, barY = 40;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(barX, barY, (boss.hp / boss.maxHp) * barWidth, barHeight);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(barX, barY, barWidth, barHeight);
}

function spawnItem(x, y) {
    if (Math.random() < 0.2) {
        const typeInfo = itemTypes[Math.floor(Math.random() * itemTypes.length)];
        items.push({ x, y, width: 30, height: 30, type: typeInfo.type, color: typeInfo.color, label: typeInfo.label, rotation: 0 });
    }
}

function drawItems() {
    items.forEach(item => {
        ctx.save();
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        ctx.rotate(item.rotation);
        ctx.fillStyle = item.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
        ctx.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, 0, 0);
        ctx.restore();
    });
}

function moveItems() {
    for (let i = items.length - 1; i >= 0; i--) {
        items[i].y += 2;
        items[i].rotation += 0.05;
        if (items[i].y > canvas.height) items.splice(i, 1);
    }
}

function drawEnemies() {
    enemies.forEach(enemy => {
        ctx.save();
        ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.moveTo(0, enemy.height / 2);
        ctx.lineTo(enemy.width / 2, -enemy.height / 2);
        ctx.lineTo(0, -enemy.height / 4);
        ctx.lineTo(-enemy.width / 2, -enemy.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.fillRect(-10, -5, 5, 5);
        ctx.fillRect(5, -5, 5, 5);
        ctx.restore();
    });
}

function moveEnemies() {
    enemySpeed = initialEnemySpeed + Math.floor(score / 200) * 0.5;
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].y += enemySpeed;
        if (enemies[i].y > canvas.height) enemies.splice(i, 1);
    }
}

function enemyShoot() {
    enemyShootTimer++;
    const currentShootRate = Math.max(40, initialEnemyShootRate - Math.floor(score / 150) * 5);
    if (enemyShootTimer > currentShootRate && enemies.length > 0) {
        const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
        enemyBullets.push({ x: randomEnemy.x + randomEnemy.width / 2 - 2.5, y: randomEnemy.y + randomEnemy.height, width: 5, height: 12, color: '#00ff44', vx: 0, vy: 5 });
        enemyShootTimer = 0;
    }
}

function drawEnemyBullets() {
    enemyBullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00ff44';
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        ctx.shadowBlur = 0;
    });
}

function moveEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        enemyBullets[i].x += enemyBullets[i].vx || 0;
        enemyBullets[i].y += enemyBullets[i].vy || 5;
        if (enemyBullets[i].y > canvas.height || enemyBullets[i].x < -20 || enemyBullets[i].x > canvas.width + 20) enemyBullets.splice(i, 1);
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({ x: x, y: y, dx: (Math.random() - 0.5) * 8, dy: (Math.random() - 0.5) * 8, size: Math.random() * 4, life: 30, color: color });
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life / 30;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

function moveParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].dx;
        particles[i].y += particles[i].dy;
        particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function checkCollisions() {
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (isColliding(b, e, 3, enemyRadius)) {
                createExplosion(e.x + e.width / 2, e.y + e.height / 2, e.color);
                spawnItem(e.x + e.width / 2, e.y + e.height / 2);
                playerBullets.splice(i, 1);
                enemies.splice(j, 1);
                score += 10;
                break;
            }
        }
        if (boss && i < playerBullets.length && isColliding(b, boss, 3, boss.radius)) {
            boss.hp--;
            createExplosion(b.x, b.y, '#ff00ff');
            playerBullets.splice(i, 1);
            if (boss.hp <= 0) {
                createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, '#ff00ff');
                score += 200;
                boss = null;
                player.lives = Math.min(5, player.lives + 1);
            }
        }
    }
    if (player.invincible <= 0) {
        let hit = false;
        enemies.forEach((e, idx) => { if (isColliding(player, e, player.radius, enemyRadius)) { hit = true; enemies.splice(idx, 1); } });
        enemyBullets.forEach((b, idx) => { if (isColliding(player, b, player.radius, 4)) { hit = true; enemyBullets.splice(idx, 1); } });
        if (boss && isColliding(player, boss, player.radius, boss.radius)) hit = true;
        if (hit) {
            if (player.powerUp === 'barrier') { player.powerUp = null; player.invincible = 60; createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#00ffff'); }
            else { player.lives--; player.invincible = 120; createExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color); if (player.lives <= 0) gameOver = true; }
        }
    }
    for (let i = items.length - 1; i >= 0; i--) {
        if (isColliding(player, items[i], player.radius, 15)) { player.powerUp = items[i].type; player.powerUpTimer = 600; items.splice(i, 1); score += 50; }
    }
}

function drawUI() {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`SCORE: ${score}`, 10, 30);
    for (let i = 0; i < player.lives; i++) {
        ctx.fillStyle = player.color;
        ctx.beginPath(); ctx.moveTo(30 + i * 25, 50); ctx.lineTo(40 + i * 25, 70); ctx.lineTo(20 + i * 25, 70); ctx.closePath(); ctx.fill();
    }
    if (player.powerUp) {
        ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial';
        ctx.fillText(`POWER: ${player.powerUp.toUpperCase()}`, 10, 95);
        ctx.fillRect(10, 105, (player.powerUpTimer / 600) * 100, 5);
    }
}

function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

function resetGame() {
    player.x = canvas.width / 2 - 20; player.y = canvas.height - 60; player.lives = 3; player.powerUp = null; player.powerUpTimer = 0; player.invincible = 0;
    playerBullets = []; enemies = []; enemyBullets = []; particles = []; items = [];
    score = 0; lastBossScore = 0; gameOver = false;
    enemySpawnTimer = 0; enemyShootTimer = 0; enemySpeed = initialEnemySpeed; boss = null;
    gameOverScreen.style.display = 'none';
    requestAnimationFrame(update);
}

// ゲームオーバー画面にスコアとベスト記録を表示
function showGameOver() {
    let best = 0;
    try { best = parseInt(localStorage.getItem('simpleShootsBest'), 10) || 0; } catch (e) {}
    const isNewRecord = score > best;
    if (isNewRecord) {
        best = score;
        try { localStorage.setItem('simpleShootsBest', best); } catch (e) {}
    }
    document.getElementById('newRecord').style.display = isNewRecord ? 'block' : 'none';
    document.getElementById('finalScore').textContent = `SCORE: ${score}`;
    document.getElementById('bestScore').textContent = `BEST: ${best}`;
    gameOverScreen.style.display = 'flex';
}

function update() {
    if (gameOver) { showGameOver(); return; }
    clearCanvas();
    moveStars(); drawStars();
    movePlayer(); playerShoot();
    spawnEnemies(); moveEnemies(); moveBoss();
    enemyShoot(); moveEnemyBullets();
    movePlayerBullets(); moveItems(); moveParticles();
    checkCollisions();
    drawPlayer(); drawEnemies(); drawBoss(); drawItems(); drawPlayerBullets(); drawEnemyBullets(); drawParticles(); drawUI();
    requestAnimationFrame(update);
}

update();
