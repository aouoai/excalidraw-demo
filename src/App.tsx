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

function roundedDiamondPath(x: number, y: number, width: number, height: number, radius: number) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const top = { x: cx, y };
  const right = { x: x + width, y: cy };
  const bottom = { x: cx, y: y + height };
  const left = { x, y: cy };
  const vertices = [top, right, bottom, left];

  const edgeLens = vertices.map((p, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return Math.hypot(next.x - p.x, next.y - p.y);
  });
  const minEdge = Math.min(...edgeLens);
  const r = clamp(radius, 0, minEdge / 2 - 0.01);

  if (!r) {
    return [
      `M ${top.x} ${top.y}`,
      `L ${right.x} ${right.y}`,
      `L ${bottom.x} ${bottom.y}`,
      `L ${left.x} ${left.y}`,
      'Z',
    ].join(' ');
  }

  const pts = vertices.map((curr, i) => {
    const prev = vertices[(i - 1 + vertices.length) % vertices.length];
    const next = vertices[(i + 1) % vertices.length];
    const toPrevLen = Math.hypot(prev.x - curr.x, prev.y - curr.y);
    const toNextLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    return {
      enter: {
        x: curr.x + ((prev.x - curr.x) / toPrevLen) * r,
        y: curr.y + ((prev.y - curr.y) / toPrevLen) * r,
      },
      corner: curr,
      exit: {
        x: curr.x + ((next.x - curr.x) / toNextLen) * r,
        y: curr.y + ((next.y - curr.y) / toNextLen) * r,
      },
    };
  });

  return [
    `M ${pts[0].exit.x} ${pts[0].exit.y}`,
    `L ${pts[1].enter.x} ${pts[1].enter.y}`,
    `Q ${pts[1].corner.x} ${pts[1].corner.y}, ${pts[1].exit.x} ${pts[1].exit.y}`,
    `L ${pts[2].enter.x} ${pts[2].enter.y}`,
    `Q ${pts[2].corner.x} ${pts[2].corner.y}, ${pts[2].exit.x} ${pts[2].exit.y}`,
    `L ${pts[3].enter.x} ${pts[3].enter.y}`,
    `Q ${pts[3].corner.x} ${pts[3].corner.y}, ${pts[3].exit.x} ${pts[3].exit.y}`,
    `L ${pts[0].enter.x} ${pts[0].enter.y}`,
    `Q ${pts[0].corner.x} ${pts[0].corner.y}, ${pts[0].exit.x} ${pts[0].exit.y}`,
    'Z',
  ].join(' ');
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialShape = (() => {
    if (typeof window === 'undefined') return 'rectangle';
    const value = new URLSearchParams(window.location.search).get('shape');
    return value === 'ellipse' || value === 'diamond' || value === 'rectangle' ? value : 'rectangle';
  })();
  const [shape, setShape] = useState(initialShape); // 'rectangle' | 'ellipse' | 'diamond'
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(180);
  const [roughness, setRoughness] = useState(1);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [roundMode, setRoundMode] = useState('adaptive');
  const [fillStyle, setFillStyle] = useState('solid');
  const [stroke, setStroke] = useState('#e03131');
  const [fill, setFill] = useState('#ffc9c9');
  const [seed, setSeed] = useState(42);

  const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    ctx.save();
    ctx.fillStyle = '#555';
    ctx.font = '12px sans-serif';
    ctx.textAlign = align;
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
    const rect = {
      x: (cssWidth - width) / 2,
      y: (cssHeight - height) / 2,
      w: width,
      h: height,
    };

    const minSide = Math.min(width, height);
    const radius = getCornerRadius(minSide, roundMode);
    
    const shapeHasRoundness = shape === 'rectangle' || shape === 'diamond' ? radius > 0 : true;
    const finalRoughness = adjustRoughness(width, height, roughness, shapeHasRoundness);

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

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    if (shape === 'rectangle') {
      const path = roundedRectPath(rect.x, rect.y, rect.w, rect.h, radius);
      rc.path(path, roughOptions);

      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = stroke;
      ctx.stroke(new Path2D(path));
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Rounded rectangle', cx, cy - 6);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#5b5b5b';
      ctx.fillText(radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight corner geometry', cx, cy + 20);
      ctx.restore();
    } else if (shape === 'ellipse') {
      rc.ellipse(cx, cy, rect.w, rect.h, roughOptions);

      ctx.save();
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ellipse', cx, cy - 6);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#5b5b5b';
      ctx.fillText('Clean geometric skeleton with controlled roughness', cx, cy + 20);
      ctx.restore();
    } else if (shape === 'diamond') {
      const path = roundedDiamondPath(rect.x, rect.y, rect.w, rect.h, radius);
      rc.path(path, roughOptions);

      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = stroke;
      ctx.stroke(new Path2D(path));
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(radius > 0 ? 'Rounded diamond' : 'Diamond', cx, cy - 6);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#5b5b5b';
      ctx.fillText(radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight edge rhombus geometry', cx, cy + 20);
      ctx.restore();
    }

    drawLabel(ctx, `roughness ${finalRoughness.toFixed(2)}`, cx, rect.y + rect.h + 48, 'center');

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
      <div className="sub">先专注图形本体：矩形、椭圆、菱形的几何骨架、圆角和手绘感。</div>

      <div className="layout">
        <div className="panel controls">
          <h2>参数</h2>

          <div className="control">
            <label><span>形状</span></label>
            <select value={shape} onChange={e => setShape(e.target.value)}>
              <option value="rectangle">圆角矩形 (Rectangle)</option>
              <option value="ellipse">椭圆 (Ellipse)</option>
              <option value="diamond">菱形 (Diamond)</option>
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
          {(shape === 'rectangle' || shape === 'diamond') && (
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
            <button className="secondary" onClick={handleDownload}>下载 PNG</button>
          </div>

          <div className="hint">
            当前只关注图形本体：干净母路径、稳定 seed、尺寸相关 roughness、以及更克制的圆角处理。
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
