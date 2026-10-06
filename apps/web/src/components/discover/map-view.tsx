'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { MapTrifoldIcon, PaintBrushIcon, XIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';

import { EmptyState } from '@/components/ui/empty-state';
import { PointPreviewCard } from './point-preview-card';
import styles from './map-view.module.css';

// Manhattan/Brooklyn waterfront — matches the reference mockup's default
// viewport (Lower Manhattan / Chelsea / DUMBO all in frame).
const NYC_CENTER: [number, number] = [-73.99, 40.72];

const SOURCE_ID = 'venues';
const EVENT_SOURCE_ID = 'event-pins';
const DRAW_SOURCE_ID = 'draw-shape';

// Minimum points captured on release for a stroke to count as a real shape
// rather than an accidental click/tiny jitter.
const MIN_DRAW_POINTS = 3;

// The same Phosphor "PaintBrushIcon" glyph used on the button itself,
// redrawn as an outline-only cursor (no fill) so it reads on the light
// streets basemap regardless of the app's own light/dark UI theme (the map
// style itself never changes). The hotspot (3, 23) lands on the bristle
// tip, the icon's bottom-left point in its native 256x256 viewBox, scaled
// to this 27px cursor.
const PAINTBRUSH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='27' height='27' viewBox='0 0 256 256'>` +
    `<path d='M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM124.42,113.55q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z' fill='none' stroke='#1A2036' stroke-width='10' stroke-linejoin='round' stroke-linecap='round'/>` +
    `</svg>`
)}") 3 23, crosshair`;

type DrawMode = 'idle' | 'drawing' | 'active';

// How long a mouse has to dwell on a dot before the preview card appears —
// long enough that a mouse just passing over a point on its way elsewhere
// doesn't trigger it, short enough to still feel responsive.
const HOVER_DELAY_MS = 400;

// Synthetic origin size for the card-expand transition when it's triggered
// by a raw dot click (no real card DOM exists yet to measure a rect from).
const CLICK_ORIGIN_SIZE = 24;

// Below this distance from the top of the map, the preview card (280px
// tall) opens downward instead of upward, so it doesn't render on top of
// the search bar / category chips (map-filters-overlay.tsx, ~120px tall).
const TOP_FLIP_THRESHOLD = 320;

// Grace period after the mouse leaves a pin before the preview card closes —
// without this, moving the mouse from the pin toward the card itself (which
// sits a little above/below the point, not on top of it) would immediately
// close the card before the user could ever reach it. Re-entering the pin
// or the card within this window cancels the pending close.
const CLOSE_GRACE_MS = 180;

type VenueProperties = { id: number; name: string };
type EventPinProperties = { eventId: number };

/** A one-off event's location — never a standalone place, only ever shown
 * as the event's own pin on the map while it's upcoming. */
export type EventPin = { eventId: number; venueId: number; lat: number; lng: number; title: string };

// Mapbox paint properties are canvas-rendered, not CSS — they can't read
// --icon-line, so the theme's colors are duplicated here and kept in sync
// by watching data-theme directly (see the MutationObserver below), same
// source of truth, different mechanism.
function getMapPaintColors() {
  const isLight = document.documentElement.dataset.theme === 'light';
  const pinColor = isLight ? '#437742' : '#8DE9D5';
  return {
    clusterColor: isLight ? '#97acc8' : '#9AA8E8',
    clusterTextColor: isLight ? '#10261f' : '#1A2036',
    pinColor,
    // A one-off event's location, not a standalone place — a warm amber so
    // it reads as "temporary" against the permanent pins' green/teal.
    eventPinColor: isLight ? '#B5700C' : '#F0B74A',
    // Reuses the pin color so the drawn shape reads as "the same accent",
    // not a fourth unrelated hue.
    drawColor: pinColor,
  };
}

function toFeatureCollection(venues: VenueRow[]): FeatureCollection<Point, VenueProperties> {
  return {
    type: 'FeatureCollection',
    features: venues
      .filter((v) => v.latitude != null && v.longitude != null)
      .map((v) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.longitude as number, v.latitude as number] },
        properties: { id: v.id, name: v.name },
      })),
  };
}

function toEventFeatureCollection(pins: EventPin[]): FeatureCollection<Point, EventPinProperties> {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { eventId: p.eventId },
    })),
  };
}

type MapViewProps = {
  venues: VenueRow[];
  /** One-off event locations — never a standalone place, shown as a visually
   * distinct pin only while their event is upcoming (see EventPin). */
  eventPins: EventPin[];
  onMoveEnd: (center: { lat: number; lng: number }) => void;
  /** Fired when a cluster (grouped dot) is clicked, with every venue id it contains. */
  onClusterClick: (venueIds: number[]) => void;
  /** Fired after each pan/zoom once individual (unclustered) dots are visible —
   * with every currently-visible venue id, or `null` while dots are still
   * clustered (i.e. not "zoomed in enough" for this to apply). */
  onViewportVenuesChange: (venueIds: number[] | null) => void;
  /** A dot (or its preview card) was clicked and should navigate — `originRect`
   * is where the card-expand transition should visually grow from. */
  onPointClick: (venue: VenueRow, originRect: DOMRect) => void;
  /** An event pin was clicked and should navigate straight to that event. */
  onEventPinClick: (eventId: number) => void;
  /** Fired once when a freehand-drawn shape completes (a closed ring, first
   * point duplicated at the end), and once with `null` when the draw tool's
   * X button clears it. Whether a stroke is currently in progress is not
   * exposed — that's fully self-contained in here (button icon, cursor, and
   * all the mouse-event wiring). */
  onPolygonChange: (polygon: { lat: number; lng: number }[] | null) => void;
};

export function MapView({
  venues,
  eventPins,
  onMoveEnd,
  onClusterClick,
  onViewportVenuesChange,
  onPointClick,
  onEventPinClick,
  onPolygonChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const venuesRef = useRef(venues);
  const venuesByIdRef = useRef<Map<number, VenueRow>>(new Map());
  const eventPinsRef = useRef(eventPins);
  const [failed, setFailed] = useState(false);

  const [hoverPreview, setHoverPreview] = useState<{
    venue: VenueRow;
    point: { x: number; y: number };
    anchor: 'above' | 'below';
  } | null>(null);
  const hoveredIdRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // drawModeRef is the source of truth read inside the mount-once effect's
  // closures (its deps array is `[]`, so React state captured there would go
  // stale — same reasoning as venuesRef/hoveredIdRef above). drawMode (state)
  // exists purely to drive the button's rendered icon/aria-label.
  const drawModeRef = useRef<DrawMode>('idle');
  const [drawMode, setDrawModeState] = useState<DrawMode>('idle');
  const drawPathRef = useRef<{ lng: number; lat: number }[]>([]);
  const drawRafRef = useRef<number | null>(null);
  // The button (render scope) triggers these; they're bound to the mount-once
  // effect's `map` instance and assigned there, once.
  const startDrawRef = useRef<() => void>(() => {});
  const resetDrawRef = useRef<() => void>(() => {});

  function setDrawMode(next: DrawMode) {
    drawModeRef.current = next;
    setDrawModeState(next);
  }

  function scheduleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setHoverPreview(null), CLOSE_GRACE_MS);
  }

  function cancelClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  useEffect(() => {
    venuesRef.current = venues;
    venuesByIdRef.current = new Map(venues.map((v) => [v.id, v]));
  }, [venues]);

  useEffect(() => {
    eventPinsRef.current = eventPins;
  }, [eventPins]);

  // Dismiss the preview card on a click outside of it — deliberately not
  // stopping propagation, so an underlying map click (e.g. a different dot)
  // still fires its own handler normally.
  useEffect(() => {
    if (!hoverPreview) return;
    function handlePointerDown(e: MouseEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setHoverPreview(null);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [hoverPreview]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set — copy apps/web/.env.example to .env.local.');
    }
    mapboxgl.accessToken = token ?? '';

    // mapboxgl.Map() throws synchronously if WebGL can't be initialized
    // (disabled, unsupported browser/hardware) — degrade to a message
    // instead of taking the whole page down with an unhandled exception.
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        // Light streets style (route shields, transit/POI icons, labeled
        // neighborhoods) — matches the reference mockup, not a dark map.
        style: 'mapbox://styles/mapbox/streets-v12',
        center: NYC_CENTER,
        zoom: 12.5,
      });
    } catch (err) {
      console.error('Mapbox failed to initialize', err);
      // Synchronous failure right after construction, not a normal render
      // path — there's no non-effect place to catch this one-shot init error.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }

    // Async failures (bad token, style load error) surface here instead.
    map.on('error', (e) => {
      console.error('Mapbox error', e.error);
      setFailed(true);
    });

    // 'top-right' sits directly underneath the side panel at desktop widths
    // (and in the narrow gap next to the filters overlay's kind toggle even
    // after nudging it left), so the zoom buttons end up unreachable —
    // bottom-left is the only corner clear of both the panel and the top
    // filters overlay; Mapbox already stacks its own attribution control
    // there without conflict.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');

    // A pan/zoom in flight means the card's frozen pixel position is about
    // to go stale — closing it here is the technical stand-in for "the user
    // clicked away" for that case.
    map.on('dragstart', () => setHoverPreview(null));
    map.on('zoomstart', () => setHoverPreview(null));

    map.on('moveend', () => {
      const c = map.getCenter();
      onMoveEnd({ lat: c.lat, lng: c.lng });

      if (!loadedRef.current) return;
      const clustersOnScreen = map.queryRenderedFeatures({ layers: ['clusters'] });
      if (clustersOnScreen.length > 0) {
        onViewportVenuesChange(null);
        return;
      }
      const visible = map.queryRenderedFeatures({ layers: ['unclustered-point'] });
      const ids = [...new Set(visible.map((f) => f.properties?.id as number).filter((id) => id != null))];
      onViewportVenuesChange(ids);
    });

    map.on('load', () => {
      const mapColors = getMapPaintColors();

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(venuesRef.current),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 44,
      });

      // Clusters — a single circle sized by how many venues it's standing in
      // for, matching the reference's tight bundle-of-dots look at city zoom
      // instead of scattering hundreds of individual pins everywhere.
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': mapColors.clusterColor,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 21, 30, 27],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': mapColors.clusterTextColor },
      });
      // A soft grounding shadow beneath each point, for a touch of lift
      // without adding visual weight — rendered first so the point layer
      // paints on top of it.
      map.addLayer({
        id: 'unclustered-point-shadow',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#000000',
          'circle-opacity': 0.25,
          'circle-blur': 0.7,
          'circle-radius': 4,
          'circle-translate': [0, 1.5],
        },
      });
      // Minimalist marker — a small translucent sphere with a crisp white
      // outline, matching the same white-stroke language the cluster
      // bubbles already use. Deliberately small so dense areas don't feel
      // cluttered with dozens of pins.
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': mapColors.pinColor,
          'circle-opacity': 0.9,
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // One-off event locations — never clustered (counts are small, and
      // clicking one should always go straight to that one event, not a
      // cluster-of-events interaction nobody asked for).
      map.addSource(EVENT_SOURCE_ID, { type: 'geojson', data: toEventFeatureCollection(eventPinsRef.current) });
      map.addLayer({
        id: 'event-point-shadow',
        type: 'circle',
        source: EVENT_SOURCE_ID,
        paint: {
          'circle-color': '#000000',
          'circle-opacity': 0.25,
          'circle-blur': 0.7,
          'circle-radius': 4,
          'circle-translate': [0, 1.5],
        },
      });
      map.addLayer({
        id: 'event-point',
        type: 'circle',
        source: EVENT_SOURCE_ID,
        paint: {
          'circle-color': mapColors.eventPinColor,
          'circle-opacity': 0.9,
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', 'event-point', (e) => {
        if (drawModeRef.current === 'drawing') return;
        const eventId = e.features?.[0]?.properties?.eventId;
        if (eventId == null) return;
        setHoverPreview(null);
        onEventPinClick(eventId);
      });

      // The freehand draw tool's live stroke / settled shape. Always holds
      // zero features, one LineString (mid-stroke), or one Polygon (settled)
      // — never both — so the two geometry-type filters below never fight
      // over what to show.
      map.addSource(DRAW_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'draw-stroke-line',
        type: 'line',
        source: DRAW_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': mapColors.drawColor, 'line-width': 3, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'draw-polygon-fill',
        type: 'fill',
        source: DRAW_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': mapColors.drawColor, 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'draw-polygon-outline',
        type: 'line',
        source: DRAW_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': mapColors.drawColor, 'line-width': 2, 'line-opacity': 0.9 },
      });

      map.on('click', 'clusters', (e) => {
        if (drawModeRef.current === 'drawing') return;
        const [feature] = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = feature?.properties?.cluster_id;
        const pointCount = (feature?.properties?.point_count as number | undefined) ?? 1000;
        const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
        if (clusterId == null) return;

        source.getClusterLeaves(clusterId, pointCount, 0, (err, leaves) => {
          if (err || !leaves) return;
          const ids = leaves.map((leaf) => leaf.properties?.id as number).filter((id) => id != null);
          onClusterClick(ids);
        });

        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom });
        });
      });

      map.on('click', 'unclustered-point', (e) => {
        if (drawModeRef.current === 'drawing') return;
        const id = e.features?.[0]?.properties?.id;
        if (id == null) return;
        const venue = venuesByIdRef.current.get(id);
        if (!venue) return;
        setHoverPreview(null);
        const rect = new DOMRect(
          e.point.x - CLICK_ORIGIN_SIZE / 2,
          e.point.y - CLICK_ORIGIN_SIZE / 2,
          CLICK_ORIGIN_SIZE,
          CLICK_ORIGIN_SIZE
        );
        onPointClick(venue, rect);
      });

      map.on('mousemove', 'unclustered-point', (e) => {
        if (drawModeRef.current === 'drawing') return;
        // Moving over any pin means the mouse hasn't actually left the
        // hover area — cancel a close that started on the way here (e.g.
        // re-entering the same pin, or arriving at a different one).
        cancelClose();
        const feature = e.features?.[0];
        const id = feature?.properties?.id as number | undefined;
        if (id == null || hoveredIdRef.current === id) return;
        hoveredIdRef.current = id;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        const point = { x: e.point.x, y: e.point.y };
        const anchor = point.y < TOP_FLIP_THRESHOLD ? 'below' : 'above';
        hoverTimerRef.current = setTimeout(() => {
          const hoveredVenue = venuesByIdRef.current.get(id);
          if (!hoveredVenue) return;
          setHoverPreview({ venue: hoveredVenue, point, anchor });
        }, HOVER_DELAY_MS);
      });
      map.on('mouseleave', 'unclustered-point', () => {
        hoveredIdRef.current = null;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        // A visible card gets a brief grace period rather than closing
        // instantly — cancelled if the mouse lands back on a pin or on the
        // card itself (see the anchor's onMouseEnter below), which is what
        // lets a user actually move the mouse onto the card to interact
        // with it instead of it vanishing the moment they leave the pin.
        scheduleClose();
      });

      for (const layer of ['clusters', 'unclustered-point', 'event-point']) {
        // Unguarded, these fight the draw tool's cursor: crossing a pin
        // mid-stroke would flip it to 'pointer' on enter and '' on leave,
        // stomping the paintbrush cursor set in handleStartDraw below.
        map.on('mouseenter', layer, () => {
          if (drawModeRef.current === 'drawing') return;
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          if (drawModeRef.current === 'drawing') return;
          map.getCanvas().style.cursor = '';
        });
      }

      loadedRef.current = true;
    });

    // --- Freehand draw tool -------------------------------------------
    // Bound to this specific `map` instance, exposed to the button in
    // render scope via startDrawRef/resetDrawRef (this effect only runs
    // once, so those refs get set exactly once, here).

    function getDrawSource() {
      return map.getSource(DRAW_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    }

    function clearDrawLayer() {
      getDrawSource()?.setData({ type: 'FeatureCollection', features: [] });
    }

    function redrawStroke() {
      drawRafRef.current = null;
      getDrawSource()?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: drawPathRef.current.map((p) => [p.lng, p.lat]) },
          },
        ],
      });
    }

    function handleDrawMouseMove(e: mapboxgl.MapMouseEvent) {
      drawPathRef.current.push({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      // Raw mousemove can fire well above 60/s during a fast drag —
      // coalesce redraws to one per animation frame instead of jank.
      if (drawRafRef.current == null) {
        drawRafRef.current = requestAnimationFrame(redrawStroke);
      }
    }

    function teardownStrokeListeners() {
      map.off('mousemove', handleDrawMouseMove);
      map.off('mouseup', handleDrawMouseUp);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      map.dragPan.enable();
    }

    function cancelStrokeToIdle() {
      teardownStrokeListeners();
      drawPathRef.current = [];
      clearDrawLayer();
      map.getCanvas().style.cursor = '';
      document.removeEventListener('keydown', handleDrawEscape);
      map.off('mousedown', handleDrawMouseDown);
      setDrawMode('idle');
    }

    function finishStroke() {
      // Guards against Mapbox's own 'mouseup' and the window fallback both
      // firing for the same release (the canvas event bubbles to window
      // too) — without this, a release over the map would run this twice.
      if (drawModeRef.current !== 'drawing') return;
      teardownStrokeListeners();
      const path = drawPathRef.current;
      if (path.length < MIN_DRAW_POINTS) {
        cancelStrokeToIdle();
        return;
      }
      // Auto-close the shape, connecting the release point back to the
      // start — a lasso stroke, not an open line.
      const closedRing = [...path, path[0]];
      getDrawSource()?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [closedRing.map((p) => [p.lng, p.lat])] },
          },
        ],
      });
      map.getCanvas().style.cursor = '';
      document.removeEventListener('keydown', handleDrawEscape);
      map.off('mousedown', handleDrawMouseDown);
      setDrawMode('active');
      onPolygonChange(closedRing);
    }

    function handleDrawMouseUp() {
      finishStroke();
    }

    function handleWindowMouseUp() {
      // Covers a stroke that's dragged off the map div and released
      // outside it — Mapbox's own 'mouseup' only fires for releases over
      // the canvas, so without this the tool would stay stuck mid-draw.
      finishStroke();
    }

    function handleDrawMouseDown(e: mapboxgl.MapMouseEvent) {
      e.originalEvent.preventDefault();
      drawPathRef.current = [{ lng: e.lngLat.lng, lat: e.lngLat.lat }];
      map.on('mousemove', handleDrawMouseMove);
      map.on('mouseup', handleDrawMouseUp);
      window.addEventListener('mouseup', handleWindowMouseUp, { once: true });
    }

    function handleDrawEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape' || drawModeRef.current !== 'drawing') return;
      cancelStrokeToIdle();
    }

    function handleStartDraw() {
      if (drawModeRef.current !== 'idle') return;
      setHoverPreview(null);
      // Must stay disabled for the whole armed period, not just mid-stroke
      // — otherwise the very first mousedown races a native map pan.
      map.dragPan.disable();
      map.getCanvas().style.cursor = PAINTBRUSH_CURSOR;
      map.on('mousedown', handleDrawMouseDown);
      document.addEventListener('keydown', handleDrawEscape);
      drawPathRef.current = [];
      setDrawMode('drawing');
    }

    function handleResetDraw() {
      if (drawModeRef.current === 'drawing') teardownStrokeListeners();
      drawPathRef.current = [];
      clearDrawLayer();
      map.getCanvas().style.cursor = '';
      document.removeEventListener('keydown', handleDrawEscape);
      map.off('mousedown', handleDrawMouseDown);
      setDrawMode('idle');
      onPolygonChange(null);
    }

    startDrawRef.current = handleStartDraw;
    resetDrawRef.current = handleResetDraw;
    // --------------------------------------------------------------------

    mapRef.current = map;
    const initial = map.getCenter();
    onMoveEnd({ lat: initial.lat, lng: initial.lng });

    // The pull chain toggles theme by mutating data-theme directly (no
    // React state/context involved), so this is the only way for the map's
    // canvas-rendered paint properties to find out it changed.
    const themeObserver = new MutationObserver(() => {
      if (!loadedRef.current) return;
      const colors = getMapPaintColors();
      map.setPaintProperty('clusters', 'circle-color', colors.clusterColor);
      map.setPaintProperty('cluster-count', 'text-color', colors.clusterTextColor);
      map.setPaintProperty('unclustered-point', 'circle-color', colors.pinColor);
      map.setPaintProperty('event-point', 'circle-color', colors.eventPinColor);
      map.setPaintProperty('draw-stroke-line', 'line-color', colors.drawColor);
      map.setPaintProperty('draw-polygon-fill', 'fill-color', colors.drawColor);
      map.setPaintProperty('draw-polygon-outline', 'line-color', colors.drawColor);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      loadedRef.current = false;
      themeObserver.disconnect();
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      // map.remove() tears down the map's own listeners, but these
      // document/window-level ones would otherwise outlive it.
      document.removeEventListener('keydown', handleDrawEscape);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (drawRafRef.current != null) cancelAnimationFrame(drawRafRef.current);
      startDrawRef.current = () => {};
      resetDrawRef.current = () => {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(venues));
  }, [venues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(EVENT_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toEventFeatureCollection(eventPins));
  }, [eventPins]);

  if (failed) {
    return (
      <div className={styles.map}>
        <EmptyState
          icon={<MapTrifoldIcon weight="duotone" size={32} />}
          title="Map couldn't load"
          subtitle="Your browser may not support WebGL, or the map failed to load. Try a different browser, or check NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN."
        />
      </div>
    );
  }

  return (
    <div className={styles.mapWrap}>
      <div ref={containerRef} className={styles.map} />
      <button
        type="button"
        className={`${styles.drawButton} ${drawMode !== 'idle' ? styles.drawButtonActive : ''}`}
        aria-label={drawMode === 'idle' ? 'Draw an area to filter the map' : 'Clear drawn area'}
        aria-pressed={drawMode !== 'idle'}
        onClick={() => (drawMode === 'idle' ? startDrawRef.current() : resetDrawRef.current())}
      >
        {drawMode === 'idle' ? <PaintBrushIcon weight="bold" size={18} /> : <XIcon weight="bold" size={18} />}
      </button>
      {hoverPreview ? (
        <div
          ref={anchorRef}
          className={`${styles.previewAnchor} ${hoverPreview.anchor === 'below' ? styles.previewAnchorBelow : ''}`}
          style={{ left: hoverPreview.point.x, top: hoverPreview.point.y }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <PointPreviewCard
            venue={hoverPreview.venue}
            onDismiss={() => setHoverPreview(null)}
            onOpen={(rect) => {
              const venue = hoverPreview.venue;
              setHoverPreview(null);
              onPointClick(venue, rect);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
