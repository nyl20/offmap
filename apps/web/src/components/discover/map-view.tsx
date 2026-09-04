'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import { MapTrifoldIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';

import { EmptyState } from '@/components/ui/empty-state';
import { PointPreviewCard } from './point-preview-card';
import styles from './map-view.module.css';

// Manhattan/Brooklyn waterfront — matches the reference mockup's default
// viewport (Lower Manhattan / Chelsea / DUMBO all in frame).
const NYC_CENTER: [number, number] = [-73.99, 40.72];

const SOURCE_ID = 'venues';

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

// Mapbox paint properties are canvas-rendered, not CSS — they can't read
// --icon-line, so the theme's colors are duplicated here and kept in sync
// by watching data-theme directly (see the MutationObserver below), same
// source of truth, different mechanism.
function getMapPaintColors() {
  const isLight = document.documentElement.dataset.theme === 'light';
  return {
    clusterColor: isLight ? '#97acc8' : '#9AA8E8',
    clusterTextColor: isLight ? '#10261f' : '#1A2036',
    pinColor: isLight ? '#437742' : '#8DE9D5',
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

type MapViewProps = {
  venues: VenueRow[];
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
};

export function MapView({ venues, onMoveEnd, onClusterClick, onViewportVenuesChange, onPointClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const venuesRef = useRef(venues);
  const venuesByIdRef = useRef<Map<number, VenueRow>>(new Map());
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

      map.on('click', 'clusters', (e) => {
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

      for (const layer of ['clusters', 'unclustered-point']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      loadedRef.current = true;
    });

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
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      loadedRef.current = false;
      themeObserver.disconnect();
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
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
