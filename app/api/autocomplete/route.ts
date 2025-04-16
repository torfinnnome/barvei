// app/api/autocomplete/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Server configuration error: ORS API key missing' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 3) { // Don't search for very short strings
        return NextResponse.json({ suggestions: [] });
    }

    // ORS Autocomplete endpoint
    const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${apiKey}&text=${encodeURIComponent(query)}`;
    // You might add '&boundary.country=XX' or focus points '&focus.point.lon=X&focus.point.lat=Y' for better results

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`ORS Autocomplete error: ${response.status} ${response.statusText}`);
             // Try to parse error body from ORS if possible
             let errorBody = 'ORS Autocomplete request failed';
             try { errorBody = await response.json(); } catch (e) {}
            return NextResponse.json({ error: 'Failed to fetch suggestions from ORS', details: errorBody }, { status: response.status });
        }
        const data = await response.json();

        // Format suggestions (ORS returns GeoJSON features)
        const suggestions = data.features?.map((feature: any) => ({
             label: feature.properties.label, // The display text
             coordinates: feature.geometry.coordinates // Optional: [lon, lat] if needed
        })) || [];

        return NextResponse.json({ suggestions });

    } catch (error: any) {
        console.error("[API Autocomplete ERROR]:", error);
        return NextResponse.json({ error: 'An internal server error occurred during autocomplete' }, { status: 500 });
    }
}
