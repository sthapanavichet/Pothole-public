import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Filter, Download, Calendar, AlertCircle, Eye, Search } from 'lucide-react';
import { MapContainer, GeoJSON, TileLayer, CircleMarker, Popup } from 'react-leaflet';
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

function withinMeters(a, b, meters) {
  const dKm = turf.distance(turf.point([a.lng, a.lat]), turf.point([b.lng, b.lat]), { units: 'kilometers' });
  return dKm * 1000 < meters;
}
function existsWithinMeters(list, candidate, meters) {
  for (const p of list) if (withinMeters(p, candidate, meters)) return true;
  return false;
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


  const [potholeData] = useState({
    critical: 12,
    high: 28,
    medium: 45,
    low: 31,
    total: 116,
    repaired: 23,
    pending: 89,
    inProgress: 4,
  });

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildInitialPotholes() {
    const rand = mulberry32(12345);
    const torontoCenter = { lat: 43.6532, lng: -79.3832 };
    const colors = severityColors;
    const items = [];
    const targetCount = 80;
    const maxAttempts = targetCount * 50;
    let attempts = 0;

    while (items.length < targetCount && attempts < maxAttempts) {
      attempts++;
      const severity = SEVERITIES[Math.floor(rand() * SEVERITIES.length)];
      const status = STATUSES[Math.floor(rand() * STATUSES.length)];
      const size = Math.floor(rand() * 40) + 10;
      const detected = new Date(Date.now() - rand() * 7 * 24 * 60 * 60 * 1000);
      const cand = {
        id: attempts,
        lat: torontoCenter.lat + (rand() - 0.5) * 0.15,
        lng: torontoCenter.lng + (rand() - 0.5) * 0.2,
        severity,
        status,
        color: colors[severity],
        size,
        detected,
      };
      if (!existsWithinMeters(items, cand, 10)) items.push(cand);
    }
    return items.map((p, i) => ({ ...p, id: i }));
  }
  const [potholes] = useState(buildInitialPotholes);

  const neighborhoodsFC = useNeighborhoods();

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
      if (sizeMin !== '' && p.size < min) return false;
      if (sizeMax !== '' && p.size > max) return false;

      return true;
    });
  }, [potholes, selectedFilters, neighborhoodsFC, selectedNeighborhoodIds]);

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
        } catch {}
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
        } catch {}
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
          <div className="flex border-b">
            {['Summary', 'Filter', 'Query', 'Export', 'About'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase())}
                className={`flex-1 px-4 py-3 font-medium transition-colors ${
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
                <h2 className="text-lg font-bold text-gray-800 mb-4">Detection Summary</h2>
                {[
                  { label: 'Critical Severity', value: potholeData.critical, color: 'bg-red-600' },
                  { label: 'High Severity', value: potholeData.high, color: 'bg-orange-600' },
                  { label: 'Medium Severity', value: potholeData.medium, color: 'bg-yellow-500' },
                  { label: 'Low Severity', value: potholeData.low, color: 'bg-green-500' },
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
                    { icon: <AlertCircle size={20} />, label: 'Pending', count: potholeData.pending },
                    { icon: <div className="text-blue-600">⚙</div>, label: 'In Progress', count: potholeData.inProgress },
                    { icon: <div className="text-green-600">✓</div>, label: 'Repaired', count: potholeData.repaired },
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
              whenCreated={setMap}
            >
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
                    <div className="text-sm">
                      <div className="font-bold text-lg capitalize">{p.severity}</div>
                      <div>Size: {p.size}cm</div>
                      <div>Status: <span className="capitalize">{p.status === 'inProgress' ? 'In Progress' : p.status}</span></div>
                      <div>Detected: {p.detected.toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500 mt-1">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

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
