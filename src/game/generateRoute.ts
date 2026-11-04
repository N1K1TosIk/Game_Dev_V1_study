import type { Point } from './gameplayConfig';

export interface RouteRules {
  startX: number;
  baseX: number;
  endX: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  turnCount: number;
  minLeg: number;
  slotCount: number;
  slotOffset: number;
  corridorHalfWidth: number;
}

export interface GeneratedLayout {
  route: Point[];
  slots: Point[];
  base: Point;
}

interface Anchor {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export function generateRoute(seed: number, rules: RouteRules): GeneratedLayout {
  const random = mulberry32(seed);
  const route = buildRoute(random, rules);
  const base = route[route.length - 2] ?? { x: rules.baseX, y: rules.minY };
  return {
    route,
    base,
    slots: placeSlots(route, base, rules),
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRoute(random: () => number, rules: RouteRules): Point[] {
  const turns = Math.max(1, Math.round(rules.turnCount));
  let y = pickY(random, rules, rules.minY);
  const route: Point[] = [{ x: rules.startX, y }];
  for (let turn = 1; turn <= turns; turn += 1) {
    const x = rules.startX + ((rules.baseX - rules.startX) * turn) / (turns + 1);
    route.push({ x, y });
    y = pickY(random, rules, y);
    route.push({ x, y });
  }
  route.push({ x: rules.baseX, y });
  route.push({ x: rules.endX, y });
  return route;
}

function pickY(random: () => number, rules: RouteRules, previous: number): number {
  const span = rules.maxY - rules.minY;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const y = rules.minY + random() * span;
    if (Math.abs(y - previous) >= rules.minLeg) return y;
  }
  const midpoint = (rules.minY + rules.maxY) / 2;
  return previous > midpoint ? rules.minY : rules.maxY;
}

function placeSlots(route: Point[], base: Point, rules: RouteRules): Point[] {
  const total = routeLength(route);
  const slots: Point[] = [];
  for (let index = 0; index < rules.slotCount; index += 1) {
    const anchor = pointAlong(route, total * (index + 0.5) / rules.slotCount);
    const side = index % 2 === 0 ? 1 : -1;
    const slot = offsetFromRoad(anchor, side, rules, route);
    slot.x = Math.min(rules.maxX, Math.max(rules.minX, slot.x));
    slot.y = Math.min(rules.maxY, Math.max(rules.minY, slot.y));
    if (Math.hypot(slot.x - base.x, slot.y - base.y) < rules.slotOffset) {
      slot.x = Math.max(rules.minX, base.x - rules.slotOffset);
    }
    separateFromEarlier(slot, slots, rules);
    slots.push(slot);
  }
  return slots;
}

function offsetFromRoad(anchor: Anchor, side: number, rules: RouteRules, route: Point[]): Point {
  const placed = (offset: number, direction: number): Point => ({
    x: anchor.x + anchor.nx * offset * direction,
    y: anchor.y + anchor.ny * offset * direction,
  });
  const primary = clampPoint(placed(rules.slotOffset, side), rules);
  if (clearOfRoad(primary, route, rules)) return primary;
  const flipped = clampPoint(placed(rules.slotOffset, -side), rules);
  if (clearOfRoad(flipped, route, rules)) return flipped;
  return clampPoint(placed(rules.slotOffset + rules.corridorHalfWidth, side), rules);
}

function clearOfRoad(point: Point, route: Point[], rules: RouteRules): boolean {
  return distanceToRoute(point, route) >= rules.corridorHalfWidth;
}

function separateFromEarlier(slot: Point, earlier: Point[], rules: RouteRules): void {
  earlier.forEach((other) => {
    if (Math.hypot(slot.x - other.x, slot.y - other.y) >= rules.corridorHalfWidth + 18) return;
    slot.x = Math.min(rules.maxX, slot.x + rules.slotOffset * 0.6);
    slot.y = Math.min(rules.maxY, Math.max(rules.minY, slot.y + (slot.y >= other.y ? 28 : -28)));
  });
}

function clampPoint(point: Point, rules: RouteRules): Point {
  return {
    x: Math.min(rules.maxX, Math.max(rules.minX, point.x)),
    y: Math.min(rules.maxY, Math.max(rules.minY, point.y)),
  };
}

function routeLength(route: Point[]): number {
  let total = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    if (!start || !end) continue;
    total += Math.hypot(end.x - start.x, end.y - start.y);
  }
  return total || 1;
}

function pointAlong(route: Point[], distance: number): Anchor {
  let remaining = distance;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    if (remaining <= length) {
      const t = remaining / length;
      return {
        x: start.x + dx * t,
        y: start.y + dy * t,
        nx: -dy / length,
        ny: dx / length,
      };
    }
    remaining -= length;
  }
  const last = route[route.length - 1] ?? { x: 0, y: 0 };
  return { x: last.x, y: last.y, nx: 0, ny: -1 };
}

function distanceToRoute(point: Point, route: Point[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    if (!start || !end) continue;
    closest = Math.min(closest, distanceToSegment(point, start, end));
  }
  return closest;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}
