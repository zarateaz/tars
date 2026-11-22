import fs from "fs";
import path from "path";
import os from "os";

export interface GameInfo {
  title: string;
  gameType: "tetris" | "snake" | "pong" | "tarjeta" | "adivinanza" | "trivia" | "tictactoe";
  filename: string;
  systemPath: string;
  webPath: string;
}

export function generateTetrisCyberpunk(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TETRIS // CYBERPUNK 2026 - TARS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #000;
      color: #00f0ff;
      font-family: 'Courier New', Courier, monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    h1 {
      font-size: 24px;
      letter-spacing: 4px;
      text-transform: uppercase;
      text-shadow: 0 0 15px #00f0ff;
      margin-bottom: 12px;
    }
    .game-container {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      border: 2px solid #00f0ff;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.3), inset 0 0 20px rgba(0, 240, 255, 0.1);
      background: rgba(5, 10, 20, 0.9);
    }
    canvas {
      border: 1px solid rgba(0, 240, 255, 0.4);
      background: #02040a;
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
    }
    .hud {
      display: flex;
      flex-direction: column;
      gap: 15px;
      min-width: 130px;
    }
    .stat-box {
      border: 1px solid rgba(0, 240, 255, 0.4);
      padding: 8px 12px;
      border-radius: 6px;
      background: rgba(0, 240, 255, 0.05);
    }
    .stat-label {
      font-size: 11px;
      color: #38bdf8;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .stat-val {
      font-size: 20px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 8px #00f0ff;
    }
    .controls {
      margin-top: 15px;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
      line-height: 1.6;
    }
    kbd {
      background: #1e293b;
      color: #00f0ff;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(0, 240, 255, 0.3);
    }
    .game-over-overlay {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      display: none;
      z-index: 100;
    }
    .btn {
      background: #00f0ff;
      color: #000;
      border: none;
      padding: 10px 20px;
      font-family: inherit;
      font-weight: bold;
      font-size: 14px;
      letter-spacing: 2px;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
      margin-top: 15px;
    }
    .btn:hover { background: #38bdf8; }
  </style>
</head>
<body>
  <h1>⚡ TARS // TETRIS 2026</h1>
  <div class="game-container">
    <canvas id="tetris" width="240" height="400"></canvas>
    <div class="hud">
      <div class="stat-box">
        <div class="stat-label">Puntos</div>
        <div class="stat-val" id="score">0</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Líneas</div>
        <div class="stat-val" id="lines">0</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Nivel</div>
        <div class="stat-val" id="level">1</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Siguiente</div>
        <canvas id="next" width="90" height="90" style="margin-top:6px;"></canvas>
      </div>
    </div>
  </div>
  <div class="controls">
    <kbd>←</kbd> <kbd>→</kbd> Mover | <kbd>↑</kbd> Rotar | <kbd>↓</kbd> Caer | <kbd>Espacio</kbd> Caída Directa
  </div>

  <div id="game-over" class="game-over-overlay">
    <h2 style="font-size:32px; color:#ff0055; text-shadow:0 0 20px #ff0055; letter-spacing:4px;">GAME OVER</h2>
    <p style="margin-top:10px; color:#fff;">Puntuación Final: <span id="final-score" style="color:#00f0ff; font-weight:bold;">0</span></p>
    <button class="btn" onclick="restartGame()">REINICIAR</button>
  </div>

  <script>
    const canvas = document.getElementById('tetris');
    const ctx = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next');
    const nextCtx = nextCanvas.getContext('2d');

    const COLS = 12;
    const ROWS = 20;
    const BLOCK = 20;

    const COLORS = [
      null,
      '#00f0ff', // I - Cyan
      '#0055ff', // J - Blue
      '#ff8800', // L - Orange
      '#ffee00', // O - Yellow
      '#00ff66', // S - Green
      '#aa00ff', // T - Purple
      '#ff0055'  // Z - Red
    ];

    const PIECES = [
      [],
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
      [[2,0,0],[2,2,2],[0,0,0]],                 // J
      [[0,0,3],[3,3,3],[0,0,0]],                 // L
      [[4,4],[4,4]],                             // O
      [[0,5,5],[5,5,0],[0,0,0]],                 // S
      [[0,6,0],[6,6,6],[0,0,0]],                 // T
      [[7,7,0],[0,7,7],[0,0,0]]                  // Z
    ];

    // Sound FX using Web Audio API
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    function playTone(freq, type, duration) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    let board = createMatrix(COLS, ROWS);
    let score = 0;
    let lines = 0;
    let level = 1;
    let dropCounter = 0;
    let dropInterval = 800;
    let lastTime = 0;
    let isGameOver = false;

    let player = {
      pos: {x: 0, y: 0},
      matrix: null,
      nextMatrix: null,
      color: 1
    };

    function createMatrix(w, h) {
      const matrix = [];
      while (h--) matrix.push(new Array(w).fill(0));
      return matrix;
    }

    function collide(board, player) {
      const [m, o] = [player.matrix, player.pos];
      for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
          if (m[y][x] !== 0 && (board[y + o.y] && board[y + o.y][x + o.x]) !== 0) {
            return true;
          }
        }
      }
      return false;
    }

    function drawMatrix(matrix, offset, targetCtx, blockSize = BLOCK) {
      matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            targetCtx.fillStyle = COLORS[value];
            targetCtx.shadowColor = COLORS[value];
            targetCtx.shadowBlur = 10;
            targetCtx.fillRect((x + offset.x) * blockSize + 1, (y + offset.y) * blockSize + 1, blockSize - 2, blockSize - 2);
            targetCtx.shadowBlur = 0;
            targetCtx.strokeStyle = '#ffffff';
            targetCtx.lineWidth = 1;
            targetCtx.strokeRect((x + offset.x) * blockSize + 1, (y + offset.y) * blockSize + 1, blockSize - 2, blockSize - 2);
          }
        });
      });
    }

    function draw() {
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += BLOCK) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += BLOCK) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      drawMatrix(board, {x: 0, y: 0}, ctx);
      drawMatrix(player.matrix, player.pos, ctx);

      // Draw Next
      nextCtx.fillStyle = '#02040a';
      nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
      if (player.nextMatrix) {
        const offset = {
          x: (nextCanvas.width / 18 - player.nextMatrix[0].length) / 2,
          y: (nextCanvas.height / 18 - player.nextMatrix.length) / 2
        };
        drawMatrix(player.nextMatrix, offset, nextCtx, 18);
      }
    }

    function merge(board, player) {
      player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            board[y + player.pos.y][x + player.pos.x] = value;
          }
        });
      });
      playTone(180, 'sine', 0.08);
    }

    function rotate(matrix, dir) {
      for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
          [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
      }
      if (dir > 0) matrix.forEach(row => row.reverse());
      else matrix.reverse();
    }

    function playerRotate(dir) {
      const pos = player.pos.x;
      let offset = 1;
      rotate(player.matrix, dir);
      while (collide(board, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
          rotate(player.matrix, -dir);
          player.pos.x = pos;
          return;
        }
      }
      playTone(440, 'triangle', 0.05);
    }

    function arenaSweep() {
      let rowCount = 0;
      outer: for (let y = board.length - 1; y >= 0; --y) {
        for (let x = 0; x < board[y].length; ++x) {
          if (board[y][x] === 0) continue outer;
        }
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        ++y;
        rowCount++;
      }
      if (rowCount > 0) {
        lines += rowCount;
        score += rowCount === 1 ? 100 : rowCount === 2 ? 300 : rowCount === 3 ? 500 : 800;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(120, 800 - (level - 1) * 70);
        document.getElementById('score').innerText = score;
        document.getElementById('lines').innerText = lines;
        document.getElementById('level').innerText = level;
        playTone(660, 'square', 0.2);
      }
    }

    function getRandomPiece() {
      const id = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
      return JSON.parse(JSON.stringify(PIECES[id]));
    }

    function playerReset() {
      if (!player.nextMatrix) player.nextMatrix = getRandomPiece();
      player.matrix = player.nextMatrix;
      player.nextMatrix = getRandomPiece();
      player.pos.y = 0;
      player.pos.x = (board[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
      if (collide(board, player)) {
        isGameOver = true;
        document.getElementById('final-score').innerText = score;
        document.getElementById('game-over').style.display = 'flex';
        playTone(120, 'sawtooth', 0.5);
      }
    }

    function playerDrop() {
      player.pos.y++;
      if (collide(board, player)) {
        player.pos.y--;
        merge(board, player);
        arenaSweep();
        playerReset();
      }
      dropCounter = 0;
    }

    function playerHardDrop() {
      while (!collide(board, player)) {
        player.pos.y++;
      }
      player.pos.y--;
      merge(board, player);
      arenaSweep();
      playerReset();
      dropCounter = 0;
      playTone(280, 'sine', 0.05);
    }

    function playerMove(dir) {
      player.pos.x += dir;
      if (collide(board, player)) player.pos.x -= dir;
      else playTone(300, 'triangle', 0.03);
    }

    function update(time = 0) {
      if (isGameOver) return;
      const deltaTime = lastTime ? time - lastTime : 0;
      lastTime = time;
      dropCounter += deltaTime;
      if (dropCounter > dropInterval) playerDrop();
      draw();
      requestAnimationFrame(update);
    }

    function restartGame() {
      board = createMatrix(COLS, ROWS);
      score = 0;
      lines = 0;
      level = 1;
      dropInterval = 800;
      lastTime = 0;
      dropCounter = 0;
      isGameOver = false;
      document.getElementById('score').innerText = 0;
      document.getElementById('lines').innerText = 0;
      document.getElementById('level').innerText = 1;
      document.getElementById('game-over').style.display = 'none';
      playerReset();
      update();
    }

    document.addEventListener('keydown', event => {
      if (isGameOver) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft') playerMove(-1);
      else if (event.key === 'ArrowRight') playerMove(1);
      else if (event.key === 'ArrowDown') playerDrop();
      else if (event.key === 'ArrowUp') playerRotate(1);
      else if (event.key === ' ') { playerHardDrop(); }
    });

    playerReset();
    update();
  </script>
</body>
</html>`;
}

export function generateSnakeCyberpunk(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNAKE // MATRIX CYBERPUNK - TARS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #000;
      color: #00f0ff;
      font-family: 'Courier New', Courier, monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    h1 {
      font-size: 24px;
      letter-spacing: 4px;
      text-transform: uppercase;
      text-shadow: 0 0 15px #00f0ff;
      margin-bottom: 12px;
    }
    .game-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      border: 2px solid #00f0ff;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.3), inset 0 0 20px rgba(0, 240, 255, 0.1);
      background: rgba(5, 10, 20, 0.9);
      position: relative;
    }
    canvas {
      border: 1px solid rgba(0, 240, 255, 0.4);
      background: #02040a;
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
    }
    .hud {
      display: flex;
      justify-content: space-between;
      width: 100%;
      margin-bottom: 10px;
    }
    .stat-val {
      font-size: 16px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 8px #00f0ff;
    }
    .controls {
      margin-top: 15px;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
    kbd {
      background: #1e293b;
      color: #00f0ff;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(0, 240, 255, 0.3);
    }
    .game-over-overlay {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      display: none;
      border-radius: 12px;
    }
    .btn {
      background: #00f0ff;
      color: #000;
      border: none;
      padding: 10px 20px;
      font-family: inherit;
      font-weight: bold;
      font-size: 14px;
      letter-spacing: 2px;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
      margin-top: 15px;
    }
  </style>
</head>
<body>
  <h1>⚡ TARS // SERPIENTE MATRIX</h1>
  <div class="game-container">
    <div class="hud">
      <div>PUNTOS: <span id="score" class="stat-val">0</span></div>
      <div>RECORD: <span id="high-score" class="stat-val">0</span></div>
    </div>
    <canvas id="snake" width="400" height="400"></canvas>
    <div id="game-over" class="game-over-overlay">
      <h2 style="font-size:32px; color:#ff0055; text-shadow:0 0 20px #ff0055; letter-spacing:4px;">GAME OVER</h2>
      <p style="margin-top:10px; color:#fff;">Puntos: <span id="final-score" style="color:#00f0ff; font-weight:bold;">0</span></p>
      <button class="btn" onclick="resetGame()">VOLVER A JUGAR</button>
    </div>
  </div>
  <div class="controls">
    Usa las flechas <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> o <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> para controlar la serpiente
  </div>

  <script>
    const canvas = document.getElementById('snake');
    const ctx = canvas.getContext('2d');
    const GRID = 20;
    const COUNT = canvas.width / GRID;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    function beep(f, d) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(f, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + d);
    }

    let snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
    let food = {x: 15, y: 10};
    let dx = 1;
    let dy = 0;
    let score = 0;
    let highScore = 0;
    let isGameOver = false;

    function randomFood() {
      return {
        x: Math.floor(Math.random() * COUNT),
        y: Math.floor(Math.random() * COUNT)
      };
    }

    function gameLoop() {
      if (isGameOver) return;
      setTimeout(() => {
        requestAnimationFrame(gameLoop);
      }, 95);

      const head = {x: snake[0].x + dx, y: snake[0].y + dy};

      // Wrap edges
      if (head.x < 0) head.x = COUNT - 1;
      else if (head.x >= COUNT) head.x = 0;
      if (head.y < 0) head.y = COUNT - 1;
      else if (head.y >= COUNT) head.y = 0;

      // Check self-collision
      for (let segment of snake) {
        if (segment.x === head.x && segment.y === head.y) {
          isGameOver = true;
          document.getElementById('final-score').innerText = score;
          document.getElementById('game-over').style.display = 'flex';
          beep(130, 0.4);
          return;
        }
      }

      snake.unshift(head);

      // Check food
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        if (score > highScore) highScore = score;
        document.getElementById('score').innerText = score;
        document.getElementById('high-score').innerText = highScore;
        food = randomFood();
        beep(580, 0.1);
      } else {
        snake.pop();
      }

      // Draw
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Food
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(food.x * GRID + GRID/2, food.y * GRID + GRID/2, GRID/2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // Snake
      snake.forEach((part, index) => {
        ctx.fillStyle = index === 0 ? '#00f0ff' : '#00aaee';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = index === 0 ? 15 : 6;
        ctx.fillRect(part.x * GRID + 1, part.y * GRID + 1, GRID - 2, GRID - 2);
      });
      ctx.shadowBlur = 0;
    }

    function resetGame() {
      snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
      dx = 1; dy = 0;
      score = 0;
      isGameOver = false;
      food = randomFood();
      document.getElementById('score').innerText = 0;
      document.getElementById('game-over').style.display = 'none';
      gameLoop();
    }

    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
      }
      if ((k === 'arrowup' || k === 'w') && dy === 0) { dx = 0; dy = -1; }
      else if ((k === 'arrowdown' || k === 's') && dy === 0) { dx = 0; dy = 1; }
      else if ((k === 'arrowleft' || k === 'a') && dx === 0) { dx = -1; dy = 0; }
      else if ((k === 'arrowright' || k === 'd') && dx === 0) { dx = 1; dy = 0; }
    });

    gameLoop();
  </script>
</body>
</html>`;
}

export function generateBusinessCard(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tarjeta de Presentación Digital // TARS</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      color: #fff;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(0, 240, 255, 0.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 34px 28px;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      text-align: center;
      position: relative;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 0 50px rgba(0, 240, 255, 0.35);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(0, 240, 255, 0.15);
      border: 1px solid rgba(0, 240, 255, 0.4);
      color: #00f0ff;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .avatar-wrapper {
      width: 110px;
      height: 110px;
      margin: 0 auto 18px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00f0ff, #3b82f6, #ec4899);
      padding: 4px;
      box-shadow: 0 0 25px rgba(0, 240, 255, 0.4);
    }
    .avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.6rem;
    }
    h1 {
      font-size: 1.7rem;
      font-weight: 800;
      color: #f8fafc;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .role {
      color: #38bdf8;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .bio {
      font-size: 0.9rem;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 24px;
      background: rgba(0, 0, 0, 0.25);
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 22px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 700;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #00f0ff);
      color: #020617;
      box-shadow: 0 0 18px rgba(0, 240, 255, 0.4);
    }
    .btn-primary:hover {
      filter: brightness(1.15);
      transform: translateY(-2px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.16);
      transform: translateY(-2px);
    }
    .links {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .link-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      text-decoration: none;
      font-size: 0.9rem;
      transition: background 0.2s, border-color 0.2s;
    }
    .link-row:hover {
      background: rgba(0, 240, 255, 0.12);
      border-color: rgba(0, 240, 255, 0.4);
    }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #fff;
      padding: 10px 22px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.85rem;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
      z-index: 100;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Disponible para Proyectos</div>
    <div class="avatar-wrapper">
      <div class="avatar">👨‍💻</div>
    </div>
    <h1 id="name">Desarrollador FullStack</h1>
    <p class="role" id="role">Ingeniería & Soluciones Tecnológicas</p>
    <div class="bio" id="bio">
      Especialista en desarrollo web, inteligencia artificial aplicada y automatización de sistemas.
    </div>

    <div class="actions">
      <a href="https://wa.me/51999999999" target="_blank" class="btn btn-primary">
        <span>💬 WhatsApp</span>
      </a>
      <button class="btn btn-secondary" onclick="copyContact()">
        <span>📋 Copiar Datos</span>
      </button>
    </div>

    <div class="links">
      <a href="mailto:contacto@tech.com" class="link-row">
        <span>✉️ contacto@tech.com</span>
        <span>→</span>
      </a>
      <a href="tel:+51999999999" class="link-row">
        <span>📞 +51 999 999 999</span>
        <span>→</span>
      </a>
      <a href="https://github.com" target="_blank" class="link-row">
        <span>💻 GitHub / Proyectos</span>
        <span>→</span>
      </a>
    </div>
  </div>

  <div id="toast" class="toast">✓ ¡Contacto copiado al portapapeles!</div>

  <script>
    function copyContact() {
      const name = document.getElementById('name').innerText;
      const role = document.getElementById('role').innerText;
      const text = name + " | " + role + "\\nEmail: contacto@tech.com\\nTel: +51 999 999 999";
      navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
      });
    }
  </script>
</body>
</html>`;
}

export function generateGuessNumberGame(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RETO SENATI // ADIVINA EL NÚMERO - TARS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body {
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      color: #00f0ff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .box {
      background: rgba(30, 41, 59, 0.85);
      border: 2px solid #00f0ff;
      border-radius: 20px;
      padding: 35px 30px;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.3);
    }
    h1 { font-size: 24px; margin-bottom: 12px; letter-spacing: 2px; text-shadow: 0 0 10px #00f0ff; }
    p { color: #94a3b8; font-size: 15px; margin-bottom: 24px; }
    input {
      width: 100%;
      background: #020617;
      border: 2px solid rgba(0, 240, 255, 0.5);
      border-radius: 12px;
      padding: 14px;
      font-size: 26px;
      color: #fff;
      text-align: center;
      margin-bottom: 18px;
      outline: none;
    }
    input:focus { border-color: #00f0ff; box-shadow: 0 0 15px rgba(0, 240, 255, 0.5); }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #0284c7, #00f0ff);
      color: #020617;
      border: none;
      padding: 14px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 1.5px;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .btn:active { transform: scale(0.97); }
    .feedback {
      margin-top: 20px;
      font-size: 18px;
      font-weight: bold;
      min-height: 28px;
    }
    .attempts { margin-top: 10px; color: #64748b; font-size: 13px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>⚡ RETO SENATI FEST</h1>
    <p>He pensado un número secreto entre <strong>1 y 100</strong>.<br>¿Puedes adivinarlo?</p>
    <input type="number" id="guessInput" min="1" max="100" placeholder="?" autofocus>
    <button class="btn" onclick="checkGuess()">COMPROBAR NÚMERO</button>
    <div id="feedback" class="feedback"></div>
    <div id="attempts" class="attempts">Intentos: 0</div>
  </div>

  <script>
    let secret = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    function beep(freq, duration) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    function checkGuess() {
      const input = document.getElementById('guessInput');
      const val = parseInt(input.value, 10);
      const feedback = document.getElementById('feedback');
      const attemptsDiv = document.getElementById('attempts');

      if (isNaN(val) || val < 1 || val > 100) {
        feedback.style.color = '#f59e0b';
        feedback.innerText = 'Ingresa un número válido del 1 al 100';
        return;
      }

      attempts++;
      attemptsDiv.innerText = 'Intentos: ' + attempts;

      if (val === secret) {
        beep(880, 0.3);
        feedback.style.color = '#10b981';
        feedback.innerText = '🎉 ¡CORRECTO! ¡Adivinaste en ' + attempts + ' intentos!';
        input.disabled = true;
      } else if (val < secret) {
        beep(300, 0.15);
        feedback.style.color = '#38bdf8';
        feedback.innerText = '🔼 El número secreto es MAYOR';
        input.value = '';
        input.focus();
      } else {
        beep(220, 0.15);
        feedback.style.color = '#ec4899';
        feedback.innerText = '🔽 El número secreto es MENOR';
        input.value = '';
        input.focus();
      }
    }

    document.getElementById('guessInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') checkGuess();
    });
  </script>
</body>
</html>`;
}

export function generateTriviaCyberpunk(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TRIVIA TECH // SENATI FEST - TARS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .trivia-card {
      background: rgba(30, 41, 59, 0.85);
      border: 2px solid #00f0ff;
      border-radius: 24px;
      padding: 36px 30px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(14px);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(0, 240, 255, 0.15);
      border: 1px solid rgba(0, 240, 255, 0.4);
      color: #00f0ff;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .score-bar {
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .score-bar span { color: #00f0ff; }
    .question {
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 24px;
      line-height: 1.4;
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    .opt-btn {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(0, 240, 255, 0.3);
      color: #e2e8f0;
      padding: 14px 18px;
      border-radius: 14px;
      font-size: 1rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .opt-btn:hover:not(:disabled) {
      background: rgba(0, 240, 255, 0.15);
      border-color: #00f0ff;
      transform: translateX(4px);
    }
    .opt-btn.correct {
      background: rgba(16, 185, 129, 0.3) !important;
      border-color: #10b981 !important;
      color: #34d399 !important;
      font-weight: 700;
    }
    .opt-btn.wrong {
      background: rgba(239, 68, 68, 0.3) !important;
      border-color: #ef4444 !important;
      color: #f87171 !important;
    }
    .feedback {
      font-size: 1rem;
      font-weight: 700;
      min-height: 26px;
      margin-bottom: 16px;
    }
    .btn-next {
      background: linear-gradient(135deg, #0284c7, #00f0ff);
      color: #020617;
      border: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
      display: none;
      margin: 0 auto;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="trivia-card">
    <div class="badge">Reto Tecnológico // SENATI FEST</div>
    <div class="score-bar">
      <div>Pregunta <span id="qIndex">1</span>/6</div>
      <div>Puntos: <span id="score">0</span></div>
    </div>
    <div id="question" class="question">Cargando pregunta...</div>
    <div id="options" class="options"></div>
    <div id="feedback" class="feedback"></div>
    <button id="nextBtn" class="btn-next" onclick="nextQuestion()">SIGUIENTE PREGUNTA →</button>
  </div>

  <script>
    const questions = [
      {
        q: "¿Cuál es el componente considerado el 'cerebro' de una computadora que ejecuta las operaciones lógicas?",
        opts: ["Disco de Estado Sólido (SSD)", "Procesador Central (CPU)", "Memoria RAM", "Fuente de Alimentación"],
        ans: 1
      },
      {
        q: "¿Qué lenguaje de programación es el estándar mundial para Inteligencia Artificial y Ciencia de Datos?",
        opts: ["Python", "HTML5", "Visual Basic", "Pascal"],
        ans: 0
      },
      {
        q: "¿Qué significan las siglas 'IA' en la tecnología moderna de software?",
        opts: ["Internet Aplicado", "Información Asistida", "Inteligencia Artificial", "Interfaz Automatizada"],
        ans: 2
      },
      {
        q: "¿En qué carrera líder de SENATI se combinan mecánica, electrónica y programación robótica?",
        opts: ["Mecatrónica Industrial", "Gastronomía", "Administración", "Diseño Gráfico"],
        ans: 0
      },
      {
        q: "¿Cuál es la memoria volátil ultrarrápida que almacena los datos temporales en ejecución?",
        opts: ["Disco Duro SATA", "Memoria RAM", "Memoria USB", "Tarjeta microSD"],
        ans: 1
      },
      {
        q: "¿Qué sistema operativo de código abierto y alta seguridad tiene como mascota al pingüino Tux?",
        opts: ["Windows 11", "macOS", "GNU/Linux", "ChromeOS"],
        ans: 2
      }
    ];

    let current = 0;
    let score = 0;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    function beep(freq, duration) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    function renderQuestion() {
      const q = questions[current];
      document.getElementById('qIndex').innerText = current + 1;
      document.getElementById('question').innerText = q.q;
      const optsDiv = document.getElementById('options');
      optsDiv.innerHTML = '';
      document.getElementById('feedback').innerText = '';
      document.getElementById('nextBtn').style.display = 'none';

      const letters = ['A', 'B', 'C', 'D'];
      q.opts.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.innerHTML = '<strong>' + letters[idx] + ')</strong> ' + opt;
        btn.onclick = () => selectOption(idx);
        optsDiv.appendChild(btn);
      });
    }

    function selectOption(selected) {
      const q = questions[current];
      const buttons = document.querySelectorAll('.opt-btn');
      buttons.forEach(b => b.disabled = true);

      const feedback = document.getElementById('feedback');
      if (selected === q.ans) {
        buttons[selected].classList.add('correct');
        score += 20;
        document.getElementById('score').innerText = score;
        beep(750, 0.25);
        feedback.style.color = '#34d399';
        feedback.innerText = '✓ ¡CORRECTO! ¡Excelente razonamiento!';
      } else {
        buttons[selected].classList.add('wrong');
        buttons[q.ans].classList.add('correct');
        beep(220, 0.3);
        feedback.style.color = '#f87171';
        feedback.innerText = '✗ Incorrecto. La respuesta correcta era la opción ' + ['A','B','C','D'][q.ans];
      }

      const nextBtn = document.getElementById('nextBtn');
      nextBtn.style.display = 'block';
      if (current === questions.length - 1) {
        nextBtn.innerText = 'VER RESULTADOS FINALES';
      }
    }

    function nextQuestion() {
      current++;
      if (current < questions.length) {
        renderQuestion();
      } else {
        showResults();
      }
    }

    function showResults() {
      beep(880, 0.4);
      document.querySelector('.trivia-card').innerHTML = 
        '<div class="badge">¡TRIVIA COMPLETADA!</div>' +
        '<h2 style="font-size:2rem; color:#00f0ff; margin-bottom:12px;">¡Felicidades!</h2>' +
        '<p style="font-size:1.1rem; color:#94a3b8; margin-bottom:20px;">Puntuación lograda:</p>' +
        '<div style="font-size:3.5rem; font-weight:900; color:#34d399; text-shadow:0 0 20px rgba(52,211,153,0.5); margin-bottom:24px;">' + score + ' / 120</div>' +
        '<p style="color:#cbd5e1; margin-bottom:28px;">' + (score >= 80 ? '¡Tienes un talento excepcional para la tecnología y la ingeniería en SENATI!' : '¡Buen intento! Sigue explorando el mundo de la computación y la tecnología.') + '</p>' +
        '<button class="btn-next" style="display:block;" onclick="location.reload()">VOLVER A JUGAR</button>';
    }

    renderQuestion();
  </script>
</body>
</html>`;
}

export function generateTicTacToeCyberpunk(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TRES EN RAYA // TARS CYBERPUNK</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body {
      background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .wrapper {
      background: rgba(30, 41, 59, 0.85);
      border: 2px solid #00f0ff;
      border-radius: 24px;
      padding: 30px;
      box-shadow: 0 0 35px rgba(0, 240, 255, 0.3);
      text-align: center;
      max-width: 420px;
      width: 100%;
    }
    h1 { font-size: 22px; color: #00f0ff; margin-bottom: 8px; letter-spacing: 2px; }
    .status { font-size: 15px; color: #94a3b8; margin-bottom: 20px; min-height: 22px; font-weight: 600; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 90px);
      grid-template-rows: repeat(3, 90px);
      gap: 10px;
      margin: 0 auto 20px;
      justify-content: center;
    }
    .cell {
      background: #020617;
      border: 2px solid rgba(0, 240, 255, 0.4);
      border-radius: 14px;
      font-size: 38px;
      font-weight: 900;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .cell:hover:not(.taken) {
      border-color: #00f0ff;
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
    }
    .cell.x { color: #00f0ff; text-shadow: 0 0 15px #00f0ff; }
    .cell.o { color: #ec4899; text-shadow: 0 0 15px #ec4899; }
    .btn {
      background: linear-gradient(135deg, #0284c7, #00f0ff);
      color: #020617;
      border: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <h1>⚡ TRES EN RAYA CYBER</h1>
    <div id="status" class="status">Tu turno (X) vs TARS (O)</div>
    <div class="grid" id="grid">
      <div class="cell" onclick="makeMove(0)"></div>
      <div class="cell" onclick="makeMove(1)"></div>
      <div class="cell" onclick="makeMove(2)"></div>
      <div class="cell" onclick="makeMove(3)"></div>
      <div class="cell" onclick="makeMove(4)"></div>
      <div class="cell" onclick="makeMove(5)"></div>
      <div class="cell" onclick="makeMove(6)"></div>
      <div class="cell" onclick="makeMove(7)"></div>
      <div class="cell" onclick="makeMove(8)"></div>
    </div>
    <button class="btn" onclick="resetBoard()">REINICIAR PARTIDA</button>
  </div>

  <script>
    let board = Array(9).fill('');
    let isGameOver = false;
    let isAiThinking = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    function beep(f, d) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(f, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + d);
    }

    function checkWin(b) {
      const wins = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
      ];
      for (let [a,b1,c] of wins) {
        if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
      }
      return b.includes('') ? null : 'tie';
    }

    function makeMove(idx) {
      if (board[idx] || isGameOver || isAiThinking) return;
      board[idx] = 'X';
      beep(550, 0.1);
      updateDisplay();

      let res = checkWin(board);
      if (res) return finish(res);

      isAiThinking = true;
      document.getElementById('status').innerText = 'TARS pensando...';
      setTimeout(aiMove, 300);
    }

    function aiMove() {
      if (isGameOver) { isAiThinking = false; return; }
      let empty = board.map((v, i) => v === '' ? i : null).filter(v => v !== null);
      if (empty.length === 0) { isAiThinking = false; return; }
      let pick = empty[Math.floor(Math.random() * empty.length)];
      board[pick] = 'O';
      beep(380, 0.1);
      updateDisplay();

      let res = checkWin(board);
      if (res) return finish(res);
      isAiThinking = false;
      document.getElementById('status').innerText = 'Tu turno (X)';
    }

    function updateDisplay() {
      const cells = document.querySelectorAll('.cell');
      board.forEach((val, i) => {
        cells[i].innerText = val;
        cells[i].className = 'cell' + (val ? ' taken ' + val.toLowerCase() : '');
      });
    }

    function finish(winner) {
      isGameOver = true;
      isAiThinking = false;
      const status = document.getElementById('status');
      if (winner === 'X') {
        beep(750, 0.3);
        status.style.color = '#34d399';
        status.innerText = '🎉 ¡Ganaste la partida!';
      } else if (winner === 'O') {
        beep(220, 0.3);
        status.style.color = '#ec4899';
        status.innerText = '🤖 TARS ha ganado';
      } else {
        beep(440, 0.2);
        status.style.color = '#94a3b8';
        status.innerText = '🤝 ¡Empate técnico!';
      }
    }

    function resetBoard() {
      board = Array(9).fill('');
      isGameOver = false;
      isAiThinking = false;
      const status = document.getElementById('status');
      status.style.color = '#94a3b8';
      status.innerText = 'Tu turno (X) vs TARS (O)';
      updateDisplay();
    }
  </script>
</body>
</html>`;
}

export async function createCyberpunkGame(commandText: string, targetFolder?: string): Promise<GameInfo> {
  const clean = commandText.toLowerCase();
  const isCard = /\b(tarjeta\s+de\s+presentaci[oó]n|tarjeta\s+personal|tarjeta\s+digital|tarjeta\s+de\s+contacto|tarjeta\s+profesional|business\s*card|tarjeta)\b/i.test(clean);
  const isTrivia = /\b(trivia|preguntas|pregunta|quiz|cuestionario|concurso)\b/i.test(clean);
  const isTicTacToe = /\b(tres\s+en\s+raya|gato|tic\s*tac\s*toe|triqui)\b/i.test(clean);
  const isGuess = /\b(adivina|adivinar|n[uú]mero\s+secreto|reto)\b/i.test(clean);
  const isTetris = /\b(tetris|teriz|tetri|bloques)\b/i.test(clean);
  const isSnake = /\b(serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|slither)\b/i.test(clean);

  let gameType: "tetris" | "snake" | "pong" | "tarjeta" | "adivinanza" | "trivia" | "tictactoe" = "snake";
  let title = "Serpiente Matrix Cyberpunk";
  let filename = "snake.html";
  let content = "";

  if (isCard) {
    gameType = "tarjeta";
    title = "Tarjeta de Presentación Digital";
    filename = "index.html";
    content = generateBusinessCard();
  } else if (isTrivia) {
    gameType = "trivia";
    title = "Trivia Tecnológica SENATI FEST";
    filename = "trivia.html";
    content = generateTriviaCyberpunk();
  } else if (isTicTacToe) {
    gameType = "tictactoe";
    title = "Tres en Raya Cyberpunk";
    filename = "tictactoe.html";
    content = generateTicTacToeCyberpunk();
  } else if (isGuess) {
    gameType = "adivinanza";
    title = "Reto Adivina el Número";
    filename = "adivina.html";
    content = generateGuessNumberGame();
  } else if (isTetris) {
    gameType = "tetris";
    title = "Tetris Cyberpunk 2026";
    filename = "tetris.html";
    content = generateTetrisCyberpunk();
  } else if (isSnake) {
    gameType = "snake";
    title = "Serpiente Matrix Cyberpunk";
    filename = "snake.html";
    content = generateSnakeCyberpunk();
  } else {
    gameType = "snake";
    title = "Serpiente Matrix Cyberpunk";
    filename = "snake.html";
    content = generateSnakeCyberpunk();
  }

  const gamesDir = path.join(os.homedir(), "games");
  const publicGamesDir = path.join(process.cwd(), "public", "games");

  if (!fs.existsSync(gamesDir)) fs.mkdirSync(gamesDir, { recursive: true });
  if (!fs.existsSync(publicGamesDir)) fs.mkdirSync(publicGamesDir, { recursive: true });

  const systemPath = path.join(gamesDir, filename);
  const publicPath = path.join(publicGamesDir, filename);

  fs.writeFileSync(systemPath, content, "utf-8");
  fs.writeFileSync(publicPath, content, "utf-8");
  fs.writeFileSync(path.join(os.homedir(), filename), content, "utf-8");

  let actualPath = systemPath;

  if (targetFolder) {
    const customDir = targetFolder.startsWith("/") ? targetFolder : path.join(os.homedir(), targetFolder);
    if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
    const customFilePath = path.join(customDir, filename);
    fs.writeFileSync(customFilePath, content, "utf-8");
    actualPath = customFilePath;
  }

  return {
    title,
    gameType,
    filename,
    systemPath: actualPath,
    webPath: `/games/${filename}`,
  };
}
