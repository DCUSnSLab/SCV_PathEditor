// GPS ↔ UTM 좌표 변환 유틸리티
class CoordinateUtils {
    constructor() {
        // WGS84 타원체 상수
        this.a = 6378137.0; // 장반경 (미터)
        this.e2 = 0.00669437999014; // 첫 번째 이심률의 제곱
        this.k0 = 0.9996; // 스케일 팩터
        this.E0 = 500000.0; // False easting
        this.N0 = 0.0; // False northing (북반구)
    }

    /**
     * 위경도 좌표를 UTM 좌표로 변환
     * @param {number} lat - 위도 (도)
     * @param {number} lng - 경도 (도)
     * @returns {object} {easting, northing, zone, hemisphere}
     */
    latLngToUtm(lat, lng) {
        const latRad = lat * Math.PI / 180.0;
        const lngRad = lng * Math.PI / 180.0;
        
        // UTM 존 계산
        const zone = Math.floor((lng + 180) / 6) + 1;
        const hemisphere = lat >= 0 ? 'N' : 'S';
        
        // 중앙 경선
        const centralMeridian = (zone - 1) * 6 - 180 + 3;
        const centralMeridianRad = centralMeridian * Math.PI / 180.0;
        
        // 경도 차이
        const deltaLng = lngRad - centralMeridianRad;
        
        // 계산용 변수들
        const N = this.a / Math.sqrt(1 - this.e2 * Math.sin(latRad) * Math.sin(latRad));
        const T = Math.tan(latRad) * Math.tan(latRad);
        const C = this.e2 * Math.cos(latRad) * Math.cos(latRad) / (1 - this.e2);
        const A = Math.cos(latRad) * deltaLng;
        
        // 자오선 호장 계산
        const e1 = (1 - Math.sqrt(1 - this.e2)) / (1 + Math.sqrt(1 - this.e2));
        const M = this.a * (
            (1 - this.e2 / 4 - 3 * this.e2 * this.e2 / 64 - 5 * Math.pow(this.e2, 3) / 256) * latRad -
            (3 * this.e2 / 8 + 3 * this.e2 * this.e2 / 32 + 45 * Math.pow(this.e2, 3) / 1024) * Math.sin(2 * latRad) +
            (15 * this.e2 * this.e2 / 256 + 45 * Math.pow(this.e2, 3) / 1024) * Math.sin(4 * latRad) -
            (35 * Math.pow(this.e2, 3) / 3072) * Math.sin(6 * latRad)
        );
        
        // UTM 좌표 계산
        const x = this.k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + 
                  (5 - 18 * T + T * T + 72 * C - 58 * this.e2) * Math.pow(A, 5) / 120);
        const y = this.k0 * (M + N * Math.tan(latRad) * (A * A / 2 + 
                  (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + 
                  (61 - 58 * T + T * T + 600 * C - 330 * this.e2) * Math.pow(A, 6) / 720));
        
        const easting = x + this.E0;
        let northing = y;
        
        // 남반구의 경우 False northing 적용
        if (hemisphere === 'S') {
            northing += 10000000.0;
        }
        
        return {
            easting: Math.round(easting * 100) / 100, // 소수점 2자리까지
            northing: Math.round(northing * 100) / 100,
            zone: zone,
            hemisphere: hemisphere,
            zoneString: `${zone}${hemisphere}`
        };
    }

    /**
     * UTM 좌표를 위경도 좌표로 변환
     * @param {number} easting - UTM Easting
     * @param {number} northing - UTM Northing  
     * @param {number} zone - UTM 존 번호
     * @param {string} hemisphere - 반구 ('N' 또는 'S')
     * @returns {object} {lat, lng}
     */
    utmToLatLng(easting, northing, zone, hemisphere) {
        const x = easting - this.E0;
        let y = northing;
        
        // 남반구의 경우 False northing 제거
        if (hemisphere === 'S') {
            y -= 10000000.0;
        }
        
        // 중앙 경선
        const centralMeridian = (zone - 1) * 6 - 180 + 3;
        const centralMeridianRad = centralMeridian * Math.PI / 180.0;
        
        // 자오선 호장의 역계산
        const M = y / this.k0;
        const mu = M / (this.a * (1 - this.e2 / 4 - 3 * this.e2 * this.e2 / 64 - 5 * Math.pow(this.e2, 3) / 256));
        
        const e1 = (1 - Math.sqrt(1 - this.e2)) / (1 + Math.sqrt(1 - this.e2));
        const phi1 = mu + 
            (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
            (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
            (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
        
        // 계산용 변수들
        const N = this.a / Math.sqrt(1 - this.e2 * Math.sin(phi1) * Math.sin(phi1));
        const T = Math.tan(phi1) * Math.tan(phi1);
        const C = this.e2 * Math.cos(phi1) * Math.cos(phi1) / (1 - this.e2);
        const R = this.a * (1 - this.e2) / Math.pow(1 - this.e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
        const D = x / (N * this.k0);
        
        // 위경도 계산
        const lat = phi1 - (N * Math.tan(phi1) / R) * 
            (D * D / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * this.e2) * Math.pow(D, 4) / 24 +
             (61 + 90 * T + 298 * C + 45 * T * T - 252 * this.e2 - 3 * C * C) * Math.pow(D, 6) / 720);
             
        const lng = centralMeridianRad + 
            (D - (1 + 2 * T + C) * Math.pow(D, 3) / 6 + 
             (5 - 2 * C + 28 * T - 3 * C * C + 8 * this.e2 + 24 * T * T) * Math.pow(D, 5) / 120) / Math.cos(phi1);
        
        return {
            lat: lat * 180.0 / Math.PI,
            lng: lng * 180.0 / Math.PI
        };
    }

    /**
     * 두 UTM 좌표 간의 거리 계산 (미터 단위)
     * @param {number} easting1 
     * @param {number} northing1 
     * @param {number} easting2 
     * @param {number} northing2 
     * @returns {number} 거리 (미터)
     */
    calculateUtmDistance(easting1, northing1, easting2, northing2) {
        const dx = easting1 - easting2;
        const dy = northing1 - northing2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 한국 지역에 특화된 UTM 좌표 변환 (주로 UTM Zone 52N 사용)
     * @param {number} lat 
     * @param {number} lng 
     * @returns {object}
     */
    koreanLatLngToUtm(lat, lng) {
        const result = this.latLngToUtm(lat, lng);
        
        // 한국 지역 검증
        if (result.zone < 51 || result.zone > 52 || result.hemisphere !== 'N') {
            console.warn('한국 지역이 아닌 좌표입니다:', lat, lng);
        }
        
        return result;
    }
}

// 전역 인스턴스 생성
window.coordUtils = new CoordinateUtils();