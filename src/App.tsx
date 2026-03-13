import { useState, useEffect, useRef } from 'react';
import rough from 'roughjs';
import './App.css';

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

function bucketShapePaths(x: number, y: number, width: number, height: number, radius: number) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);

  const strokePath = !r
    ? [
        `M ${x} ${y}`,
        `L ${x} ${y + height}`,
        `L ${x + width} ${y + height}`,
        `L ${x + width} ${y}`,
      ].join(' ')
    : [
        `M ${x} ${y}`,
        `L ${x} ${y + height - r}`,
        `Q ${x} ${y + height}, ${x + r} ${y + height}`,
        `L ${x + width - r} ${y + height}`,
        `Q ${x + width} ${y + height}, ${x + width} ${y + height - r}`,
        `L ${x + width} ${y}`,
      ].join(' ');

  const fillPath = !r
    ? [
        `M ${x} ${y}`,
        `L ${x} ${y + height}`,
        `L ${x + width} ${y + height}`,
        `L ${x + width} ${y}`,
        'Z',
      ].join(' ')
    : [
        `M ${x} ${y}`,
        `L ${x} ${y + height - r}`,
        `Q ${x} ${y + height}, ${x + r} ${y + height}`,
        `L ${x + width - r} ${y + height}`,
        `Q ${x + width} ${y + height}, ${x + width} ${y + height - r}`,
        `L ${x + width} ${y}`,
        'Z',
      ].join(' ');

  return { strokePath, fillPath };
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

function appendSvgLabel(svg: SVGSVGElement, text: string, x: number, y: number, options?: { anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number | string; color?: string; opacity?: number; }) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('text-anchor', options?.anchor ?? 'start');
  node.setAttribute('font-size', String(options?.size ?? 12));
  node.setAttribute('font-weight', String(options?.weight ?? 400));
  node.setAttribute('fill', options?.color ?? '#555');
  if (options?.opacity != null) node.setAttribute('opacity', String(options.opacity));
  node.textContent = text;
  svg.appendChild(node);
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const initialParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const initialShape = (() => {
    if (typeof window === 'undefined') return 'rectangle';
    const value = new URLSearchParams(window.location.search).get('shape');
    return value === 'ellipse' || value === 'diamond' || value === 'arrow' || value === 'bucket' || value === 'rectangle' ? value : 'rectangle';
  })();
  const [shape, setShape] = useState(initialShape);
  const [mode, setMode] = useState(initialParams.get('mode') === 'svg' ? 'svg' : 'canvas');
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(180);
  const [arrowLength, setArrowLength] = useState(360);
  const [arrowHeadSize, setArrowHeadSize] = useState(28);
  const [roughness, setRoughness] = useState(1);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [roundMode, setRoundMode] = useState(initialParams.get('roundMode') || 'adaptive');
  const [fillStyle, setFillStyle] = useState(initialParams.get('fillStyle') || 'solid');
  const [strokeStyle, setStrokeStyle] = useState(initialParams.get('strokeStyle') || 'solid');
  const [stroke, setStroke] = useState(initialParams.get('stroke') || '#e03131');
  const [fill, setFill] = useState(initialParams.get('fill') || '#ffc9c9');
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    const minSide = Math.min(width, height);
    const radius = getCornerRadius(minSide, roundMode);
    const shapeHasRoundness = shape === 'rectangle' || shape === 'diamond' || shape === 'bucket' ? radius > 0 : true;
    const finalRoughness = shape === 'arrow'
      ? adjustRoughness(arrowLength, strokeWidth * 10, roughness, true)
      : adjustRoughness(width, height, roughness, shapeHasRoundness);

    const dashPattern = strokeStyle === 'dashed'
      ? [strokeWidth * 6, strokeWidth * 4]
      : strokeStyle === 'dotted'
        ? [strokeWidth, strokeWidth * 3]
        : undefined;

    const roughOptions = {
      seed,
      stroke,
      strokeWidth: strokeStyle !== 'solid' ? strokeWidth + 0.5 : strokeWidth,
      roughness: finalRoughness,
      fill,
      fillStyle,
      fillWeight: strokeWidth / 2,
      hachureGap: strokeWidth * 4,
      preserveVertices: true,
      bowing: 1.1,
      disableMultiStroke: strokeStyle !== 'solid',
      strokeLineDash: dashPattern,
    };

    if (mode === 'canvas') {
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

      const rect = { x: (cssWidth - width) / 2, y: (cssHeight - height) / 2, w: width, h: height };
      const arrow = { x1: (cssWidth - arrowLength) / 2, y1: cssHeight / 2, x2: (cssWidth + arrowLength) / 2, y2: cssHeight / 2 };
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;

      const drawLabel = (text: string, x: number, y: number, align: CanvasTextAlign = 'left', size = 12, weight = '400', color = '#555') => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `${weight} ${size}px sans-serif`;
        ctx.textAlign = align;
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      if (shape === 'rectangle') {
        const path = roundedRectPath(rect.x, rect.y, rect.w, rect.h, radius);
        rc.path(path, roughOptions);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = stroke;
        ctx.stroke(new Path2D(path));
        ctx.restore();
        drawLabel('Rounded rectangle', cx, cy - 6, 'center', 20, '600', '#1f1f1f');
        drawLabel(radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight corner geometry', cx, cy + 20, 'center', 14, '400', '#5b5b5b');
      } else if (shape === 'ellipse') {
        rc.ellipse(cx, cy, rect.w, rect.h, roughOptions);
        drawLabel('Ellipse', cx, cy - 6, 'center', 20, '600', '#1f1f1f');
        drawLabel('Clean geometric skeleton with controlled roughness', cx, cy + 20, 'center', 14, '400', '#5b5b5b');
      } else if (shape === 'diamond') {
        const path = roundedDiamondPath(rect.x, rect.y, rect.w, rect.h, radius);
        rc.path(path, roughOptions);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = stroke;
        ctx.stroke(new Path2D(path));
        ctx.restore();
        drawLabel(radius > 0 ? 'Rounded diamond' : 'Diamond', cx, cy - 6, 'center', 20, '600', '#1f1f1f');
        drawLabel(radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight edge rhombus geometry', cx, cy + 20, 'center', 14, '400', '#5b5b5b');
      } else if (shape === 'bucket') {
        const { strokePath, fillPath } = bucketShapePaths(rect.x, rect.y, rect.w, rect.h, radius);
        rc.path(fillPath, { ...roughOptions, stroke: 'transparent' });
        rc.path(strokePath, { ...roughOptions, fill: undefined });
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = stroke;
        ctx.stroke(new Path2D(strokePath));
        ctx.restore();
        drawLabel('Bucket', cx, cy - 6, 'center', 20, '600', '#1f1f1f');
        drawLabel(radius > 0 ? `Open top · bottom radius ${radius.toFixed(1)} px` : 'Open top container geometry', cx, cy + 20, 'center', 14, '400', '#5b5b5b');
      } else if (shape === 'arrow') {
        const { x1, y1, x2, y2 } = arrow;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headAngle = Math.PI / 7;
        const hx1 = x2 - Math.cos(angle - headAngle) * arrowHeadSize;
        const hy1 = y2 - Math.sin(angle - headAngle) * arrowHeadSize;
        const hx2 = x2 - Math.cos(angle + headAngle) * arrowHeadSize;
        const hy2 = y2 - Math.sin(angle + headAngle) * arrowHeadSize;
        rc.line(x1, y1, x2, y2, { ...roughOptions, fill: undefined });
        rc.line(x2, y2, hx1, hy1, { ...roughOptions, fill: undefined });
        rc.line(x2, y2, hx2, hy2, { ...roughOptions, fill: undefined });
        drawLabel('Arrow', cssWidth / 2, cssHeight / 2 - 34, 'center', 20, '600', '#1f1f1f');
        drawLabel(`Length ${arrowLength}px · Head ${arrowHeadSize}px`, cssWidth / 2, cssHeight / 2 - 8, 'center', 14, '400', '#5b5b5b');
      }

      drawLabel(`roughness ${finalRoughness.toFixed(2)}`, shape === 'arrow' ? cssWidth / 2 : cx, shape === 'arrow' ? cssHeight / 2 + 46 : rect.y + rect.h + 48, 'center');

      const handleResize = () => fitCanvas();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const widthCss = svg.clientWidth || 800;
    const heightCss = svg.clientHeight || 760;
    svg.setAttribute('viewBox', `0 0 ${widthCss} ${heightCss}`);

    const rect = { x: (widthCss - width) / 2, y: (heightCss - height) / 2, w: width, h: height };
    const arrow = { x1: (widthCss - arrowLength) / 2, y1: heightCss / 2, x2: (widthCss + arrowLength) / 2, y2: heightCss / 2 };
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const rs = rough.svg(svg);

    const appendNode = (node: Node) => svg.appendChild(node);
    const appendOverlayPath = (d: string) => {
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      overlay.setAttribute('d', d);
      overlay.setAttribute('fill', 'none');
      overlay.setAttribute('stroke', stroke);
      overlay.setAttribute('stroke-width', '1.1');
      overlay.setAttribute('opacity', '0.14');
      svg.appendChild(overlay);
    };

    if (shape === 'rectangle') {
      const path = roundedRectPath(rect.x, rect.y, rect.w, rect.h, radius);
      appendNode(rs.path(path, roughOptions));
      appendOverlayPath(path);
      appendSvgLabel(svg, 'Rounded rectangle', cx, cy - 6, { anchor: 'middle', size: 20, weight: 600, color: '#1f1f1f' });
      appendSvgLabel(svg, radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight corner geometry', cx, cy + 20, { anchor: 'middle', size: 14, color: '#5b5b5b' });
    } else if (shape === 'ellipse') {
      appendNode(rs.ellipse(cx, cy, rect.w, rect.h, roughOptions));
      appendSvgLabel(svg, 'Ellipse', cx, cy - 6, { anchor: 'middle', size: 20, weight: 600, color: '#1f1f1f' });
      appendSvgLabel(svg, 'Clean geometric skeleton with controlled roughness', cx, cy + 20, { anchor: 'middle', size: 14, color: '#5b5b5b' });
    } else if (shape === 'diamond') {
      const path = roundedDiamondPath(rect.x, rect.y, rect.w, rect.h, radius);
      appendNode(rs.path(path, roughOptions));
      appendOverlayPath(path);
      appendSvgLabel(svg, radius > 0 ? 'Rounded diamond' : 'Diamond', cx, cy - 6, { anchor: 'middle', size: 20, weight: 600, color: '#1f1f1f' });
      appendSvgLabel(svg, radius > 0 ? `Adaptive corner radius · ${radius.toFixed(1)} px` : 'Straight edge rhombus geometry', cx, cy + 20, { anchor: 'middle', size: 14, color: '#5b5b5b' });
    } else if (shape === 'bucket') {
      const { strokePath, fillPath } = bucketShapePaths(rect.x, rect.y, rect.w, rect.h, radius);
      appendNode(rs.path(fillPath, { ...roughOptions, stroke: 'transparent' }));
      appendNode(rs.path(strokePath, { ...roughOptions, fill: undefined }));
      appendOverlayPath(strokePath);
      appendSvgLabel(svg, 'Bucket', cx, cy - 6, { anchor: 'middle', size: 20, weight: 600, color: '#1f1f1f' });
      appendSvgLabel(svg, radius > 0 ? `Open top · bottom radius ${radius.toFixed(1)} px` : 'Open top container geometry', cx, cy + 20, { anchor: 'middle', size: 14, color: '#5b5b5b' });
    } else if (shape === 'arrow') {
      const { x1, y1, x2, y2 } = arrow;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headAngle = Math.PI / 7;
      const hx1 = x2 - Math.cos(angle - headAngle) * arrowHeadSize;
      const hy1 = y2 - Math.sin(angle - headAngle) * arrowHeadSize;
      const hx2 = x2 - Math.cos(angle + headAngle) * arrowHeadSize;
      const hy2 = y2 - Math.sin(angle + headAngle) * arrowHeadSize;
      appendNode(rs.line(x1, y1, x2, y2, { ...roughOptions, fill: undefined }));
      appendNode(rs.line(x2, y2, hx1, hy1, { ...roughOptions, fill: undefined }));
      appendNode(rs.line(x2, y2, hx2, hy2, { ...roughOptions, fill: undefined }));
      appendSvgLabel(svg, 'Arrow', widthCss / 2, heightCss / 2 - 34, { anchor: 'middle', size: 20, weight: 600, color: '#1f1f1f' });
      appendSvgLabel(svg, `Length ${arrowLength}px · Head ${arrowHeadSize}px`, widthCss / 2, heightCss / 2 - 8, { anchor: 'middle', size: 14, color: '#5b5b5b' });
    }

    appendSvgLabel(svg, `roughness ${finalRoughness.toFixed(2)}`, shape === 'arrow' ? widthCss / 2 : cx, shape === 'arrow' ? heightCss / 2 + 46 : rect.y + rect.h + 48, { anchor: 'middle' });
  }, [mode, shape, width, height, arrowLength, arrowHeadSize, roughness, strokeWidth, roundMode, fillStyle, strokeStyle, stroke, fill, seed]);

  const handleDownload = () => {
    if (mode === 'canvas') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `excalidraw-${shape}-demo.png`;
      a.click();
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excalidraw-${shape}-demo.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wrap">
      <h1>Excalidraw 风格手绘 Demo 🎨</h1>
      <div className="sub">现在可以切换 Canvas / SVG，对比同一套几何骨架与 rough 风格的展示效果。</div>

      <div className="layout">
        <div className="panel controls">
          <h2>参数</h2>

          <div className="control">
            <label><span>渲染模式</span></label>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="canvas">canvas</option>
              <option value="svg">svg</option>
            </select>
          </div>

          <div className="control">
            <label><span>形状</span></label>
            <select value={shape} onChange={e => setShape(e.target.value)}>
              <option value="rectangle">圆角矩形 (Rectangle)</option>
              <option value="ellipse">椭圆 (Ellipse)</option>
              <option value="diamond">菱形 (Diamond)</option>
              <option value="bucket">桶 (Bucket)</option>
              <option value="arrow">箭头 (Arrow)</option>
            </select>
          </div>

          {shape !== 'arrow' ? (
            <>
              <div className="control">
                <label><span>宽度</span><strong>{width} px</strong></label>
                <input type="range" min="120" max="520" value={width} onChange={e => setWidth(Number(e.target.value))} />
              </div>
              <div className="control">
                <label><span>高度</span><strong>{height} px</strong></label>
                <input type="range" min="80" max="320" value={height} onChange={e => setHeight(Number(e.target.value))} />
              </div>
            </>
          ) : (
            <>
              <div className="control">
                <label><span>箭头长度</span><strong>{arrowLength} px</strong></label>
                <input type="range" min="180" max="620" value={arrowLength} onChange={e => setArrowLength(Number(e.target.value))} />
              </div>
              <div className="control">
                <label><span>箭头尺寸</span><strong>{arrowHeadSize} px</strong></label>
                <input type="range" min="12" max="56" value={arrowHeadSize} onChange={e => setArrowHeadSize(Number(e.target.value))} />
              </div>
            </>
          )}

          <div className="control">
            <label><span>基础 roughness</span><strong>{roughness.toFixed(1)}</strong></label>
            <input type="range" min="0" max="4" step="0.1" value={roughness} onChange={e => setRoughness(Number(e.target.value))} />
          </div>
          <div className="control">
            <label><span>描边宽度</span><strong>{strokeWidth.toFixed(1)} px</strong></label>
            <input type="range" min="1" max="6" step="0.5" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} />
          </div>

          {(shape === 'rectangle' || shape === 'diamond' || shape === 'bucket') && (
            <div className="control">
              <label><span>圆角模式</span></label>
              <select value={roundMode} onChange={e => setRoundMode(e.target.value)}>
                <option value="adaptive">adaptive</option>
                <option value="proportional">proportional</option>
                <option value="none">none</option>
              </select>
            </div>
          )}

          {shape !== 'arrow' && (
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
          )}

          <div className="control">
            <label><span>边框样式</span></label>
            <select value={strokeStyle} onChange={e => setStrokeStyle(e.target.value)}>
              <option value="solid">solid</option>
              <option value="dashed">dashed</option>
              <option value="dotted">dotted</option>
            </select>
          </div>
          <div className="control">
            <label><span>描边颜色</span></label>
            <input type="color" value={stroke} onChange={e => setStroke(e.target.value)} />
          </div>
          {shape !== 'arrow' && (
            <div className="control">
              <label><span>填充颜色</span></label>
              <input type="color" value={fill} onChange={e => setFill(e.target.value)} />
            </div>
          )}
          <div className="control">
            <label><span>随机种子</span><strong>{seed}</strong></label>
            <input type="range" min="1" max="999" step="1" value={seed} onChange={e => setSeed(Number(e.target.value))} />
          </div>

          <div className="control">
            <button className="secondary" onClick={handleDownload}>下载 {mode === 'canvas' ? 'PNG' : 'SVG'}</button>
          </div>

          <div className="hint">
            当前支持同一套参数切换 canvas / svg，方便直接对比展示效果与 rough 风格差异。
          </div>
        </div>

        <div className="panel stage">
          {mode === 'canvas' ? (
            <canvas ref={canvasRef}></canvas>
          ) : (
            <svg ref={svgRef} className="stage-svg" xmlns="http://www.w3.org/2000/svg"></svg>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
