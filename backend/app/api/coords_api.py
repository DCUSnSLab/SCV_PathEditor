from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import utm

router = APIRouter(prefix="/api/coords", tags=["coordinates"])

class LatLng(BaseModel):
    lat: float
    lng: float

class UtmCoords(BaseModel):
    easting: float
    northing: float
    zone_number: int
    zone_letter: str

@router.post("/latlng-to-utm", response_model=UtmCoords)
async def convert_latlng_to_utm(coords: LatLng):
    """Latitude/Longitude를 UTM 좌표로 변환"""
    try:
        easting, northing, zone_number, zone_letter = utm.from_latlon(coords.lat, coords.lng)
        return UtmCoords(
            easting=easting,
            northing=northing,
            zone_number=zone_number,
            zone_letter=zone_letter
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coordinate conversion failed: {e}")

@router.post("/utm-to-latlng", response_model=LatLng)
async def convert_utm_to_latlng(coords: UtmCoords):
    """UTM 좌표를 Latitude/Longitude로 변환"""
    try:
        lat, lng = utm.to_latlon(coords.easting, coords.northing, coords.zone_number, coords.zone_letter)
        return LatLng(lat=lat, lng=lng)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coordinate conversion failed: {e}")
