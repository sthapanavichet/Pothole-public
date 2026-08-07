import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Filter, Download, Calendar, AlertCircle, Eye, Search, RefreshCw, X, ArrowLeft } from 'lucide-react';
import { MapContainer, GeoJSON, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';


const STATUSES = ['pending', 'inProgress', 'repaired'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const severityColors = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#f59e0b',
  low: '#84cc16',
};

// Shared backend that the Streamlit app also writes to. Falls back to the
// deployed API so the dashboard works without extra config; override with
// VITE_API_URL (see .env.example) to point at a local API during development.
const API_BASE = (
  import.meta.env.VITE_API_URL || 'https://api-mu-ten-54.vercel.app'
).replace(/\/$/, '');

// Shared team read token (visible in the browser bundle). Prefer env config;
// never put the write key or Supabase secret here.
const API_READ_KEY = (import.meta.env.VITE_API_READ_KEY || '').trim();

function apiHeaders(extra = {}) {
  const headers = { Accept: 'application/json', ...extra };
  if (API_READ_KEY) {
    headers['X-API-Key'] = API_READ_KEY;
  }
  return headers;
}

/** Captures the Leaflet map instance for imperative zoom/fitBounds calls. */
function MapBinder({ onReady }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

// Maps a raw backend report into the shape the map/UI already expects.
function mapReport(r) {
  const meta = r.metadata || {};
  const candidateDetections = Array.isArray(meta.detections) ? meta.detections : [];
  const fullModel = meta.full_model && typeof meta.full_model === 'object' ? meta.full_model : null;
  const fullModelDetections = Array.isArray(fullModel?.detections) ? fullModel.detections : [];
  const detections = fullModelDetections.length ? fullModelDetections : candidateDetections;
  const confidences = detections
    .map((d) => Number(d.confidence))
    .filter((n) => !Number.isNaN(n));
  const confidence = confidences.length ? Math.max(...confidences) : null;
  const detectionCount =
    fullModelDetections.length ||
    (typeof fullModel?.detection_count === 'number' ? fullModel.detection_count : null) ||
    (typeof meta.detection_count === 'number' ? meta.detection_count : detections.length);
  const severity = severityColors[r.severity] ? r.severity : 'medium';
  const status = r.status === 'in_progress' ? 'inProgress' : r.status || 'pending';

  return {
    id: r.id,
    lat: typeof r.latitude === 'number' ? r.latitude : null,
    lng: typeof r.longitude === 'number' ? r.longitude : null,
    severity,
    status,
    color: severityColors[severity] || severityColors.medium,
    size: typeof meta.size === 'number' ? meta.size : undefined,
    detected: new Date(r.created_at),
    imageUrl: r.annotated_image_url || r.image_url || null,
    originalImageUrl: r.image_url || null,
    annotatedImageUrl: r.annotated_image_url || null,
    confidence,
    detectionCount,
    detections,
    candidateDetections,
    fullModelDetections,
    hasFullModel: Boolean(fullModel),
    fullModelProcessedAt: fullModel?.processed_at ?? null,
    fullModelImageWidth: fullModel?.image_width ?? null,
    fullModelImageHeight: fullModel?.image_height ?? null,
    regionId: meta.region_id ?? null,
    regionName: meta.region_name ?? null,
  };
}

function DetectionImage({ src, detections = [], alt = 'Detection image', className = '' }) {
  const imageRef = useRef(null);
  const [size, setSize] = useState(null);
  const boxes = detections.filter((d) => Array.isArray(d.bbox) && d.bbox.length === 4);

  const updateSize = useCallback((img) => {
    const rect = img.getBoundingClientRect();
    setSize({
      naturalWidth: img.naturalWidth || 1,
      naturalHeight: img.naturalHeight || 1,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (imageRef.current) updateSize(imageRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateSize]);

  const pct = (value, total) => `${Math.max(0, Math.min(100, (Number(value) / total) * 100))}%`;

  return (
    <div className={`bg-gray-50 text-center ${className}`}>
      <div className="relative inline-block max-w-full align-top">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          onLoad={(e) => updateSize(e.currentTarget)}
          className="block max-w-full max-h-80 object-contain bg-gray-50"
        />
        {size &&
          boxes.map((d, idx) => {
            const [x1, y1, x2, y2] = d.bbox.map(Number);
            return (
              <div
                key={`${d.label || 'box'}-${idx}`}
                className="absolute border-2 border-red-500 pointer-events-none"
                style={{
                  left: pct(x1, size.naturalWidth),
                  top: pct(y1, size.naturalHeight),
                  width: pct(x2 - x1, size.naturalWidth),
                  height: pct(y2 - y1, size.naturalHeight),
                }}
              >
                <span className="absolute left-0 top-0 -translate-y-full bg-red-600 text-white text-[11px] leading-none px-1.5 py-1 whitespace-nowrap">
                  {d.label || 'pothole'} {Number.isFinite(Number(d.confidence)) ? `${(Number(d.confidence) * 100).toFixed(0)}%` : ''}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// Fetches real pothole detections from the shared backend. This replaces the
// previous hard-coded/generated demo data.
function useReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        headers: apiHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized — check VITE_API_READ_KEY in dashboard/.env.local');
        }
        throw new Error(`Request failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      const mapped = (data.reports || [])
        .map(mapReport)
        // A record is a mappable pothole only if it has coordinates and at least
        // one detection. Non-pothole uploads never get coordinates.
        .filter((p) => p.lat !== null && p.lng !== null && p.detectionCount > 0);
      setReports(mapped);
      setError(null);
    } catch (e) {
      console.error('Failed to load reports', e);
      setError(e.message || 'Failed to load pothole data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { reports, loading, error, reload: load };
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}


function dateInRange(date, rangeKey) {
  if (rangeKey === 'all') return true;
  const d = new Date(date);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (rangeKey) {
    case 'today': return d >= startOfToday;
    case 'last7': { const t = new Date(now); t.setDate(now.getDate() - 7); return d >= t; }
    case 'last30': { const t = new Date(now); t.setDate(now.getDate() - 30); return d >= t; }
    case 'thisYear': return d >= new Date(now.getFullYear(), 0, 1);
    default: return true;
  }
}


function useNeighborhoods() {
  const [fc, setFc] = useState(null);
  useEffect(() => {
    fetch('/data/toronto_crs84.geojson')
      .then((r) => r.json())
      .then(setFc)
      .catch((e) => {
        console.error('Failed to load GeoJSON', e);
        setFc(null);
      });
  }, []);
  return fc;
}

function pointOnAnyPolygon(lat, lng, fc) {
  if (!fc) return true;
  const pt = turf.point([lng, lat]);
  if (fc.type === 'FeatureCollection') {
    return fc.features.some((f) => turf.booleanPointInPolygon(pt, f));
  }
  return turf.booleanPointInPolygon(pt, fc);
}

function featureName(f) {
  const props = f.properties || {};
  const keys = ['name','Name','NAME','AREA_NAME','AREA','NEIGHBORHOOD','NEIGHBOURHOOD','HOOD','NBRHD','ward','WARD'];
  for (const k of keys) if (props[k]) return String(props[k]);
  return `Area ${f.id ?? ''}`.trim();
}

const PotholeMappingPlatform = () => {
  const [activeTab, setActiveTab] = useState('summary');
  const [map, setMap] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNeighborhoodIds, setSelectedNeighborhoodIds] = useState(new Set()); // empty = show all

// Marker filters
  const [selectedFilters, setSelectedFilters] = useState({
    dateRange: 'all',
    severities: [],
    statuses: [],
    sizeMin: '',
    sizeMax: '',
  });

  // Filter tab inputs
  const [inputs, setInputs] = useState({
    dateRange: 'all',
    severities: new Set(),
    statuses: new Set(),
    sizeMin: '',
    sizeMax: '',
  });


  // Real detections from the shared backend (written by the Streamlit app).
  const { reports: rawPotholes, loading: potholesLoading, error: potholesError, reload: reloadPotholes } =
    useReports();

  // Details view state.
  const [selectedPothole, setSelectedPothole] = useState(null);

  const neighborhoodsFC = useNeighborhoods();

  // Attach a region name (and feature index) to each pothole. We prefer the
  // region stored on the record, and fall back to a point-in-polygon lookup so
  // older records still resolve to a region.
  const potholes = useMemo(() => {
    if (!rawPotholes.length) return [];
    return rawPotholes.map((p) => {
      if (p.regionName && p.regionId) return p;
      if (!neighborhoodsFC) return p;
      try {
        const pt = turf.point([p.lng, p.lat]);
        const idx = neighborhoodsFC.features.findIndex((f) =>
          turf.booleanPointInPolygon(pt, f)
        );
        if (idx >= 0) {
          return { ...p, regionName: p.regionName || featureName(neighborhoodsFC.features[idx]) };
        }
      } catch {
        // ignore lookup failures; region simply stays unknown
      }
      return p;
    });
  }, [rawPotholes, neighborhoodsFC]);

  // Live summary counts derived from real data (no more hard-coded numbers).
  const summary = useMemo(() => {
    const s = { critical: 0, high: 0, medium: 0, low: 0, total: 0, repaired: 0, pending: 0, inProgress: 0 };
    for (const p of potholes) {
      s.total += 1;
      if (s[p.severity] !== undefined) s[p.severity] += 1;
      if (p.status === 'repaired') s.repaired += 1;
      else if (p.status === 'inProgress') s.inProgress += 1;
      else s.pending += 1;
    }
    return s;
  }, [potholes]);

  const neighborhoodIndex = useMemo(() => {
    if (!neighborhoodsFC?.features?.length) return [];
    return neighborhoodsFC.features.map((f, idx) => {
      return {
        idx,
        name: normalize(
          (() => {
            const props = f.properties || {};
            const keys = ['name','Name','NAME','AREA_NAME','AREA','NEIGHBORHOOD','NEIGHBOURHOOD','HOOD','NBRHD','ward','WARD'];
            for (const k of keys) if (props[k]) return String(props[k]);
            return `Area ${f.id ?? ''}`.trim();
          })()
        ),
      };
    });
  }, [neighborhoodsFC]);

  const filteredPotholes = useMemo(() => {
    const { dateRange, severities, statuses, sizeMin, sizeMax } = selectedFilters;

    const activeNeighborhoods =
      neighborhoodsFC && selectedNeighborhoodIds.size > 0
        ? neighborhoodsFC.features.filter((f, idx) => selectedNeighborhoodIds.has(idx))
        : null;

    return potholes.filter((p) => {
      if (!pointOnAnyPolygon(p.lat, p.lng, neighborhoodsFC)) return false;

      if (activeNeighborhoods) {
        const pt = turf.point([p.lng, p.lat]);
        const insideSel = activeNeighborhoods.some((f) => turf.booleanPointInPolygon(pt, f));
        if (!insideSel) return false;
      }

      if (!dateInRange(p.detected, dateRange)) return false;
      if (severities && severities.length > 0 && !severities.includes(p.severity)) return false;
      if (statuses && statuses.length > 0 && !statuses.includes(p.status)) return false;

      const min = Number(sizeMin);
      const max = Number(sizeMax);
      if (sizeMin !== '' && (typeof p.size !== 'number' || p.size < min)) return false;
      if (sizeMax !== '' && (typeof p.size !== 'number' || p.size > max)) return false;

      return true;
    });
  }, [potholes, selectedFilters, neighborhoodsFC, selectedNeighborhoodIds]);

  // Region-details view: active only when exactly one region is selected.
  const selectedFeature = useMemo(() => {
    if (!neighborhoodsFC || selectedNeighborhoodIds.size !== 1) return null;
    const idx = [...selectedNeighborhoodIds][0];
    return neighborhoodsFC.features[idx] ?? null;
  }, [neighborhoodsFC, selectedNeighborhoodIds]);

  const selectedRegionName = selectedFeature ? featureName(selectedFeature) : null;

  // All potholes physically inside the selected region (independent of the other
  // marker filters, so the gallery always shows every detection in the region).
  const regionPotholes = useMemo(() => {
    if (!selectedFeature) return [];
    return potholes.filter((p) => {
      if (p.lat === null || p.lng === null) return false;
      try {
        return turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), selectedFeature);
      } catch {
        return false;
      }
    });
  }, [selectedFeature, potholes]);

  const toggleSetValue = (set, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };

  const applyFilters = () => {
    setSelectedFilters({
      dateRange: inputs.dateRange,
      severities: Array.from(inputs.severities),
      statuses: Array.from(inputs.statuses),
      sizeMin: inputs.sizeMin,
      sizeMax: inputs.sizeMax,
    });
  };

  const clearFilters = () => {
    const cleared = { dateRange: 'today', severities: new Set(), statuses: new Set(), sizeMin: '', sizeMax: '' };
    setInputs(cleared);
    setSelectedFilters({ dateRange: 'today', severities: [], statuses: [], sizeMin: '', sizeMax: '' });
    setSelectedNeighborhoodIds(new Set()); // clears to show all
  };

  const neighborhoodsWithIdx = useMemo(() => {
    if (!neighborhoodsFC) return null;
    return {
      ...neighborhoodsFC,
      features: neighborhoodsFC.features.map((f, i) => ({ ...f, __idx: i })),
    };
  }, [neighborhoodsFC]);

  // emphasized outlines; no tooltip
  const hoodStyle = (feature) => ({
    color: selectedNeighborhoodIds.has(feature.__idx) ? '#1d4ed8' : '#2563eb',
    weight: selectedNeighborhoodIds.has(feature.__idx) ? 3 : 2,
    fillOpacity: selectedNeighborhoodIds.has(feature.__idx) ? 0.18 : 0.08,
    fillColor: '#93c5fd',
    dashArray: selectedNeighborhoodIds.has(feature.__idx) ? '' : '4',
  });

  // click selects only that neighborhood. clicking it again clears filter to show all.
  const onEachNeighborhood = (feature, layer) => {
    layer.on('click', () => {
      setSelectedNeighborhoodIds((prev) => {
        const alreadyOnlyThis = prev.size === 1 && prev.has(feature.__idx);
        if (alreadyOnlyThis) {
          // clear -> show all
          return new Set();
        }
        // select only this one
        return new Set([feature.__idx]);
      });
    });
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = normalize(searchQuery);
    if (!q) return;

    // 1) Try neighborhood exact
    if (neighborhoodIndex.length) {
      const exact = neighborhoodIndex.find((n) => n.name === q);
      if (exact) {
        setSelectedNeighborhoodIds(new Set([exact.idx]));
        try {
          const bounds = L.geoJSON(neighborhoodsFC.features[exact.idx]).getBounds();
          if (map && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
        } catch (err) {
          console.warn('Failed to zoom to exact neighborhood match', err);
        }
        return;
      }
    }

    // 2) Try neighborhood fuzzy (substring)
    if (neighborhoodIndex.length) {
      const fuzzy = neighborhoodIndex.find((n) => n.name.includes(q));
      if (fuzzy) {
        setSelectedNeighborhoodIds(new Set([fuzzy.idx]));
        try {
          const bounds = L.geoJSON(neighborhoodsFC.features[fuzzy.idx]).getBounds();
          if (map && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
        } catch (err) {
          console.warn('Failed to zoom to fuzzy neighborhood match', err);
        }
        return;
      }
    }

    // 3) Fallback to Nominatim for postal code or city
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ca&limit=1&q=${encodeURIComponent(
        searchQuery
      )}`;

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
      const results = await res.json();

      if (Array.isArray(results) && results.length > 0) {
        const r = results[0];
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        if (map && !Number.isNaN(lat) && !Number.isNaN(lon)) {
          // clear neighborhood filter since this is a free geocode result
          setSelectedNeighborhoodIds(new Set());
          map.flyTo([lat, lon], 13);
        }
      }
    } catch (err) {
      console.error('Geocode failed', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg">
              <MapPin className="text-blue-900" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">City Infrastructure Services</h1>
              <p className="text-blue-200 text-sm">Pothole Detection & Mapping (Year to Date)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg flex items-center gap-2 transition-colors">
              <Download size={18} />
              Export Data
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 bg-white shadow-lg overflow-y-auto">
          {/* Tabs */}
          <div className="grid grid-cols-3 border-b">
            {['Summary', 'Review', 'Filter', 'Query', 'Export', 'About'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase())}
                className={`px-3 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.toLowerCase()
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4">
            {activeTab === 'summary' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-gray-800">Detection Summary</h2>
                  <button
                    onClick={reloadPotholes}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                    title="Refresh detections"
                  >
                    <RefreshCw size={16} className={potholesLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 text-blue-900">
                  <span className="font-semibold">Total Detections</span>
                  <span className="font-bold">{summary.total}</span>
                </div>
                {potholesLoading && (
                  <p className="text-sm text-gray-500">Loading detections…</p>
                )}
                {potholesError && (
                  <p className="text-sm text-red-600">Could not load detections: {potholesError}</p>
                )}
                {[
                  { label: 'Critical Severity', value: summary.critical, color: 'bg-red-600' },
                  { label: 'High Severity', value: summary.high, color: 'bg-orange-600' },
                  { label: 'Medium Severity', value: summary.medium, color: 'bg-yellow-500' },
                  { label: 'Low Severity', value: summary.low, color: 'bg-green-500' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="w-full flex items-center justify-between p-3 rounded-lg transition-all hover:bg-gray-100 text-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full ${row.color}`} />
                      <span className="font-medium">{row.label}</span>
                    </div>
                    <span className="font-bold text-gray-900">{row.value}</span>
                  </div>
                ))}
                <div className="border-t pt-3 mt-4 space-y-2">
                  {[
                    { icon: <AlertCircle size={20} />, label: 'Pending', count: summary.pending },
                    { icon: <div className="text-blue-600">⚙</div>, label: 'In Progress', count: summary.inProgress },
                    { icon: <div className="text-green-600">✓</div>, label: 'Repaired', count: summary.repaired },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="w-full flex items-center justify-between p-3 rounded-lg transition-all hover:bg-gray-100 text-gray-700"
                    >
                      <div className="flex items-center gap-3">
                        {row.icon}
                        <span className="font-medium">{row.label}</span>
                      </div>
                      <span className="font-bold text-gray-900">{row.count}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Detections shown are from the current year. Use the Filter tab to explore other dates.
                  </p>
                </div>
                <div className="mt-4 text-center">
                  <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-2 mx-auto">
                    <Eye size={18} />
                    Data Analytics
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'review' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Image Review</h2>
                    <p className="text-xs text-gray-600">
                      Full YOLO ready: {potholes.filter((p) => p.hasFullModel).length} of {potholes.length}
                    </p>
                  </div>
                  <button
                    onClick={reloadPotholes}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                    title="Refresh detections"
                  >
                    <RefreshCw size={16} className={potholesLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {potholesLoading && <p className="text-sm text-gray-500">Loading images...</p>}
                {potholesError && (
                  <p className="text-sm text-red-600">Could not load images: {potholesError}</p>
                )}
                {!potholesLoading && potholes.length === 0 && (
                  <p className="text-sm text-gray-600">No uploaded pothole images yet.</p>
                )}

                <div className="space-y-3">
                  {potholes.slice(0, 40).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPothole(p)}
                      className="w-full text-left border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white"
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt="Detected pothole"
                          className="w-full h-32 object-cover bg-gray-50"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                          No image
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-sm font-semibold capitalize">{p.severity}</span>
                          </div>
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full ${
                              p.hasFullModel
                                ? 'bg-red-50 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {p.hasFullModel ? 'Full YOLO' : 'Pi candidate'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {p.detectionCount} detection{p.detectionCount === 1 ? '' : 's'}
                          {p.confidence !== null ? `, ${(p.confidence * 100).toFixed(1)}% max confidence` : ''}
                        </div>
                        <div className="text-[11px] text-gray-500">{p.detected.toLocaleString()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'filter' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-800">Filter Options</h2>

                {neighborhoodsFC && (
                  <details className="mb-2">
                    <summary className="cursor-pointer text-sm font-semibold">Neighborhoods</summary>
                    <div className="mt-2 max-h-48 overflow-auto space-y-1 pr-1">
                      {neighborhoodsFC.features.map((f, idx) => {
                        const name = featureName(f);
                        const checked = selectedNeighborhoodIds.has(idx);
                        return (
                          <label key={idx} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                // same single-select behavior as map click
                                setSelectedNeighborhoodIds((prev) => {
                                  const alreadyOnlyThis = prev.size === 1 && prev.has(idx);
                                  if (alreadyOnlyThis) return new Set(); // clear to show all
                                  return new Set([idx]); // only this one
                                });
                              }}
                            />
                            <span>{name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                 <select
                    className="w-full p-2 border rounded-lg"
                    value={inputs.dateRange}
                    onChange={(e) => setInputs((s) => ({ ...s, dateRange: e.target.value }))}
                  >
                    <option value="all">All dates</option>
                    <option value="today">Today</option>
                    <option value="last7">Last 7 Days</option>
                    <option value="last30">Last 30 Days</option>
                    <option value="thisYear">This Year</option>
                  </select>

                </div>

                {/* Severity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Severity Level</label>
                  <div className="space-y-2">
                    {SEVERITIES.map((sev) => (
                      <label key={sev} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={inputs.severities.has(sev)}
                          onChange={() =>
                            setInputs((s) => ({ ...s, severities: toggleSetValue(s.severities, sev) }))
                          }
                        />
                        <span className="capitalize">{sev}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Size Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Size Range (cm)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="w-full p-2 border rounded-lg"
                      value={inputs.sizeMin}
                      onChange={(e) => setInputs((s) => ({ ...s, sizeMin: e.target.value }))}
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      className="w-full p-2 border rounded-lg"
                      value={inputs.sizeMax}
                      onChange={(e) => setInputs((s) => ({ ...s, sizeMax: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <div className="space-y-2">
                    {STATUSES.map((st) => (
                      <label key={st} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={inputs.statuses.has(st)}
                          onChange={() =>
                            setInputs((s) => ({ ...s, statuses: toggleSetValue(s.statuses, st) }))
                          }
                        />
                        <span className="capitalize">{st === 'inProgress' ? 'In Progress' : st}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={applyFilters}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Apply Filters
                  </button>
                  <button
                    onClick={clearFilters}
                    className="w-full bg-gray-100 text-gray-800 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>

                <div className="text-xs text-gray-600">
                  <div>Active date: <span className="font-medium">{selectedFilters.dateRange}</span></div>
                  <div>Severities: <span className="font-medium">{selectedFilters.severities.join(', ') || 'all'}</span></div>
                  <div>Statuses: <span className="font-medium">{selectedFilters.statuses.join(', ') || 'all'}</span></div>
                  <div>Size: <span className="font-medium">{selectedFilters.sizeMin || 'any'} to {selectedFilters.sizeMax || 'any'} cm</span></div>
                  <div>Neighborhoods: <span className="font-medium">{selectedNeighborhoodIds.size || 'all'}</span></div>
                  <div>Showing <span className="font-semibold">{filteredPotholes.length}</span> of {potholes.length}</div>
                </div>
              </div>
            )}

            {activeTab === 'query' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-800">Advanced Query</h2>
                <p className="text-sm text-gray-600">Search postal code, neighborhood, or GTA city</p>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g., M5V 2T6 or Kensington Market or Mississauga"
                      className="w-full p-2 pl-10 border rounded-lg"
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <button className="px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Go</button>
                </form>
              </div>
            )}
          </div>
        </aside>

        {/* Map Area */}
        <main className="flex-1 relative" style={{ height: '100%' }}>
          <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-2 flex gap-2">
            <button
              className="p-2 hover:bg-gray-100 rounded"
              onClick={reloadPotholes}
              title="Refresh detections from backend"
            >
              <RefreshCw size={20} className={potholesLoading ? 'animate-spin' : ''} />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded"><Filter size={20} /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><MapPin size={20} /></button>
            <button className="p-2 hover:bg-gray-100 rounded"><Calendar size={20} /></button>
          </div>

          <div className="absolute top-4 left-4 right-4 z-[1000] max-w-md">
            <form onSubmit={handleSearch}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find postal code, neighborhood, or GTA city"
                className="w-full p-3 rounded-lg shadow-lg border-2 border-gray-200"
              />
            </form>
          </div>

          <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <MapContainer
              center={[43.6532, -79.3832]}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <MapBinder onReady={setMap} />
              <TileLayer
                attribution="© OpenStreetMap contributors, © CARTO"
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />

              {neighborhoodsWithIdx && (
                <GeoJSON
                  data={neighborhoodsWithIdx}
                  style={hoodStyle}
                  onEachFeature={onEachNeighborhood}
                />
              )}

              {filteredPotholes.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={8}
                  pathOptions={{ fillColor: p.color, fillOpacity: 0.8, color: 'white', weight: 2 }}
                >
                  <Popup>
                    <div className="text-sm" style={{ minWidth: 200 }}>
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl}
                          alt="Detected pothole"
                          style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }}
                        />
                      )}
                      <div className="font-bold text-base capitalize">{p.severity} severity</div>
                      <div>{p.hasFullModel ? 'Full YOLO reviewed' : 'Pi candidate only'}</div>
                      {p.confidence !== null && (
                        <div>Confidence: {(p.confidence * 100).toFixed(1)}%</div>
                      )}
                      <div>Status: <span className="capitalize">{p.status === 'inProgress' ? 'In Progress' : p.status}</span></div>
                      <div>Region: {p.regionName || 'Unknown'}</div>
                      <div>Detected: {p.detected.toLocaleString()}</div>
                      <div className="text-xs text-gray-500 mt-1">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* Region-details panel: opens when exactly one region is selected. */}
          {selectedFeature && (
            <div className="absolute top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[1100] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 bg-blue-900 text-white">
                <button
                  onClick={() => setSelectedNeighborhoodIds(new Set())}
                  className="flex items-center gap-2 hover:text-blue-200"
                >
                  <ArrowLeft size={18} />
                  Back to map
                </button>
                <button
                  onClick={() => setSelectedNeighborhoodIds(new Set())}
                  className="p-1 hover:bg-blue-800 rounded"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-4 py-3 border-b">
                <h2 className="text-lg font-bold text-gray-800">{selectedRegionName}</h2>
                <p className="text-sm text-gray-600">
                  {regionPotholes.length} pothole{regionPotholes.length === 1 ? '' : 's'} detected
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {regionPotholes.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center">
                    <p className="text-gray-700 font-semibold text-base px-4">
                      No potholes were detected within this region.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {regionPotholes.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPothole(p)}
                        className="text-left border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt="Detected pothole"
                            className="w-full h-24 object-cover"
                          />
                        ) : (
                          <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                            No image
                          </div>
                        )}
                        <div className="p-2">
                          <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs font-medium capitalize">{p.severity}</span>
                          </div>
                          {p.confidence !== null && (
                            <div className="text-xs text-gray-600">{(p.confidence * 100).toFixed(0)}% conf.</div>
                          )}
                          <div className="text-[11px] text-gray-500">{p.detected.toLocaleString()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Single-pothole detail modal (from map popup or region gallery). */}
          {selectedPothole && (
            <div
              className="absolute inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4"
              onClick={() => setSelectedPothole(null)}
            >
              <div
                className="bg-white rounded-lg max-w-lg w-full max-h-[90%] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h3 className="font-bold text-gray-800 capitalize">{selectedPothole.severity} pothole</h3>
                  <button
                    onClick={() => setSelectedPothole(null)}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                {(selectedPothole.originalImageUrl || selectedPothole.imageUrl) && (
                  <DetectionImage
                    src={selectedPothole.originalImageUrl || selectedPothole.imageUrl}
                    detections={selectedPothole.detections}
                    alt="Detected pothole with bounding boxes"
                    className="w-full p-2"
                  />
                )}
                <div className="p-4 space-y-1 text-sm text-gray-700">
                  <div>Region: <span className="font-medium">{selectedPothole.regionName || 'Unknown'}</span></div>
                  <div>Model source: <span className="font-medium">{selectedPothole.hasFullModel ? 'Full YOLO model' : 'Pi candidate model'}</span></div>
                  {selectedPothole.fullModelProcessedAt && (
                    <div>Reviewed: <span className="font-medium">{new Date(selectedPothole.fullModelProcessedAt).toLocaleString()}</span></div>
                  )}
                  {selectedPothole.confidence !== null && (
                    <div>Confidence: <span className="font-medium">{(selectedPothole.confidence * 100).toFixed(1)}%</span></div>
                  )}
                  <div>Detections in image: <span className="font-medium">{selectedPothole.detectionCount}</span></div>
                  <div>Status: <span className="font-medium capitalize">{selectedPothole.status === 'inProgress' ? 'In Progress' : selectedPothole.status}</span></div>
                  <div>Detected: <span className="font-medium">{selectedPothole.detected.toLocaleString()}</span></div>
                  {selectedPothole.detections.length > 0 && (
                    <div className="pt-3">
                      <div className="font-semibold text-gray-800 mb-2">Bounding boxes</div>
                      <div className="space-y-2">
                        {selectedPothole.detections.map((d, idx) => (
                          <div key={`${d.label || 'detection'}-${idx}`} className="rounded border bg-gray-50 p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{d.label || 'pothole'}</span>
                              {Number.isFinite(Number(d.confidence)) && (
                                <span>{(Number(d.confidence) * 100).toFixed(1)}%</span>
                              )}
                            </div>
                            {Array.isArray(d.bbox) && (
                              <div className="text-gray-600 mt-1">
                                bbox: [{d.bbox.map((v) => Number(v).toFixed(1)).join(', ')}]
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 pt-1">
                    Coordinates: {selectedPothole.lat.toFixed(5)}, {selectedPothole.lng.toFixed(5)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[1000]">
            <h3 className="font-bold text-sm mb-2">Severity Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-600 rounded-full" /><span>Critical (&gt;30cm)</span></div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 bg-orange-600 rounded-full" /><span>High (20 to 30cm)</span></div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-500 rounded-full" /><span>Medium (10 to 20cm)</span></div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded-full" /><span>Low (&lt;10cm)</span></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PotholeMappingPlatform;
