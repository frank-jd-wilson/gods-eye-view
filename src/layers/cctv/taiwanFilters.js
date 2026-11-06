/** Provider metadata, never parse road/direction back out of display labels. */
export function cameraMatchesTaiwanFilter(camera, filter = {}) {
  if (filter.region !== 'taiwan') return true;
  if (!camera?.taiwan) return false;
  const { road, direction, minKm, maxKm } = filter;
  if (road && camera.taiwan.road !== road) return false;
  if (direction && camera.taiwan.direction !== direction) return false;
  const km = camera.taiwan.km;
  if (minKm !== '' && minKm != null && (km == null || km < Number(minKm)))
    return false;
  if (maxKm !== '' && maxKm != null && (km == null || km > Number(maxKm)))
    return false;
  return true;
}
