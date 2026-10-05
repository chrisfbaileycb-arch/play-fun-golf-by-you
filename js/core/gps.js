// Geolocation hook: converts live GPS fixes into hole-space yards.
// Calibration: stand on the tee and tap "Calibrate" while facing the pin (uses compass heading when
// available, else a manual bearing). Manual tap targeting is always available as a fallback.

const YARDS_PER_M = 1.0936133;
const R_EARTH = 6371008.8;

export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

export const haversineYards = (a, b) => haversineMeters(a, b) * YARDS_PER_M;

/** Local tangent-plane offset (east/north metres) of b relative to a. */
export function enuOffset(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const east = toRad(b.lon - a.lon) * R_EARTH * Math.cos(toRad((a.lat + b.lat) / 2));
  const north = toRad(b.lat - a.lat) * R_EARTH;
  return { east, north };
}

/** Rotate an ENU offset so +y points along `bearingDeg` (clockwise from north). Returns yards. */
export function toHoleSpace(anchor, bearingDeg, fix) {
  const { east, north } = enuOffset(anchor, fix);
  const b = (bearingDeg * Math.PI) / 180;
  // forward unit (along bearing) = (sin b, cos b) in (east, north); right = (cos b, -sin b)
  const fwd = east * Math.sin(b) + north * Math.cos(b);
  const right = east * Math.cos(b) - north * Math.sin(b);
  return { x: right * YARDS_PER_M, y: fwd * YARDS_PER_M };
}

export class GPSTracker {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    this.watchId = null;
    this.fix = null; // {lat, lon, acc}
    this.anchor = null;
    this.bearing = 0;
    this.heading = null;
    this.listeners = new Set();
    this._onOrient = (e) => {
      const h = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : (e.absolute && e.alpha !== null ? 360 - e.alpha : null);
      if (h !== null && !Number.isNaN(h)) this.heading = h;
    };
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.status()); }

  status() {
    return {
      supported: this.supported, active: this.watchId !== null, fix: this.fix,
      calibrated: !!this.anchor, bearing: this.bearing, heading: this.heading, error: this.error || null,
    };
  }

  async start() {
    if (!this.supported || this.watchId !== null) return;
    this.error = null;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      }
    } catch { /* optional */ }
    window.addEventListener('deviceorientationabsolute', this._onOrient);
    window.addEventListener('deviceorientation', this._onOrient);
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => { this.fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }; this.error = null; this.emit(); },
      (err) => { this.error = err.message || 'Location unavailable'; this.emit(); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    this.emit();
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    window.removeEventListener('deviceorientationabsolute', this._onOrient);
    window.removeEventListener('deviceorientation', this._onOrient);
    this.emit();
  }

  /** Anchor the current fix as the tee; bearing from compass or explicit value. */
  calibrate(bearingDeg = null) {
    if (!this.fix) return false;
    this.anchor = { ...this.fix };
    this.bearing = bearingDeg ?? this.heading ?? 0;
    this.emit();
    return true;
  }

  /** Current position in hole yards, or null if uncalibrated / no fix. */
  holePosition() {
    if (!this.fix || !this.anchor) return null;
    return toHoleSpace(this.anchor, this.bearing, this.fix);
  }
}

export const gps = new GPSTracker();
