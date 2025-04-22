// app/api/route-weather/types.ts
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

export interface RouteData {
    distance: number; // meters
    duration: number; // seconds
    geoJson: FeatureCollection<Geometry>; // Route geometry
    // Add coordinates if needed separately, but geoJson contains them
    // coordinates: [number, number][];
    legs: any[]; // Raw leg data from ORS might be useful
}

export interface WeatherPoint {
    lat: number;
    lon: number;
    time: number; // Timestamp (milliseconds UTC) for the weather forecast
    temperature?: number; // Celsius
    symbolCode?: string; // e.g., 'clearsky_day'
    windDirection?: number; // degrees (0-360)
    windSpeed?: number; // m/s
    source: 'start' | 'end' | 'intermediate';
}
