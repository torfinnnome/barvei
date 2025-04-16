// app/api/route-weather/route.ts
import { NextResponse } from 'next/server';
import type { RouteData, WeatherPoint } from './types'; // Adjust path if needed
import type { FeatureCollection, LineString } from 'geojson';

export const runtime = 'edge';

// --- OpenRouteService Functions ---

async function geocodeORS(address: string, apiKey: string): Promise<{ lat: number, lon: number } | null> {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&size=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`ORS Geocode error: ${response.statusText}`);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const [lon, lat] = data.features[0].geometry.coordinates;
            return { lat, lon };
        }
        return null;
    } catch (error) {
        console.error("ORS Geocoding failed:", error);
        return null;
    }
}


async function getRouteORS(
    coordinates: { lat: number; lon: number }[], // Array of coordinates
    apiKey: string
): Promise<RouteData | null> {
    if (coordinates.length < 2) {
        console.error("[API ERROR] getRouteORS: Need at least 2 coordinates.");
        return null;
    }

    // Format coordinates for ORS POST request: [[lon, lat], [lon, lat], ...]
    const orsCoords = coordinates.map(coord => [coord.lon, coord.lat]);

    // Use the GeoJSON endpoint for richer data, requires POST
    const url = `https://api.openrouteservice.org/v2/directions/driving-car/geojson`;
    console.log('[API DEBUG] GetRouteORS (POST) URL:', url);
    console.log('[API DEBUG] GetRouteORS Coordinates:', JSON.stringify(orsCoords));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': apiKey, // Use Authorization header for POST
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/geo+json',
            },
            body: JSON.stringify({
                coordinates: orsCoords,
                // Add options if needed:
                // instructions: false,
                // preference: "fastest",
            }),
        });

        if (!response.ok) {
             const errorBody = await response.text(); // Get error text
             console.error(`[API ERROR] ORS Directions POST error: ${response.status} ${response.statusText}`, errorBody);
             throw new Error(`ORS Directions error: ${response.statusText}. Details: ${errorBody}`);
        }

        const data: FeatureCollection = await response.json(); // Response is GeoJSON FeatureCollection

        if (data.features && data.features.length > 0) {
            const routeFeature = data.features[0];
            // Summary might be slightly different in GeoJSON response, adjust path if needed
            const summary = routeFeature.properties?.summary;
            const segments = routeFeature.properties?.segments;

            if (!summary || !segments) {
                 console.error("[API ERROR] ORS Response missing summary or segments", routeFeature.properties);
                 throw new Error("Invalid route data received from ORS.");
            }

            return {
                distance: summary.distance, // meters
                duration: summary.duration, // seconds
                geoJson: data, // The whole GeoJSON response
                legs: segments, // Use 'segments' for multi-leg routes
            };
        }
        return null;
    } catch (error: any) {
        console.error("[API ERROR] GetRouteORS (POST) failed:", error.message);
        // Don't return null directly, let the calling code handle the thrown error
        throw error; // Re-throw the error
    }
}

// --- Yr.no Locationforecast Function ---

async function getWeatherYrNo(lat: number, lon: number, userAgent: string): Promise<any | null> {
    // Use Locationforecast/2.0 compact format
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent, // CRITICAL: Identify your application
                'Accept': 'application/json',
            },
            // Consider adding caching headers if appropriate (next: { revalidate: 3600 })
            next: { revalidate: 600 } // Cache for 10 minutes
        });
        if (!response.ok) throw new Error(`Yr.no Forecast error: ${response.statusText}`);
        const data = await response.json();
        return data.properties.timeseries; // Return the array of forecast time steps
    } catch (error) {
        console.error("Yr.no request failed:", error);
        return null;
    }
}


// --- Helper Functions ---

// Find the closest forecast in the time series *after* the target time
function findForecastForTime(timeseries: any[], targetTimeUTCMillis: number): { temperature?: number, symbolCode?: string } | null {
    if (!timeseries || timeseries.length === 0) return null;

    let bestMatch = null;
    let smallestDiff = Infinity;

    for (const entry of timeseries) {
        const forecastTime = new Date(entry.time).getTime();
        const diff = forecastTime - targetTimeUTCMillis;

        // We want the first forecast *at or after* the target time
        if (diff >= 0 && diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = entry.data?.instant?.details?.air_temperature !== undefined ? {
                 temperature: entry.data.instant.details.air_temperature, // Celsius
                 // Look for symbol code in next_1_hours, next_6_hours etc. Prioritize shorter term.
                 symbolCode: entry.data.next_1_hours?.summary?.symbol_code ||
                             entry.data.next_6_hours?.summary?.symbol_code ||
                             entry.data.next_12_hours?.summary?.symbol_code
            } : null;
        }
    }

    // If no future forecast found, maybe take the last available one? (Or handle as needed)
    if (!bestMatch && timeseries.length > 0) {
         const lastEntry = timeseries[timeseries.length - 1];
         bestMatch = lastEntry.data?.instant?.details?.air_temperature !== undefined ? {
             temperature: lastEntry.data.instant.details.air_temperature,
             symbolCode: lastEntry.data.next_1_hours?.summary?.symbol_code ||
                         lastEntry.data.next_6_hours?.summary?.symbol_code ||
                         lastEntry.data.next_12_hours?.summary?.symbol_code
         } : null;
    }

    return bestMatch;
}


// Select points along the route for weather checks
function selectPointsAlongRoute(route: RouteData, maxPoints = 5): { lat: number, lon: number, timeOffsetSeconds: number }[] {
    const points: { lat: number, lon: number, timeOffsetSeconds: number }[] = [];
    // Assuming the first feature is the route line
    const routeGeometry = route.geoJson.features[0]?.geometry as LineString | undefined;
    if (!routeGeometry || routeGeometry.type !== 'LineString') {
         console.error("Invalid route geometry in GeoJSON");
         return [];
    }
    const coordinates = routeGeometry.coordinates; // [[lon, lat], ...]
    const totalDuration = route.duration;

    if (!coordinates || coordinates.length < 2 || totalDuration <= 0) {
        // Handle edge cases
         if (coordinates && coordinates.length > 0) {
              points.push({ lon: coordinates[0][0], lat: coordinates[0][1], timeOffsetSeconds: 0 });
             if (coordinates.length > 1) {
                 points.push({ lon: coordinates[coordinates.length - 1][0], lat: coordinates[coordinates.length - 1][1], timeOffsetSeconds: totalDuration });
             }
        }
        return points.slice(0, maxPoints);
    }

    // 1. Always add Start Point
    points.push({ lon: coordinates[0][0], lat: coordinates[0][1], timeOffsetSeconds: 0 });

    // 2. Calculate target time offsets
    const numIntermediate = Math.max(0, maxPoints - 2);
    const targetTimeOffsets: number[] = [];
    if (numIntermediate > 0) {
        for (let i = 1; i <= numIntermediate; i++) {
            targetTimeOffsets.push(totalDuration * (i / (numIntermediate + 1)));
        }
    }
     console.log('[API DEBUG] Target Time Offsets:', targetTimeOffsets);


    // 3. Find coordinates corresponding to target time offsets
    if (targetTimeOffsets.length > 0 && route.legs) { // Check if route.legs exists
        let accumulatedDuration = 0;
        let targetIndex = 0;
        let lastAddedPointIndex = 0;

        // Iterate through ORS *segments* (legs) and *steps* within them
        segmentLoop: for (const segment of route.legs) { // Use route.legs (segments)
            if (!segment.steps) continue; // Skip if segment has no steps

             for (const step of segment.steps) {
                const stepDuration = step.duration;
                const stepStartIndex = step.way_points[0];
                const stepEndIndex = step.way_points[1];
                // IMPORTANT: Ensure step way_points indices are relative to the *entire* coordinate array
                const stepCoords = coordinates.slice(stepStartIndex, stepEndIndex + 1);

                if (!stepCoords || stepCoords.length === 0) continue; // Skip empty steps

                while (targetIndex < targetTimeOffsets.length &&
                       accumulatedDuration + stepDuration >= targetTimeOffsets[targetIndex])
                {
                    const targetTime = targetTimeOffsets[targetIndex];
                    const durationIntoStep = targetTime - accumulatedDuration;
                    let fractionOfStep = 0;
                    if (stepDuration > 0) {
                        fractionOfStep = Math.max(0, Math.min(1, durationIntoStep / stepDuration));
                    }

                    const coordIndexInStep = Math.round(fractionOfStep * (stepCoords.length - 1));
                    const targetCoord = stepCoords[coordIndexInStep];

                    const prevPoint = points[lastAddedPointIndex];
                    if (targetCoord && (targetCoord[0] !== prevPoint.lon || targetCoord[1] !== prevPoint.lat)) {
                         points.push({ lon: targetCoord[0], lat: targetCoord[1], timeOffsetSeconds: targetTime });
                         console.log(`[API DEBUG] Added intermediate point ${points.length -1}: Time=${targetTime.toFixed(0)}s, Coords=[${targetCoord[0].toFixed(4)}, ${targetCoord[1].toFixed(4)}]`);
                         lastAddedPointIndex++;
                    } else {
                         console.log(`[API DEBUG] Skipping duplicate intermediate point at time ${targetTime.toFixed(0)}s`);
                    }

                    targetIndex++;
                    if (points.length >= maxPoints - 1) break segmentLoop;
                }

                accumulatedDuration += stepDuration;
                if (points.length >= maxPoints - 1) break segmentLoop;
             } // end step loop
        } // end segment loop
    } else if(targetTimeOffsets.length > 0) {
         console.warn("[API WARN] Route data missing 'legs' array for waypoint time calculation.");
         // Fallback or error? For now, continue without intermediate points based on steps
    }


    // 4. Always Add End Point
    const endCoord = coordinates[coordinates.length - 1];
    const lastPoint = points[points.length - 1];
     if (points.length < maxPoints && (endCoord[0] !== lastPoint.lon || endCoord[1] !== lastPoint.lat)) {
         points.push({ lon: endCoord[0], lat: endCoord[1], timeOffsetSeconds: totalDuration });
          console.log(`[API DEBUG] Added end point.`);
    } else if (points.length === maxPoints && (endCoord[0] !== lastPoint.lon || endCoord[1] !== lastPoint.lat)) {
        points[maxPoints - 1] = { lon: endCoord[0], lat: endCoord[1], timeOffsetSeconds: totalDuration };
         console.log(`[API DEBUG] Replaced last intermediate with end point.`);
    }

    console.log('[API DEBUG] Final selected points count:', points.length);
    return points;
}


// --- POST Handler ---

export async function POST(request: Request) {
    console.log('[API DEBUG] POST /api/route-weather received request');
    const apiKey = process.env.ORS_API_KEY;
    const userAgent = process.env.NEXT_PUBLIC_YR_USER_AGENT;

    if (!apiKey || !userAgent) { /* ... error handling ... */ }

    try {
        const {
            startAddress,
            waypoints = [], // Default to empty array if not provided
            endAddress,
            travelDate,
            travelTime,
            travelType
        } = await request.json();

        console.log(`[API DEBUG] Addresses: Start="${startAddress}", Waypoints=[${waypoints.join('; ')}], End="${endAddress}"`);
        console.log(`[API DEBUG] Time params: Date="${travelDate}", Time="${travelTime}", Type="${travelType}"`);

        if (!startAddress || !endAddress) return NextResponse.json({ error: 'Start and End addresses are required' }, { status: 400 });
        if (!travelDate || !travelTime || !travelType) return NextResponse.json({ error: 'Travel date, time, and type are required' }, { status: 400 });

        // --- Geocode ALL points ---
        const allAddresses = [startAddress, ...waypoints, endAddress];
        console.log('[API DEBUG] Geocoding addresses:', allAddresses);
        const geocodeResults = await Promise.all(
             allAddresses.map(addr => geocodeORS(addr as string, apiKey as string))
        );

        // Check for any failed geocoding results
        const failedIndex = geocodeResults.findIndex(result => result === null);
        if (failedIndex !== -1) {
             const failedAddress = allAddresses[failedIndex];
             console.error(`[API ERROR] Geocoding failed for address: "${failedAddress}" (index ${failedIndex})`);
             return NextResponse.json({ error: `Could not find coordinates for address: ${failedAddress}` }, { status: 400 });
        }
        const allCoords = geocodeResults as { lat: number; lon: number }[]; // Type assertion after check
        console.log('[API DEBUG] Geocoding successful for all points.');
        // --- End Geocode ---


        // --- Calculate Base Time ---
        let baseTimeUTCMillis: number;
        try {
            // Combine date and time strings. IMPORTANT: This assumes the server's local timezone
            // when parsing. If the server is in UTC, this might be fine. If it's in a different
            // timezone, the conversion to UTC via getTime() will reflect that.
            // For robust timezone handling, consider using a library like date-fns-tz.
            const localDateTime = new Date(`${travelDate}T${travelTime}:00`);
            if (isNaN(localDateTime.getTime())) { // Check if date is valid
                 throw new Error('Invalid date or time format provided.');
            }
            baseTimeUTCMillis = localDateTime.getTime();
            console.log(`[API DEBUG] Parsed local DateTime: ${localDateTime.toISOString()}, Base UTC Millis: ${baseTimeUTCMillis}`);
         } catch (e: any) {
             console.error("[API ERROR] Failed to parse date/time:", e.message);
             return NextResponse.json({ error: `Invalid date or time format: ${e.message}` }, { status: 400 });
         }
        // --- End Calculate Base Time ---


        // --- Get Route (using updated function) ---
        console.log('[API DEBUG] Attempting routing with waypoints...');
        const routeData = await getRouteORS(allCoords, apiKey as string); // Pass array of coords
        if (!routeData) return NextResponse.json({ error: 'Could not calculate route with waypoints' }, { status: 400 }); // Error might be thrown now
        const totalRouteDurationSeconds = routeData.duration;
        console.log(`[API DEBUG] Routing successful. Duration: ${totalRouteDurationSeconds.toFixed(0)}s`);
        // --- End Get Route ---


        // --- Select Points (using updated function) ---
        console.log('[API DEBUG] Selecting points along route...');
        const pointsToCheck = selectPointsAlongRoute(routeData!, 5);
        // --- End Select Points ---

        // --- Calculate Actual Departure Time (needed for arrival type) ---
        let actualDepartureTimeUTCMillis: number;
        if (travelType === 'arrival') {
            actualDepartureTimeUTCMillis = baseTimeUTCMillis - Math.round(totalRouteDurationSeconds * 1000);
             console.log(`[API DEBUG] Travel Type: Arrival. Calculated Departure UTC Millis: ${actualDepartureTimeUTCMillis}`);
        } else { // travelType === 'departure'
            actualDepartureTimeUTCMillis = baseTimeUTCMillis;
             console.log(`[API DEBUG] Travel Type: Departure. Using Base UTC Millis as Departure: ${actualDepartureTimeUTCMillis}`);
        }
        // --- End Calculate Departure Time ---


        // --- Fetch Weather (logic remains the same, relies on correct pointsToCheck) ---
        console.log('[API DEBUG] Fetching weather...');
        const weatherPromises = pointsToCheck.map(async (point, index) => {
            // --- Calculate Arrival Time at this specific point ---
            const arrivalTimeAtPointUTC = actualDepartureTimeUTCMillis + Math.round(point.timeOffsetSeconds * 1000);
            // --- End Calculate Arrival Time ---

            console.log(`[API DEBUG] Weather check for Point ${index}: Lat=${point.lat.toFixed(4)}, Lon=${point.lon.toFixed(4)}, TargetTimeUTC=${new Date(arrivalTimeAtPointUTC).toISOString()}`);

            const timeseries = await getWeatherYrNo(point.lat, point.lon, userAgent as string);
            const forecast = findForecastForTime(timeseries, arrivalTimeAtPointUTC); // Use calculated arrival time

            return {
                lat: point.lat,
                lon: point.lon,
                time: arrivalTimeAtPointUTC, // Store the calculated arrival time UTC millis
                temperature: forecast?.temperature,
                symbolCode: forecast?.symbolCode,
                source: index === 0 ? 'start' : index === pointsToCheck.length - 1 ? 'end' : 'intermediate',
            } as WeatherPoint;
        });

        let weatherResults = await Promise.all(weatherPromises);
        
        console.log('[API DEBUG] Filtering weather points...');
    
        // 5. Filter Weather Points: Keep start/end, only keep intermediate if weather changes significantly
         let finalWeatherPoints: WeatherPoint[] = [];
         if (weatherResults.length > 0) {
             finalWeatherPoints.push(weatherResults[0]); // Always add start

             for (let i = 1; i < weatherResults.length - 1; i++) {
                 const prev = finalWeatherPoints[finalWeatherPoints.length - 1]; // Compare with the *last added* point
                 const current = weatherResults[i];
                 // Keep if symbol changes OR temp difference is > 2 degrees (adjust threshold as needed)
                 const tempDiff = prev.temperature !== undefined && current.temperature !== undefined
                     ? Math.abs(prev.temperature - current.temperature)
                     : Infinity; // Treat missing temp as a difference

                 if (prev.symbolCode !== current.symbolCode || tempDiff > 2) {
                     finalWeatherPoints.push(current);
                 }
             }

             // Always add end point if it exists and is different from the last added point, or if only start exists
             if (weatherResults.length > 1) {
                 const endPoint = weatherResults[weatherResults.length - 1];
                 if (finalWeatherPoints.length === 1 || // Only start point exists
                     finalWeatherPoints[finalWeatherPoints.length - 1].symbolCode !== endPoint.symbolCode ||
                     (finalWeatherPoints[finalWeatherPoints.length - 1].temperature !== undefined && endPoint.temperature !== undefined &&
                     Math.abs(finalWeatherPoints[finalWeatherPoints.length - 1].temperature! - endPoint.temperature!) > 2) ||
                     (finalWeatherPoints[finalWeatherPoints.length - 1].temperature === undefined && endPoint.temperature !== undefined) || // Add if temp becomes available
                     (finalWeatherPoints[finalWeatherPoints.length - 1].temperature !== undefined && endPoint.temperature === undefined) // Add if temp becomes unavailable
                     ) {
                     finalWeatherPoints.push(endPoint);
                 } else if (finalWeatherPoints.length > 1) {
                     // If end point is *not* different, replace the last *intermediate* point with the end point
                     // to ensure the timeline ends correctly.
                     finalWeatherPoints[finalWeatherPoints.length - 1] = endPoint;
                 }
             }
         }

         // Ensure maximum points constraint is met after filtering (should be handled by selection, but as a safeguard)
         finalWeatherPoints = finalWeatherPoints.slice(0, 5);


        // 6. Return Route and Filtered Weather Data
        return NextResponse.json({ route: routeData, weather: finalWeatherPoints });

        // --- End Filter ---

        console.log('[API DEBUG] Returning successful response.');
        return NextResponse.json({ route: routeData, weather: finalWeatherPoints });

    } catch (error: any) {
        console.error("[API ERROR] Overall POST handler failed:", error);
        // Return specific error message if available from ORS/Geocode/etc.
        return NextResponse.json({ error: error.message || 'An internal server error occurred during calculation' }, { status: 500 });
    }
}
