'use client';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
interface Props { latitude: number; longitude: number; onSelect: (lat: number, lon: number) => void }
function MapEvents({ latitude, longitude, onSelect }: Props) {
 const map = useMap();
 useEffect(() => { map.setView([latitude, longitude], map.getZoom()); }, [latitude, longitude, map]);
 useMapEvents({ click: e => onSelect(Number(e.latlng.lat.toFixed(4)), Number(((e.latlng.lng + 540) % 360 - 180).toFixed(4))) });
 return <CircleMarker center={[latitude,longitude]} radius={8} pathOptions={{ color: '#65e8e2', fillColor: '#65e8e2', fillOpacity: 0.7, weight: 2 }}/>;
}
export default function LocationMap(props: Props) {
 const [tileError, setTileError] = useState(false);
 return <div className="map-frame"><MapContainer center={[props.latitude,props.longitude]} zoom={3} minZoom={2} scrollWheelZoom={false} style={{ height:'100%', width:'100%' }} attributionControl><TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' eventHandlers={{ tileerror: () => setTileError(true) }}/><MapEvents {...props}/></MapContainer>{tileError && <div className="map-warning" role="status">Map tiles unavailable. Use coordinates below.</div>}<div className="map-hint">Click the map to select a location</div></div>;
}
