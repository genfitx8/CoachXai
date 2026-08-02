# CoachX AI — Android/iOS 상세 배포 가이드

두 앱(코치 앱 `com.coachxai.coach` / 회원 앱 `com.coachxai.student`)을
스토어에 올리기 위한 처음부터 끝까지의 절차입니다.

---

## 0. 전체 흐름 한눈에

```
[사전 준비]                     [Android]                       [iOS]
                                    │                              │
계정 만들기 ────────────────────►│ Google Play Console          │ Apple Developer
개발 도구 설치 ──────────────────│ Android Studio               │ Xcode (macOS 필수)
                                    │                              │
로컬 테스트 ────────────────────►│ 에뮬레이터/실기기 실행         │ 시뮬레이터/실기기 실행
                                    │                              │
서명·번들 ID 세팅 ──────────────►│ Keystore 2개 생성            │ App ID 2개 등록
                                    │                              │
스토어 앱 등록 ──────────────────►│ 앱 2개 생성 (내부 테스트)     │ App Store Connect 앱 2개
                                    │                              │
빌드 업로드 ────────────────────►│ AAB 업로드                    │ Archive → TestFlight
                                    │                              │
심사·출시 ──────────────────────►│ 정식 출시                     │ App Review → 정식 출시
```

**첫 유료 서비스 출시까지 걸리는 현실적 시간**: 
- Android: 계정 승인 후 심사까지 보통 **3-7일**
- iOS: Apple Developer 가입 하루 + App Review **1-3일**

---

## 1. 사전 준비 (돈·계정)

### 1-1. 유료 계정
| 스토어 | 비용 | 링크 | 소요 시간 |
|---|---|---|---|
| Apple Developer Program | **$99/년** | https://developer.apple.com/programs/enroll/ | 1-2일 (신원 확인) |
| Google Play Console | **$25 일회성** | https://play.google.com/console/signup | 즉시 |

두 계정 모두 **개인 or 법인** 등록이 가능합니다. 사업자 등록 완료했다면 
법인/사업자로 등록하는 편이 세금 정산·환급에 유리합니다.

### 1-2. 개발 도구
| OS | Android 앱 빌드 | iOS 앱 빌드 |
|---|---|---|
| macOS | ✅ Android Studio | ✅ Xcode |
| Windows/Linux | ✅ Android Studio | ❌ 불가 |

**iOS 앱은 반드시 macOS + Xcode가 필요합니다.** Mac이 없다면:
- Mac Mini(중고 60-80만원대) 구매
- MacInCloud 등 클라우드 Mac 임대 (월 $30-)
- 지인/사무실 Mac 활용

---

## 2. 로컬에서 처음 실행해보기

내 컴퓨터에 브랜치를 가져옵니다:

```bash
git clone https://github.com/genfitx8/CoachXai.git
cd CoachXai
git checkout claude/app-development-wss9jy
npm install
```

### 2-1. 웹에서 먼저 UI 확인
```bash
npm run dev:coach    # http://localhost:3000 → 코치 로그인만
npm run dev:student  # http://localhost:3000 → 회원 로그인만
```

### 2-2. Android 에뮬레이터/실기기에서 확인

**Android Studio 설치**: https://developer.android.com/studio

첫 실행 시 SDK를 자동으로 받습니다.

```bash
# 코치 앱을 안드로이드에서 열기
npm run cap:sync:coach
npm run cap:open:coach:android
# → Android Studio가 열림
# → Device Manager로 에뮬레이터 만들기 (Pixel 6, API 34 권장)
# → 상단 초록색 ▶ 버튼으로 실행

# 회원 앱
npm run cap:sync:student
npm run cap:open:student:android
```

**실기기 사용**: USB로 폰 연결 → 폰에서 "USB 디버깅" 켜기 → 
Android Studio 상단 기기 목록에서 실기기 선택 → ▶

### 2-3. iOS 시뮬레이터/실기기에서 확인 (macOS 전용)

**Xcode 설치**: 앱스토어에서 "Xcode" 검색 (10GB+, 시간 오래 걸림)

```bash
# 최초 1회
sudo gem install cocoapods
cd native/coach/ios/App && pod install && cd -
cd native/student/ios/App && pod install && cd -

# 코치 앱을 iOS에서 열기
npm run cap:sync:coach
npm run cap:open:coach:ios
# → Xcode가 App.xcworkspace를 열음
# → 상단에서 시뮬레이터 선택 (iPhone 15 Pro 등)
# → ▶ 버튼으로 실행

# 회원 앱
npm run cap:sync:student
npm run cap:open:student:ios
```

**실기기 사용**: USB로 iPhone 연결 → 기기 신뢰 → Xcode → Signing에서 
Team(개인 Apple ID로도 가능) 선택 → ▶

---

## 3. Android 배포 절차

### 3-1. 앱 아이콘·스플래시 교체

Capacitor 기본 아이콘을 그대로 두면 심사 반려/브랜드 문제가 있습니다.

**아이콘 만들기**: 1024x1024 png 준비 후 https://icon.kitchen 또는 
https://easyappicon.com 에서 안드로이드용 세트 다운로드.

교체 위치: 
```
native/coach/android/app/src/main/res/mipmap-*/ic_launcher*.png
native/coach/android/app/src/main/res/drawable*/splash.png
native/student/android/app/src/main/res/mipmap-*/ic_launcher*.png
native/student/android/app/src/main/res/drawable*/splash.png
```

### 3-2. 서명 키스토어 생성 (앱마다 별도)

⚠️ **키스토어는 절대 잃어버리면 안 됩니다.** 잃어버리면 같은 앱으로 업데이트 불가능.
안전한 곳(비밀번호 관리자 + 클라우드 백업)에 보관하세요.

```bash
# 코치 앱 키스토어
keytool -genkey -v \
  -keystore ~/keystores/coachxai-coach.keystore \
  -alias coachxai-coach \
  -keyalg RSA -keysize 2048 -validity 10000

# 회원 앱 키스토어
keytool -genkey -v \
  -keystore ~/keystores/coachxai-student.keystore \
  -alias coachxai-student \
  -keyalg RSA -keysize 2048 -validity 10000
```

각 명령마다 물어보는 항목:
- Keystore password: **강력한 비밀번호** (기록해 두세요)
- 이름, 조직 등: 실제 사업자 정보
- Key password: keystore password와 같게 두는 게 편함

### 3-3. Gradle에 서명 설정 추가

`native/coach/android/keystore.properties` 파일 생성 (git에 커밋 금지):
```properties
storeFile=/Users/YOUR_NAME/keystores/coachxai-coach.keystore
storePassword=위에서_정한_비밀번호
keyAlias=coachxai-coach
keyPassword=위에서_정한_비밀번호
```

`native/coach/android/app/build.gradle` 상단에 추가:
```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

`android { ... }` 블록 안에:
```gradle
signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

회원 앱도 `native/student/android/`에 동일하게 반복 (파일명·alias만 student로).

### 3-4. 릴리즈 빌드 (AAB 파일 생성)

```bash
# 코치 앱
npm run cap:sync:coach
cd native/coach/android
./gradlew bundleRelease
# → 산출물: app/build/outputs/bundle/release/app-release.aab

# 회원 앱  
cd ../../../
npm run cap:sync:student
cd native/student/android
./gradlew bundleRelease
```

### 3-5. Google Play Console에서 앱 등록

https://play.google.com/console 접속 → **앱 만들기**

각 앱마다 (총 2번) 반복:
1. 앱 이름: `CoachX AI Coach` / `CoachX AI`
2. 기본 언어: 한국어
3. 앱 or 게임: 앱
4. 무료 or 유료: **처음엔 무료로 등록 후 인앱 결제**(추천)

등록 후 왼쪽 메뉴 **"앱 콘텐츠"**에서 다음 항목 모두 채우기:
- [ ] 개인정보처리방침 URL (필수)
- [ ] 앱 액세스 권한 (코치/회원 테스트 계정 제공)
- [ ] 광고 포함 여부
- [ ] 콘텐츠 등급 (설문 답변)
- [ ] 대상 사용자 및 콘텐츠
- [ ] 데이터 안전 (수집하는 정보 명시 — 이메일, 사진, 영상 등)
- [ ] 정부 앱 아님

**스토어 등록정보**:
- [ ] 스크린샷 최소 2장 (폰), 태블릿 옵션
- [ ] 512x512 아이콘
- [ ] 1024x500 그래픽 이미지 (피처그래픽)
- [ ] 앱 설명 (짧은 설명 80자, 자세한 설명 4000자)
- [ ] 카테고리: 스포츠 or 건강/운동

### 3-6. 내부 테스트로 먼저 업로드

**"테스트" → "내부 테스트" → 새 버전 만들기**
- 앞서 만든 `app-release.aab` 업로드
- 릴리즈 노트 작성
- 저장 → 검토 → 내부 테스트로 출시

**테스터 추가**: 이메일 목록에 본인·팀원 gmail 추가 → 초대 링크 발송
→ 링크에서 "테스터 되기" 클릭 → Play 스토어에서 앱 검색·설치

내부 테스트는 **심사 없이 즉시 설치 가능**하므로 여기서 완전히 확인 후 
프로덕션 출시로 넘기세요.

### 3-7. 프로덕션 출시

내부 테스트에서 만족스러우면 → **"프로덕션" → "새 버전 만들기"** → 
동일 AAB 사용 or 새 빌드 → 저장 → **검토 및 출시**

심사 소요: 대개 **1-3일**, 첫 앱은 신규 계정 검토로 최대 **7일**.

---

## 4. iOS 배포 절차 (macOS 필수)

### 4-1. Apple Developer에서 App ID 등록

https://developer.apple.com/account → **Certificates, IDs & Profiles**
→ **Identifiers** → **+** 버튼

각 앱마다 (총 2번):
1. **App IDs** → App → Continue
2. Description: `CoachX AI Coach` / `CoachX AI`
3. Bundle ID (Explicit): `com.coachxai.coach` / `com.coachxai.student`
4. Capabilities: **Push Notifications**, **Sign In with Apple**(사용 시) 체크
5. Continue → Register

### 4-2. Xcode에서 서명 설정

```bash
npm run cap:open:coach:ios
```

Xcode에서:
1. 왼쪽 트리 최상단 **App** 클릭
2. **Signing & Capabilities** 탭
3. **Automatically manage signing** 체크
4. **Team**: 본인의 Apple Developer 팀 선택
5. Bundle Identifier: `com.coachxai.coach` (자동으로 잡힘)

회원 앱도 동일하게 반복 (`com.coachxai.student`).

### 4-3. 아이콘·스플래시 교체

Xcode → 왼쪽 트리 **App/Assets.xcassets/AppIcon** 클릭
→ 각 슬롯에 크기별 png 드래그. (앞서 icon.kitchen에서 받은 iOS 세트 사용)

**Splash**: `Splash.imageset` 슬롯 3개에 splash 이미지 드래그.

### 4-4. App Store Connect에서 앱 등록

https://appstoreconnect.apple.com → **나의 앱** → **+** → **새로운 앱**

각 앱마다:
1. 플랫폼: **iOS**
2. 이름: `CoachX AI Coach` / `CoachX AI`
3. 기본 언어: 한국어
4. Bundle ID: 4-1에서 만든 것 선택
5. SKU: 임의(내부용 식별자, `coachxai-coach` / `coachxai-student`)

앱 정보에서 채워야 할 것:
- [ ] 개인정보처리방침 URL
- [ ] 카테고리: 스포츠 / 건강 및 피트니스
- [ ] 등급(연령 등급 설문)
- [ ] 저작권자
- [ ] 스크린샷: **6.7인치(iPhone 15 Pro Max)** 필수, iPad는 옵션
- [ ] 앱 설명 (한국어·영어)
- [ ] 심사용 계정 (테스트 로그인 정보) — **매우 중요**
- [ ] 심사 메모(코치 계정과 회원 계정이 각각 무엇을 볼 수 있는지 서술)

### 4-5. Archive → TestFlight 업로드

Xcode에서:
1. 상단 기기 선택을 **"Any iOS Device (arm64)"**로 변경
2. 메뉴 **Product → Archive**
3. 빌드 완료 후 Organizer 창이 뜸 → **Distribute App**
4. **App Store Connect** → **Upload** → Next → 옵션 그대로 → Upload

10-30분 후 App Store Connect의 **TestFlight** 탭에서 빌드가 잡힙니다.

### 4-6. TestFlight 내부 테스트

TestFlight → **내부 테스트** → 그룹 만들기 → 테스터 이메일 추가
→ 빌드 선택 → 테스터에게 초대 이메일

테스터는 iPhone에서 **TestFlight 앱** 설치 → 초대 이메일 링크 → 설치

### 4-7. App Review 제출

TestFlight로 검증 완료 → App Store Connect 왼쪽 **App Store** → 
버전 정보 채우기 → **심사 제출**

심사 소요: 일반적으로 **24-48시간**, 첫 앱은 최대 **1주일**.

---

## 5. 유료 결제 — 반드시 결정할 것

현재 코드베이스는 `@tosspayments/tosspayments-sdk`(웹결제)를 씁니다.
그런데 스토어 정책 상 이것만으로는 심사가 어려울 수 있습니다.

### Apple의 규칙
- **디지털 재화·구독**: 반드시 **In-App Purchase (IAP)** 사용, 
  수수료 15-30%. Toss 등 외부 결제로 대체 불가.
- **실물 재화, 오프라인 서비스**(예: 실제 대면 골프 레슨 예약): 
  외부 결제 허용, IAP 불필요.

CoachX AI는 코치와 회원을 연결하는 서비스이므로:
- **레슨 예약·오프라인 결제**만 다룬다 → Toss 그대로 유지 가능 (Apple 심사 통과)
- **AI 코칭 구독, 프리미엄 기능** 등 디지털 재화 판매 → **IAP 필수 병행**

### Google의 규칙
Google Play도 유사하나 국내 결제 특례가 있어 다소 유연합니다.
2024년부터 인앱 결제 강제 정책이 계속 조정 중이므로 최신 공지 확인 필요.

### 실전 권장
1. **첫 출시**는 결제 UI를 앱에서 숨기고 웹에서만 결제 유도 → 심사 리스크 최소화
2. 사용자 유입이 확인되면 IAP 통합 (별도 개발 필요, `@capacitor-community/in-app-purchase` 등)

---

## 6. 배포 후 관리 팁

- **버전 관리**: 새 빌드 올릴 때마다 `versionCode`(Android) / 
  `CURRENT_PROJECT_VERSION`(iOS)를 반드시 올려야 함. 낮으면 업로드 거절.
- **크래시 리포트**: Firebase Crashlytics 또는 Sentry 붙여두면 실사용자 이슈 감지 쉬움.
- **원격 콘텐츠 업데이트**: Capacitor 앱은 `dist-*/`를 새로 빌드해서 
  다시 스토어 심사 받아야 반영됩니다. 코드 수정이 잦다면 
  Capacitor Live Update 서비스도 고려.

---

## 7. 다음 스텝 체크리스트

- [ ] Apple Developer Program 결제 ($99)
- [ ] Google Play Console 결제 ($25)  
- [ ] 개인정보처리방침 페이지 배포 (필수 URL)
- [ ] 앱 아이콘·스플래시 이미지 교체 (2 앱 × Android/iOS = 4벌)
- [ ] 스크린샷 촬영 (2 앱 × iOS/Android)
- [ ] Android 키스토어 2개 생성·백업
- [ ] iOS App ID 2개 등록 (Apple Developer)
- [ ] 내부 테스트 → TestFlight로 실기기 검증
- [ ] 유료 결제 정책 결정 (Toss만 vs IAP 병행)
- [ ] 프로덕션 출시 → 스토어 심사 → 정식 오픈
