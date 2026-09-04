# Flutter env 전략

현재 `dev/stage/prod`는 동일한 운영 URL(`https://aubl.club`)을 사용합니다.

이 디렉터리에는 비밀값이 아닌 공개 엔드포인트만 저장하며 앱 빌드의 재현성을
위해 Git으로 관리합니다. API 키, 서비스 계정, 서명 정보는 추가하지 않습니다.

- 목적: 빌드별 동작 분기는 `AUBL_ENV` 값으로 하고, `AUBL_BACKEND_API_URL`을 포함한 엔드포인트를 빌드 입력으로 명시
- 운영 원칙: 스토어 배포 빌드는 반드시 `--dart-define-from-file=env/prod.json` 사용
- 확장 계획: 스테이징 인프라가 준비되면 `stage.json`의 `AUBL_WEB_BASE_URL`/`AUBL_AUTH_BRIDGE_URL`만 분리

## 릴리즈 명령 예시

```bash
cd flutter_app
flutter build appbundle --release --dart-define-from-file=env/prod.json
flutter build ipa --release --dart-define-from-file=env/prod.json
```
