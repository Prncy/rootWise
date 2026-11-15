import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function validPoint(latitude, longitude) {
  if (latitude === "" || longitude === "") return false;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export default function MapPicker({ latitude, longitude, onLocationPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const callbackRef = useRef(onLocationPick);

  useEffect(() => { callbackRef.current = onLocationPick; }, [onLocationPick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false })
      .setView([15, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const markerIcon = L.divIcon({
      className: "rootwise-marker-wrap",
      html: '<span class="rootwise-map-marker"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    function setMarker(lat, lon, shouldNotify = false) {
      const point = [lat, lon];
      if (!markerRef.current) {
        markerRef.current = L.marker(point, { draggable: true, icon: markerIcon }).addTo(map);
        markerRef.current.on("dragend", () => {
          const position = markerRef.current.getLatLng();
          callbackRef.current?.(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)));
        });
      } else {
        markerRef.current.setLatLng(point);
      }
      if (shouldNotify) callbackRef.current?.(Number(lat.toFixed(6)), Number(lon.toFixed(6)));
    }

    map.on("click", event => setMarker(event.latlng.lat, event.latlng.lng, true));
    mapRef.current = map;
    mapRef.current.setMarker = setMarker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !validPoint(latitude, longitude)) return;
    const lat = Number(latitude);
    const lon = Number(longitude);
    mapRef.current.setView([lat, lon], Math.max(mapRef.current.getZoom(), 8));
    mapRef.current.setMarker(lat, lon);
  }, [latitude, longitude]);

  return <div className="farm-map" ref={containerRef} role="application" aria-label="Map for selecting a farm location" />;
}
