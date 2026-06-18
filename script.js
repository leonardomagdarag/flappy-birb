
// fixed variables for the game
const W = 400, H = 600;
const GRAVITY = 0.40;
const FLAP_POWER = -7.5;
const PIPE_GAP = 148;
const PIPE_W = 58;
const GROUND_H = 52;
const BIRD_R = 14;
// for highcores
const HS_KEY = "flappyBirb_highscores"; // localStorage key prefix
const HS_MAX = 5;

// 3 difficulty - each may sariling speed, interval ng pipe spawn, and delay ng spawn ng pipe sa start
const DIFFICULTIES = {
    easy: { speed: 2.4, interval: 125, startDelay: 60 },
    normal: { speed: 3.6, interval: 108, startDelay: 100 },
    hard: { speed: 5, interval: 60, startDelay: 160 },
};

let difficulty = "normal"; // default difficulty

// kunin mga elements from html
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

// main canvas for the actual game
const gameCanvas = document.getElementById("game-canvas");
const ctx = gameCanvas.getContext("2d");

//smaller canvas sa menu dun sa nag aanimate
const previewCanvas = document.getElementById("preview-canvas");
const pCtx = previewCanvas.getContext("2d");


// Per-difficulty ang highscore storage — kaya may suffix na "_easy", "_normal", etc.
// Hindi magkakahalo ang scores ng iba't ibang difficulty
function diffKey() { return `${HS_KEY}_${difficulty}`; }

//read yung file ng highscoers
function loadScores() {
    try {
        const raw = localStorage.getItem(diffKey());
        // Pag walang laman, ibalik na lang empty array para hindi mag-error
        return raw ? JSON.parse(raw) : [];
    } catch {
        // Kung may corrupt na data sa localStorage, mag-fail gracefully
        return [];
    }
}

function saveScore(score) {
    const scores = loadScores();
    scores.push(score); // add yung new score sa array

    // sort yung scores
    scores.sort((a, b) => b - a);
    //kunin lang yung top 5
    const trimmed = scores.slice(0, HS_MAX);

    //save into json file
    localStorage.setItem(diffKey(), JSON.stringify(trimmed));
    return trimmed; // ibalik para magamit agad ng endGame()
}

function renderHighscores() {
    const scores = loadScores();
    hsList.innerHTML = ""; // i-clear muna bago i-render ulit

    if (scores.length === 0) {
        hsList.innerHTML = "<li style='color:#888;justify-content:center'>No scores yet</li>";
        return;
    }

    scores.forEach((s, i) => {
        const li = document.createElement("li");
        const medals = ["🥇", "🥈", "🥉"];
        // Top 3 may medal, yung iba may numero na lang
        const rank = medals[i] || `${i + 1}.`;
        li.innerHTML = `<span class="rank">${rank}</span><span>${s}</span>`;
        hsList.appendChild(li);
    });
}

// game variables
let bird, pipes, frame, score, animId, started;
let pipeSpeed, pipeInterval, pipeStartDelay;
let nextSpeedScore, nextIntervalScore;

function resetState() {
    const currentDifficulty = DIFFICULTIES[difficulty]; // grab yung difficulty na selected

    // reset yung location sa starting pos, velocity is zero
    bird = { x: 90, y: H / 2 - 30, vy: 0 };

    pipes = [];    // walang pipes sa simula
    frame = 0;     // frame counter - ginagamit para sa pipe spawning timing
    score = 0;
    started = false; // paused lang yung game until mag press ng button

    pipeSpeed = currentDifficulty.speed;
    pipeInterval = currentDifficulty.interval;
    pipeStartDelay = currentDifficulty.startDelay; // delay ng pipe mag spawn

    // para once lang mag trigger bawat milestone
    nextSpeedScore = 10;
    nextIntervalScore = 20;
}



function drawBackground(c) {
    // Simple gradient sa background
    const sky = c.createLinearGradient(0, 0, 0, H - GROUND_H);
    sky.addColorStop(0, "#5db3e8");
    sky.addColorStop(1, "#c8f0ff");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H - GROUND_H);
}

function drawGround(c, canvasW, canvasH) {
    // Kung nasa main canvas, gamitin ang fixed GROUND_H,
    // kung sa preview canvas (mas maliit), proporsyonal lang
    const gh = canvasH === H ? GROUND_H : canvasH * 0.18;
    c.fillStyle = "#6bbf59";
    c.fillRect(0, canvasH - gh, canvasW, gh);
}

function drawBird(c, x, y, r) {
    // Simple rectangle lang ang bird - r ang half-size niya
    c.fillStyle = "#ffd54a";
    c.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawPipes(c) {
    c.fillStyle = "#3bb143";
    // draw lahat ng pipes na meron 
    for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i];

        // bottom pipe start
        const bottomY = p.topH + PIPE_GAP;
        // yung magiging height ng bottom pipe
        const bottomH = H - GROUND_H - bottomY;

        //set yung top pipe location and size
        const topPipeX = p.x;
        const topPipeY = 0;
        const topPipeW = PIPE_W;
        const topPipeH = p.topH;

        //set yung bottom pipe
        const bottomPipeX = p.x;
        const bottomPipeY = bottomY;
        const bottomPipeW = PIPE_W;
        const bottomPipeH = bottomH;

        //create yung pipes
        c.fillRect(topPipeX, topPipeY, topPipeW, topPipeH);
        c.fillRect(bottomPipeX, bottomPipeY, bottomPipeW, bottomPipeH);
    }
}

//yung nasa top left ng game to show the scores
function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 110, 50, 8);
    ctx.fill();

    //show yung score
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 35);

    //grab yung highest score
    const best = loadScores()[0] || 0;
    ctx.font = "13px Arial";
    ctx.fillStyle = "#ffd54a";
    ctx.fillText(`Best: ${best}`, 20, 53);
}

//starting message in-game
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

function update() {
    // wala mangyari if dipa nag start yung game
    if (!started) return;

    // increase speed once every 10 score
    if (score >= nextSpeedScore && pipeSpeed < 10) {
        pipeSpeed += 0.2;
        nextSpeedScore += 10;
    }

    // decrease pipe spawn interval once every 20 score
    if (score >= nextIntervalScore && pipeInterval > 50) {
        pipeInterval -= 1;
        nextIntervalScore += 20;
    }

    // add ng gravity. Incremental so every frame mag increase yung gravity
    bird.vy += GRAVITY;
    bird.y += bird.vy;

    // spawn ng pipe before the delay
    if (frame >= pipeStartDelay && (frame - pipeStartDelay) % pipeInterval === 0) {
        //randomize ng hieght. Minimum na yung 55
        const topH = 55 + Math.random() * 200;
        pipes.push({ x: W + 10, topH, scored: false });
    }

    // Move yung pipes to the left
    for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i];
        p.x = p.x - pipeSpeed;

        // increase yung score ng player pag lumagpas sa width ng pipe once
        if (p.scored === false && p.x + PIPE_W < bird.x) {
            p.scored = true;
            score = score + 1;
        }
    }

    //remove yung mga pipe na lagpas na sa canvas
    pipes = pipes.filter(p => p.x + PIPE_W > -10);

    // check height ng bird kung nasa celiling
    if (bird.y - BIRD_R < 0) {
        bird.y = BIRD_R;
        bird.vy = 0;
    }

    // check colission ng bird sa ground
    if (bird.y + BIRD_R >= H - GROUND_H) {
        endGame();
        return;
    }

    // check yung colision ng bird sa pipe
    for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i];
        const birdX = bird.x - BIRD_R;
        const birdY = bird.y - BIRD_R;
        const birdW = BIRD_R * 2;
        const birdH = BIRD_R * 2;

        const hitTopPipe =
            birdX < p.x + PIPE_W &&
            birdX + birdW > p.x &&
            birdY < p.topH &&
            birdY + birdH > 0;

        const bottomPipeY = p.topH + PIPE_GAP;
        const bottomPipeH = H - p.topH - PIPE_GAP - GROUND_H;
        const hitBottomPipe =
            birdX < p.x + PIPE_W &&
            birdX + birdW > p.x &&
            birdY < bottomPipeY + bottomPipeH &&
            birdY + birdH > bottomPipeY;

        if (hitTopPipe || hitBottomPipe) {
            endGame();
            return;
        }
    }

    frame += 1; // i-increment ang frame counter pagkatapos ng lahat ng checks
}

function draw() {
    // Order matters dito — background muna, tapos pipes, lupa, bird sa ibabaw, tapos HUD
    drawBackground(ctx);
    drawPipes(ctx);
    drawGround(ctx, W, H);
    drawBird(ctx, bird.x, bird.y, BIRD_R);
    drawHUD();
    if (!started) drawWaitMessage(); // ipakita ang "tap to flap" habang hindi pa nagsisimula
}

function gameLoop() {
    // I-schedule MUNA ang susunod na frame bago mag-update at mag-draw —
    // para kapag nag-cancel tayo ng animId sa loob ng update() (sa endGame),
    // yung ma-cancel ay yung SUSUNOD na frame, hindi yung kasalukuyan.
    // Ito ang nag-aayos ng bug na paulit-ulit na nag-eendGame at nagse-saveScore.
    animId = requestAnimationFrame(gameLoop);
    update();
    draw();
}

function flap() {
    // flap upwards
    if (!started) started = true;
    bird.vy = FLAP_POWER; 
}

function endGame() {
    cancelAnimationFrame(animId); // diko alam ano to sabi lang ni chatgpt
    const scores = saveScore(score); // save tyung score
    const best = scores[0];

    goScore.textContent = `Score: ${score}`;
    //check kung new highscore
    goBest.textContent = score === best ? "New personal best!" : `Best: ${best}`;

    showScreen(screenGameOver);
}

function startGame() {
    cancelAnimationFrame(animId); // para daw di mag conflict ng animation... sabi ni gpt
    resetState();
    showScreen(screenGame);
    gameLoop();
}

function goToMenu() {
    cancelAnimationFrame(animId); // para daw di mag conflict ng animation... sabi ni gpt
    renderHighscores();           // show yung highscore
    showScreen(screenMenu);
}

//diko to alam si chatgpt gumawa nyan
function showScreen(screen) {
    [screenMenu, screenGame, screenGameOver].forEach(s => s.classList.add("hidden"));
    screen.classList.remove("hidden");
}

//animation dun sa secondary canvas sa main menu.
let previewY = 60, previewVY = 0, previewFrame = 0;
function animatePreview() {
    const pw = previewCanvas.width, ph = previewCanvas.height;

    pCtx.fillStyle = "#87ceeb"; // i-clear ang canvas sa bawat frame
    pCtx.fillRect(0, 0, pw, ph);

    // Simulate ng gravity + flap para mag-bob-bob ang bird sa preview
    previewVY += 0.15;
    if (previewFrame % 60 === 0) previewVY = -3.5; // automatic na "flap" every 60 frames

    previewY += previewVY;

    // I-clamp ang posisyon para hindi lumabas sa canvas
    if (previewY > ph * 0.7) { previewY = ph * 0.7; previewVY = -3.5; }
    if (previewY < ph * 0.2) { previewY = ph * 0.2; previewVY = 0; }

    drawBird(pCtx, pw / 2, previewY, 18);
    previewFrame += 1;
    requestAnimationFrame(animatePreview); // walang tigil ito — loop forever sa menu
}

// controls
document.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault(); // para di mag scroll yung page
        // flap lang if nasa game screen
        if (!screenGame.classList.contains("hidden")) flap();
    }
});

// add din ng support for click or tap
gameCanvas.addEventListener("click", () => {
    if (!screenGame.classList.contains("hidden")) flap();
});

btnPlay.addEventListener("click", startGame);
btnRestart.addEventListener("click", startGame);
btnMenu.addEventListener("click", goToMenu);
btnClearScores.addEventListener("click", () => {
    // I-clear lang ang scores ng kasalukuyang difficulty — hindi lahat
    localStorage.removeItem(diffKey());
    renderHighscores();
});

// difficiculty selection
document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        // I-remove ang active sa lahat, tapos i-add sa na-click
        document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        difficulty = btn.dataset.diff; // i-update ang global difficulty variable
        renderHighscores(); // ipakita ang scores ng bagong difficulty
    });
});

// show yung highscore, yung secondary canvas, and yung main menu
renderHighscores();
animatePreview();
showScreen(screenMenu);

