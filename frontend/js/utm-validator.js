// UTM 좌표 검증 및 수정 도구
class UTMValidator {
    constructor() {
        this.createValidationModal();
    }

    // UTM 검증 결과를 시각적으로 표시하는 모달 생성
    createValidationModal() {
        const modal = document.createElement('div');
        modal.id = 'utmValidationModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>UTM 좌표 검증 결과</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="utmValidationResults"></div>
                    <div class="modal-actions" style="margin-top: 20px; text-align: center;">
                        <button id="utmFixIssues" class="btn btn-primary">문제 자동 수정</button>
                        <button id="utmIgnoreAndSave" class="btn btn-secondary">무시하고 저장</button>
                        <button id="utmCancelSave" class="btn btn-danger">저장 취소</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 이벤트 리스너 설정
        modal.querySelector('.close').onclick = () => this.hideModal();
        modal.querySelector('#utmCancelSave').onclick = () => this.hideModal();
        modal.onclick = (e) => {
            if (e.target === modal) this.hideModal();
        };
    }

    // UTM 검증 결과를 상세하게 표시
    showValidationResults(validation, onFix, onIgnore) {
        const modal = document.getElementById('utmValidationModal');
        const resultsDiv = document.getElementById('utmValidationResults');

        let html = '<div class="utm-validation-summary">';

        // 전체 요약
        html += `<div class="validation-summary">`;
        html += `<h4>📊 검증 요약</h4>`;
        html += `<ul>`;
        html += `<li>노드: ${validation.stats.nodeCount}개</li>`;
        html += `<li>링크: ${validation.stats.linkCount}개</li>`;
        html += `<li>UTM 존: ${validation.stats.zones.join(', ')}</li>`;
        html += `<li>반구: ${validation.stats.hemispheres.join(', ')}</li>`;
        html += `</ul>`;
        html += `</div>`;

        // 오류 목록
        if (validation.errors.length > 0) {
            html += `<div class="validation-errors">`;
            html += `<h4>❌ 오류 (${validation.errors.length}개)</h4>`;
            html += `<ul class="error-list">`;
            validation.errors.forEach(error => {
                html += `<li class="error-item">${error}</li>`;
            });
            html += `</ul>`;
            html += `</div>`;
        }

        // 경고 목록
        if (validation.warnings.length > 0) {
            html += `<div class="validation-warnings">`;
            html += `<h4>⚠️ 경고 (${validation.warnings.length}개)</h4>`;
            html += `<ul class="warning-list">`;
            validation.warnings.forEach(warning => {
                html += `<li class="warning-item">${warning}</li>`;
            });
            html += `</ul>`;
            html += `</div>`;
        }

        // 성공 메시지
        if (validation.isValid && validation.warnings.length === 0) {
            html += `<div class="validation-success">`;
            html += `<h4>✅ UTM 좌표가 모두 정상입니다!</h4>`;
            html += `</div>`;
        }

        html += '</div>';

        resultsDiv.innerHTML = html;

        // 버튼 이벤트 설정
        const fixBtn = document.getElementById('utmFixIssues');
        const ignoreBtn = document.getElementById('utmIgnoreAndSave');

        // 수정 가능한 문제가 있을 때만 수정 버튼 활성화
        if (this.hasFixableIssues(validation)) {
            fixBtn.style.display = 'inline-block';
            fixBtn.onclick = () => {
                this.hideModal();
                if (onFix) onFix();
            };
        } else {
            fixBtn.style.display = 'none';
        }

        ignoreBtn.onclick = () => {
            this.hideModal();
            if (onIgnore) onIgnore();
        };

        // 스타일 추가 (한 번만)
        if (!document.querySelector('#utm-validation-styles')) {
            const style = document.createElement('style');
            style.id = 'utm-validation-styles';
            style.textContent = `
                .utm-validation-summary {
                    font-family: 'Consolas', 'Monaco', monospace;
                    line-height: 1.6;
                }
                .validation-summary {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .validation-errors {
                    background: #fff5f5;
                    border-left: 4px solid #e53e3e;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .validation-warnings {
                    background: #fffaf0;
                    border-left: 4px solid #dd6b20;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .validation-success {
                    background: #f0fff4;
                    border-left: 4px solid #38a169;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .error-list, .warning-list {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .error-item {
                    color: #e53e3e;
                    margin-bottom: 8px;
                }
                .warning-item {
                    color: #dd6b20;
                    margin-bottom: 8px;
                }
                .modal-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    flex-wrap: wrap;
                }
            `;
            document.head.appendChild(style);
        }

        modal.style.display = 'block';
    }

    // 자동 수정 가능한 문제가 있는지 확인
    hasFixableIssues(validation) {
        // 반구 불일치, Zone 형식 오류 등은 자동 수정 가능
        return validation.errors.some(error =>
            error.includes('반구') ||
            error.includes('Zone 형식') ||
            error.includes('GPS 위도')
        );
    }

    // UTM 문제 자동 수정 시도
    async fixUTMIssues(pathData) {
        const fixes = [];
        let fixedCount = 0;

        for (let i = 0; i < pathData.Node.length; i++) {
            const node = pathData.Node[i];

            if (!node.UtmInfo || !node.GpsInfo) continue;

            const { Lat, Long } = node.GpsInfo;
            let { Zone } = node.UtmInfo;

            // GPS 좌표와 UTM 반구 불일치 수정
            if (Lat !== undefined && Zone) {
                const expectedHemisphere = Lat >= 0 ? 'N' : 'S';
                const zoneMatch = Zone.match(/^(\d{1,2})([NS])$/);

                if (zoneMatch && zoneMatch[2] !== expectedHemisphere) {
                    const newZone = `${zoneMatch[1]}${expectedHemisphere}`;

                    try {
                        // UTM 좌표 재계산
                        const utmData = await pathAPI.latLngToUtm(Lat, Long);

                        node.UtmInfo = {
                            Easting: utmData.easting,
                            Northing: utmData.northing,
                            Zone: `${utmData.zone_number}${utmData.zone_letter}`
                        };

                        fixes.push(`${node.ID}: UTM 존을 ${Zone}에서 ${node.UtmInfo.Zone}으로 수정`);
                        fixedCount++;
                    } catch (error) {
                        fixes.push(`${node.ID}: UTM 좌표 재계산 실패 - ${error.message}`);
                    }
                }
            }

            // Zone 형식 오류 수정 (잘못된 형식을 가장 가까운 올바른 형식으로)
            if (Zone && !Zone.match(/^(\d{1,2})([NS])$/)) {
                // 간단한 수정 시도
                const cleanZone = Zone.replace(/[^0-9NS]/g, '');
                const match = cleanZone.match(/(\d+)([NS])/);

                if (match) {
                    const newZone = `${match[1]}${match[2]}`;
                    node.UtmInfo.Zone = newZone;
                    fixes.push(`${node.ID}: Zone 형식을 ${Zone}에서 ${newZone}으로 수정`);
                    fixedCount++;
                }
            }
        }

        return {
            fixedCount,
            fixes,
            updatedData: pathData
        };
    }

    hideModal() {
        const modal = document.getElementById('utmValidationModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// 전역 인스턴스 생성
window.utmValidator = new UTMValidator();