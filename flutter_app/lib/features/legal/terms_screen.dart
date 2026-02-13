import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

const _kSections = [
  _Section('제1조 (목적)', [
    '본 약관은 전국대학아마추어야구연합회(이하 "AUBL")가 제공하는 모바일 앱 및 웹 서비스(이하 "서비스")의 이용 조건과 절차, 회원과 AUBL의 권리·의무를 규정함을 목적으로 합니다.',
  ]),
  _Section('제2조 (정의)', [
    '"서비스"란 AUBL이 운영하는 모바일 앱(iOS/Android) 및 웹사이트를 통해 제공하는 경기 일정·결과 조회, 실시간 문자중계, 기록 열람, 커뮤니티, 푸시 알림 등 일체의 서비스를 말합니다.',
    '"회원"이란 본 약관에 동의하고 이메일·비밀번호 또는 Google 계정을 통해 가입한 이용자를 말합니다.',
    '"비회원"이란 회원 가입 없이 서비스의 일부를 이용하는 자를 말합니다.',
  ]),
  _Section('제3조 (약관의 효력 및 변경)', [
    '본 약관은 서비스 내 게시하거나 기타 방법으로 회원에게 공지함으로써 효력이 발생합니다.',
    'AUBL은 합리적인 사유가 있는 경우 약관을 변경할 수 있으며, 변경 시 시행일 7일 전에 앱 내 공지 또는 웹사이트를 통해 사전 고지합니다.',
    '변경된 약관에 동의하지 않는 경우 회원 탈퇴를 할 수 있으며, 고지 후 7일 이내 탈퇴하지 않은 경우 동의한 것으로 간주합니다.',
  ]),
  _Section('제4조 (회원 가입 및 탈퇴)', [
    '회원 가입은 이메일·비밀번호 등록 또는 Google 계정을 통한 소셜 로그인으로 이루어지며, 가입 시 본 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.',
    '회원은 언제든지 앱 내 "더보기 → 계정 관리"에서 탈퇴를 요청할 수 있으며, 탈퇴 시 개인정보는 즉시 파기됩니다.',
    '탈퇴 후에도 커뮤니티에 작성한 게시글은 삭제되지 않을 수 있으며, 삭제를 원하는 경우 탈퇴 전에 직접 삭제하거나 별도 요청해야 합니다.',
  ]),
  _Section('제5조 (서비스의 제공 및 변경)', [
    'AUBL은 다음 서비스를 제공합니다: 경기 일정·결과 조회, 실시간 문자중계, 선수 기록 열람, 커뮤니티(공지·갤러리), 팀 관리, 푸시 알림.',
    '서비스의 내용은 운영상·기술상 필요에 따라 변경될 수 있으며, 주요 변경 시 사전 공지합니다.',
    '서비스는 무료로 제공되며, 향후 유료 서비스 도입 시 별도 고지 후 동의를 받습니다.',
  ]),
  _Section('제6조 (서비스의 중단)', [
    '시스템 점검, 설비 교체, 통신 장애, 천재지변 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다.',
    'AUBL은 비영리 대학생 단체로 운영되며, 운영 여건에 따라 서비스가 종료될 수 있습니다. 이 경우 30일 전 사전 고지합니다.',
  ]),
  _Section('제7조 (회원의 의무)', [
    '회원은 관련 법령, 본 약관, 서비스 이용 안내 등을 준수해야 합니다.',
    '다음 행위를 금지합니다: 타인의 개인정보 도용, 허위 정보 등록, 서비스 운영 방해, 욕설·비방·음란물 게시, 상업적 광고 게시, 서비스의 무단 크롤링·스크래핑.',
    '위반 시 AUBL은 사전 통지 없이 서비스 이용을 제한하거나 회원 자격을 박탈할 수 있습니다.',
  ]),
  _Section('제8조 (게시물의 관리)', [
    '회원이 작성한 게시물의 저작권은 해당 회원에게 귀속됩니다.',
    'AUBL은 다음에 해당하는 게시물을 사전 통지 없이 삭제하거나 비공개 처리할 수 있습니다: 관련 법령 위반, 타인의 권리 침해, 공공질서·미풍양속 위반, 서비스 운영 정책 위반.',
    '경기 기록·통계 데이터는 AUBL에 귀속되며, 서비스 운영 목적으로 활용됩니다.',
  ]),
  _Section('제9조 (책임의 제한)', [
    'AUBL은 비영리 대학생 단체로서 서비스를 "있는 그대로(AS-IS)" 제공하며, 서비스의 완전성·정확성·신뢰성을 보증하지 않습니다.',
    '천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.',
    '회원 간 또는 회원과 제3자 간의 분쟁에 대해 AUBL은 개입할 의무가 없습니다.',
  ]),
  _Section('제10조 (준거법 및 분쟁 해결)', [
    '본 약관은 대한민국 법률에 의하여 규율됩니다.',
    '서비스 이용과 관련하여 분쟁이 발생한 경우 양 당사자 간 원만한 합의를 위해 노력하며, 합의가 이루어지지 않는 경우 민사소송법상의 관할 법원에서 해결합니다.',
    '서비스 관련 문의: aublcau@gmail.com',
  ]),
  _Section('부칙', [
    '본 약관은 2026년 2월 21일부터 시행합니다.',
  ]),
];

class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('이용약관')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 헤더
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF0a1a3f), Color(0xFF0f2f8f)],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.slate500.withValues(alpha: 0.25)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.blue400.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppTheme.blue400.withValues(alpha: 0.35)),
                  ),
                  child: const Text(
                    'TERMS OF SERVICE',
                    style: TextStyle(
                      color: Color(0xFFbfdbfe),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  '이용약관',
                  style: TextStyle(
                    color: Color(0xFFf1f5f9),
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '전국대학아마추어야구연합회(AUBL) 서비스 이용에 관한 약관입니다. '
                  '서비스를 이용함으로써 본 약관에 동의한 것으로 간주됩니다.',
                  style: TextStyle(
                    color: AppTheme.slate400,
                    fontSize: 13,
                    height: 1.7,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 섹션들
          for (final section in _kSections) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.slate800.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.slate700.withValues(alpha: 0.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    section.title,
                    style: const TextStyle(
                      color: Color(0xFFe2e8f0),
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
                          const Text('  \u2022  ',
                              style: TextStyle(color: AppTheme.slate500, fontSize: 13)),
                          Expanded(
                            child: Text(
                              item,
                              style: const TextStyle(
                                color: AppTheme.slate400,
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
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _Section {
  const _Section(this.title, this.items);
  final String title;
  final List<String> items;
}
