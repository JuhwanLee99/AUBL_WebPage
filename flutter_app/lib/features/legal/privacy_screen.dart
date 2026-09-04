import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';

const _kSections = [
  _Section('1. 개인정보의 수집 항목 및 수집 방법', [
    '회원가입 시 수집 항목: 이메일 주소, 이름(소셜 로그인 시 제공되는 경우), 계정 고유 식별자(UID)',
    '서비스 이용 과정에서 자동 수집: 기기 식별 정보, 앱 버전, OS 종류 및 버전, FCM 푸시 토큰',
    '커뮤니티(건의/문의) 이용 시 수집 항목: 게시글/댓글 내용, 작성 시각, 작성자 식별 정보(UID, 표시명)',
    '신고/차단 기능 이용 시 수집 항목: 신고 사유 및 상세 설명, 신고자/대상자 식별 정보(UID, 표시명), 대상 콘텐츠 식별 정보(도메인/콘텐츠 ID/미리보기), 처리 상태 및 검토 이력(처리 시각·처리자·처리 메모)',
    '수집 방법: 이메일·비밀번호 회원가입 또는 Google/Apple 소셜 로그인을 통한 수집, Firebase Authentication 및 Firestore 서비스 이용 과정에서의 자동 생성·수집',
  ]),
  _Section('2. 개인정보의 수집 및 이용 목적', [
    '회원 식별 및 가입 의사 확인',
    '리그 경기 일정·결과·기록 조회 서비스 제공',
    '커뮤니티 게시글 작성·관리',
    '건의/문의 접수, 답변, 처리 상태 안내',
    '부적절 콘텐츠 신고 접수, 악성 사용자 차단 처리, 신고 건 운영 검토(원칙적 24시간 내) 및 위반 콘텐츠/계정 조치',
    '팀 공지사항 및 경기 알림(푸시 알림) 발송',
    '서비스 운영·유지·개선 및 오류 대응',
  ]),
  _Section('3. 개인정보의 보유 및 이용 기간', [
    '회원 탈퇴 시까지 보유하며, 탈퇴 요청 즉시 파기합니다.',
    '다만, 관련 법령에 의해 보존 의무가 있는 경우 해당 기간 동안 보관합니다.',
    '신고/차단 및 운영 처리 기록은 서비스 운영 정책 준수 확인, 분쟁 대응, 재발 방지 목적 범위에서 필요한 기간 동안 보관될 수 있습니다.',
    '전자상거래법에 의한 계약·거래 기록: 5년 (해당 시)',
    '통신비밀보호법에 의한 로그 기록: 3개월',
  ]),
  _Section('4. 개인정보의 제3자 제공', [
    '원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.',
    '다만, 이용자의 동의가 있는 경우 또는 법령에 의해 요구되는 경우에 한해 제공합니다.',
  ]),
  _Section('5. 개인정보의 처리 위탁', [
    'Firebase (Google LLC): 인증, 데이터 저장, 푸시 알림 서비스 운영',
    'Google Cloud Platform: 클라우드 함수 실행 및 데이터 처리',
    'Cloudflare, Inc.: API 보안 및 전송 최적화(리버스 프록시, CDN, WAF, DDoS 방어)',
    'AUBL 운영 MariaDB 서버: 종료 경기 및 과거 시즌 기록 데이터 저장·조회 API 운영',
    '위탁 업체는 위탁 목적 범위 내에서만 개인정보를 처리하며, 계약 종료 시 파기합니다.',
  ]),
  _Section('6. 이용자의 권리와 행사 방법', [
    '이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있습니다.',
    '회원 탈퇴를 원하는 경우 앱 내 "더보기 → 계정 → 회원 탈퇴"에서 직접 처리하거나, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)를 통해 요청할 수 있습니다.',
    '개인정보 열람·정정·삭제·처리정지 요구 시 지체 없이 조치합니다.',
  ]),
  _Section('7. 개인정보의 파기 절차 및 방법', [
    '보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다.',
    '전자적 파일: 복구 불가능한 방법으로 영구 삭제',
    '서면 자료: 분쇄기로 분쇄 또는 소각',
  ]),
  _Section('8. 개인정보 보호를 위한 기술적·관리적 대책', [
    '전송 데이터 암호화(HTTPS/TLS)',
    'Firebase Security Rules를 통한 접근 제어',
    '관리자 계정 분리 및 최소 권한 원칙 적용',
    '정기적인 보안 점검',
  ]),
  _Section('9. 개인정보 보호책임자', [
    '책임자: 이주환 (AUBL 기록팀장)',
    '이메일: aublcau@gmail.com',
    '개인정보 관련 문의사항은 위 연락처로 문의해 주시기 바랍니다.',
  ]),
  _Section('10. 개인정보 처리방침의 변경', [
    '본 방침은 시행일로부터 적용되며, 변경 시 앱 내 공지 또는 웹사이트를 통해 사전 고지합니다.',
    '시행일: 2026년 3월 5일',
  ]),
];

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('개인정보 처리방침')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final outerInset = constraints.maxWidth > 900
              ? (constraints.maxWidth - 900) / 2
              : 0.0;
          return ListView(
            padding: EdgeInsets.fromLTRB(
              outerInset + 16,
              16,
              outerInset + 16,
              32,
            ),
            children: [
              const SeasonPageHero(
                eyebrow: 'PRIVACY POLICY',
                title: Text('개인정보 처리방침'),
                description:
                    '전국대학아마추어야구연합회(AUBL)는 개인정보 보호법을 준수하며, 이 방침은 모바일 앱과 웹 서비스에 적용됩니다.',
              ),
              const SizedBox(height: 16),

              // 섹션들
              for (final section in _kSections) ...[
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          section.title,
                          style: TextStyle(
                            color: context.aublColors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                        for (final item in section.items)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '  \u2022  ',
                                  style: TextStyle(
                                    color: context.aublColors.muted,
                                    fontSize: 13,
                                  ),
                                ),
                                Expanded(
                                  child: Text(
                                    item,
                                    style: TextStyle(
                                      color: context.aublColors.muted,
                                      fontSize: 13,
                                      height: 1.7,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 16),
            ],
          );
        },
      ),
    );
  }
}

class _Section {
  const _Section(this.title, this.items);
  final String title;
  final List<String> items;
}
