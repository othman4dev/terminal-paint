const blessed = require("blessed");
const fs = require("fs");
const path = require("path");

class TerminalDrawer {
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Terminal Drawer by Othman4dev",
    });

    // Canvas configuration
    this.width = 30;
    this.height = 15;
    this.cellSize = 2;

    // Drawing state
    this.color = "green";
    this.cursorX = 0;
    this.cursorY = 0;
    this.isDrawing = false;
    this.drawMode = "single"; // single, line, rectangle, circle, fill
    this.startX = 0;
    this.startY = 0;
    this.brushLocked = false;

    // Undo/Redo system
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Color palette
    this.colors = [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
    ];

    this.colorIndex = 2; // Start with green

    // Saved drawings
    this.saveDir = path.join(process.cwd(), "drawings");
    this.ensureSaveDirectory();

    this.init();
  }

  init() {
    this.createGrid();
    this.createUI();
    this.setupEventHandlers();
    this.saveState(); // Initial state
    this.highlightCursor();
  }

  createGrid() {
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      this.grid[y] = [];
      for (let x = 0; x < this.width; x++) {
        const cell = blessed.box({
          top: y + 2, // Leave space for title
          left: x * this.cellSize,
          width: this.cellSize,
          height: 1,
          content: "  ",
          tags: true,
          style: {
            bg: "black",
          },
        });
        this.grid[y][x] = { element: cell, color: "black" };
        this.screen.append(cell);
      }
    }
  }

  createUI() {
    // Title bar
    this.titleBar = blessed.box({
      top: 0,
      height: 1,
      width: "100%",
      content: "{center} TERMINAL DRAWER - by Othman4dev {/center}",
      tags: true,
      style: { fg: "white", bg: "blue", bold: true },
    });
    this.screen.append(this.titleBar);

    // Color palette display
    this.colorPalette = blessed.box({
      top: this.height + 3,
      height: 2,
      width: "100%",
      content: this.getColorPaletteDisplay(),
      tags: true,
      style: { fg: "white" },
    });
    this.screen.append(this.colorPalette);

    // Tool selection
    this.toolBar = blessed.box({
      top: this.height + 5,
      height: 1,
      width: "100%",
      content: this.getToolBarDisplay(),
      tags: true,
      style: { fg: "cyan" },
    });
    this.screen.append(this.toolBar);

    // Info/controls display
    this.infoBar = blessed.box({
      bottom: 0,
      height: 3,
      width: "100%",
      content: this.getControlsDisplay(),
      tags: true,
      style: { fg: "white", bg: "black" },
    });
    this.screen.append(this.infoBar);

    // Status bar
    this.statusBar = blessed.box({
      bottom: 3,
      height: 1,
      width: "100%",
      content: this.getStatusDisplay(),
      tags: true,
      style: { fg: "black", bg: "white" },
    });
    this.screen.append(this.statusBar);
  }

  getColorPaletteDisplay() {
    let display = "Colors: ";
    this.colors.forEach((color, index) => {
      const marker = index === this.colorIndex ? "●" : "○";
      display += `{${color}-fg}${marker}{/} `;
    });
    return display;
  }

  getToolBarDisplay() {
    const tools = {
      single: "● Brush",
      line: "─ Line",
      rectangle: "# Rectangle",
      circle: "O Circle",
      fill: "█ Fill",
    };

    let display = "Tools: ";
    Object.entries(tools).forEach(([key, name]) => {
      const marker = key === this.drawMode ? `[${name}]` : name;
      display += `${marker}  `;
    });
    return display;
  }

  getControlsDisplay() {
    return `{bold}CONTROLS:{/bold}
{cyan-fg}Movement:{/} ↑↓←→ | {cyan-fg}Paint:{/} Space/Enter | {cyan-fg}Colors:{/} Tab/Shift+Tab | {cyan-fg}Clear:{/} C | {cyan-fg}Brush Lock:{/} B
{cyan-fg}Tools:{/} T (cycle) | {cyan-fg}Undo:{/} U | {cyan-fg}Redo:{/} R | {cyan-fg}Save:{/} S | {cyan-fg}Load:{/} L | {cyan-fg}Quit:{/} Q/Esc`;
  }

  getStatusDisplay() {
    const pos = `Position: (${this.cursorX}, ${this.cursorY})`;
    const colorName = `Color: ${this.colors[this.colorIndex]}`;
    const mode = `Mode: ${this.drawMode.toUpperCase()}`;
    const historyInfo = `History: ${this.historyIndex + 1}/${
      this.history.length
    }`;
    const brushStatus = `Brush: ${this.brushLocked ? "Locked" : "Unlocked"}`;
    return `${pos} | ${colorName} | ${mode} | ${historyInfo} | ${brushStatus}`;
  }

  setupEventHandlers() {
    // Movement
    this.screen.key(["up", "down", "left", "right"], (_, key) => {
      if (key.name === "up" && this.cursorY > 0) this.cursorY--;
      if (key.name === "down" && this.cursorY < this.height - 1) this.cursorY++;
      if (key.name === "left" && this.cursorX > 0) this.cursorX--;
      if (key.name === "right" && this.cursorX < this.width - 1) this.cursorX++;

      if (this.brushLocked && this.drawMode == "single") {
        this.paintCell(this.cursorX, this.cursorY);
      }

      this.highlightCursor();
      this.updateStatus();
    });

    // Paint/Draw
    this.screen.key(["space", "enter"], () => {
      this.handlePaint();
    });

    // Color cycling
    this.screen.key(["tab"], () => {
      this.colorIndex = (this.colorIndex + 1) % this.colors.length;
      this.color = this.colors[this.colorIndex];
      this.updateUI();
    });

    this.screen.key(["S-tab"], () => {
      this.colorIndex =
        this.colorIndex === 0 ? this.colors.length - 1 : this.colorIndex - 1;
      this.color = this.colors[this.colorIndex];
      this.updateUI();
    });

    // Tool switching
    this.screen.key(["t"], () => {
      const modes = ["single", "line", "rectangle", "circle", "fill"];
      const currentIndex = modes.indexOf(this.drawMode);
      this.drawMode = modes[(currentIndex + 1) % modes.length];
      this.updateUI();
    });

    //Brush lock
    this.screen.key(["b"], () => {
      this.brushLocked = !this.brushLocked;
      this.updateUI();
    });

    // Specific tool shortcuts
    this.screen.key(["1"], () => {
      this.drawMode = "single";
      this.updateUI();
    });
    this.screen.key(["2"], () => {
      this.drawMode = "line";
      this.updateUI();
    });
    this.screen.key(["3"], () => {
      this.drawMode = "rectangle";
      this.updateUI();
    });
    this.screen.key(["4"], () => {
      this.drawMode = "circle";
      this.updateUI();
    });
    this.screen.key(["5"], () => {
      this.drawMode = "fill";
      this.updateUI();
    });

    // Clear
    this.screen.key(["c"], () => {
      this.saveState();
      this.clearGrid();
      this.highlightCursor();
    });

    // Undo/Redo
    this.screen.key(["u"], () => this.undo());
    this.screen.key(["r"], () => this.redo());

    // Save/Load
    this.screen.key(["s"], () => this.saveDrawing());
    this.screen.key(["l"], () => this.loadDrawing());

    // Quit
    this.screen.key(["q", "escape", "C-c"], () => process.exit(0));

    // Mouse support
    this.screen.on("mouse", (data) => {
      if (data.action === "mousedown" || data.action === "mousemove") {
        const x = Math.floor(data.x / this.cellSize);
        const y = data.y - 2; // Account for title bar
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
          this.cursorX = x;
          this.cursorY = y;
          if (data.action === "mousedown") {
            this.handlePaint();
          }
          this.highlightCursor();
          this.updateStatus();
        }
      }
    });
  }

  handlePaint() {
    if (this.drawMode === "single") {
      this.saveState();
      this.paintCell(this.cursorX, this.cursorY);
    } else if (this.drawMode === "fill") {
      this.saveState();
      this.floodFill(this.cursorX, this.cursorY);
    } else {
      // For line, rectangle, circle - handle start/end points
      if (!this.isDrawing) {
        this.startX = this.cursorX;
        this.startY = this.cursorY;
        this.isDrawing = true;
        this.saveState();
      } else {
        this.drawShape();
        this.isDrawing = false;
      }
    }
    this.highlightCursor();
  }

  drawShape() {
    switch (this.drawMode) {
      case "line":
        this.drawLine(this.startX, this.startY, this.cursorX, this.cursorY);
        break;
      case "rectangle":
        this.drawRectangle(
          this.startX,
          this.startY,
          this.cursorX,
          this.cursorY
        );
        break;
      case "circle":
        this.drawCircle(this.startX, this.startY, this.cursorX, this.cursorY);
        break;
    }
  }

  drawLine(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1,
      y = y1;
    while (true) {
      this.paintCell(x, y);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  drawRectangle(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let x = minX; x <= maxX; x++) {
      this.paintCell(x, minY);
      this.paintCell(x, maxY);
    }
    for (let y = minY; y <= maxY; y++) {
      this.paintCell(minX, y);
      this.paintCell(maxX, y);
    }
  }

  drawCircle(x1, y1, x2, y2) {
    const radius = Math.round(
      Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    );
    const centerX = x1;
    const centerY = y1;

    for (let angle = 0; angle < 360; angle += 2) {
      const x = Math.round(
        centerX + radius * Math.cos((angle * Math.PI) / 180)
      );
      const y = Math.round(
        centerY + radius * Math.sin((angle * Math.PI) / 180)
      );
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.paintCell(x, y);
      }
    }
  }

  floodFill(x, y) {
    const targetColor = this.grid[y][x].color;
    if (targetColor === this.color) return;

    const stack = [[x, y]];
    const visited = new Set();

    while (stack.length > 0) {
      const [currentX, currentY] = stack.pop();
      const key = `${currentX},${currentY}`;

      if (visited.has(key)) continue;
      if (
        currentX < 0 ||
        currentX >= this.width ||
        currentY < 0 ||
        currentY >= this.height
      )
        continue;
      if (this.grid[currentY][currentX].color !== targetColor) continue;

      visited.add(key);
      this.paintCell(currentX, currentY);

      stack.push([currentX + 1, currentY]);
      stack.push([currentX - 1, currentY]);
      stack.push([currentX, currentY + 1]);
      stack.push([currentX, currentY - 1]);
    }
  }

  paintCell(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y][x].element.style.bg = this.color;
      this.grid[y][x].color = this.color;
    }
  }

  highlightCursor() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (x === this.cursorX && y === this.cursorY) {
          switch (this.drawMode) {
            case "single":
              this.grid[y][x].element.setContent("●");
              break;
            case "fill":
              this.grid[y][x].element.setContent("█");
              break;
            case "line":
              this.grid[y][x].element.setContent("_");
              break;
            case "circle":
              this.grid[y][x].element.setContent("O");
              break;
            case "rectangle":
              this.grid[y][x].element.setContent("#");
              break;
            default:
              break;
          }

          this.grid[y][x].element.style.fg =
            this.grid[y][x].color === "black" ? "white" : "black";
        } else {
          this.grid[y][x].element.setContent("  ");
        }
      }
    }
    this.screen.render();
  }

  clearGrid() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x].element.style.bg = "black";
        this.grid[y][x].color = "black";
      }
    }
  }

  saveState() {
    const state = this.grid.map((row) =>
      row.map((cell) => ({ color: cell.color }))
    );

    // Remove future history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(JSON.parse(JSON.stringify(state)));

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState(this.history[this.historyIndex]);
    }
  }

  restoreState(state) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const color = state[y][x].color;
        this.grid[y][x].element.style.bg = color;
        this.grid[y][x].color = color;
      }
    }
    this.highlightCursor();
    this.updateStatus();
  }

  ensureSaveDirectory() {
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
  }

  async saveDrawing() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `drawing-${timestamp}.json`;
    const filepath = path.join(this.saveDir, filename);

    const data = {
      width: this.width,
      height: this.height,
      grid: this.grid.map((row) => row.map((cell) => ({ color: cell.color }))),
      metadata: {
        created: new Date().toISOString(),
        version: "1.0",
      },
    };

    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      this.showMessage(`Saved as ${filename}`, "green");
    } catch (error) {
      this.showMessage(`Save failed: ${error.message}`, "red");
    }
  }

  async loadDrawing() {
    try {
      const files = fs
        .readdirSync(this.saveDir)
        .filter((f) => f.endsWith(".json"));
      if (files.length === 0) {
        this.showMessage("No saved drawings found", "yellow");
        return;
      }

      // Load the most recent file for simplicity
      const latestFile = files.sort().pop();
      const filepath = path.join(this.saveDir, latestFile);
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));

      this.saveState(); // Save current state before loading

      // Restore the drawing
      for (let y = 0; y < Math.min(this.height, data.height); y++) {
        for (let x = 0; x < Math.min(this.width, data.width); x++) {
          const color = data.grid[y][x].color;
          this.grid[y][x].element.style.bg = color;
          this.grid[y][x].color = color;
        }
      }

      this.highlightCursor();
      this.showMessage(`Loaded ${latestFile}`, "green");
    } catch (error) {
      this.showMessage(`Load failed: ${error.message}`, "red");
    }
  }

  showMessage(text, color = "white") {
    const messageBox = blessed.box({
      top: "center",
      left: "center",
      width: text.length + 4,
      height: 3,
      content: `{center}${text}{/center}`,
      tags: true,
      border: { type: "line" },
      style: { fg: color, bg: "black", border: { fg: color } },
    });

    this.screen.append(messageBox);
    this.screen.render();

    setTimeout(() => {
      this.screen.remove(messageBox);
      this.screen.render();
    }, 2000);
  }

  updateUI() {
    this.colorPalette.setContent(this.getColorPaletteDisplay());
    this.toolBar.setContent(this.getToolBarDisplay());
    this.updateStatus();
  }

  updateStatus() {
    this.statusBar.setContent(this.getStatusDisplay());
    this.screen.render();
  }
}

// Initialize and start the game
const drawer = new TerminalDrawer();

// Graceful shutdown
process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
