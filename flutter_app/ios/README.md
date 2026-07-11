Flutter SDK 설치 후 아래 명령으로 iOS 프로젝트 파일을 생성하세요.

```bash
cd flutter_app
flutter create . --platforms=android,ios
```

생성 후 `flutter_app/ios/Runner/GoogleService-Info.plist` 파일을 추가해야 Firebase가 동작합니다.
