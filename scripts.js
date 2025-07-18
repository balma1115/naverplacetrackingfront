// Railway API 설정
const API_CONFIG = {
    development: 'http://localhost:8000',
    production: 'https://your-railway-app.railway.app'  // 배포 후 실제 URL로 변경
};

// 현재 환경에 따른 API URL 결정
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? API_CONFIG.development 
    : API_CONFIG.production;

let currentJobId = null;
let progressCheckInterval = null;

// 페이지 로드시 초기화
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    checkApiConnection();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 위치 설정 방법 변경
    document.querySelectorAll('.location-method').forEach(method => {
        method.addEventListener('click', function() {
            document.querySelectorAll('.location-method').forEach(m => m.classList.remove('active'));
            this.classList.add('active');
            
            const selectedMethod = this.dataset.method;
            document.getElementById('coords-input').style.display = selectedMethod === 'coords' ? 'block' : 'none';
            document.getElementById('address-input').style.display = selectedMethod === 'address' ? 'block' : 'none';
        });
    });
    
    // 키워드 입력에서 Enter 키
    document.getElementById('keywordInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addKeyword();
        }
    });
}

// API 서버 연결 확인
async function checkApiConnection() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            statusIndicator.textContent = '🟢';
            statusText.textContent = 'API 서버 연결됨 - 실제 검색 가능';
            document.getElementById('startButton').disabled = false;
        } else {
            throw new Error('서버 응답 오류');
        }
    } catch (error) {
        statusIndicator.textContent = '🔴';
        statusText.textContent = 'API 서버 연결 실패 - 배포 후 사용 가능';
        document.getElementById('startButton').disabled = true;
        console.error('API 연결 오류:', error);
    }
}

// 키워드 추가
function addKeyword() {
    const input = document.getElementById('keywordInput');
    const keyword = input.value.trim();
    
    if (!keyword) {
        alert('키워드를 입력해주세요.');
        return;
    }
    
    // 중복 체크
    const existingKeywords = getKeywords();
    if (existingKeywords.includes(keyword)) {
        alert('이미 추가된 키워드입니다.');
        return;
    }
    
    // 키워드 태그 생성
    const keywordTag = document.createElement('div');
    keywordTag.className = 'keyword-tag';
    keywordTag.innerHTML = `${keyword} <span class="remove" onclick="removeKeyword(this)">×</span>`;
    
    document.getElementById('keywordsList').appendChild(keywordTag);
    input.value = '';
}

// 키워드 제거
function removeKeyword(element) {
    element.parentElement.remove();
}

// 현재 키워드 목록 가져오기
function getKeywords() {
    return Array.from(document.querySelectorAll('.keyword-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
}

// 위치 설정 가져오기
function getLocationSettings() {
    const activeMethod = document.querySelector('.location-method.active').dataset.method;
    
    if (activeMethod === 'coords') {
        return {
            type: 'coords',
            lat: parseFloat(document.getElementById('latitude').value) || 35.1379,
            lng: parseFloat(document.getElementById('longitude').value) || 126.7794,
            name: document.getElementById('locationName').value || '설정된 위치'
        };
    } else {
        return {
            type: 'address',
            address: document.getElementById('address').value || '광주광역시 서구 벌원동'
        };
    }
}

// 순위 확인 시작
async function startRankingCheck() {
    const targetBusiness = document.getElementById('targetBusiness').value.trim();
    const keywords = getKeywords();
    const location = getLocationSettings();
    
    // 입력 유효성 검사
    if (!targetBusiness) {
        alert('목표 업체명을 입력해주세요.');
        return;
    }
    
    if (keywords.length === 0) {
        alert('검색 키워드를 하나 이상 추가해주세요.');
        return;
    }
    
    // UI 초기화
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('startButton').disabled = true;
    
    try {
        // 키워드가 3개 이하면 동기식, 그 이상이면 비동기식
        if (keywords.length <= 3) {
            await handleSyncSearch(targetBusiness, keywords, location);
        } else {
            await handleAsyncSearch(targetBusiness, keywords, location);
        }
        
    } catch (error) {
        console.error('검색 오류:', error);
        showError(`검색 중 오류가 발생했습니다: ${error.message}`);
    } finally {
        document.getElementById('startButton').disabled = false;
    }
}

// 동기식 검색 (즉시 결과)
async function handleSyncSearch(targetBusiness, keywords, location) {
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');
    
    progressText.textContent = '서버에서 검색 중...';
    progressFill.style.width = '50%';
    
    const requestData = {
        target_business: targetBusiness,
        keywords: keywords,
        location: location,
        max_pages: 3,
        max_concurrent: 3
    };
    
    const response = await fetch(`${API_BASE_URL}/api/check-ranking`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
    }
    
    const results = await response.json();
    
    progressFill.style.width = '100%';
    progressText.textContent = '검색 완료!';
    
    displayResults(results);
}

// 비동기식 검색 (실시간 진행 상황)
async function handleAsyncSearch(targetBusiness, keywords, location) {
    const progressText = document.getElementById('progressText');
    
    progressText.textContent = '비동기 검색 작업 시작...';
    
    // 비동기 검색 시작
    const requestData = {
        target_business: targetBusiness,
        keywords: keywords,
        location: location,
        max_pages: 3,
        max_concurrent: 3
    };
    
    const response = await fetch(`${API_BASE_URL}/api/check-ranking-parallel`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
    }
    
    const jobData = await response.json();
    currentJobId = jobData.job_id;
    
    progressText.textContent = `작업 시작됨 (Job ID: ${currentJobId.substring(0, 8)})`;
    
    // 진행 상황 체크 시작
    startProgressCheck();
}

// 진행 상황 확인
function startProgressCheck() {
    if (progressCheckInterval) {
        clearInterval(progressCheckInterval);
    }
    
    progressCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/job-status/${currentJobId}`);
            if (!response.ok) return;
            
            const status = await response.json();
            updateProgress(status);
            
            if (status.status === 'completed') {
                clearInterval(progressCheckInterval);
                displayResults(status.results);
            } else if (status.status === 'failed') {
                clearInterval(progressCheckInterval);
                showError(`검색 실패: ${status.error || '알 수 없는 오류'}`);
            }
            
        } catch (error) {
            console.error('진행 상황 확인 오류:', error);
        }
    }, 2000); // 2초마다 확인
}

// 진행 상황 업데이트
function updateProgress(status) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressDetails = document.getElementById('progressDetails');
    
    progressFill.style.width = `${status.progress}%`;
    
    if (status.status === 'running') {
        progressText.textContent = `검색 진행 중... (${status.completed_keywords}/${status.total_keywords})`;
        progressDetails.innerHTML = `
            <div class="progress-info">
                <span>🔍 진행률: ${status.progress.toFixed(1)}%</span>
                <span>✅ 완료: ${status.completed_keywords}개</span>
                <span>⏳ 남은 키워드: ${status.total_keywords - status.completed_keywords}개</span>
            </div>
        `;
    } else if (status.status === 'completed') {
        progressText.textContent = '🎉 모든 검색 완료!';
        progressDetails.innerHTML = `
            <div class="progress-info success">
                <span>✅ 총 ${status.total_keywords}개 키워드 검색 완료</span>
            </div>
        `;
    }
}

// 결과 표시
function displayResults(results) {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsSection = document.getElementById('resultsSection');
    
    resultsContainer.innerHTML = '';
    resultsSection.style.display = 'block';
    
    // 결과 요약
    const summary = createResultSummary(results);
    resultsContainer.appendChild(summary);
    
    // 개별 결과
    results.forEach((result, index) => {
        setTimeout(() => {
            const resultItem = createResultItem(result);
            resultsContainer.appendChild(resultItem);
        }, index * 200);
    });
    
    // 진행 상황 숨기기
    setTimeout(() => {
        document.getElementById('progressSection').style.display = 'none';
    }, 1000);
}

// 결과 요약 생성
function createResultSummary(results) {
    const firstPlaceCount = results.filter(r => r.rank === 1).length;
    const topTenCount = results.filter(r => r.rank && r.rank <= 10).length;
    const foundCount = results.filter(r => r.found).length;
    
    const summary = document.createElement('div');
    summary.className = 'result-summary';
    summary.innerHTML = `
        <h3>📈 검색 결과 요약</h3>
        <div class="summary-stats">
            <div class="stat-item">
                <span class="stat-number">${firstPlaceCount}</span>
                <span class="stat-label">1위 달성</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${topTenCount}</span>
                <span class="stat-label">TOP 10</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${foundCount}</span>
                <span class="stat-label">검색됨</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${results.length}</span>
                <span class="stat-label">총 키워드</span>
            </div>
        </div>
    `;
    return summary;
}

// 개별 결과 아이템 생성
function createResultItem(result) {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    let rankClass, rankText, statusText;
    
    if (result.error) {
        rankClass = 'rank-error';
        rankText = '⚠️ 오류';
        statusText = result.error;
    } else if (result.rank === 1) {
        rankClass = 'rank-first';
        rankText = '🥇 1위';
        statusText = '축하합니다! 1위를 달성했습니다!';
    } else if (result.rank && result.rank <= 10) {
        rankClass = 'rank-top10';
        rankText = `🏅 ${result.rank}위`;
        statusText = 'TOP 10 안에 위치하고 있습니다.';
    } else if (result.rank) {
        rankClass = 'rank-other';
        rankText = `📍 ${result.rank}위`;
        statusText = '검색 결과에서 찾을 수 있습니다.';
    } else {
        rankClass = 'rank-not-found';
        rankText = '❌ 찾을 수 없음';
        statusText = '검색 범위 내에서 찾을 수 없습니다.';
    }
    
    item.innerHTML = `
        <div class="result-header">
            <div class="result-keyword">"${result.keyword}"</div>
            <div class="result-rank ${rankClass}">${rankText}</div>
        </div>
        <div class="result-status">${statusText}</div>
        <div class="result-details">
            <span>🎯 ${result.target_business}</span>
            <span>📊 ${result.total_results}개 결과</span>
            <span>⏱️ ${result.processing_time}초</span>
        </div>
    `;
    
    // 애니메이션 효과
    item.style.opacity = '0';
    item.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        item.style.transition = 'all 0.5s ease-out';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
    }, 100);
    
    return item;
}

// 오류 표시
function showError(message) {
    const progressText = document.getElementById('progressText');
    const progressSection = document.getElementById('progressSection');
    
    progressText.textContent = `❌ ${message}`;
    progressSection.style.display = 'block';
    
    // 3초 후 숨기기
    setTimeout(() => {
        progressSection.style.display = 'none';
    }, 3000);
}

// 결과 내보내기 (CSV)
function exportResults() {
    // 구현 예정
    alert('CSV 내보내기 기능은 곧 추가될 예정입니다!');
}

// 설정 저장
function saveSettings() {
    const settings = {
        target_business: document.getElementById('targetBusiness').value,
        keywords: getKeywords(),
        location: getLocationSettings(),
        saved_at: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `naver_ranking_settings_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}