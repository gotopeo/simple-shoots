const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartButton = document.getElementById('restartButton');

// ゲームの基本設定
canvas.width = 480;
canvas.height = 640;

// サウンドエフェクト（Web Audio APIで合成。外部ファイル不要）
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
// ブラウザの自動再生制限対策: 最初の操作で有効化
['touchstart', 'mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, ensureAudio));

function playSound(type) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(330, t + 0.07);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.start(t); osc.stop(t + 0.08);
    } else if (type === 'explosion') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t); osc.stop(t + 0.26);
    } else if (type === 'clink') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1500, t);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t); osc.stop(t + 0.06);
    } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.35);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.36);
    } else if (type === 'item') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.setValueAtTime(990, t + 0.08);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.19);
    } else if (type === 'bossAppear') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.linearRampToValueAtTime(240, t + 0.5);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.start(t); osc.stop(t + 0.61);
    } else if (type === 'bossDown') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.start(t); osc.stop(t + 0.61);
    }
}

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
let bossCount = 0;
let bossesDefeated = 0; // 倒した数に応じて敵・アイテムの種類が解禁される
let bossTimer = 0;
const bossInterval = 60 * 40; // 中ボスは約40秒ごと（時間基準なので後半も間隔が一定）

// 中ボスの種類（出現するたびに切り替わる）
const bossTypeDefs = {
    spread:  { color: '#9900cc', glow: 'purple', bulletColor: '#ff00ff' }, // 扇状にばらまく
    spinner: { color: '#cc3300', glow: 'orange', bulletColor: '#ff9900' }, // 回転しながら8方向弾
    sniper:  { color: '#0066cc', glow: 'cyan',   bulletColor: '#00ccff' }  // 自機を狙い撃ち
};

// 難易度レベル（スコア300ごとに1上昇。敵の数が増えていく）
function difficultyLevel() {
    return 1 + Math.floor(score / 300);
}

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

// 敵の種類
const enemyTypeDefs = {
    normal: { color: '#ff3366', hp: 1, speedFactor: 1.0, score: 10, radius: 15 },
    zigzag: { color: '#ffaa00', hp: 1, speedFactor: 0.9, score: 20, radius: 15 },
    speedy: { color: '#66ff33', hp: 1, speedFactor: 2.2, score: 30, radius: 12 },
    tank:   { color: '#aa66ff', hp: 3, speedFactor: 0.5, score: 50, radius: 18 }
};

// 敵の種類は中ボスを倒すごとに解禁されていく
function pickEnemyType() {
    const pool = [['normal', 50]];
    if (bossesDefeated >= 1) pool.push(['zigzag', 25]);
    if (bossesDefeated >= 2) pool.push(['speedy', 15]);
    if (bossesDefeated >= 3) pool.push(['tank', 12]);
    const total = pool.reduce((sum, p) => sum + p[1], 0);
    let roll = Math.random() * total;
    for (const [type, weight] of pool) {
        roll -= weight;
        if (roll < 0) return type;
    }
    return 'normal';
}
const initialEnemySpeed = 2;
let enemySpeed = initialEnemySpeed;
let enemySpawnTimer = 0;
const initialEnemySpawnRate = 100;

// アイテム
let items = [];
const itemTypes = [
    { type: 'wide', color: '#ffff00', label: 'W' },
    { type: 'speed', color: '#00ff00', label: 'S' },
    { type: 'barrier', color: '#00ffff', label: 'B' },
    { type: 'life', color: '#ff6699', label: '♥' } // ライフ回復（レア）
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

// コンボ（連続撃破でスコア倍率アップ）
let combo = 0;
let lastKillTime = 0;
const comboTimeout = 3000; // この時間(ms)撃破がないとリセット
const comboMaxMultiplier = 4;

function comboMultiplier() {
    return Math.min(comboMaxMultiplier, 1 + combo * 0.1);
}

function addKillScore(base) {
    const now = Date.now();
    if (now - lastKillTime > comboTimeout) combo = 0;
    combo++;
    lastKillTime = now;
    score += Math.round(base * comboMultiplier());
}

// キー入力
const keys = {
    right: false,
    left: false
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === 'ArrowLeft') keys.left = true;
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowLeft') keys.left = false;
});

restartButton.addEventListener('click', resetGame);

// タッチ操作: 画面の左半分を押すと左移動、右半分を押すと右移動（ショットは自動発射）
function updateTouchZones(e) {
    if (e.target.tagName === 'BUTTON') return; // リスタートボタンの操作は邪魔しない
    keys.left = false;
    keys.right = false;
    for (const t of e.touches) {
        if (t.clientX < window.innerWidth / 2) keys.left = true;
        else keys.right = true;
    }
    e.preventDefault();
}
document.addEventListener('touchstart', updateTouchZones, { passive: false });
document.addEventListener('touchmove', updateTouchZones, { passive: false });
document.addEventListener('touchend', updateTouchZones, { passive: false });
document.addEventListener('touchcancel', updateTouchZones, { passive: false });

// マウスでも左右半分クリックで移動できるようにしておく（PC確認用）
document.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (e.clientX < window.innerWidth / 2) keys.left = true;
    else keys.right = true;
});
document.addEventListener('mouseup', () => {
    keys.left = false;
    keys.right = false;
});

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

    if (player.invincible > 0) player.invincible--;
    if (player.powerUpTimer > 0) {
        player.powerUpTimer--;
        if (player.powerUpTimer <= 0) player.powerUp = null;
    }
}

// ショットは自動発射
function playerShoot() {
    const now = Date.now();
    if (now - lastShootTime > shootInterval) {
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
        playSound('shoot');
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

function spawnOneEnemy() {
    const x = Math.random() * (canvas.width - enemyWidth);
    const y = -enemyHeight - Math.random() * 80; // 同時出現時に重ならないよう縦にずらす
    const type = pickEnemyType();
    const def = enemyTypeDefs[type];
    enemies.push({
        x, y, width: enemyWidth, height: enemyHeight,
        type, color: def.color, hp: def.hp, maxHp: def.hp,
        scoreValue: def.score, speedFactor: def.speedFactor, radius: def.radius,
        baseX: x, phase: Math.random() * Math.PI * 2
    });
}

function spawnEnemies() {
    if (boss) return;

    enemySpawnTimer++;
    const level = difficultyLevel();
    // 難易度はスピードではなく「数」で上げる: 間隔は少しだけ短く、同時出現数が主に増える
    const currentSpawnRate = Math.max(50, initialEnemySpawnRate - level * 4);
    if (enemySpawnTimer > currentSpawnRate) {
        let count = 1;
        const maxExtra = Math.min(3, level - 1);
        for (let i = 0; i < maxExtra; i++) {
            if (Math.random() < 0.45) count++;
        }
        for (let i = 0; i < count; i++) spawnOneEnemy();
        enemySpawnTimer = 0;
    }

    // ボスは時間基準で出現（ボス戦中はカウントしないので間隔はずっと一定）
    bossTimer++;
    if (bossTimer >= bossInterval) {
        spawnBoss();
        bossTimer = 0;
    }
}

function spawnBoss() {
    const kinds = Object.keys(bossTypeDefs);
    const kind = kinds[bossCount % kinds.length]; // 出現するたびに種類が変わる
    const hp = 50 + bossCount * 30; // 出現回数に応じて硬くなる
    bossCount++;
    playSound('bossAppear');
    boss = {
        kind,
        x: canvas.width / 2 - bossWidth / 2,
        y: -bossHeight,
        targetY: 80,
        width: bossWidth,
        height: bossHeight,
        radius: 50,
        hp: hp,
        maxHp: hp,
        dx: kind === 'spinner' ? 3.5 : 2,
        shootTimer: 0,
        angle: 0
    };
}

function moveBoss() {
    if (!boss) return;
    if (boss.y < boss.targetY) {
        boss.y += 1;
    } else if (boss.kind === 'sniper') {
        // スナイパーは自機の真上を狙ってゆっくり追尾
        const targetX = player.x + player.width / 2 - boss.width / 2;
        boss.x += (targetX - boss.x) * 0.02;
        boss.x = Math.max(0, Math.min(canvas.width - boss.width, boss.x));
    } else {
        boss.x += boss.dx;
        if (boss.x <= 0 || boss.x >= canvas.width - boss.width) boss.dx *= -1;
    }

    const def = bossTypeDefs[boss.kind];
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height;
    boss.shootTimer++;
    if (boss.kind === 'spread') {
        if (boss.shootTimer > 60) {
            for (let i = -2; i <= 2; i++) {
                enemyBullets.push({ x: cx, y: cy, width: 8, height: 15, color: def.bulletColor, vx: i * 1.5, vy: 4 });
            }
            boss.shootTimer = 0;
        }
    } else if (boss.kind === 'spinner') {
        if (boss.shootTimer > 75) {
            boss.angle += 0.5; // 発射角が回転していく
            for (let a = 0; a < 8; a++) {
                const ang = boss.angle + a * Math.PI / 4;
                enemyBullets.push({
                    x: cx, y: boss.y + boss.height / 2, width: 8, height: 8, color: def.bulletColor,
                    vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5
                });
            }
            boss.shootTimer = 0;
        }
    } else { // sniper
        if (boss.shootTimer > 45) {
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            const dist = Math.hypot(px - cx, py - cy) || 1;
            enemyBullets.push({
                x: cx, y: cy, width: 6, height: 12, color: def.bulletColor,
                vx: (px - cx) / dist * 6, vy: (py - cy) / dist * 6
            });
            boss.shootTimer = 0;
        }
    }
}

function drawBoss() {
    if (!boss) return;
    const def = bossTypeDefs[boss.kind];
    ctx.save();
    ctx.translate(boss.x + boss.width / 2, boss.y + boss.height / 2);
    ctx.fillStyle = def.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = def.glow;
    if (boss.kind === 'spinner') {
        // 回転する円形ボディ
        ctx.rotate(Date.now() / 300 % (Math.PI * 2));
        ctx.beginPath();
        ctx.arc(0, 0, boss.height / 2, 0, Math.PI * 2);
        ctx.fill();
        for (let a = 0; a < 4; a++) {
            ctx.rotate(Math.PI / 2);
            ctx.fillRect(boss.height / 2 - 5, -6, 22, 12); // 突起
        }
    } else if (boss.kind === 'sniper') {
        // 下向きの鋭い三角形
        ctx.beginPath();
        ctx.moveTo(-boss.width / 2, -boss.height / 2);
        ctx.lineTo(boss.width / 2, -boss.height / 2);
        ctx.lineTo(0, boss.height / 2);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(-boss.width / 2, -boss.height / 2);
        ctx.lineTo(boss.width / 2, -boss.height / 2);
        ctx.lineTo(boss.width / 3, boss.height / 2);
        ctx.lineTo(-boss.width / 3, boss.height / 2);
        ctx.closePath();
        ctx.fill();
    }
    ctx.rotate(0);
    ctx.fillStyle = (Math.floor(Date.now() / 200) % 2 === 0) ? def.bulletColor : def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const barWidth = 300, barHeight = 10;
    const barX = (canvas.width - barWidth) / 2, barY = 40;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = def.bulletColor;
    ctx.fillRect(barX, barY, (boss.hp / boss.maxHp) * barWidth, barHeight);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(barX, barY, barWidth, barHeight);
}

function spawnItem(x, y) {
    if (Math.random() < 0.2) {
        // アイテムも中ボス撃破ごとに解禁: W → S → B → ♥（♥だけ出にくい）
        const pool = [[itemTypes[0], 30]];
        if (bossesDefeated >= 1) pool.push([itemTypes[1], 30]);
        if (bossesDefeated >= 2) pool.push([itemTypes[2], 30]);
        if (bossesDefeated >= 3) pool.push([itemTypes[3], 10]);
        const total = pool.reduce((sum, p) => sum + p[1], 0);
        let roll = Math.random() * total;
        let typeInfo = pool[0][0];
        for (const [ti, weight] of pool) {
            roll -= weight;
            if (roll < 0) { typeInfo = ti; break; }
        }
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
        if (enemy.type === 'tank') {
            ctx.beginPath();
            ctx.moveTo(-enemy.width / 2, 0);
            ctx.lineTo(-enemy.width / 4, -enemy.height / 2);
            ctx.lineTo(enemy.width / 4, -enemy.height / 2);
            ctx.lineTo(enemy.width / 2, 0);
            ctx.lineTo(enemy.width / 4, enemy.height / 2);
            ctx.lineTo(-enemy.width / 4, enemy.height / 2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.fillRect(-8, -4, 5, 5);
            ctx.fillRect(3, -4, 5, 5);
            ctx.fillStyle = '#222';
            ctx.fillRect(-15, -enemy.height / 2 - 9, 30, 4);
            ctx.fillStyle = enemy.color;
            ctx.fillRect(-15, -enemy.height / 2 - 9, (enemy.hp / enemy.maxHp) * 30, 4);
        } else if (enemy.type === 'zigzag') {
            ctx.rotate(Math.sin(enemy.y / 20 + enemy.phase) * 0.4);
            ctx.beginPath();
            ctx.moveTo(0, -enemy.height / 2);
            ctx.lineTo(enemy.width / 2, 0);
            ctx.lineTo(0, enemy.height / 2);
            ctx.lineTo(-enemy.width / 2, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.fillRect(-7, -3, 4, 4);
            ctx.fillRect(3, -3, 4, 4);
        } else if (enemy.type === 'speedy') {
            ctx.shadowBlur = 8;
            ctx.shadowColor = enemy.color;
            ctx.beginPath();
            ctx.moveTo(0, enemy.height / 2);
            ctx.lineTo(enemy.width / 4, -enemy.height / 2);
            ctx.lineTo(0, -enemy.height / 4);
            ctx.lineTo(-enemy.width / 4, -enemy.height / 2);
            ctx.closePath();
            ctx.fill();
        } else {
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
        }
        ctx.restore();
    });
}

function moveEnemies() {
    enemySpeed = initialEnemySpeed; // 速度は一定。難易度は敵の数とボスで上げる
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.y += enemySpeed * (e.speedFactor || 1);
        if (e.type === 'zigzag') {
            e.x = e.baseX + Math.sin(e.y / 40 + e.phase) * 60;
            e.x = Math.max(0, Math.min(canvas.width - e.width, e.x));
        }
        if (e.y > canvas.height) enemies.splice(i, 1);
    }
}

function enemyShoot() {
    enemyShootTimer++;
    const currentShootRate = Math.max(40, initialEnemyShootRate - difficultyLevel() * 3);
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
        if (enemyBullets[i].y > canvas.height || enemyBullets[i].y < -20 || enemyBullets[i].x < -20 || enemyBullets[i].x > canvas.width + 20) enemyBullets.splice(i, 1);
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
            if (isColliding(b, e, 3, e.radius || enemyRadius)) {
                playerBullets.splice(i, 1);
                e.hp--;
                if (e.hp <= 0) {
                    createExplosion(e.x + e.width / 2, e.y + e.height / 2, e.color);
                    spawnItem(e.x + e.width / 2, e.y + e.height / 2);
                    enemies.splice(j, 1);
                    addKillScore(e.scoreValue || 10);
                    playSound('explosion');
                } else {
                    createExplosion(b.x, b.y, '#ffffff');
                    playSound('clink');
                }
                break;
            }
        }
        if (boss && i < playerBullets.length && isColliding(b, boss, 3, boss.radius)) {
            boss.hp--;
            createExplosion(b.x, b.y, '#ff00ff');
            playerBullets.splice(i, 1);
            if (boss.hp <= 0) {
                createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, '#ff00ff');
                addKillScore(200);
                bossesDefeated++; // 新しい敵・アイテムが解禁される
                playSound('bossDown');
                boss = null; // ライフ回復は♥アイテムに変更
            }
        }
    }
    if (player.invincible <= 0) {
        let hit = false;
        enemies.forEach((e, idx) => { if (isColliding(player, e, player.radius, e.radius || enemyRadius)) { hit = true; enemies.splice(idx, 1); } });
        enemyBullets.forEach((b, idx) => { if (isColliding(player, b, player.radius, 4)) { hit = true; enemyBullets.splice(idx, 1); } });
        if (boss && isColliding(player, boss, player.radius, boss.radius)) hit = true;
        if (hit) {
            combo = 0; // 被弾でコンボリセット
            playSound('hit');
            if (player.powerUp === 'barrier') { player.powerUp = null; player.invincible = 60; createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#00ffff'); }
            else { player.lives--; player.invincible = 120; createExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color); if (player.lives <= 0) gameOver = true; }
        }
    }
    for (let i = items.length - 1; i >= 0; i--) {
        if (isColliding(player, items[i], player.radius, 15)) {
            if (items[i].type === 'life') {
                player.lives = Math.min(5, player.lives + 1);
            } else {
                player.powerUp = items[i].type;
                player.powerUpTimer = 600;
            }
            items.splice(i, 1);
            score += 50;
            playSound('item');
        }
    }
}

function drawUI() {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`SCORE: ${score}`, 10, 30);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#88aaff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`LV ${difficultyLevel()}`, canvas.width / 2, 30);
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'white';
    if (combo >= 2) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`${combo} COMBO ×${comboMultiplier().toFixed(1)}`, canvas.width - 10, 30);
        ctx.textAlign = 'left';
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'white';
    }
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
    combo = 0; lastKillTime = 0;
    enemySpawnTimer = 0; enemyShootTimer = 0; enemySpeed = initialEnemySpeed;
    boss = null; bossCount = 0; bossesDefeated = 0; bossTimer = 0;
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
    if (combo > 0 && Date.now() - lastKillTime > comboTimeout) combo = 0;
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
