import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Point, Viewport } from './types';

// Constants for the triangle geometry in world coordinates
const VERTICES: readonly [Point, Point, Point] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0.5, y: Math.sqrt(0.75) },
];

const INITIAL_VIEWPORT_PADDING = 1.1; // 10% padding around the triangle

// Function to calculate the initial viewport to fit the triangle
const getInitialViewport = (width: number, height: number): Viewport => {
  const triangleWidth = 1;
  const triangleHeight = Math.sqrt(0.75);
  const triangleCenterX = 0.5;
  const triangleCenterY = triangleHeight / 2;

  const scaleX = width / (triangleWidth * INITIAL_VIEWPORT_PADDING);
  const scaleY = height / (triangleHeight * INITIAL_VIEWPORT_PADDING);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: triangleCenterX,
    y: triangleCenterY,
    scale,
  };
};

// Initial point for the chaos game
const getInitialPoint = (): Point => {
    // A random point inside the triangle using barycentric coordinates
    let s = Math.random();
    let t = Math.random();

    if (s + t > 1) {
        s = 1 - s;
        t = 1 - t;
    }

    const x = VERTICES[0].x * (1 - s - t) + VERTICES[1].x * s + VERTICES[2].x * t;
    const y = VERTICES[0].y * (1 - s - t) + VERTICES[1].y * s + VERTICES[2].y * t;
    
    return { x, y };
};

// Helper to check if a point is in the triangle using cross-product signs
const isPointInTriangle = (p: Point, vertices: readonly [Point, Point, Point]): boolean => {
  const [v1, v2, v3] = vertices;
  const d1 = (p.x - v2.x) * (v1.y - v2.y) - (v1.x - v2.x) * (p.y - v2.y);
  const d2 = (p.x - v3.x) * (v2.y - v3.y) - (v2.x - v3.x) * (p.y - v3.y);
  const d3 = (p.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (p.y - v1.y);
  const has_neg = d1 < 0 || d2 < 0 || d3 < 0;
  const has_pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(has_neg && has_pos);
};

// Animation-related types
interface AnimationStep {
  currentPoint: Point;
  targetVertex: Point;
  newPoint: Point;
}
interface HighlightedVertex {
  vertex: Point;
  life: number; // How many more points until it disappears
}


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const currentPointRef = useRef<Point>(getInitialPoint());
  const [viewport, setViewport] = useState<Viewport>({ x: 0.5, y: 0.433, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });

  // State for generation options
  const [pointsPerClick, setPointsPerClick] = useState<100 | 1000 | 10000>(100);
  const [isAnimationMode, setIsAnimationMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // State for animation visuals
  const [animationStep, setAnimationStep] = useState<AnimationStep | null>(null);
  const [highlightedVertices, setHighlightedVertices] = useState<HighlightedVertex[]>([]);
  const animationTimeoutRef = useRef<number | null>(null);


  const reset = useCallback(() => {
    if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const { width, height } = canvas.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setViewport(getInitialViewport(width, height));
      }
    }
    setPoints([]);
    currentPointRef.current = getInitialPoint();
    
    // Clear animation state
    setIsGenerating(false);
    setAnimationStep(null);
    setHighlightedVertices([]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = (width: number, height: number) => {
      canvas.width = width;
      canvas.height = height;
      if (pointsRef.current.length === 0) {
        setViewport(getInitialViewport(width, height));
      } else {
        // Trigger a redraw if we resize mid-exploration
        setViewport(v => ({ ...v }));
      }
    };

    const resizeObserver = new ResizeObserver(() => {
        const { width, height } = canvas.getBoundingClientRect();
        if (width > 0 && height > 0) {
          setupCanvas(width, height);
        }
    });
    resizeObserver.observe(canvas);

    // Initial setup
    const { width, height } = canvas.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setupCanvas(width, height);
    }
    
    return () => resizeObserver.disconnect();
  }, []);


  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || viewport.scale <= 0) return;

    // Clear canvas
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply viewport transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    // Flip the Y axis for a standard cartesian system & apply scale
    ctx.scale(viewport.scale, -viewport.scale);
    ctx.translate(-viewport.x, -viewport.y);

    // Draw points
    ctx.fillStyle = '#FFFFFF'; // White
    const pointSize = 1.25 / viewport.scale;
    for (const point of points) {
      ctx.fillRect(point.x - pointSize / 2, point.y - pointSize / 2, pointSize, pointSize);
    }
    
    // Draw vertices for context, especially when zoomed out
    if (viewport.scale < 2000) {
        ctx.fillStyle = '#f87171'; // red-400
        const vertexSize = 4 / viewport.scale;
        VERTICES.forEach(v => {
            ctx.fillRect(v.x - vertexSize / 2, v.y - vertexSize / 2, vertexSize, vertexSize);
        });
    }

    // Draw highlighted vertices from animation
    highlightedVertices.forEach(({ vertex }) => {
        ctx.fillStyle = '#a78bfa'; // violet-400
        const vertexSize = 8 / viewport.scale;
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, vertexSize / 2, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw animation step elements
    if (animationStep) {
        const { currentPoint, targetVertex, newPoint } = animationStep;

        // Line from current point to target vertex
        ctx.beginPath();
        ctx.moveTo(currentPoint.x, currentPoint.y);
        ctx.lineTo(targetVertex.x, targetVertex.y);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // Yellow, semi-transparent
        ctx.lineWidth = 1 / viewport.scale;
        ctx.stroke();

        // Current point (yellow circle)
        ctx.fillStyle = '#facc15'; // yellow-400
        const currentPointSize = 5 / viewport.scale;
        ctx.beginPath();
        ctx.arc(currentPoint.x, currentPoint.y, currentPointSize / 2, 0, 2 * Math.PI);
        ctx.fill();

        // New point (cyan circle)
        ctx.fillStyle = '#22d3ee'; // cyan-400
        const newPointSize = 5 / viewport.scale;
        ctx.beginPath();
        ctx.arc(newPoint.x, newPoint.y, newPointSize / 2, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Restore context state
    ctx.restore();

  }, [points, viewport, animationStep, highlightedVertices]);

  const findSeedPoint = (current: Point): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return getInitialPoint();

    const worldWidth = canvas.width / viewport.scale;
    const worldHeight = canvas.height / viewport.scale;
    const xMin = viewport.x - worldWidth / 2;
    const xMax = viewport.x + worldWidth / 2;
    const yMin = viewport.y - worldHeight / 2;
    const yMax = viewport.y + worldHeight / 2;

    const isPointInView = (p: Point) =>
      p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;

    if (pointsRef.current.length === 0 || !isPointInView(current)) {
      for (let i = 0; i < 100; i++) {
        const randomPointInView = {
          x: xMin + Math.random() * worldWidth,
          y: yMin + Math.random() * worldHeight,
        };
        if (isPointInTriangle(randomPointInView, VERTICES)) {
          return randomPointInView;
        }
      }
      return getInitialPoint(); // Fallback
    }
    return current; // Current point is fine
  }

  const generateInstantly = () => {
    let current = findSeedPoint(currentPointRef.current);
    const newPoints: Point[] = [];
    for (let i = 0; i < pointsPerClick; i++) {
      const targetVertex = VERTICES[Math.floor(Math.random() * 3)];
      const nextPoint = {
        x: (current.x + targetVertex.x) / 2,
        y: (current.y + targetVertex.y) / 2,
      };
      newPoints.push(nextPoint);
      current = nextPoint;
    }
    currentPointRef.current = current;
    setPoints(prevPoints => [...prevPoints, ...newPoints]);
  };

  const animateGeneration = () => {
    setIsGenerating(true);
    setAnimationStep(null);

    let localCurrent = findSeedPoint(currentPointRef.current);

    const step = (count: number) => {
        if (count >= 100) {
            setIsGenerating(false);
            setAnimationStep(null);
            setHighlightedVertices([]); // Clear highlights at the end
            currentPointRef.current = localCurrent;
            return;
        }

        const targetVertex = VERTICES[Math.floor(Math.random() * 3)];
        const nextPoint = {
            x: (localCurrent.x + targetVertex.x) / 2,
            y: (localCurrent.y + targetVertex.y) / 2,
        };

        setAnimationStep({
            currentPoint: localCurrent,
            targetVertex: targetVertex,
            newPoint: nextPoint,
        });

        setHighlightedVertices(prev => 
            [{ vertex: targetVertex, life: 5 }, ...prev]
                .map(h => ({ ...h, life: h.life - 1 }))
                .filter(h => h.life > 0)
        );
        
        setPoints(prev => [...prev, nextPoint]);
        
        localCurrent = nextPoint;

        animationTimeoutRef.current = window.setTimeout(() => step(count + 1), 100);
    };

    step(0);
  };

  const handleGeneratePoints = () => {
    if (isAnimationMode) {
      animateGeneration();
    } else {
      generateInstantly();
    }
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mouseWorldX = (mouseX - canvas.width / 2) / viewport.scale + viewport.x;
    const mouseWorldY = -(mouseY - canvas.height / 2) / viewport.scale + viewport.y;

    const zoomFactor = Math.pow(0.998, e.deltaY);
    const newScale = viewport.scale * zoomFactor;

    const newX = mouseWorldX - (mouseX - canvas.width / 2) / newScale;
    const newY = mouseWorldY + (mouseY - canvas.height / 2) / newScale;
    
    setViewport({ x: newX, y: newY, scale: newScale });
  };
  
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setViewport(prev => ({
      ...prev,
      x: prev.x - dx / prev.scale,
      y: prev.y + dy / prev.scale,
    }));
  };
  
  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-white font-sans">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label="Sierpinski triangle canvas"
      />
      <div className="absolute top-0 left-0 p-4 md:p-6 w-full flex flex-col sm:flex-row justify-between items-start sm:items-center pointer-events-none">
        <div className="bg-slate-900/50 backdrop-blur-sm p-3 rounded-lg pointer-events-auto">
          <h1 className="text-xl md:text-2xl font-bold text-cyan-300">Sierpinski Triangle</h1>
          <p className="text-sm text-slate-300">Generated Points: {points.length.toLocaleString()}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mt-4 sm:mt-0 pointer-events-auto">
            <div className="flex items-center space-x-2 bg-slate-800/60 backdrop-blur-sm p-2 rounded-lg">
                <span className="text-sm font-medium text-slate-300">Instant</span>
                <label htmlFor="animation-toggle" className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="animation-toggle" className="sr-only peer" checked={isAnimationMode} onChange={() => setIsAnimationMode(prev => !prev)} disabled={isGenerating} />
                    <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500 peer-disabled:opacity-50"></div>
                </label>
                <span className="text-sm font-medium text-slate-300">Animate</span>
            </div>
             <div className={`flex items-center space-x-3 bg-slate-800/60 backdrop-blur-sm p-2 rounded-lg transition-opacity ${isAnimationMode || isGenerating ? 'opacity-50' : ''}`}>
                <span className="text-sm font-medium text-slate-300 pl-1">Amount:</span>
                {(['100', '1k', '10k'] as const).map((label, index) => {
                    const value = (100 * Math.pow(10, index)) as 100 | 1000 | 10000;
                    return (
                        <label key={value} className={`flex items-center space-x-1 ${isAnimationMode || isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input
                                type="radio"
                                name="points-option"
                                value={value}
                                checked={pointsPerClick === value}
                                onChange={() => setPointsPerClick(value)}
                                disabled={isAnimationMode || isGenerating}
                                className="h-4 w-4 accent-cyan-500 disabled:accent-slate-600"
                                aria-label={`Generate ${value} points`}
                            />
                            <span className="text-sm text-slate-200">{label}</span>
                        </label>
                    );
                })}
            </div>
            <div className="flex space-x-2">
                <button
                    onClick={handleGeneratePoints}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-md shadow-lg transition-transform transform active:scale-95 disabled:bg-slate-600 disabled:cursor-not-allowed w-48 text-center"
                    style={{ minWidth: '12rem' }}
                >
                    {isAnimationMode ? 'Animate 100 Points' : `Generate ${pointsPerClick.toLocaleString()} Points`}
                </button>
                <button
                    onClick={reset}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-md shadow-lg transition-transform transform active:scale-95 disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    Reset
                </button>
            </div>
        </div>
      </div>
       <div className="absolute bottom-4 left-4 text-xs text-slate-400 bg-slate-900/50 backdrop-blur-sm p-2 rounded-lg pointer-events-none">
        Use mouse wheel to zoom and drag to pan.
      </div>
    </div>
  );
};

export default App;
