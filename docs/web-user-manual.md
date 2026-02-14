# AUBL Web User Manual

원문: https://docs.google.com/document/d/e/2PACX-1vRYQNkS6wuqoYWokWN_rnPpmZuWLHcNyn_j5K5Vhw3g8voduO20VMJYFH_3FTjW9Whgk7nxywV8ps_9/pub  
동기화 날짜: 2026-02-13  
비고: 이미지 링크는 Google Docs 공개 이미지 URL을 사용합니다.

---

# 📘 AUBL 웹 플랫폼 사용 설명서

본 문서는 AUBL(Amateur University Baseball League) 웹 플랫폼을 이용하는 방문자(Guest), 일반 회원(Member), 관리자(Admin)를 위한 기능별 가이드입니다.

---

## 1. 👥 방문자 (Guest) 가이드

대상: 로그인을 하지 않은 모든 일반 사용자

권한: 모든 공개 정보 열람, 경기 승부 예측 조회, 중계 화면 시청

### 1-1. 메인 및 리그 정보

AUBL의 소식을 가장 먼저 접하는 공간입니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXf3r0ARbx3dcO0kdtXZCteurdGF9LipUElOaxLigJGl71v-fhPqNCWpae5sctuAvNV-rn-uE-lkw-8kjJ9rQI_Fvrwh0Gv2TU9KGXOR7QGdsLWOof17MRUx4NnZevvakVHNnm9WWA5CDdRC58Nz6Kbz?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXehuJtDWYwV6G0K6RvJJXgghmHaeY3j5DCdcDBGhz5AYVaa1ieEErqGwnvoCw7ESy_jCCP8ThhwnHpNwa3nwfsDHM-YCV2VOLwfTDYZKLXwYyKAM55RoAJDqFLXGCPbDhI8-E-cAKaK181e5VnZjc3m?key=B-oY9nAYO_WLDNm-jnDPFA)

-   랜딩 페이지 (/): 최신 리그 뉴스, 공지사항, 하이라이트 영상을 한눈에 확인할 수 있습니다.
-   리그 소개 (/league): AUBL 리그의 역사, 규정, 운영진 정보를 열람할 수 있습니다.

### 1-2. 경기 일정 및 결과 확인

리그의 흐름을 파악하고 경기 결과를 조회합니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcSYFoS6fqbM1uAyyklzor8u9IW0Rgt4iAqPNvOO6F8i8XNTeWUdDBpwKk1PRp9qkqESlAd9P8shWguGZKsR3IdlQc4GHgtfseFUsm0OoihS2putgplFBecbLs_FWN9zT2F7bBzxWbl0a8XdrQSEFbu?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXf4YTWVG-lnW_EaVdJT7u2Dlb75gITqmma9TNvUwOmji4SqcJ-uct8MlCjeEQpRwLOJcSVD8JrBSsbt4Cq7mOL_EwujeJp98jfb_Tj_W6UoVqTqfTdICv_jF09qk3p0lFIyPFX7lTO9JvQwwKhGUlC0?key=B-oY9nAYO_WLDNm-jnDPFA)

-   조별 현황 (/group): 각 조(Group)별 팀 리스트와 현재 순위를 확인합니다.
-   경기 일정 (/schedule): 앞으로 예정된 경기 일정을 확인하고, 구장 및 시간을 체크할 수 있습니다.
-   경기 결과 (/schedule/results): 종료된 경기의 스코어와 상세 기록을 조회합니다.

### 1-3. 순위 및 기록실 (개발중)

팀과 선수의 상세한 기록을 분석합니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdpn42iCJHLEbUcq1hbrEgUM_dMM4-AvI15bKu4vpcYmvyOnwaV6xJ4aFlavY4cEGk6ss8pGcKUplQy6PukiXqblTAs2JxsuGtulNbbNmJffAKnToSKc6Dmo_2OQVnh-1QTKtnwZW1QdgTJsMABEM1L?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcvJA1Z7XeVtLixp5XDM8wrJAfqzyhHoeWzCMv6Y36MKxlWtXQlRMs7SwS_GWz0OeYbClEEpPojBqI6q-BrtQvvR_tM-HYFxQQt5ZWiBVtRTGWrZWUWmI1bI2PONiEVdQeqI2iNi3qaKEwFQsqFp611?key=B-oY9nAYO_WLDNm-jnDPFA)

-   순위표 (/progress): 정규 시즌 팀 순위, 승률, 게임차 등을 실시간으로 확인합니다.
-   개인 기록실: 타자/투수 부문별 TOP 플레이어와 상세 스탯을 조회할 수 있습니다.

-   타자 기록: 타율, 홈런, 안타, 타점 등
-   투수 기록: 방어율, 다승, 탈삼진 등

-   팀/선수 상세: 특정 팀이나 선수를 클릭하여 통산 기록과 최근 경기 퍼포먼스를 확인합니다.

### 1-4. 승부 예측 (/prediction) (개발중)

ML / AI 데이터를 기반으로 경기 결과를 미리 예측해 봅니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXclzBm8VlXEiG22MVaj4MhJj_ncacOvgQpnU6cZ4o4EBykfMEB8FXdANJ25NbEzJM6daJvRkIXjs80W3c7OS7F3TWK-tWHW6L6YlSxraJLtQFFDDnucuAM8n5e8M4dVWM2_v4nqIEmrVk7xgimhAcQ?key=B-oY9nAYO_WLDNm-jnDPFA)

-   AI 승부 예측: Elo Rating과 머신러닝 모델이 분석한 다가오는 경기의 승리 확률을 확인합니다.
-   전력 비교: 양 팀의 전력 분석 데이터를 그래프와 수치로 비교해 볼 수 있습니다.

### 1-5. 경기 중계 시청

경기장에 가지 못해도 실시간으로 경기를 관람합니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfJSVVyIcHsY1x7A_z9k6UdAlYxKqhGZq7oZ9RTVYzdWEosGC70q2ooCW6AK8bPd-FImoNVg-PGph0pDyESKgK210_ain-ZT17_60OOtDtRRn8X4vfbsLoVy7dHzR8C9bIgHWNYt6w9h9TiJ3RahAA?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcgN9yUZHwD_K9BAFkKA3dJMn9uC5Ae-wo5WK3PJKCUY5aOWeQrWS4fI6Pe8M4TW4h_W9ok2Hc4KYZybIsv3iZA8NmWIM1nkRmik4BJ5hapfD8bM5957hECew1QtJM9xQb2FyVVaGPXsM5Z7N_u0O0h?key=B-oY9nAYO_WLDNm-jnDPFA)

-   스코어보드 (/scoreboard): 진행 중인 경기의 실시간 점수판을 볼 수 있습니다.
-   라이브 오버레이 (/scoreboard/live): 유튜브 중계 영상과 실시간 기록 데이터가 결합된 중계 화면을 시청할 수 있습니다. (모바일 가로 모드 지원)
-   문자 중계 (/scoreboard-text): 영상 시청이 어려울 때 텍스트로 실시간 경기 상황을 파악할 수 있습니다.

---

## 2. 👤 일반 회원 (Member) 가이드

대상: 회원가입 후 로그인한 사용자 (선수, 팀 관계자 등)

권한: 방문자 권한 전체 + 커뮤니티 활동 + 내 정보 관리

### 2-1. 로그인 및 계정 관리

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfQxcEmvfRcdu-yOcETwC47serXJlRpVAxhVg0Y0XK61vA-c3npgQDFdWRNRn4jzXG7Y3_-fBt8NEslrUDtUPhd9Inh8td086A7goZcgs44dF1u6JzTB_Da3o1XSxDECKdw4ZPYn_zuKN_GWFMz5-V5?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeejZNJZ8U036klplmVGLYXLgvbicpJ6E7WsJgAQSUmxXKxJljFvR_6dK_PY_hPZCLA6ik4omEdqcaxqVA1KfMROXgISXHBkkAQ-AXdm6OzANNz5MLNLVH-RcNrL_HvwwlzxHBYBUs9mQ6qSV4VsbPE?key=B-oY9nAYO_WLDNm-jnDPFA)

-   로그인/회원가입 (/login): 이메일 또는 소셜 계정(구글 등)을 통해 로그인합니다.
-   마이페이지 (/account): (개발중)

-   프로필 수정: 닉네임, 소속 팀 정보를 수정합니다.
-   내 기록 보기: 본인이 선수로 등록된 경우, 자신의 시즌 성적을 바로 확인할 수 있습니다.

### 2-2. 커뮤니티 이용 (/community)

AUBL의 소통과 공식 소식을 접할 수 있는 통합 공간입니다. 커뮤니티 페이지는 크게 갤러리와 공지사항 두 가지 영역으로 나뉩니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcJlUBP-kDAtDxqL0FE4QxCdJM-ykpNDZqa_Jty492wW1h5Liu2P1MGv6kqNRhhiPFF8dwiPUifcO1w17tqrxNv42H7QyTrx2uAdbqFs1fy_0CgyncRZ7PfLOvujof2jnK1XsMRDuz6Reg_jePDjPk8?key=B-oY9nAYO_WLDNm-jnDPFA)

-   AUBL 갤러리 (좌측 /community/gallery)

-   미리보기: 커뮤니티 메인에서 최신 글 목록을 빠르게 훑어볼 수 있습니다.
-   전체보기: '전체보기'를 클릭하면 DC인사이드 AUBL 갤러리가 포함된 전체 화면으로 이동합니다.
-   활동: 자유로운 게시글 작성, 댓글 달기 등 팬들과의 소통은 이곳에서 이루어집니다.

-   공지사항 (우측 /community/notices)

-   공식 알림: 리그 운영진이 전하는 공식적인 소식(경기 일정 변경, 징계, 긴급 공지 등)을 확인합니다.
-   카테고리 구분: 일반 / 징계 / 경기공지 / 긴급 태그를 통해 공지의 성격을 쉽게 파악할 수 있습니다.
-   상세 보기: 공지사항 제목을 클릭하면 상세 내용을 열람할 수 있습니다. (일반 회원은 열람만 가능)

---

## 3. 🛡️ 관리자 및 기록원 (Admin/Scorer) 가이드

대상: 리그 운영진 및 공식 기록원

권한: 일반 회원 권한 전체 + 데이터 관리 + 전자 기록지 작성

### 3-1. 관리자 대시보드 (/admin)

리그 운영을 위한 통합 관리 페이지입니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfpA2NpPBFbjrlof-VzaaSwCdnP9sKia6_8rKPYJRcxyLmF46Z_yuB4LlA_y_KCpMOz-rewuVN_z2mHlhL0oBS4AID-ymrl9-CWWENRe8yeMxMHbQO2sArxiRDlPTbAKx9zZEqi4NPQQiZ88cW2UJQ6?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXcyt59tGzpOMa22Uzy-94sazUTCXM9ppd9t5JPprYySOT1PgmfxdnrvqDLsLYpH3a4horETKpmiI33SVDWK_oGE8UdWfEhluyf3dVAIi1daifNMmcPsvIKRTMFnJ2ccUxcIyz9n4pfsNlfeAjhwQ-95?key=B-oY9nAYO_WLDNm-jnDPFA)

-   콘텐츠 관리 (CMS): 개발 지식 없이도 웹사이트 문구를 즉시 수정할 수 있습니다.

-   LIVE INFO (Ticker): 메인 화면 상단에 흐르는 공지사항(뉴스 티커)을 줄바꿈으로 구분하여 손쉽게 등록·수정합니다.
-   리그 소개 관리: '리그 소개' 페이지의 태그라인, 히어로 섹션 문구, 연혁(History), 거버넌스 등의 텍스트를 미리보기(Preview)와 함께 실시간으로 편집합니다.
-   팀 소개 관리: 각 팀의 소개 문구, 배지, 조 편성(Group) 정보를 관리자 페이지에서 직접 업데이트합니다.

-   팀/선수 DB 관리: (순차 업데이트 예정) 신규 팀 등록 및 로스터 관리 기능을 준비 중입니다.

### 3-2. 경기 일정 관리 (/admin/schedule)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXfRBgy11yvbFm8zrf582xDN2RJfBHe2M3iYWk5n6BXGpRYAQbfG_sCb1Y168cOYUpuOTz01A8zIjqkECaCNFXz5h5mAtqCFalt9QnxnpYofTS5Mq2Z9tnBDsrz9Fw89xm_tmr9k-jOr_gapEs6pkyyM?key=B-oY9nAYO_WLDNm-jnDPFA)

-   일정 생성/수정: 시즌 경기 일정을 생성하거나, 우천 취소 등으로 인한 일정을 변경합니다.
-   경기 상태 변경: 경기를 '예정', '진행 중', '종료' 상태로 변경하여 라이브 스코어보드에 반영되게 합니다.

### 3-3. 공지사항 작성 및 관리 

관리자(Admin) 권한을 가진 계정은 커뮤니티 내 공지사항 게시판에 공식 글을 등록할 수 있습니다.

-   작성 메뉴 진입:

-   커뮤니티 > 공지사항 더보기를 클릭하여 공지사항 목록 페이지( /community/notices )로 이동합니다.
-   페이지 우측 상단에 노출되는 파란색 [글쓰기] 버튼을 클릭합니다. (관리자에게만 보임)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdGom-nB69iSprxYugFxPwqS5ghmQr4aaRvRUprdVoxHePAo5KZKHVr8nARRqadGv9B7jHngL9MsGzVZJvlOOZoGrRI83bii96DPwcYb-cocfReDIy4frmEk9jojjhwu4JxbePTx_YYkhglJ_QvRMzS?key=B-oY9nAYO_WLDNm-jnDPFA)

-   공지사항 작성:

-   분류 선택: 글의 성격에 맞는 카테고리(일반, 경기공지, 징계, 긴급)를 선택합니다. '긴급'이나 '징계' 선택 시 목록에서 색상이 강조됩니다.
-   내용 입력: 제목과 본문을 작성하고 [등록하기]를 누르면 즉시 반영됩니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdxqMEvTynWA56rqmOHGQzaHiBswDLmLtuASdC4TzZTPv_fQ_iStJAxIHXC3_2NGqgO6p-SR9NnSWc7CKxJfdjVOJWMG3dSeATsC9v2ZUsJLjmEVLKaTimyNKWx43YsHazbxNxiGiSCOjdvWX_AfhI1?key=B-oY9nAYO_WLDNm-jnDPFA)

### 3-4. 전자 기록지 작성 (/scorekeeper)

[중요] 이 페이지는 PC 또는 태블릿(가로 모드) 환경 사용을 권장합니다.

#### ① 경기 선택 및 라인업

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXe5X8B5WQtsO4hoUqKBnqZUBeOHF-zVqsP8dAS-ChdImwcDAO6mxivz9tA761T4s_fQ2Qrsz70RKKwYNG9Kipj0Le0e8-8j4Wh2Terf0y04QOIB9qEDMwPtVamxhlgbo8nnG-mw8rL-K_ADr7gAxWko?key=B-oY9nAYO_WLDNm-jnDPFA)

-   경기 선택: 오늘 예정된 경기를 불러옵니다.
-   라인업 입력: 양 팀의 선발 라인업과 수비 위치를 입력합니다.

#### ② 플레이 기록 (메인 인터페이스)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeOQvJlZfBJL-5GPpFKzpzpVaRDjfhNxyXbvmRpRrYusvRr2wuI71hYyQwiTxKkT2XMyXlLjbAiy6zwH5DKA1Iystxn4vbNUXxKZ5O97T4j94zw36P41l8S4ZHIrqpsGiH-ENKvxgKp78OGXFFaTU4?key=B-oY9nAYO_WLDNm-jnDPFA)

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXeOQvJlZfBJL-5GPpFKzpzpVaRDjfhNxyXbvmRpRrYusvRr2wuI71hYyQwiTxKkT2XMyXlLjbAiy6zwH5DKA1Iystxn4vbNUXxKZ5O97T4j94zw36P41l8S4ZHIrqpsGiH-ENKvxgKp78OGXFFaTU4?key=B-oY9nAYO_WLDNm-jnDPFA)

-   볼카운트: 볼/스트라이크/아웃 버튼을 눌러 카운트를 조작합니다.
-   타격 결과: 안타, 2루타, 홈런, 땅볼, 뜬공 등 타구 결과를 아이콘으로 선택합니다.
-   상세 상황: 수비 실책, 야수 선택, 주자 진루/도로/견제사 등 복잡한 상황을 팝업 메뉴에서 선택하여 기록합니다.

#### ③ 락 시스템 및 경기 종료

-   기록원 락(Lock): 여러 기록원이 동시에 접속할 경우 데이터 충돌을 막기 위해, 한 명이 기록 권한을 점유(Lock)합니다.
-   경기 종료: 경기가 끝나면 [경기 종료 & CSV 다운로드] 버튼을 눌러 데이터를 서버에 저장하고 기록지 파일을 내려받습니다.

④ 편의 기능 추가:

-   키보드 단축키: 마우스 없이도 빠른 입력이 가능합니다.  (키보드 1: 볼, 2: 스트라이크,             3: 타격 메뉴, 4: 실행 취소, 5: 파울)
-   경기 시간 타이머: 경기 제한 시간(예: 120분)을 설정하고 타이머를 시작/일시정지하여 잔여 시간을 실시간으로 체크할 수 있습니다.
-   문자 중계: 기록실 내 채팅창을 통해 관전자를 위한 텍스트 해설을 즉시 송출할 수 있습니다.
-   연습경기: 일정추가 페이지에서 연습경기로 경기를 추가하면 타자 라인업을 9명 이상으로 설정 가능하고, 정규시즌 기록에 추가되지 않습니다.

### 3-5. 라이브 방송 제어

기록원에서 입력하는 데이터는 즉시 /scoreboard 및 /scoreboard/live 페이지에 반영됩니다.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXdvd7uTlzjlXhbx08BP_XrHu_2H7uzRJpa4b1ALDeloMxRNKtP4IhLwvVQqtLj2TYA9ob6KJe54ku1H1WRt6gl3ZVqyUwcgQx4ar2IWX6kCSYq0FowgAbEYWQO2m1tb9BSCXw8vJcqWIIpJWlaPptA?key=B-oY9nAYO_WLDNm-jnDPFA)

-   문자 중계 입력: 기록지 페이지 내 '문자 중계' 창에 코멘트를 입력하면, 시청자들에게 실시간 텍스트 해설이 송출됩니다.
