# 백엔드 연동 테스트 가이드

백엔드 API 연동을 안전하게 테스트하는 방법을 설명합니다.

## 테스트 방법 선택

### 방법 1: 수동 재전송만 사용 (가장 안전) ✅ 권장

**설정:**
```bash
# .env
VITE_ENABLE_BACKEND_INTEGRATION=false  # 자동 전송 비활성화
VITE_BACKEND_TEST_MODE=true            # 테스트 모드
```

**장점:**
- ✅ 자동 전송 없음
- ✅ 원하는 경기만 선택해서 전송
- ✅ Firestore 원본 데이터 보존
- ✅ 배포된 버전에 영향 없음

**테스트 절차:**
1. 경기를 진행하고 종료 (Firestore에만 저장됨)
2. 브라우저에서 관리자 페이지 접속
3. "경기 데이터 백엔드 재전송" 섹션에서 테스트할 경기 선택
4. "재전송" 버튼 클릭
5. 전송 상태 확인 (성공/실패)

---

### 방법 2: 로컬 백엔드 서버 사용

**설정:**
```bash
# .env
VITE_ENABLE_BACKEND_INTEGRATION=false  # 여전히 자동 전송은 꺼둠
VITE_BACKEND_TEST_MODE=true
VITE_BACKEND_TEST_URL=http://localhost:8080  # 로컬 백엔드
```

**사전 준비:**
1. 백엔드 프로젝트를 로컬에서 실행
   ```bash
   cd /path/to/AUBL_WebPage_BE
   ./gradlew bootRun
   ```
2. 로컬 DB (MariaDB) 실행 및 스키마 생성

**장점:**
- ✅ 프로덕션 DB에 영향 없음
- ✅ 로컬에서 완전한 테스트 가능
- ✅ 디버깅 용이

---

### 방법 3: 테스트 시즌 ID 사용

**설정:**
```bash
# .env
VITE_ENABLE_BACKEND_INTEGRATION=false
VITE_CURRENT_SEASON_ID=999  # 테스트용 시즌 ID
```

**장점:**
- ✅ 실제 시즌 데이터와 분리
- ✅ 테스트 데이터만 따로 관리

**주의사항:**
- 백엔드 DB에 시즌 ID 999가 존재해야 함

---

## 환경 변수 설명

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `VITE_ENABLE_BACKEND_INTEGRATION` | 자동 백엔드 전송 활성화 | `false` |
| `VITE_BACKEND_TEST_MODE` | 테스트 모드 (테스트 URL 사용) | `false` |
| `VITE_BACKEND_TEST_URL` | 테스트용 백엔드 URL | `http://localhost:8080` |
| `VITE_CURRENT_SEASON_ID` | 시즌 ID | `1` |
| `VITE_BACKEND_API_URL` | 프로덕션 백엔드 URL | `https://api.aubl.club` |

---

## 테스트 시나리오

### 시나리오 1: 단일 경기 테스트

1. `.env` 설정
   ```bash
   VITE_ENABLE_BACKEND_INTEGRATION=false
   VITE_BACKEND_TEST_MODE=true
   ```

2. 개발 서버 재시작
   ```bash
   npm run dev
   ```

3. 테스트 경기 생성 및 진행
   - 경기 일정 생성
   - 라인업 설정
   - 경기 시작 및 기록
   - 경기 종료 (Firestore에 저장됨)

4. 관리자 페이지에서 수동 재전송
   - `/admin` 접속
   - 완료된 경기 확인
   - "재전송" 버튼 클릭
   - 콘솔에서 결과 확인

### 시나리오 2: 자동 전송 테스트 (주의!)

⚠️ **주의: 프로덕션 환경에서는 절대 사용하지 마세요**

1. `.env` 설정
   ```bash
   VITE_ENABLE_BACKEND_INTEGRATION=true  # 자동 전송 활성화
   VITE_BACKEND_TEST_MODE=true           # 로컬 백엔드 사용
   VITE_BACKEND_TEST_URL=http://localhost:8080
   ```

2. 로컬 백엔드 서버 실행 필수

3. 경기 종료 시 자동으로 백엔드 전송

---

## 안전 체크리스트

배포 전 반드시 확인:

- [ ] `.env`에서 `VITE_ENABLE_BACKEND_INTEGRATION=false` 설정됨
- [ ] `.env`에서 `VITE_BACKEND_TEST_MODE=false` 설정됨
- [ ] 테스트 경기가 프로덕션 Firestore에 남지 않도록 정리
- [ ] 백엔드 DB에 테스트 데이터만 있는지 확인
- [ ] Git에 `.env` 파일이 커밋되지 않았는지 확인

---

## 프로덕션 배포 시

### 1단계: 백엔드 CORS 설정 완료

```java
// WebConfig.java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("https://aubl.club", "http://localhost:5173")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
```

### 2단계: 환경 변수 설정

```bash
# 프로덕션 .env
VITE_ENABLE_BACKEND_INTEGRATION=true   # 자동 전송 활성화
VITE_BACKEND_TEST_MODE=false           # 프로덕션 URL 사용
VITE_CURRENT_SEASON_ID=1               # 실제 시즌 ID
```

### 3단계: 점진적 활성화

1. 먼저 재전송 기능으로 과거 경기 전송 테스트
2. 문제없으면 자동 전송 활성화
3. 첫 경기 테스트 후 결과 확인
4. 정상 작동 확인 후 완전 활성화

---

## 문제 해결

### CORS 에러
- 로컬 개발: Vite 프록시가 자동으로 처리
- 프로덕션: 백엔드 CORS 설정 필요

### 405 에러 (Method Not Allowed)
- 백엔드 엔드포인트가 없거나 HTTP 메서드가 틀림
- `/api/teams` GET 메서드 확인
- `/api/import/firestore/matches` POST 메서드 확인

### 전송 실패
1. 네트워크 탭에서 요청/응답 확인
2. 백엔드 로그 확인
3. 데이터 형식이 올바른지 확인 (transformers.ts)

---

## 추가 정보

- 관리자 페이지: `/admin`
- 백엔드 저장소: https://github.com/jason0904/AUBL_WebPage_BE
- API 문서: (백엔드 README 참고)
