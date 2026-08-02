# CoachX AI — 앱 릴리즈 가이드 (Coach / Student 두 앱)

이 저장소는 하나의 코드베이스에서 **두 개의 네이티브 앱**을 빌드합니다.

| 앱             | 번들 ID                   | 저장소 표시 이름         | 설치 대상       |
|----------------|---------------------------|--------------------------|-----------------|
| 코치 앱        | `com.coachxai.coach`      | **CoachX AI Coach**      | 코치·관리자      |
| 회원(학생) 앱  | `com.coachxai.student`    | **CoachX AI**            | 회원             |

빌드 변형은 `VITE_APP_VARIANT` 환경 변수로 선택합니다 (`coach` 또는 `student`).
값이 없으면 웹/개발 빌드로 취급되어 두 로그인 탭이 모두 표시됩니다.

---

## 1. 개발 흐름 (Dev)

```bash
# 웹 (기본 - 코치/회원 탭 둘 다 보임)
npm run dev

# 코치 앱만 실행 (탭 없이 코치 로그인만)
npm run dev:coach

# 회원 앱만 실행 (탭 없이 회원 로그인만)
npm run dev:student
```

---

## 2. 웹 빌드

```bash
npm run build            # dist-coach/, dist-student/ 두 개 모두 생성
npm run build:coach      # dist-coach/ 만
npm run build:student    # dist-student/ 만
```

---

## 3. 네이티브 앱 폴더 구조

```
native/
  coach/
    android/    # com.coachxai.coach
    ios/
  student/
    android/    # com.coachxai.student
    ios/
```

Capacitor CLI는 항상 루트의 `capacitor.config.ts`를 읽습니다.
`scripts/cap-run.mjs`가 실행 직전에 이 파일을 원하는 변형(`capacitor.coach.config.ts` 또는
`capacitor.student.config.ts`)으로 심볼릭 링크한 뒤, 실행 후 정리합니다.

---

## 4. 네이티브 앱 빌드/실행 명령

```bash
# 코치 앱
npm run cap:sync:coach          # web 빌드 → 네이티브 폴더로 복사
npm run cap:open:coach:ios      # Xcode 열기 (macOS 필요)
npm run cap:open:coach:android  # Android Studio 열기

# 회원 앱
npm run cap:sync:student
npm run cap:open:student:ios
npm run cap:open:student:android
```

플랫폼 재추가 (이미 폴더가 있으면 불필요):

```bash
npm run cap:add:coach:android
npm run cap:add:coach:ios
npm run cap:add:student:android
npm run cap:add:student:ios
```

---

## 5. 최초 실전 배포 체크리스트

### 공통
- [ ] `.env` / CI에 `VITE_API_BASE_URL`, `GEMINI_API_KEY` 등 프로덕션 값 세팅
- [ ] `capacitor.*.config.ts`의 `server` 블록에 개발용 `url`이 남아있지 않은지 확인 (프로덕션에서는 비워둘 것)
- [ ] 각 앱의 아이콘·스플래시 교체
    - Android: `native/<variant>/android/app/src/main/res/mipmap-*/ic_launcher*.png`
    - iOS:     Xcode → App → `Assets.xcassets/AppIcon` 및 `Splash`

### Android 서명 키 (Play Console 업로드용)
```bash
# 두 앱 각각 별도 키스토어를 사용하세요.
keytool -genkey -v \
  -keystore ~/coachxai-coach.keystore \
  -alias coachxai-coach -keyalg RSA -keysize 2048 -validity 10000

keytool -genkey -v \
  -keystore ~/coachxai-student.keystore \
  -alias coachxai-student -keyalg RSA -keysize 2048 -validity 10000
```

각 `native/<variant>/android/app/build.gradle`에 `signingConfigs.release`를 추가하고,
`android { buildTypes { release { signingConfig signingConfigs.release } } }` 설정.
키스토어 자체는 절대 커밋하지 마세요 (`.gitignore` 확인).

AAB 빌드:
```bash
cd native/coach/android && ./gradlew bundleRelease
# 산출물: app/build/outputs/bundle/release/app-release.aab

cd native/student/android && ./gradlew bundleRelease
```

### iOS (Xcode / macOS 필요)
1. `npm run cap:open:coach:ios` (또는 student)
2. Xcode → Signing & Capabilities → Team 선택, Provisioning Profile 자동 관리
3. Product → Archive → Distribute App → App Store Connect
4. TestFlight 심사 후 스토어 심사

### 스토어 등록
| 항목              | 코치 앱 (com.coachxai.coach)     | 회원 앱 (com.coachxai.student) |
|-------------------|----------------------------------|--------------------------------|
| App Store Connect | 새 앱 등록 (별도 App ID)         | 새 앱 등록 (별도 App ID)       |
| Play Console      | 새 앱 등록                       | 새 앱 등록                     |
| 스크린샷 6.7"/5.5" | 코치 대시보드 위주                | 회원 대시보드 위주              |
| 개인정보 처리방침 | 필수 링크                        | 필수 링크                       |
| 심사 대상 계정    | 코치 테스트 로그인 제공          | 회원 테스트 로그인 제공        |

### 유료 결제 (인앱)
- 현재 코드베이스는 `@tosspayments/tosspayments-sdk`(웹결제) 기반입니다.
- **iOS App Store 정책**: 앱 내 디지털 재화·구독 결제는 반드시 Apple IAP 사용 필요.
  외부 웹결제(Toss)는 원칙적으로 거절 가능성이 높습니다.
    - 옵션 A: 유료 기능은 웹에서만 결제하고, 앱은 로그인 후 이용만 가능한 구조로 심사 통과
    - 옵션 B: Apple IAP + Google Play Billing 추가 구현 후 심사
- Play Store도 유사 정책(Play Billing) 존재. 국내 결제 예외 조항 확인 필요.

---

## 6. 역할 게이팅 동작

`utils/appVariant.ts`가 각 빌드의 허용 역할을 정의합니다:

| 변형          | 허용 역할                                     | 로그인 화면          |
|---------------|-----------------------------------------------|----------------------|
| `coach`       | `COACH`, `ADMIN`, `BRANCH_ADMIN`              | 코치 로그인만 노출   |
| `student`     | `CLIENT`                                      | 회원 로그인만 노출   |
| 미설정 (웹)   | 모두                                          | 탭 스위처 노출        |

잘못된 앱에서 로그인 시도 시 알림 후 로그아웃 처리되며, 이전에 저장된
세션이 앱 변형과 일치하지 않으면 앱 시작 시 자동으로 로그아웃됩니다.

---

## 7. 개발 편의 팁

- 심볼릭 링크 정리가 되지 않은 상태(스크립트 강제 종료 등)로 `capacitor.config.ts`가
  남아 있을 수 있습니다. 다음 명령으로 삭제하세요:
  ```bash
  rm -f capacitor.config.ts
  ```
- 두 앱의 웹 빌드는 완전히 동일한 코드에서 나옵니다.
  차이는 `import.meta.env.VITE_APP_VARIANT` 값 하나뿐입니다.
