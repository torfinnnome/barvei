// app/[locale]/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image'; // Import Image for weather icons
import { useTranslations } from 'next-intl';
import styles from './page.module.css';
import type { RouteData, WeatherPoint } from '@/app/api/route-weather/types';
import debounce from 'lodash.debounce';

export const runtime = 'edge';

// Dynamically import the Map component, prevent SSR because Leaflet needs window object
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
    ssr: false,
    loading: () => <p>Loading Map...</p> // Optional loading indicator
});

interface Suggestion {
    label: string;
    // coordinates?: [number, number]; // If you need coords directly
}

// Helper to get current date/time strings for input defaults
const getCurrentDateTime = () => {
    const now = new Date();
    // Adjust for local timezone offset to get correct YYYY-MM-DD and HH:MM
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
    return {
        date: localISOTime.slice(0, 10), // YYYY-MM-DD
        time: localISOTime.slice(11, 16)  // HH:MM
    };
};

export default function HomePage() {
    const t = useTranslations('HomePage');
    const tGeneric = useTranslations('Generic'); // Add for generic terms like "Departure", "Arrival"
    const [startAddress, setStartAddress] = useState('');
    const [endAddress, setEndAddress] = useState('');
    const [waypoints, setWaypoints] = useState<string[]>([]);
    const [routeData, setRouteData] = useState<RouteData | null>(null);
    const [weatherPoints, setWeatherPoints] = useState<WeatherPoint[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- New State for Time ---
    const { date: defaultDate, time: defaultTime } = getCurrentDateTime();
    const [travelDate, setTravelDate] = useState(defaultDate);
    const [travelTime, setTravelTime] = useState(defaultTime);
    const [travelType, setTravelType] = useState<'departure' | 'arrival'>('departure'); // 'departure' or 'arrival'
    // --- End New State ---

    // --- Autocomplete State (Needs extension for waypoints) ---
    const [suggestions, setSuggestions] = useState<Record<string | number, Suggestion[]>>({}); // Use object: key=index ('start', 'end', 0, 1, ...)
    const [loadingStates, setLoadingStates] = useState<Record<string | number, boolean>>({}); // Loading per input
    const [showSuggestions, setShowSuggestions] = useState<Record<string | number, boolean>>({}); // Show per input
    const inputRefs = useRef<(HTMLDivElement | null)[]>([]); // Refs for all input containers
    // --- End Autocomplete State ---


//     // --- Autocomplete State ---
//     const [startSuggestions, setStartSuggestions] = useState<Suggestion[]>([]);
//     const [endSuggestions, setEndSuggestions] = useState<Suggestion[]>([]);
//     const [isStartLoading, setIsStartLoading] = useState(false);
//     const [isEndLoading, setIsEndLoading] = useState(false);
//     const [showStartSuggestions, setShowStartSuggestions] = useState(false);
//     const [showEndSuggestions, setShowEndSuggestions] = useState(false);
//     // Refs to control hiding dropdowns on outside click
//     const startContainerRef = useRef<HTMLDivElement>(null);
//     const endContainerRef = useRef<HTMLDivElement>(null);
//     // --- End Autocomplete State ---

    const addWaypoint = () => {
        setWaypoints([...waypoints, '']); // Add empty waypoint
    };

    const removeWaypoint = (index: number) => {
        setWaypoints(waypoints.filter((_, i) => i !== index));
        // Clear related suggestions/loading states
        setSuggestions(prev => { delete prev[index]; return {...prev}; });
        setLoadingStates(prev => { delete prev[index]; return {...prev}; });
        setShowSuggestions(prev => { delete prev[index]; return {...prev}; });
    };

    const handleWaypointChange = (index: number, value: string) => {
        const updatedWaypoints = [...waypoints];
        updatedWaypoints[index] = value;
        setWaypoints(updatedWaypoints);
        debouncedFetchSuggestions(value, index); // Fetch suggestions for this waypoint index
    };

    const handleCalculate = async () => {
        setIsLoading(true);
        setError(null);
        setRouteData(null);
        setWeatherPoints([]);

          // 1. Combine date and time input from user
        const localDateTimeString = `${travelDate}T${travelTime}:00`;

        // 2. Create a Date object - JS assumes this is in the BROWSER's local timezone
        const localDateObject = new Date(localDateTimeString);

        // 3. Validate the created date
        if (isNaN(localDateObject.getTime())) {
             setError(t('errorInvalidDateTime'));
             setIsLoading(false);
             return;
         }

        // 4. Convert the local date object to an ISO 8601 UTC string
        const baseTimeISO = localDateObject.toISOString(); // e.g., "2025-04-17T10:00:00.000Z" if local was 12:00 CEST

        console.log(`[Frontend DEBUG] Local Input: ${localDateTimeString}, Sent as UTC ISO: ${baseTimeISO}`);

        try {
            const response = await fetch('/api/route-weather', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Pass new time parameters
                body: JSON.stringify({
                    startAddress,
                    waypoints: waypoints.filter(wp => wp.trim() !== ''),
                    endAddress,
                    baseTimeISO: baseTimeISO,
                    travelType
                 }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }

            const data: { route: RouteData, weather: WeatherPoint[] } = await response.json();
            setRouteData(data.route);
            setWeatherPoints(data.weather);

        } catch (err: any) {
            setError(err.message || 'An unknown error occurred');
            console.error("Calculation error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to format duration (seconds to HH:MM:SS or similar)
    const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours > 0 ? `${hours}h ` : ''}${minutes}m ${secs}s`;
    };



    // --- Autocomplete Logic ---
    const fetchSuggestions = async (query: string, inputKey: string | number) => { // key = 'start', 'end', 0, 1...
        if (query.length < 3) {
            setSuggestions(prev => ({...prev, [inputKey]: []}));
            return;
        }
        setLoadingStates(prev => ({...prev, [inputKey]: true}));


       try {
            const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Autocomplete fetch failed');
            const data = await response.json();
            setSuggestions(prev => ({...prev, [inputKey]: data.suggestions || []}));
            setShowSuggestions(prev => ({...prev, [inputKey]: (data.suggestions?.length > 0)}));
        } catch (error) {
            console.error("Error fetching suggestions:", error);
            setSuggestions(prev => ({...prev, [inputKey]: []}));
        } finally {
            setLoadingStates(prev => ({...prev, [inputKey]: false}));
        }
    };


    // Debounce the fetch function (300ms delay)
    const debouncedFetchSuggestions = useCallback(debounce(fetchSuggestions, 300), []);


    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>, inputKey: 'start' | 'end') => {
         const value = e.target.value;
         inputKey === 'start' ? setStartAddress(value) : setEndAddress(value);
         debouncedFetchSuggestions(value, inputKey);
    };


    const selectSuggestion = (suggestion: Suggestion, inputKey: string | number) => {
         if (inputKey === 'start') setStartAddress(suggestion.label);
         else if (inputKey === 'end') setEndAddress(suggestion.label);
         else if (typeof inputKey === 'number') { // It's a waypoint index
             const updatedWaypoints = [...waypoints];
             updatedWaypoints[inputKey] = suggestion.label;
             setWaypoints(updatedWaypoints);
         }
         // Hide suggestions for this input
         setSuggestions(prev => ({...prev, [inputKey]: []}));
         setShowSuggestions(prev => ({...prev, [inputKey]: false}));
    };

    // Effect to handle clicks outside ANY suggestion box
    useEffect(() => {
         const handleClickOutside = (event: MouseEvent) => {
            let clickedOutside = true;
             // Check if click was inside any of the input refs
             for (const ref of inputRefs.current) {
                 if (ref && ref.contains(event.target as Node)) {
                     clickedOutside = false;
                     break;
                 }
             }
             // If clicked outside all containers, hide all suggestions
             if (clickedOutside) {
                setShowSuggestions({}); // Hide all
             }
         };
         document.addEventListener('mousedown', handleClickOutside);
         return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []); // Runs once


     const formatDisplayDateTime = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = Date.now();
        // Show date if more than ~23 hours difference from now
        const showDate = Math.abs(timestamp - now) > 23 * 60 * 60 * 1000;

        let options: Intl.DateTimeFormatOptions; // Declare options variable

        if (showDate) {
            // Use explicit options for date AND time components
            options = {
                year: 'numeric',
                month: 'numeric', // Or '2-digit'
                day: 'numeric',   // Or '2-digit'
                hour: '2-digit',
                minute: '2-digit'
                // Do NOT include dateStyle or timeStyle here
            };
        } else {
            // Use only time components
            options = {
                hour: '2-digit',
                minute: '2-digit'
                // Do NOT include dateStyle or timeStyle here
            };
        }
        // Use current locale (implicitly []) with the constructed options
        return date.toLocaleString([], options);
     };


      // Helper to render suggestion list
     const renderSuggestions = (inputKey: string | number) => (
        loadingStates[inputKey] ? <div className={styles.loadingIndicator}>Loading...</div> :
        showSuggestions[inputKey] && suggestions[inputKey]?.length > 0 && (
            <ul className={styles.suggestionsList}>
                {suggestions[inputKey].map((suggestion, index) => (
                    <li key={`${inputKey}-${index}`} onMouseDown={() => selectSuggestion(suggestion, inputKey)}>
                        {suggestion.label}
                    </li>
                ))}
            </ul>
        )
    );


    return (
        <main className={styles.main}>
            <h1>{t('title')}</h1>

            {/* Start Address */}
           <div
            className={`${styles.inputGroup} ${styles.autocompleteContainer}`}
                ref={(el) => { inputRefs.current[0] = el; }}>
                <label htmlFor="start">{t('startLabel')}</label>
                <input type="text" id="start" value={startAddress} onChange={(e) => handleAddressChange(e, 'start')} onFocus={() => suggestions['start']?.length > 0 && setShowSuggestions(prev => ({...prev, start: true}))} placeholder={t('placeholderStart')} autoComplete="off" />
                {renderSuggestions('start')}
            </div>

            {/* Waypoints Section */}
            {waypoints.map((waypoint, index) => (
            <div
                key={index}
                className={`${styles.inputGroup} ${styles.autocompleteContainer} ${styles.waypointGroup}`}
                ref={(el) => { inputRefs.current[index + 1] = el; }} >
                    <label htmlFor={`waypoint-${index}`}>{t('waypointLabel', { index: index + 1 })}</label> {/* New translation */}
                     <div className={styles.waypointInputWrapper}>
                        <input
                            type="text"
                            id={`waypoint-${index}`}
                            value={waypoint}
                            onChange={(e) => handleWaypointChange(index, e.target.value)}
                             onFocus={() => suggestions[index]?.length > 0 && setShowSuggestions(prev => ({...prev, [index]: true}))}
                            placeholder={t('placeholderWaypoint')} /* New translation */
                            autoComplete="off"
                        />
                        <button onClick={() => removeWaypoint(index)} className={styles.removeWaypointBtn} aria-label={t('removeWaypointLabel', { index: index + 1 })}> {/* New translation */}
                            × {/* Simple 'X' remove icon */}
                        </button>
                    </div>
                    {renderSuggestions(index)}
                </div>
            ))}
            <button onClick={addWaypoint} className={styles.addWaypointBtn}>+ {t('addWaypointLabel')}</button> {/* New translation */}
            {/* End Waypoints Section */}


            {/* End Address */}
            <div
              className={`${styles.inputGroup} ${styles.autocompleteContainer}`}
              ref={(el) => { inputRefs.current[waypoints.length + 1] = el; }} >
                <label htmlFor="end">{t('endLabel')}</label>
                <input type="text" id="end" value={endAddress} onChange={(e) => handleAddressChange(e, 'end')} onFocus={() => suggestions['end']?.length > 0 && setShowSuggestions(prev => ({...prev, end: true}))} placeholder={t('placeholderEnd')} autoComplete="off" />
                {renderSuggestions('end')}
            </div>

            {/* Time Selection */}
            <div className={styles.timeSelectionContainer}>
                <div className={styles.inputGroup}>
                    <label htmlFor="travelDate">{t('dateLabel')}</label> {/* Add translation */}
                    <input
                        type="date"
                        id="travelDate"
                        value={travelDate}
                        onChange={(e) => setTravelDate(e.target.value)}
                        required
                    />
                </div>
                <div className={styles.inputGroup}>
                     <label htmlFor="travelTime">{t('timeLabel')}</label> {/* Add translation */}
                     <input
                        type="time"
                        id="travelTime"
                        value={travelTime}
                        onChange={(e) => setTravelTime(e.target.value)}
                        required
                    />
                </div>
                <div className={styles.inputGroup}>
                     <label>{t('typeLabel')}</label> {/* Add translation */}
                     <div className={styles.radioGroup}>
                         <label>
                            <input
                                type="radio"
                                name="travelType"
                                value="departure"
                                checked={travelType === 'departure'}
                                onChange={() => setTravelType('departure')}
                             /> {tGeneric('departure')} {/* Use generic translation */}
                        </label>
                         <label>
                            <input
                                type="radio"
                                name="travelType"
                                value="arrival"
                                checked={travelType === 'arrival'}
                                onChange={() => setTravelType('arrival')}
                             /> {tGeneric('arrival')} {/* Use generic translation */}
                         </label>
                    </div>
                </div>
            </div>
            {/* --- End Time Selection --- */}

            <button onClick={handleCalculate} disabled={isLoading || !startAddress || !endAddress}>
                {isLoading ? t('loading') : t('calculateButton')}
            </button>

            {error && <p className={styles.error}>{t('error', { errorMessage: error })}</p>}

            {/* Map Display */}
             <div className={styles.mapContainer}>
                <MapComponent routeGeoJson={routeData?.geoJson} weatherPoints={weatherPoints} />
            </div>

            {/* Route and Weather Info Display */}
            {routeData && (
                 <div className={styles.results}>
                    <h2>{t('routeInfo', {
                        distance: (routeData.distance / 1000).toFixed(1), // meters to km
                        duration: formatDuration(routeData.duration)
                    })}</h2>

                    <h3>{t('weatherPoints')}</h3>
                    <div className={styles.weatherTimeline}>
                         {weatherPoints.map((point, index) => (
                            <div key={index} className={styles.weatherPoint}>
                                 <h4>
                                    {index === 0 ? t('startPoint') :
                                     index === weatherPoints.length - 1 ? t('endPoint') :
                                     t('intermediatePoint', { index })}
                                 </h4>
                                 <p>{t('time')}: {formatDisplayDateTime(point.time)}</p>
                                 <p>{t('temp')}: {point.temperature?.toFixed(1)}°C</p>
                                 {/* Basic weather symbol display - yr.no provides codes like 'clearsky_day' */}
                                 <p>{t('weather')}: {point.symbolCode || 'N/A'}</p>
                                 {/* You might want to add icons based on symbolCode later */}
                             </div>
                        ))}
                    </div>
                </div>
             )}
        </main>
    );
}
