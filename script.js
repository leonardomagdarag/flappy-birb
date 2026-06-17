// ─── Constants ───────────────────────────────────────────────────────────────
const W = 400, H = 600;
const GRAVITY = 0.42;
const FLAP_POWER = -7.5;
const PIPE_GAP = 148;
const PIPE_W = 58;
const GROUND_H = 52;
const BIRD_R = 14;
const HS_KEY = "flappyBirb_highscores";
const HS_MAX = 5;

const DIFFICULTIES = {
    easy: { speed: 1.8, interval: 125, startDelay: 60 },
    normal: { speed: 2.4, interval: 108, startDelay: 100 },
    hard: { speed: 3.6, interval: 90, startDelay: 160 },
};

let difficulty = "normal";

// ─── Screens ─────────────────────────────────────────────────────────────────
const screenMenu = document.getElementById("menu-screen");
const screenGame = document.getElementById("game-screen");
const screenGameOver = document.getElementById("gameover-screen");

const btnPlay = document.getElementById("btn-play");
const btnRestart = document.getElementById("btn-restart");
const btnMenu = document.getElementById("btn-menu");
const btnClearScores = document.getElementById("btn-clear-scores");

const goScore = document.getElementById("go-score");
const goBest = document.getElementById("go-best");
const hsList = document.getElementById("highscore-list");

// ─── Canvases ────────────────────────────────────────────────────────────────
const gameCanvas = document.getElementById("game-canvas");
const ctx = gameCanvas.getContext("2d");

const previewCanvas = document.getElementById("preview-canvas");
const pCtx = previewCanvas.getContext("2d");

// ─── High Score helpers ───────────────────────────────────────────────────────
function diffKey() { return `${HS_KEY}_${difficulty}`; }

function loadScores() {
    try {
        const raw = localStorage.getItem(diffKey());
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveScore(score) {
    const scores = loadScores();
    scores.push(score);
    scores.sort((a, b) => b - a);
    const trimmed = scores.slice(0, HS_MAX);
    localStorage.setItem(diffKey(), JSON.stringify(trimmed));
    return trimmed;
}

function renderHighscores() {
    const scores = loadScores();
    hsList.innerHTML = "";
    if (scores.length === 0) {
        hsList.innerHTML = "<li style='color:#888;justify-content:center'>No scores yet</li>";
        return;
    }
    scores.forEach((s, i) => {
        const li = document.createElement("li");
        const medals = ["🥇", "🥈", "🥉"];
        const rank = medals[i] || `${i + 1}.`;
        li.innerHTML = `<span class="rank">${rank}</span><span>${s}</span>`;
        hsList.appendChild(li);
    });
}

// ─── Game State ───────────────────────────────────────────────────────────────
let bird, pipes, frame, score, animId, started;
let pipeSpeed, pipeInterval, pipeStartDelay;

function resetState() {
    const cfg = DIFFICULTIES[difficulty];
    bird = { x: 90, y: H / 2 - 30, vy: 0 };
    pipes = [];
    frame = 0;
    score = 0;
    started = false;
    pipeSpeed = cfg.speed;
    pipeInterval = cfg.interval;
    pipeStartDelay = cfg.startDelay;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawBackground(c) {
    // Sky
    const sky = c.createLinearGradient(0, 0, 0, H - GROUND_H);
    sky.addColorStop(0, "#5db3e8");
    sky.addColorStop(1, "#c8f0ff");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H - GROUND_H);
}

function drawGround(c, canvasW, canvasH) {
    const gh = canvasH === H ? GROUND_H : canvasH * 0.18;
    c.fillStyle = "#6bbf59";
    c.fillRect(0, canvasH - gh, canvasW, gh);
}

function drawBird(c, x, y, r) {
    c.fillStyle = "#ffd54a";
    c.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawPipes(c) {
    c.fillStyle = "#3bb143";
    pipes.forEach(p => {
        const bottomY = p.topH + PIPE_GAP;
        const bottomH = H - GROUND_H - bottomY;
        c.fillRect(p.x, 0, PIPE_W, p.topH);
        c.fillRect(p.x, bottomY, PIPE_W, bottomH);
    });
}

function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 110, 50, 8);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 35);

    const best = loadScores()[0] || 0;
    ctx.font = "13px Arial";
    ctx.fillStyle = "#ffd54a";
    ctx.fillText(`Best: ${best}`, 20, 53);
}

function drawWaitMessage() {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 140, H / 2 - 22, 280, 44, 10);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Press Space or tap to flap!", W / 2, H / 2 + 6);
}

// ─── Collision ────────────────────────────────────────────────────────────────
function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx, rx + rw));
    const nearY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy <= r * r;
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function update() {
    if (!started) return;

    bird.vy += GRAVITY;
    bird.y += bird.vy;

    // Spawn pipes (after initial delay)
    if (frame >= pipeStartDelay && (frame - pipeStartDelay) % pipeInterval === 0) {
        const topH = 55 + Math.random() * 200;
        pipes.push({ x: W + 10, topH, scored: false });
    }

    // Move pipes + score
    pipes.forEach(p => {
        p.x -= pipeSpeed;
        if (!p.scored && p.x + PIPE_W < bird.x) {
            p.scored = true;
            score += 1;
        }
    });
    pipes = pipes.filter(p => p.x + PIPE_W > -10);

    // Ceiling bounce
    if (bird.y - BIRD_R < 0) {
        bird.y = BIRD_R;
        bird.vy = 0;
    }

    // Ground hit
    if (bird.y + BIRD_R >= H - GROUND_H) {
        endGame();
        return;
    }

    // Pipe hit
    for (const p of pipes) {
        if (
            circleRect(bird.x, bird.y, BIRD_R - 2, p.x, 0, PIPE_W, p.topH) ||
            circleRect(bird.x, bird.y, BIRD_R - 2, p.x, p.topH + PIPE_GAP, PIPE_W, H - p.topH - PIPE_GAP - GROUND_H)
        ) {
            endGame();
            return;
        }
    }

    frame += 1;
}

function draw() {
    drawBackground(ctx);
    drawPipes(ctx);
    drawGround(ctx, W, H);
    drawBird(ctx, bird.x, bird.y, BIRD_R);
    drawHUD();
    if (!started) drawWaitMessage();
}

function gameLoop() {
    animId = requestAnimationFrame(gameLoop);
    update();
    draw();
}

// ─── Flap ────────────────────────────────────────────────────────────────────
function flap() {
    if (!started) started = true;
    bird.vy = FLAP_POWER;
}

// ─── End / Start ─────────────────────────────────────────────────────────────
function endGame() {
    cancelAnimationFrame(animId);
    const scores = saveScore(score);
    const best = scores[0];

    goScore.textContent = `Score: ${score}`;
    goBest.textContent = score === best ? "New personal best!" : `Best: ${best}`;

    showScreen(screenGameOver);
}

function startGame() {
    cancelAnimationFrame(animId);
    resetState();
    showScreen(screenGame);
    gameLoop();
}

function goToMenu() {
    cancelAnimationFrame(animId);
    renderHighscores();
    showScreen(screenMenu);
}

// ─── Screen management ───────────────────────────────────────────────────────
function showScreen(screen) {
    [screenMenu, screenGame, screenGameOver].forEach(s => s.classList.add("hidden"));
    screen.classList.remove("hidden");
}

// ─── Menu bird preview animation ─────────────────────────────────────────────
let previewY = 60, previewVY = 0, previewFrame = 0;
function animatePreview() {
    const pw = previewCanvas.width, ph = previewCanvas.height;

    // sky bg
    pCtx.fillStyle = "#87ceeb";
    pCtx.fillRect(0, 0, pw, ph);

    // gentle hover bob
    previewVY += 0.15;
    if (previewFrame % 60 === 0) previewVY = -3.5;
    previewY += previewVY;
    if (previewY > ph * 0.7) { previewY = ph * 0.7; previewVY = -3.5; }
    if (previewY < ph * 0.2) { previewY = ph * 0.2; previewVY = 0; }

    drawBird(pCtx, pw / 2, previewY, 18);
    previewFrame += 1;
    requestAnimationFrame(animatePreview);
}

// ─── Input ───────────────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (!screenGame.classList.contains("hidden")) flap();
    }
});

gameCanvas.addEventListener("click", () => {
    if (!screenGame.classList.contains("hidden")) flap();
});

btnPlay.addEventListener("click", startGame);
btnRestart.addEventListener("click", startGame);
btnMenu.addEventListener("click", goToMenu);
btnClearScores.addEventListener("click", () => {
    localStorage.removeItem(diffKey());
    renderHighscores();
});

document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        difficulty = btn.dataset.diff;
        renderHighscores();
    });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
renderHighscores();
animatePreview();
showScreen(screenMenu);
