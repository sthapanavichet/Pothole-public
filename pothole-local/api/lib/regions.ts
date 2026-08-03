/**
 * Region + temporary-location logic.
 *
 * This module is intentionally isolated so it can be swapped out later for real
 * GPS / image-derived coordinates. It loads the same Toronto neighborhood
 * polygons the dashboard uses (`toronto_regions.geojson`) and can:
 *   - assign a temporary random coordinate that falls inside a real region
 *   - resolve which region a given coordinate belongs to
 *
 * NOTE (temporary-location limitation): points are sampled uniformly inside a
 * region polygon. Without a street network we cannot guarantee a point sits on
 * a road, only that it is inside a valid dashboard region. Replace
 * `assignTemporaryLocation` with real location data when available.
 */

import fs from "fs";
import path from "path";

type Ring = number[][];
type PolygonCoords = Ring[]; // [outerRing, ...holes]
type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

type Region = {
  id: string;
  name: string;
  polygons: PolygonCoords[]; // one entry per Polygon (MultiPolygon => many)
  bbox: BBox;
};

export type AssignedLocation = {
  latitude: number;
  longitude: number;
  region_id: string;
  region_name: string;
};

const NAME_KEYS = [
  "AREA_NAME",
  "name",
  "Name",
  "NAME",
  "AREA",
  "NEIGHBORHOOD",
  "NEIGHBOURHOOD",
  "HOOD",
  "NBRHD",
];

let cachedRegions: Region[] | null = null;

function cleanName(raw: string): string {
  // "Yonge-St.Clair (97)" -> "Yonge-St.Clair"
  return raw.replace(/\s*\(\d+\)\s*$/, "").trim();
}

function computeBBox(polygons: PolygonCoords[]): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return [minLng, minLat, maxLng, maxLat];
}

function loadRegions(): Region[] {
  if (cachedRegions) {
    return cachedRegions;
  }

  const filePath = path.join(process.cwd(), "data", "toronto_regions.geojson");
  const raw = fs.readFileSync(filePath, "utf-8");
  const fc = JSON.parse(raw) as {
    features: Array<{
      id?: string | number;
      properties?: Record<string, unknown>;
      geometry?: { type: string; coordinates: unknown };
    }>;
  };

  const regions: Region[] = [];

  for (const feature of fc.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    let polygons: PolygonCoords[] = [];
    if (geometry.type === "Polygon") {
      polygons = [geometry.coordinates as PolygonCoords];
    } else if (geometry.type === "MultiPolygon") {
      polygons = geometry.coordinates as PolygonCoords[];
    } else {
      continue;
    }

    const props = feature.properties ?? {};
    let name = "Unknown region";
    for (const key of NAME_KEYS) {
      const value = props[key];
      if (typeof value === "string" && value.trim() !== "") {
        name = value;
        break;
      }
    }

    const id = String(props["AREA_S_CD"] ?? feature.id ?? name);

    regions.push({
      id,
      name: cleanName(name),
      polygons,
      bbox: computeBBox(polygons),
    });
  }

  cachedRegions = regions;
  return regions;
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  // Ray casting algorithm.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: PolygonCoords): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(lng, lat, polygon[0])) return false;
  // Exclude holes.
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lng, lat, polygon[i])) return false;
  }
  return true;
}

function pointInRegion(lng: number, lat: number, region: Region): boolean {
  const [minLng, minLat, maxLng, maxLat] = region.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  return region.polygons.some((polygon) => pointInPolygon(lng, lat, polygon));
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Resolve which region a coordinate belongs to. Returns null if the point is
 * outside every region.
 */
export function findRegionForPoint(
  latitude: number,
  longitude: number
): { region_id: string; region_name: string } | null {
  const regions = loadRegions();
  for (const region of regions) {
    if (pointInRegion(longitude, latitude, region)) {
      return { region_id: region.id, region_name: region.name };
    }
  }
  return null;
}

/**
 * Assign a temporary but valid coordinate inside a real dashboard region.
 * The returned coordinate is deterministic only in that it is always inside a
 * region; callers must persist it so it stays consistent across refreshes.
 */
export function assignTemporaryLocation(): AssignedLocation {
  const regions = loadRegions();
  if (regions.length === 0) {
    throw new Error("No regions available for temporary-location assignment.");
  }

  const maxAttempts = 5000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const region = regions[Math.floor(Math.random() * regions.length)];
    const [minLng, minLat, maxLng, maxLat] = region.bbox;
    const lng = minLng + Math.random() * (maxLng - minLng);
    const lat = minLat + Math.random() * (maxLat - minLat);

    if (pointInRegion(lng, lat, region)) {
      return {
        latitude: round(lat),
        longitude: round(lng),
        region_id: region.id,
        region_name: region.name,
      };
    }
  }

  // Extremely unlikely fallback: use the first vertex of the first region.
  const fallback = regions[0];
  const [lng, lat] = fallback.polygons[0][0][0];
  return {
    latitude: round(lat),
    longitude: round(lng),
    region_id: fallback.id,
    region_name: fallback.name,
  };
}
