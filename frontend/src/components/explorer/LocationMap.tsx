'use client';

import { useEffect, useRef, useState } from 'react';
import {
  circleMarker,
  map as createMap,
  tileLayer,
  type CircleMarker,
  type Map as LeafletMap,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  latitude: number;
  longitude: number;
  onSelect: (latitude: number, longitude: number) => void;
}

export default function LocationMap({ latitude, longitude, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const coordinates = useRef({ latitude, longitude });
  const select = useRef(onSelect);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    coordinates.current = { latitude, longitude };
    map.current?.setView([latitude, longitude], map.current.getZoom());
    marker.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  useEffect(() => {
    if (!container.current) return;
    // Next's cached routes can disconnect and reconnect effects while preserving
    // component state. Own the Leaflet instance in this effect, never in React
    // state, so each reconnection receives a fresh map after map.remove().
    const current = createMap(container.current, {
      center: [coordinates.current.latitude, coordinates.current.longitude],
      zoom: 3,
      minZoom: 2,
      scrollWheelZoom: false,
    });
    map.current = current;
    let active = true;
    const tiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
    }).addTo(current);
    tiles.on('tileerror', () => {
      if (active) setTileError(true);
    });
    marker.current = circleMarker(current.getCenter(), {
      radius: 8,
      color: '#65e8e2',
      fillColor: '#65e8e2',
      fillOpacity: 0.7,
      weight: 2,
    }).addTo(current);
    current.on('click', (event) =>
      select.current(
        Number(event.latlng.lat.toFixed(4)),
        Number((((((event.latlng.lng + 180) % 360) + 360) % 360) - 180).toFixed(4)),
      ),
    );
    const frame = requestAnimationFrame(() => {
      if (active) {
        current.invalidateSize();
        setTileError(false);
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      current.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  return (
    <div className="map-frame">
      <div
        ref={container}
        style={{ height: '100%', width: '100%' }}
        aria-label="Location selector map. Click to select a point, or use the coordinate inputs below."
      />
      {tileError && (
        <div className="map-warning" role="status">
          Map tiles unavailable. Use coordinates below.
        </div>
      )}
      <div className="map-hint">Click the map to select a location</div>
    </div>
  );
}
