import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCommonBounds, getElementBounds } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { AppClassProperties } from "../types";

import { useExcalidrawAppState, useExcalidrawSetAppState } from "./App";

import "./Minimap.scss";

const MINIMAP_W = 200;
const MINIMAP_H = 160;
const PADDING = 0.88;

type MinimapLayout = {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewportRect: { left: number; top: number; width: number; height: number };
};

const computeMinimapLayout = (
  elements: readonly NonDeletedExcalidrawElement[],
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewW: number,
  viewH: number,
): MinimapLayout => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementsMap = new Map(elements.map((el) => [el.id, el])) as any;

  let minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
  if (elements.length > 0) {
    [minX, minY, maxX, maxY] = getCommonBounds(elements, elementsMap);
  }

  const vpLeft = -scrollX;
  const vpTop = -scrollY;
  const vpRight = vpLeft + viewW / zoom;
  const vpBottom = vpTop + viewH / zoom;

  const fullMinX = Math.min(minX, vpLeft);
  const fullMinY = Math.min(minY, vpTop);
  const fullMaxX = Math.max(maxX, vpRight);
  const fullMaxY = Math.max(maxY, vpBottom);

  const sceneW = fullMaxX - fullMinX;
  const sceneH = fullMaxY - fullMinY;

  const scale = Math.min(
    (MINIMAP_W * PADDING) / Math.max(sceneW, 1),
    (MINIMAP_H * PADDING) / Math.max(sceneH, 1),
  );

  const offsetX = (MINIMAP_W - sceneW * scale) / 2 - fullMinX * scale;
  const offsetY = (MINIMAP_H - sceneH * scale) / 2 - fullMinY * scale;

  return {
    scale,
    offsetX,
    offsetY,
    viewportRect: {
      left: vpLeft * scale + offsetX,
      top: vpTop * scale + offsetY,
      width: (vpRight - vpLeft) * scale,
      height: (vpBottom - vpTop) * scale,
    },
  };
};

const drawMinimapCanvas = (
  canvas: HTMLCanvasElement,
  elements: readonly NonDeletedExcalidrawElement[],
  elementsMap: ReadonlyMap<string, ExcalidrawElement>,
  layout: MinimapLayout,
  bg: string,
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

  const { scale, offsetX, offsetY } = layout;

  for (const element of elements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [x1, y1, x2, y2] = getElementBounds(element, elementsMap as any);
    const mx = x1 * scale + offsetX;
    const my = y1 * scale + offsetY;
    const mw = Math.max((x2 - x1) * scale, 1);
    const mh = Math.max((y2 - y1) * scale, 1);

    ctx.globalAlpha = element.opacity / 100;

    const hasFill =
      element.backgroundColor !== "transparent" &&
      element.backgroundColor !== "";
    const strokeStyle = element.strokeColor || "#000";
    ctx.lineWidth = Math.max(0.5, element.strokeWidth * scale * 0.4);

    if (element.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        mx + mw / 2,
        my + mh / 2,
        Math.max(mw / 2, 0.5),
        Math.max(mh / 2, 0.5),
        0,
        0,
        Math.PI * 2,
      );
      if (hasFill) {
        ctx.fillStyle = element.backgroundColor;
        ctx.fill();
      }
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    } else if (element.type === "diamond") {
      const cx = mx + mw / 2;
      const cy = my + mh / 2;
      ctx.beginPath();
      ctx.moveTo(cx, my);
      ctx.lineTo(mx + mw, cy);
      ctx.lineTo(cx, my + mh);
      ctx.lineTo(mx, cy);
      ctx.closePath();
      if (hasFill) {
        ctx.fillStyle = element.backgroundColor;
        ctx.fill();
      }
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    } else if (element.type === "arrow" || element.type === "line") {
      const el = element as ExcalidrawLinearElement;
      const pts = el.points;
      if (pts && pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(
          element.x * scale + offsetX + pts[0][0] * scale,
          element.y * scale + offsetY + pts[0][1] * scale,
        );
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(
            element.x * scale + offsetX + pts[i][0] * scale,
            element.y * scale + offsetY + pts[i][1] * scale,
          );
        }
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
      }
    } else if (element.type === "freedraw") {
      const el = element as ExcalidrawFreeDrawElement;
      const pts = el.points;
      if (pts && pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(
          element.x * scale + offsetX + pts[0][0] * scale,
          element.y * scale + offsetY + pts[0][1] * scale,
        );
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(
            element.x * scale + offsetX + pts[i][0] * scale,
            element.y * scale + offsetY + pts[i][1] * scale,
          );
        }
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
      }
    } else if (element.type === "text") {
      ctx.fillStyle = strokeStyle;
      ctx.fillRect(mx, my + mh * 0.1, mw, Math.max(mh * 0.8, 1));
    } else {
      // rectangle, image, embeddable, iframe, frame, magicframe
      if (hasFill) {
        ctx.fillStyle = element.backgroundColor;
        ctx.fillRect(mx, my, mw, mh);
      }
      ctx.strokeStyle = strokeStyle;
      ctx.strokeRect(mx, my, mw, mh);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
};

export const Minimap: React.FC<{ app: AppClassProperties }> = ({ app }) => {
  const appState = useExcalidrawAppState();
  const setAppState = useExcalidrawSetAppState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const [isVisible, setIsVisible] = useState(true);

  // App.tsx re-renders (via triggerRender → setState) on every scene change,
  // which propagates through ExcalidrawAppStateContext — so these are always fresh.
  const elements = app.scene.getNonDeletedElements();
  const elementsMap = app.scene.getNonDeletedElementsMap();

  const layout = useMemo(
    () =>
      computeMinimapLayout(
        elements,
        appState.scrollX,
        appState.scrollY,
        appState.zoom.value,
        appState.width,
        appState.height,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      elements,
      appState.scrollX,
      appState.scrollY,
      appState.zoom.value,
      appState.width,
      appState.height,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isVisible) return;
    drawMinimapCanvas(
      canvas,
      elements,
      elementsMap,
      layout,
      appState.viewBackgroundColor || "#ffffff",
    );
  }, [layout, isVisible, appState.viewBackgroundColor, elements, elementsMap]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const panToPoint = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { scale, offsetX, offsetY } = layoutRef.current;
      const { width, height, zoom } = appStateRef.current;
      const sceneX = (e.clientX - rect.left - offsetX) / scale;
      const sceneY = (e.clientY - rect.top - offsetY) / scale;
      setAppState({
        scrollX: -sceneX + width / zoom.value / 2,
        scrollY: -sceneY + height / zoom.value / 2,
      });
    },
    [setAppState],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      panToPoint(e);
    },
    [panToPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      panToPoint(e);
    },
    [panToPoint],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  if (!isVisible) return null;

  const { viewportRect } = layout;
  const clampedLeft = Math.max(0, Math.min(viewportRect.left, MINIMAP_W));
  const clampedTop = Math.max(0, Math.min(viewportRect.top, MINIMAP_H));
  const clampedRight = Math.min(viewportRect.left + viewportRect.width, MINIMAP_W);
  const clampedBottom = Math.min(viewportRect.top + viewportRect.height, MINIMAP_H);

  return (
    <div className="excalidraw__minimap">
      <button
        className="excalidraw__minimap__close"
        onClick={() => setIsVisible(false)}
        aria-label="Hide minimap"
        title="Hide minimap"
      >
        ✕
      </button>
      <canvas
        ref={canvasRef}
        className="excalidraw__minimap__canvas"
        width={MINIMAP_W * (window.devicePixelRatio || 1)}
        height={MINIMAP_H * (window.devicePixelRatio || 1)}
        style={{ width: MINIMAP_W, height: MINIMAP_H }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div
        className="excalidraw__minimap__viewport"
        style={{
          left: clampedLeft,
          top: clampedTop,
          width: Math.max(clampedRight - clampedLeft, 0),
          height: Math.max(clampedBottom - clampedTop, 0),
        }}
      />
    </div>
  );
};
