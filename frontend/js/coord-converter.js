/**
 * Coordinate Conversion Service using proj4js
 */

// proj4 is loaded globally from the script tag in the HTML
const proj4 = window.proj4;

class CoordConverter {
    constructor(gpsOrigin) {
        if (!gpsOrigin || !gpsOrigin.utm_zone) {
            throw new Error("Cannot initialize CoordConverter: gpsOrigin with utm_zone is required.");
        }

        this.origin = gpsOrigin;
        this.wgs84 = 'EPSG:4326'; // Standard WGS84
        this.utmProjection = this.defineUtmProjection(gpsOrigin.utm_zone);
    }

    /**
     * Defines a new UTM projection in proj4.
     * @param {string} utmZoneStr - The UTM zone string, e.g., "52N".
     * @returns {string} The name of the defined projection.
     */
    defineUtmProjection(utmZoneStr) {
        const zoneNumber = parseInt(utmZoneStr.slice(0, -1));
        const isNorthern = utmZoneStr.slice(-1).toUpperCase() === 'N';
        const projName = `UTM${utmZoneStr}`;

        // Check if already defined
        if (proj4.defs[projName]) {
            return projName;
        }

        // Define the projection using a proj4 string
        const projString = `+proj=utm +zone=${zoneNumber} ${isNorthern ? '+north' : '+south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        proj4.defs(projName, projString);
        
        console.log(`proj4: Defined projection ${projName}`);
        return projName;
    }

    /**
     * Converts GPS (longitude, latitude) coordinates to local scene coordinates (x, y).
     * The local coordinates are relative to the gps_origin.
     * 
     * @param {object} gpsCoords - An object with { lng, lat }.
     * @returns {object} An object with { x, y } in meters.
     */
    gpsToLocal(gpsCoords) {
        if (!this.utmProjection) return null;

        // Proj4 expects [longitude, latitude]
        const utmCoords = proj4(this.wgs84, this.utmProjection, [gpsCoords.lng, gpsCoords.lat]);

        // Return coordinates relative to the origin's UTM position
        const localX = utmCoords[0] - this.origin.utm_easting;
        const localY = utmCoords[1] - this.origin.utm_northing;

        return { x: localX, y: localY };
    }

     /**
     * Converts local scene coordinates (x, y) to GPS (longitude, latitude).
     * 
     * @param {object} localCoords - An object with { x, y } in meters.
     * @returns {object} An object with { lng, lat }.
     */
    localToGps(localCoords) {
        if (!this.utmProjection) return null;

        const absEasting = localCoords.x + this.origin.utm_easting;
        const absNorthing = localCoords.y + this.origin.utm_northing;

        // Proj4 transformation returns [longitude, latitude]
        const gpsCoords = proj4(this.utmProjection, this.wgs84, [absEasting, absNorthing]);

        return { lng: gpsCoords[0], lat: gpsCoords[1] };
    }
}

export { CoordConverter };
