import { useState, useEffect, useRef } from 'react';
import rough from 'roughjs';
import './App.css';

// Helper functions from the original script
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function getCornerRadius(minSide: number, mode: string) {
  const DEFAULT_PROPORTIONAL_RADIUS = 0.25;
  const DEFAULT_ADAPTIVE_RADIUS = 32;

  if (mode === 'none') return 0;
  if (mode === 'proportional') return minSide * DEFAULT_PROPORTIONAL_RADIUS;

  const cutoff = DEFAULT_ADAPTIVE_RADIUS / DEFAULT_PROPORTIONAL_RADIUS;
  if (minSide <= cutoff) {
    return minSide * DEFAULT_PROPORTIONAL_RADIUS;
  }
  return DEFAULT_ADAPTIVE_RADIUS;
}

function adjustRoughness(width: number, height: number, roughness: number, hasRoundness: boolean) {
  const maxSize = Math.max(width, height);
  const minSize = Math.min(width, height);
  if ((minSize >= 20 && maxSize >= 50) || (minSize >= 15 && hasRoundness)) {
    return roughness;
  }
  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5);
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  if (!r) {
    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
  }
  return [
    `M ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y}, ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `Q ${x + width} ${y + height}, ${x + width - r} ${y + height}`,
    `L ${x + r} ${y + height}`,
    `Q ${x} ${y + height}, ${x} ${y + height - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y}, ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

function centerOfRect(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function getAnchorOnRoundedRect(rect: { x: number; y: number; w: number; h: number }, target: { x: number; y: number }, gap = 10) {
  const c = centerOfRect(rect);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const cornerBias = 0.86;

  let x, y;

  if (absDx > absDy * cornerBias) {
    x = dx > 0 ? rect.x + rect.w + gap : rect.x - gap;
    y = clamp(target.y, rect.y + 18, rect.y + rect.h - 18);
  } else {
    x = clamp(target.x, rect.x + 18, rect.x + rect.w - 18);
    y = dy > 0 ? rect.y + rect.h + gap : rect.y - gap;
  }

  return { x, y };
}

function getAnchorOnEllipse(rect: { x: number; y: number; w: number; h: number }, target: { x: number; y: number }, gap = 10) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const rx = rect.w / 2 + gap;
  const ry = rect.h / 2 + gap;
  
  const dx = target.x - cx;
  const dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle)
  };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState('rectangle'); // 'rectangle' | 'ellipse'
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(180);
  const [roughness, setRoughness] = useState(1.2);
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [roundMode, setRoundMode] = useState('adaptive');
  const [fillStyle, setFillStyle] = useState('hachure');
  const [stroke, setStroke] = useState('#1e1e1e');
  const [fill, setFill] = useState('#ffd8a8');
  const [seed, setSeed] = useState(42);

  const drawArrow = (rc: any, from: any, to: any, opts: any) => {
    rc.line(from.x, from.y, to.x, to.y, {
      seed: opts.seed,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth,
      roughness: Math.min(1, opts.roughness),
      bowing: 1,
      preserveVertices: true,
    });

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 14;
    const a1 = angle - Math.PI / 8;
    const a2 = angle + Math.PI / 8;

    rc.line(to.x, to.y, to.x - Math.cos(a1) * size, to.y - Math.sin(a1) * size, {
      seed: opts.seed + 1,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth,
      roughness: Math.min(1, opts.roughness),
      preserveVertices: true,
    });
    rc.line(to.x, to.y, to.x - Math.cos(a2) * size, to.y - Math.sin(a2) * size, {
      seed: opts.seed + 2,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth,
      roughness: Math.min(1, opts.roughness),
      preserveVertices: true,
    });
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
    ctx.save();
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fitCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    fitCanvas();

    const cssWidth = canvas.getBoundingClientRect().width;
    const cssHeight = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const rc = rough.canvas(canvas);
    const rect = { x: 310, y: 200, w: width, h: height };

    const minSide = Math.min(width, height);
    const radius = getCornerRadius(minSide, roundMode);
    
    // In Excalidraw, ellipses also get roughness adjusted similarly
    const finalRoughness = adjustRoughness(width, height, roughness, shape === 'rectangle' ? radius > 0 : true);

    const roughOptions = {
      seed,
      stroke,
      strokeWidth,
      roughness: finalRoughness,
      fill,
      fillStyle,
      fillWeight: strokeWidth / 2,
      hachureGap: strokeWidth * 4,
      preserveVertices: true,
      bowing: 1.1,
    };

    if (shape === 'rectangle') {
      const path = roundedRectPath(rect.x, rect.y, rect.w, rect.h, radius);
      rc.path(path, roughOptions);

      // Clean border overlay
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = stroke;
      const p = new Path2D(path);
      ctx.stroke(p);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 20px sans-serif';
      ctx.fillText('Hand-drawn rounded rectangle', rect.x + 22, rect.y + 42);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#5b5b5b';
      ctx.fillText('Custom path + controlled roughness + adaptive corner radius', rect.x + 22, rect.y + 70);
      ctx.restore();

    } else if (shape === 'ellipse') {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      
      // Rough.js ellipse takes center coordinates, width, and height
      rc.ellipse(cx, cy, rect.w, rect.h, roughOptions);

      // Clean border overlay
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 20px sans-serif';
      ctx.fillText('Hand-drawn ellipse', cx - 90, cy - 10);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#5b5b5b';
      ctx.fillText('Perfect geometrical skeleton with controlled hand-drawn noise', cx - 180, cy + 15);
      ctx.restore();
    }

    const externalPoints = [
      { x: 170, y: 120, label: 'top-left incoming' },
      { x: 760, y: 155, label: 'top-right incoming' },
      { x: 165, y: 475, label: 'bottom-left incoming' },
      { x: 845, y: 435, label: 'right incoming' },
    ];

    externalPoints.forEach((point, i) => {
      const anchor = shape === 'rectangle' 
        ? getAnchorOnRoundedRect(rect, point, 10) 
        : getAnchorOnEllipse(rect, point, 10);
        
      drawArrow(rc, point, anchor, {
        seed: seed + 10 + i * 10,
        stroke: '#3b5bdb',
        strokeWidth: 2.1,
        roughness: 0.8,
      });

      ctx.save();
      ctx.fillStyle = '#3b5bdb';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawLabel(ctx, point.label, point.x + 10, point.y - 10);
    });

    if (shape === 'rectangle') {
      drawLabel(ctx, `radius = ${radius.toFixed(1)} px`, rect.x, rect.y + rect.h + 40);
      drawLabel(ctx, '连接点会避开角，优先吸到边中段', rect.x, rect.y + rect.h + 80);
    } else {
      drawLabel(ctx, '连接点通过几何椭圆方程精确计算锚点', rect.x, rect.y + rect.h + 80);
    }
    drawLabel(ctx, `effective roughness = ${finalRoughness.toFixed(2)}`, rect.x, rect.y + rect.h + 60);

    const handleResize = () => {
      fitCanvas();
      setSeed(s => s + 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);

  }, [shape, width, height, roughness, strokeWidth, roundMode, fillStyle, stroke, fill, seed]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `excalidraw-${shape}-demo.png`;
    a.click();
  };

  return (
    <div className="wrap">
      <h1>Excalidraw 风格手绘 Demo 🎨</h1>
      <div className="sub">复刻要点：自定义 path、受控 roughness、自适应圆角、精确吸附。</div>

      <div className="layout">
        <div className="panel controls">
          <h2>参数</h2>

          <div className="control">
            <label><span>形状</span></label>
            <select value={shape} onChange={e => setShape(e.target.value)}>
              <option value="rectangle">圆角矩形 (Rectangle)</option>
              <option value="ellipse">椭圆 (Ellipse)</option>
            </select>
          </div>
          <div className="control">
            <label><span>宽度</span><strong>{width} px</strong></label>
            <input type="range" min="120" max="520" value={width} onChange={e => setWidth(Number(e.target.value))} />
          </div>
          <div className="control">
            <label><span>高度</span><strong>{height} px</strong></label>
            <input type="range" min="80" max="320" value={height} onChange={e => setHeight(Number(e.target.value))} />
          </div>
          <div className="control">
            <label><span>基础 roughness</span><strong>{roughness.toFixed(1)}</strong></label>
            <input type="range" min="0" max="4" step="0.1" value={roughness} onChange={e => setRoughness(Number(e.target.value))} />
          </div>
          <div className="control">
            <label><span>描边宽度</span><strong>{strokeWidth.toFixed(1)} px</strong></label>
            <input type="range" min="1" max="6" step="0.5" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} />
          </div>
          {shape === 'rectangle' && (
            <div className="control">
              <label><span>圆角模式</span></label>
              <select value={roundMode} onChange={e => setRoundMode(e.target.value)}>
                <option value="adaptive">adaptive</option>
                <option value="proportional">proportional</option>
                <option value="none">none</option>
              </select>
            </div>
          )}
          <div className="control">
            <label><span>填充样式</span></label>
            <select value={fillStyle} onChange={e => setFillStyle(e.target.value)}>
              <option value="hachure">hachure</option>
              <option value="solid">solid</option>
              <option value="cross-hatch">cross-hatch</option>
              <option value="zigzag">zigzag</option>
              <option value="dots">dots</option>
            </select>
          </div>
          <div className="control">
            <label><span>描边颜色</span></label>
            <input type="color" value={stroke} onChange={e => setStroke(e.target.value)} />
          </div>
          <div className="control">
            <label><span>填充颜色</span></label>
            <input type="color" value={fill} onChange={e => setFill(e.target.value)} />
          </div>
          <div className="control">
            <label><span>随机种子</span><strong>{seed}</strong></label>
            <input type="range" min="1" max="999" step="1" value={seed} onChange={e => setSeed(Number(e.target.value))} />
          </div>

          <div className="control">
            <button onClick={() => setSeed(Math.floor(Math.random() * 999) + 1)}>换个 seed</button>
          </div>
          <div className="control">
            <button className="secondary" onClick={handleDownload}>下载 PNG</button>
          </div>

          <div className="hint">
            这个 demo 故意模仿 Excalidraw 的几个关键细节：<br />
            1. 形状具有稳定的几何骨架（底层干净的 Path 或 Ellipse）。<br />
            2. 尺寸变小会自动降低 roughness。<br />
            3. 箭头连接时，计算严格的边缘交叉点。<br />
            4. 使用高 DPI canvas，避免发糊。
          </div>
        </div>

        <div className="panel stage">
          <canvas ref={canvasRef}></canvas>
        </div>
      </div>
    </div>
  );
}

export default App;
