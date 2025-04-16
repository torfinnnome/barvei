// components/MapComponent.tsx
'use client';

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import L, { LatLngExpression, LatLngBounds, PointTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WeatherPoint } from '@/app/api/route-weather/types';
import { useTranslations } from 'next-intl';
import { useMemo, useEffect } from 'react'; // Import useMemo and useEffect

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// --- Define Custom Icons ---

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],    // Default size
    iconAnchor: [12, 41],  // Point of the icon which will correspond to marker's location
    popupAnchor: [1, -34], // Point from which the popup should open relative to the iconAnchor
    shadowSize: [41, 41]   // Default size
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Use default blue icon (ensure path is correct if not using CDN/package import)
const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
    shadowSize:  [41, 41]
});
// --- End Icon Definitions ---

// @ts-ignore Needed because default is not typed correctly or module structure issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon.src,
    iconRetinaUrl: markerIcon2x.src,
    shadowUrl: markerShadow.src,
});
// End icon fix

interface MapComponentProps {
    routeGeoJson: GeoJSON.FeatureCollection | null | undefined;
    weatherPoints: WeatherPoint[];
}

const MapComponent: React.FC<MapComponentProps> = ({ routeGeoJson, weatherPoints }) => {
    const t = useTranslations('HomePage');
    // Set a reasonable default view (e.g., center of Norway, zoomed out)
    const defaultCenter: LatLngExpression = [64.5, 17.5]; // Approx center of Norway
    const defaultZoom = 4; // Zoom level to see most of Norway

    // --- Calculate Bounds ---
    // Use useMemo to compute bounds only when relevant props change
    const bounds = useMemo(() => {
        let combinedBounds: L.LatLngBounds | null = null;

        // 1. Try getting bounds from the route GeoJSON
        if (routeGeoJson?.features?.[0]?.geometry) {
            try {
                // Create a temporary GeoJSON layer to calculate its bounds
                const routeLayer = L.geoJSON(routeGeoJson);
                if (typeof routeLayer.getBounds === 'function') {
                    const routeBounds = routeLayer.getBounds();
                    if (routeBounds.isValid()) {
                        combinedBounds = routeBounds;
                    }
                }
            } catch (e) {
                console.error("Error getting bounds from route GeoJSON:", e);
                // Fallback or ignore if bounds calculation fails
            }
        }

        // 2. Get bounds from weather points and extend the combined bounds
        if (weatherPoints && weatherPoints.length > 0) {
            try {
                // Create LatLng objects for all points
                const pointCoords = weatherPoints.map(p => L.latLng(p.lat, p.lon));
                // Create bounds from the point coordinates
                const pointsBounds = L.latLngBounds(pointCoords);

                if (pointsBounds.isValid()) {
                    if (combinedBounds && combinedBounds.isValid()) {
                        // If we have route bounds, extend them to include the points
                        combinedBounds.extend(pointsBounds);
                    } else {
                        // If no valid route bounds, use the points bounds directly
                        combinedBounds = pointsBounds;
                    }
                }
            } catch(e) {
                console.error("Error getting bounds from weather points:", e);
            }
        }

        // Return the calculated bounds if they are valid, otherwise null
        return (combinedBounds && combinedBounds.isValid()) ? combinedBounds : null;

    }, [routeGeoJson, weatherPoints]); // Dependencies: recalculate if route or points change

    // --- Define Padding for fitBounds ---
    const boundsOptions = {
        padding: [50, 50] as PointTuple // Add 50px padding top/bottom and left/right
    };

    // Helper function for marker popups
    const getPointLabel = (index: number, totalPoints: number): string => {
         if (index === 0) return t('startPoint');
         if (index === totalPoints - 1) return t('endPoint');
         return t('intermediatePoint', { index });
    };

      // Function to select the correct icon
    const getMarkerIcon = (point: WeatherPoint, index: number, totalPoints: number) => {
        if (point.source === 'start' || index === 0) { // Double check with index
             return greenIcon;
        } else if (point.source === 'end' || index === totalPoints - 1) { // Double check with index
            return redIcon;
        } else {
            return blueIcon; // Default for intermediate
        }
     };

    // Optional: Log the bounds being used for debugging
    useEffect(() => {
        if (bounds) {
            console.log("Map bounds set to:", bounds.toBBoxString());
        } else {
            console.log("Map using default center/zoom.");
        }
    }, [bounds]);

    return (
        <MapContainer
            // Conditional props: Use bounds if available, otherwise center/zoom
            bounds={bounds || undefined} // Pass calculated bounds object (or undefined)
            boundsOptions={bounds ? boundsOptions : undefined} // Apply padding only when using bounds
            center={!bounds ? defaultCenter : undefined} // Fallback center
            zoom={!bounds ? defaultZoom : undefined} // Fallback zoom
            scrollWheelZoom={true}
            style={{ height: '400px', width: '100%' }}
             // Add a key to force re-initialization when bounds appear/disappear
             // This helps ensure fitBounds is applied correctly when data loads
            key={bounds ? 'bounds-active' : 'default-view'}
        >
            <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Display the route */}
            {routeGeoJson && <GeoJSON data={routeGeoJson} style={() => ({ color: 'blue', weight: 5 })} />}

            {/* Display markers for weather points */}
            {/* Display markers for weather points */}
            {weatherPoints.map((point, index) => (
                <Marker
                    key={index}
                    position={[point.lat, point.lon]} 
                    icon={getMarkerIcon(point, index, weatherPoints.length)}
                >
                    <Popup>
                        <b>{getPointLabel(index, weatherPoints.length)}</b><br />
                        {t('time')}: {(() => {
                                const date = new Date(point.time);
                                const showDate = Math.abs(point.time - Date.now()) > 23 * 60 * 60 * 1000;
                                let options: Intl.DateTimeFormatOptions;
                                if (showDate) {
                                    options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                                } else {
                                    options = { hour: '2-digit', minute: '2-digit' };
                                }
                                return date.toLocaleString([], options);
                            })()}<br />
                        {point.temperature !== undefined && `${t('temp')}: ${point.temperature.toFixed(1)}°C`}<br />
                        {point.symbolCode && `${t('weather')}: ${point.symbolCode}`}
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default MapComponent;
