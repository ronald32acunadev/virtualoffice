import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { EmployeeStatus } from "../api/types";
import { MONITOR_VISUALS } from "./officeTheme";

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Generates a warm oak wood-plank floor texture with staggered seams and fine grain.
 */
export function createWoodFloorTexture(): CanvasTexture | null {
  const canvas = createCanvas(512, 512);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const plankPalette = ["#d8b589", "#cfa879", "#dfc097", "#c99f6e", "#d4ae80"];
  const rows = 8;
  const cols = 3;
  const plankH = canvas.height / rows;
  const plankW = canvas.width / cols;

  ctx.fillStyle = "#c9a273";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r += 1) {
    const offset = (r % 2) * (plankW * 0.5);
    for (let c = -1; c <= cols; c += 1) {
      const x = c * plankW + offset;
      const y = r * plankH;
      const tone = plankPalette[(r * 3 + c + 5) % plankPalette.length] ?? "#d8b589";

      ctx.fillStyle = tone;
      ctx.fillRect(x, y, plankW, plankH);

      // Subtle wood grain strokes inside each plank
      ctx.strokeStyle = "rgba(120, 78, 38, 0.14)";
      ctx.lineWidth = 1.2;
      for (let g = 0; g < 6; g += 1) {
        const gy = y + 6 + ((g * 11 + r * 5) % (plankH - 10));
        ctx.beginPath();
        ctx.moveTo(x + 2, gy);
        ctx.bezierCurveTo(
          x + plankW * 0.35,
          gy + ((g % 2 === 0 ? 1 : -1) * 2.5),
          x + plankW * 0.65,
          gy + ((g % 2 === 0 ? -1 : 1) * 2),
          x + plankW - 2,
          gy,
        );
        ctx.stroke();
      }

      // Vertical seam
      ctx.strokeStyle = "rgba(92, 60, 30, 0.36)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + plankH);
      ctx.stroke();
    }

    // Horizontal plank seam
    ctx.strokeStyle = "rgba(92, 60, 30, 0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, r * plankH);
    ctx.lineTo(canvas.width, r * plankH);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a subtle woven rug texture with crosshatch threads and a crisp accent border.
 */
export function createRugTexture(baseHex: string): CanvasTexture | null {
  const canvas = createCanvas(256, 256);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Soft warm fabric background
  ctx.fillStyle = "#eee6da";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tinted inner wash
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  // Subtle woven crosshatch pattern
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(80, 65, 50, 0.08)";
  for (let j = 0; j < canvas.height; j += 6) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(canvas.width, j);
    ctx.stroke();
  }

  // Outer accent border
  ctx.strokeStyle = baseHex;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);

  // Delicate inner trim line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a stylized monitor screen CanvasTexture tailored to each EmployeeStatus.
 */
export function createScreenTexture(status: EmployeeStatus): CanvasTexture | null {
  const canvas = createCanvas(256, 160);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const visual = MONITOR_VISUALS[status];

  ctx.fillStyle = visual.screen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (status === "stopped") {
    // Powered-off monitor with tiny dim standby dot
    ctx.fillStyle = "#3a404a";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (status === "working") {
    // IDE sidebar + colorful glowing code lines
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(10, 12, 42, 136);
    const lineColors = [visual.emissive, visual.accent, "#8fb8ff", "#ffd57e"];
    const lengths = [120, 88, 145, 72, 130, 96, 110, 64, 138];
    lengths.forEach((len, idx) => {
      ctx.fillStyle = lineColors[idx % lineColors.length] ?? visual.emissive;
      ctx.fillRect(64, 18 + idx * 14, len, 6);
    });
  } else if (status === "waiting_approval") {
    // Amber alert modal card
    ctx.fillStyle = "rgba(255, 176, 46, 0.2)";
    ctx.fillRect(24, 24, 208, 112);
    ctx.strokeStyle = visual.emissive;
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, 208, 112);
    ctx.fillStyle = visual.accent;
    ctx.fillRect(46, 48, 164, 16);
    ctx.fillStyle = visual.emissive;
    ctx.fillRect(46, 78, 112, 12);
    ctx.fillRect(46, 102, 72, 16);
  } else if (status === "failed") {
    // Red error banner + diagnostic bars
    ctx.fillStyle = visual.emissive;
    ctx.fillRect(16, 18, 224, 26);
    ctx.fillStyle = visual.accent;
    ctx.fillRect(26, 62, 180, 10);
    ctx.fillRect(26, 82, 140, 10);
    ctx.fillRect(26, 102, 165, 10);
  } else if (status === "starting") {
    // Boot progress bar
    ctx.strokeStyle = visual.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 68, 172, 24);
    ctx.fillStyle = visual.emissive;
    ctx.fillRect(48, 74, 112, 12);
  } else {
    // Idle calm status screen
    ctx.fillStyle = "rgba(168, 206, 245, 0.25)";
    ctx.fillRect(24, 26, 208, 108);
    ctx.fillStyle = visual.emissive;
    ctx.fillRect(46, 54, 164, 10);
    ctx.fillStyle = visual.accent;
    ctx.fillRect(46, 78, 108, 8);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
