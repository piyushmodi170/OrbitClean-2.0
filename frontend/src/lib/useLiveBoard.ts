"use client";

import { useEffect, useState } from "react";
import { DUMPS, RISK_GRID, WARDS, WARD_ROUTES } from "@/lib/data";
import { apiUrl } from "@/lib/api";
import type { CollectionZone, DumpSite, RiskCell, WardRouteSolution, WardScore } from "@/types";

const POLL_MS = 8000;

interface GeoFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

function weightTonnes(props: Record<string, unknown>): number | undefined {
  if (typeof props.estimated_weight_tonnes === "number") return props.estimated_weight_tonnes;
  const area = Number(props.area_sqm ?? 0);
  if (!area) return undefined;
  const stream = String(props.swm_stream ?? props.waste_type ?? "Mixed");
  const depth = stream.includes("Dry") ? 0.12 : stream.includes("Wet") ? 0.08 : 0.1;
  const density = stream.includes("Dry") ? 0.15 : stream.includes("Wet") ? 0.55 : 0.45;
  return Math.round(area * depth * 0.7 * density * 10) / 10;
}

function toDumps(features: GeoFeature[]): DumpSite[] {
  return features.flatMap((feature) => {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || !props || typeof props.id !== "string") return [];
    const status = props.status === "Resolved" ? "Resolved" : "Active";
    return [{
      ...(props as unknown as DumpSite),
      status,
      lat: coords[1],
      lon: coords[0],
      estimated_weight_tonnes: weightTonnes(props),
    }];
  });
}

function toRiskCells(features: GeoFeature[]): RiskCell[] {
  return features.flatMap((feature) => {
    const coords = feature.geometry?.coordinates;
    const score = Number(feature.properties?.risk_score ?? feature.properties?.score);
    if (!coords || Number.isNaN(score)) return [];
    return [{ lat: coords[1], lon: coords[0], score }];
  });
}

function normalizeZone(zone: CollectionZone): CollectionZone {
  const poly = zone.polyline ?? [];
  const lats = poly.map((point) => point[0]);
  const lons = poly.map((point) => point[1]);
  const zone_bounds = zone.zone_bounds ?? (lats.length
    ? {
        lat_min: Math.min(...lats),
        lat_max: Math.max(...lats),
        lon_min: Math.min(...lons),
        lon_max: Math.max(...lons),
      }
    : {
        lat_min: zone.zone_center.lat - 0.005,
        lat_max: zone.zone_center.lat + 0.005,
        lon_min: zone.zone_center.lon - 0.005,
        lon_max: zone.zone_center.lon + 0.005,
      });
  return {
    ...zone,
    zone_bounds,
    dump_sites_count: zone.dump_sites_count ?? zone.waste?.high_risk_cells ?? 0,
    naive_route_km: zone.naive_route_km ?? Math.round(zone.route_length_km * 1.35 * 10) / 10,
    accumulated_waste_tonnes: zone.accumulated_waste_tonnes
      ?? Math.round(((zone.waste?.weekly_waste_kg ?? 0) / 1000) * 10) / 10,
    daily_collection_kg: zone.daily_collection_kg ?? zone.waste?.daily_waste_kg ?? 0,
  };
}

async function readJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export function useLiveBoard() {
  const [dumps, setDumps] = useState<DumpSite[]>(DUMPS);
  const [riskGrid, setRiskGrid] = useState<RiskCell[]>(RISK_GRID);
  const [wards, setWards] = useState<WardScore[]>(WARDS);
  const [routes, setRoutes] = useState<WardRouteSolution>(WARD_ROUTES);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [dumpData, riskData, wardData, routeData] = await Promise.all([
          readJson<{ features?: GeoFeature[] }>("/api/dumps/active"),
          readJson<{ features?: GeoFeature[] }>("/api/risk_grid?min_score=0.65"),
          readJson<{ all?: WardScore[] }>("/api/wards"),
          readJson<WardRouteSolution>("/api/routes/static"),
        ]);
        if (!active) return;
        const nextDumps = toDumps(dumpData.features ?? []);
        const nextRisk = toRiskCells(riskData.features ?? []);
        const nextWards = wardData.all ?? [];
        if (nextDumps.length) setDumps(nextDumps);
        if (nextRisk.length) setRiskGrid(nextRisk);
        if (nextWards.length) setWards(nextWards);
        if (routeData.zones?.length) {
          setRoutes({ ...routeData, zones: routeData.zones.map(normalizeZone) });
        }
        setLive(true);
        setUpdatedAt(new Date());
      } catch {
        if (active) setLive(false);
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return { dumps, riskGrid, wards, routes, live, updatedAt };
}
