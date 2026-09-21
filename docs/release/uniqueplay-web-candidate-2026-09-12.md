# UniquePlay 최종 웹 후보 산출물

- 상태: BUILT_NOT_APPROVED_FOR_DEPLOYMENT
- 빌드 시각(UTC): 2026-09-12T13:57:09.910Z
- 소스 스냅샷 SHA-256: `7bcf7c9be11cdcea9abf2e51cee5b976dbc7535408b41b2c3c0a331c87003fa1`
- 스냅샷 파일 수: 293
- Hosting 파일 수: 47
- 파일 목록 manifest SHA-256: `df02971b4d690d6de790279a5d17bb0937d78e9f692d828cbbc76ef9242c31f0`
- 배포용 압축본: `/tmp/aubl-web-candidate.huP5xs/hosting-dist.tar.gz`
- 압축본 SHA-256: `7f3a405baa62f46c4b2a281645a0d0e97b993aec0a129e31af700bea5bde1810`
- 상세 증거: `/tmp/aubl-web-candidate.huP5xs`의 candidate.json, source-manifest.json, hosting-files.json, build.log

## 산출물 범위

현재 작업트리의 src·public·index.html·패키지 잠금 파일·Vite/TypeScript 설정과 OG 생성 스크립트를 임시 작업 디렉터리에 복사했다. 원래 dist는 변경하지 않았다. package.json의 npm run build로 Vite production 빌드 및 OG 정적 페이지 생성을 수행했다. 원본 환경 파일은 복사하지 않고 해석된 VITE 공개 웹 환경값만 프로세스에 전달했다. 보고서에 API 키·이메일 목록 등 값은 출력하지 않는다.

이것은 현재 웹 전체의 스냅샷이며 UniquePlay 변경만 분리한 패치 빌드가 아니다. 소스 manifest는 빌드 입력 식별이며 이전 운영 소스와의 diff를 뜻하지 않는다. Git 조회·커밋·push는 하지 않았다. 실제 출시에 포함되는 전체 변경 범위의 승인은 별도로 필요하다.

기존 node_modules를 빌드 시 연결해 사용했고 npm ci로 재설치하지 않았다. 잠금 파일은 스냅샷에 포함하지만 설치 상태와 잠금 파일이 완전히 같다는 검증은 하지 않았다. 후보 산출물 자체를 해시로 고정하며, 재빌드한 파일을 같은 승인 산출물이라고 간주하지 않는다.

## 고정한 공개 대상

- Firebase 프로젝트: `aubl-backup`
- Auth 도메인: `aubl-backup.firebaseapp.com`
- API: `https://api.aubl.club`
- 기록 실행 모드: production, 에뮬레이터 비활성
- App Check site key 설정 여부: false. 운영 강제 여부와 실제 로그인 성공은 별도 확인 대상이다.
- OG 기준 도메인: `https://aubl.club`, 올스타 정적 페이지 추가 생성 비활성

production 모드는 배포용 빌드 설정을 뜻하며 기록 엔진 전체의 운영 준비 완료를 뜻하지 않는다. Firebase Hosting 프로젝트를 NAS 백엔드의 실제 서비스 계정 프로젝트로 추정하지 않는다.

## 새로 확인한 배포 차단 항목

저장소의 .github/workflows/firebase-hosting-merge.yml은 main push 시 실행되고, 공개 Firebase 설정은 aubl-backup에서 읽지만 Hosting action의 projectId는 aubl-web-9a141이며 서비스 계정 secret 참조도 FIREBASE_SERVICE_ACCOUNT_AUBL_WEB_9A141이다. .firebaserc와 기존 수동 배포 기록은 aubl-backup을 가리킨다. 따라서 현재 workflow를 이번 후보의 승인된 배포 경로로 사용하지 않는다.

workflow 파일에서 배포 전용 environment 승인 게이트는 확인되지 않았다. 저장소의 외부 보호 규칙·secret 내용·실제 권한은 확인하지 않았으므로 게이트가 전혀 없다고 단정하지 않는다. main push/merge를 배포와 무관한 작업으로 취급하지 않는다. 이 단계에서 workflow나 secret은 수정하지 않았다.

다음 작업은 Hosting 대상 통일, 사용 가능한 서비스 계정 secret과 권한 확인, 명시적 수동 승인 배포 경계 설계다. secret 이름만으로 실제 자격 증명의 프로젝트·권한을 단정하지 않으며, 존재가 확인되지 않은 새 secret으로 자동 교체하지 않는다.

## 검증과 배포 상태

빌드는 성공했지만 이번 단계에서 타입 검사·lint·UI/E2E·실제 로그인·운영 조회는 실행하지 않았다. 기존 8건 UI 시험과 워커 121건, V7/v25 왕복 결과가 이 전체 웹 번들의 회귀 검증을 대신하지 않는다. 빌드 경고는 build.log에 보존한다. Functions·Rules·Indexes·Storage·DB·Flutter·NAS 변경은 없으며 Hosting도 배포하지 않았다.

로컬 임시 산출물은 영구 보관본이 아니다. 승인된 보관 위치 확보, 전체 웹 변경 범위 승인, CI 불일치 해결 및 운영 실행 명세 완성 후에만 배포를 검토한다. 원래 workspace의 dist를 무심코 firebase deploy에 사용하지 않는다. 이번 후보는 별도 경로에 있다.
