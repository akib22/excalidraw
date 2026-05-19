import {
  newFreeDrawElement,
  getFreedrawOutlinePoints,
  getFreedrawOutlineAsSegments,
} from "@excalidraw/element";
import type { NonDeleted, ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import {
  distanceToLineSegment,
  lineSegmentsDistance,
  pointFrom,
} from "@excalidraw/math";
import type { GlobalPoint, LineSegment, LocalPoint } from "@excalidraw/math";

export function getFreedrawHitIndices(
  element: ExcalidrawFreeDrawElement,
  pathSegment: LineSegment<GlobalPoint>,
  zoom: number,
  elementsMap: Map<string, any>,
): number[] {
  const tolerance = Math.max(2.25, 5 / zoom);
  const hitIndices: number[] = [];

  // Get the rendered outline of the freedraw (not just raw points)
  const outlinePoints = getFreedrawOutlinePoints(element);
  const strokeSegments = getFreedrawOutlineAsSegments(
    element,
    outlinePoints,
    elementsMap,
  );

  // For each outline segment, check if eraser touches it
  // Then map back to the original points that contributed to that segment
  const hitOutlineIndices = new Set<number>();
  for (let i = 0; i < strokeSegments.length; i++) {
    if (lineSegmentsDistance(strokeSegments[i], pathSegment) <= tolerance) {
      hitOutlineIndices.add(i);
    }
  }

  // Map outline indices back to original point indices
  // The outline is generated from the original points, so we check which points
  // are close to the eraser (using similar logic as outline generation)
  if (hitOutlineIndices.size > 0) {
    for (let i = 0; i < element.points.length; i++) {
      const globalX = element.x + element.points[i][0];
      const globalY = element.y + element.points[i][1];
      const pt = pointFrom<GlobalPoint>(globalX, globalY);

      // Check if this point is close to any hit outline segment
      for (const outlineIdx of hitOutlineIndices) {
        const distance = distanceToLineSegment(pt, strokeSegments[outlineIdx]);
        if (distance <= tolerance * 2) {
          // Use slightly larger tolerance for individual points
          hitIndices.push(i);
          break;
        }
      }
    }
  }

  console.log("getFreedrawHitIndices:", {
    elementPointsCount: element.points.length,
    outlinePointsCount: outlinePoints.length,
    strokeSegmentsCount: strokeSegments.length,
    hitOutlineSegmentsCount: hitOutlineIndices.size,
    tolerance,
    hitIndicesCount: hitIndices.length,
    hitIndices,
  });

  return hitIndices;
}

export function splitFreeDrawElement(
  element: ExcalidrawFreeDrawElement,
  hitIndices: Set<number>,
): NonDeleted<ExcalidrawFreeDrawElement>[] | null {
  console.log("Splitting freedraw element at hit indices:", hitIndices);
  if (hitIndices.size === 0) {
    return null;
  }

  const firstHit = Math.min(...Array.from(hitIndices));
  const lastHit = Math.max(...Array.from(hitIndices));

  const leftPoints = element.points.slice(0, firstHit);
  const leftPressures = element.pressures.slice(0, firstHit);

  const rightPoints = element.points.slice(lastHit + 1);
  const rightPressures = element.pressures.slice(lastHit + 1);

  const results: NonDeleted<ExcalidrawFreeDrawElement>[] = [];

  // Left segment must have at least 2 points
  if (leftPoints.length >= 2) {
    const leftElement = newFreeDrawElement({
      type: "freedraw",
      x: element.x,
      y: element.y,
      points: leftPoints,
      pressures: leftPressures,
      simulatePressure: element.simulatePressure,
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      fillStyle: element.fillStyle,
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
      roughness: element.roughness,
      opacity: element.opacity,
      groupIds: element.groupIds,
      frameId: element.frameId,
      roundness: element.roundness,
      boundElements: element.boundElements,
      link: element.link,
      locked: element.locked,
    });
    results.push(leftElement);
  }

  // Right segment must have at least 2 points
  if (rightPoints.length >= 2) {
    // Recompute origin for right segment
    const newOriginX = element.x + rightPoints[0][0];
    const newOriginY = element.y + rightPoints[0][1];

    // Re-relativize all points by subtracting the first point
    const relativizedPoints = rightPoints.map((pt: readonly [number, number]): LocalPoint =>
      pointFrom<LocalPoint>(
        pt[0] - rightPoints[0][0],
        pt[1] - rightPoints[0][1],
      ),
    );

    const rightElement = newFreeDrawElement({
      type: "freedraw",
      x: newOriginX,
      y: newOriginY,
      points: relativizedPoints,
      pressures: rightPressures,
      simulatePressure: element.simulatePressure,
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      fillStyle: element.fillStyle,
      strokeWidth: element.strokeWidth,
      strokeStyle: element.strokeStyle,
      roughness: element.roughness,
      opacity: element.opacity,
      groupIds: element.groupIds,
      frameId: element.frameId,
      roundness: element.roundness,
      boundElements: element.boundElements,
      link: element.link,
      locked: element.locked,
    });
    results.push(rightElement);
  }

  return results.length > 0 ? results : null;
}
