import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final _fs = FirestoreService();
  Map<String, dynamic>? _content;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  Future<void> _loadContent() async {
    final data = await _fs.getStaticContent();
    if (mounted) {
      setState(() {
        _content = data;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    final intro = _content?['intro'] as Map<String, dynamic>? ?? {};
    final sections = intro['sections'] as List<dynamic>? ?? [];

    return CustomScrollView(
      slivers: [
        // ── 히어로 ──
        SliverToBoxAdapter(child: _buildHero(intro)),

        // ── 본문 ──
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── 회장 인사말 ──
                _buildChairmanMessage(),
                const SizedBox(height: 24),

                // ── 역사와 전통 ──
                _buildHistorySection(),
                const SizedBox(height: 24),

                // ── 조직 구성 ──
                _buildOrganizationSection(),
                const SizedBox(height: 24),

                // ── 리그 구조 & 규정 ──
                _buildLeagueStructure(),
                const SizedBox(height: 24),

                // ── 포스트시즌 ──
                _buildPostseason(),
                const SizedBox(height: 24),

                // ── 참가 팀 ──
                _buildParticipatingTeams(),
                const SizedBox(height: 24),

                // ── Firestore 커스텀 섹션 (아코디언) ──
                if (sections.isNotEmpty) ...[
                  _sectionTitle('추가 정보', Icons.article, AppTheme.slate300),
                  const SizedBox(height: 10),
                  ...sections.map((section) {
                    final sec = section as Map<String, dynamic>;
                    final title = sec['title'] as String? ?? '';
                    final body = sec['body'] as String? ?? '';
                    final items = sec['items'] as List<dynamic>? ?? [];

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: AppTheme.slate800,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ExpansionTile(
                        title: Text(title,
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w500)),
                        childrenPadding:
                            const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        children: [
                          if (body.isNotEmpty)
                            Text(body,
                                style: const TextStyle(
                                    color: AppTheme.slate300, fontSize: 13)),
                          ...items.map((item) {
                            if (item is String) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('• ',
                                        style: TextStyle(
                                            color: AppTheme.slate400)),
                                    Expanded(
                                      child: Text(item,
                                          style: const TextStyle(
                                              color: AppTheme.slate300,
                                              fontSize: 13)),
                                    ),
                                  ],
                                ),
                              );
                            }
                            return const SizedBox.shrink();
                          }),
                        ],
                      ),
                    );
                  }),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── 히어로 ──
  Widget _buildHero(Map<String, dynamic> intro) {
    final heroTitle = intro['heroTitle'] as String? ??
        '순수 아마추어 대학 야구의 46년 — 2026년, 중앙대학교(서울)와 함께 새로운 도약을 준비합니다.';
    final heroDescription = intro['heroDescription'] as String? ??
        '1981년 출범한 전국대학아마추어야구연합회(AUBL)는 엘리트 선수 중심이 아닌 '
            '일반 대학생들의 땀방울로 성장했습니다. 2026 시즌은 중앙대학교(서울)가 주최를 '
            '맡아 조별 예선과 으뜸·버금 토너먼트를 통해 리그의 전통과 혁신을 모두 보여줄 예정입니다.';

    const heroMetrics = [
      ('2026 HOST', '중앙대학교(서울)', '제46회 AUBL 운영'),
      ('참가 규모', '약 40개 대학', 'A~H조 조별 예선 후 으뜸·버금'),
      ('핵심 가치', '실시간 기록 · 중계 · 디지털화', '모바일 친화 기록/중계'),
    ];

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
          20, MediaQuery.of(context).padding.top + 16, 20, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0a1a3f), Color(0xFF0f2f8f), Color(0xFF0a1a3f)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -30,
            right: -30,
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.blue500.withValues(alpha: 0.14),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -20,
            left: -20,
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.purple500.withValues(alpha: 0.10),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: const Icon(Icons.arrow_back, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  const Text('리그 소개',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w600)),
                ],
              ),
              const SizedBox(height: 16),
              // 배지
              Row(
                children: [
                  _heroBadge('AUBL · LEAGUE INTRO', AppTheme.blue400),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                '46th AUBL · Hosted by Chung-Ang University (Seoul)',
                style: TextStyle(
                    color: AppTheme.slate300,
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 14),
              Text(
                heroTitle,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                heroDescription,
                style: const TextStyle(
                    color: AppTheme.slate300, fontSize: 13, height: 1.6),
              ),
              const SizedBox(height: 16),
              // 히어로 메트릭
              ...heroMetrics.map((m) {
                final (label, value, note) = m;
                return Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppTheme.slate500.withValues(alpha: 0.25)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: const TextStyle(
                              color: AppTheme.slate400,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5)),
                      const SizedBox(height: 4),
                      Text(value,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(note,
                          style: const TextStyle(
                              color: AppTheme.slate300,
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                );
              }),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroBadge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(text,
          style: TextStyle(
              color: color, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }

  Widget _sectionTitle(String title, IconData icon, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Text(title,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600)),
      ],
    );
  }

  // ── 회장단 인사말 ──
  Widget _buildChairmanMessage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('회장단 인사말', Icons.record_voice_over, AppTheme.orange500),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                AppTheme.blue500.withValues(alpha: 0.08),
                AppTheme.slate800,
              ],
            ),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: AppTheme.blue500.withValues(alpha: 0.2)),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '"변화와 혁신, 그리고 변하지 않는 열정으로"',
                style: TextStyle(
                    color: AppTheme.blue400,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    fontStyle: FontStyle.italic),
              ),
              SizedBox(height: 10),
              Text(
                '존경하는 야구 가족 여러분, 안녕하십니까. 2026년 제46대 '
                '전국대학아마추어야구연합회(AUBL) 회장을 맡게 된 '
                '정흥영(중앙대학교 서울)입니다. 1981년 시작된 AUBL은 '
                '46년 동안 대한민국 대학 스포츠를 대표하는 커뮤니티로 '
                '성장했습니다. 올해 저희 연합회는 "소통하는 리그, 공정한 리그, '
                '안전한 리그"를 목표로, 경기는 치열하게 그러나 끝나면 서로의 '
                '어깨를 두드려주는 대학 야구의 낭만을 지켜가겠습니다.',
                style: TextStyle(
                    color: AppTheme.slate300, fontSize: 13, height: 1.6),
              ),
              SizedBox(height: 8),
              Text(
                '2026 시즌은 웹 플랫폼 고도화의 해입니다. 선수들이 자신의 기록과 '
                '일정을 언제 어디서나 확인할 수 있도록 실시간 기록과 중계를 '
                '강화하고, 모든 운영진이 여러분의 땀방울이 헛되지 않도록 최선을 '
                '다하겠습니다. 부상 없는 즐거운 시즌이 되길 바랍니다.',
                style: TextStyle(
                    color: AppTheme.slate300, fontSize: 13, height: 1.6),
              ),
              SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: Text('제46대 전국대학아마추어야구연합회장 정흥영',
                    style: TextStyle(
                        color: AppTheme.slate500, fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── 역사와 유산 ──
  Widget _buildHistorySection() {
    const milestones = [
      (
        'Since 1981',
        'Since 1981',
        '1981년 대학생들의 작은 교류전으로 출발해 45년을 이어온 '
            '국내 유일 순수 대학 아마추어 야구 리그.',
        AppTheme.blue400
      ),
      (
        'Dynasties',
        'Dynasties',
        '한국외국어대학교(서울)와 동국대학교(L.A.E)가 각각 통산 8회 '
            '우승으로 최다 우승 기록을 보유하며 리그의 역사를 이끌어왔습니다.',
        AppTheme.purple500
      ),
      (
        '2025→2026',
        '2025 → 2026',
        '2025년 아주대 주최 시즌을 지나 2026년에는 중앙대학교(서울)가 '
            '호스트를 맡아 8개 조 예선과 으뜸·버금 토너먼트로 리그를 운영합니다.',
        AppTheme.green500
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('역사와 유산', Icons.history_edu, AppTheme.blue400),
        const SizedBox(height: 10),
        ...milestones.map((m) {
          final (year, title, desc, color) = m;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: color.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56,
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(year,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: color,
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(desc,
                          style: const TextStyle(
                              color: AppTheme.slate400, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ── 조직 구성 ──
  Widget _buildOrganizationSection() {
    const roles = [
      ('주최 (2026)', '중앙대학교(서울)', '46주년 시즌 운영 전권을 위임받은 호스트 대학'),
      ('회장단', '회장 정흥영 · 기록부장 이주환', '실시간 기록 · 중계 · 디지털화, 웹 개발을 기록부가 주도'),
      ('감사', '연 2회 회계 감사', '주최 외 제3의 대학(차기 주최 등)이 상·하반기 2회 진행'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('조직 구성', Icons.corporate_fare, AppTheme.green500),
        const SizedBox(height: 10),
        ...roles.map((r) {
          final (label, value, detail) = r;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: AppTheme.slate700.withValues(alpha: 0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: AppTheme.green500,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5)),
                const SizedBox(height: 6),
                Text(value,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(detail,
                    style: const TextStyle(
                        color: AppTheme.slate400, fontSize: 12,
                        height: 1.5)),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ── 리그 구조 · 규정 요약 ──
  Widget _buildLeagueStructure() {
    const cards = [
      (
        '회원 자격',
        [
          '각 대학 본부에 정식 등록된 야구회 소속원만 참가',
          '재학생 원칙, 휴학생·군 복무자 참가 허용',
          '대학원생은 원칙적으로 불허',
          '엘리트 선수(대한야구소프트볼협회 등록) 출신 제한으로 순수 아마추어리즘 유지',
        ],
      ),
      (
        '경기 운영',
        [
          '정규 7이닝, 4이닝 이상 진행 시 정식 경기 인정',
          '콜드 게임: 5회 10점 차 / 6회 7점 차',
          '노쇼 10분 경과 시 몰수, 무단 불참 시 1년 출전 정지',
        ],
      ),
      (
        '순위 · 포스트시즌',
        [
          'A~H조, 조당 4~5팀 풀리그',
          '순위: 승률 → 승자승 → TQB → 최소 실점 → 최다 득점 → 추첨',
          '각 조 상위 2팀 으뜸 토너먼트 16강, 하위권 팀은 버금 16강으로 진출',
        ],
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('리그 구조 · 규정 요약', Icons.menu_book, AppTheme.orange500),
        const SizedBox(height: 10),
        ...cards.map((card) {
          final (title, points) = card;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: AppTheme.slate700.withValues(alpha: 0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                ...points.map((p) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('• ',
                              style: TextStyle(
                                  color: AppTheme.orange500, fontSize: 13)),
                          Expanded(
                            child: Text(p,
                                style: const TextStyle(
                                    color: AppTheme.slate300,
                                    fontSize: 13,
                                    height: 1.5)),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ── 2026 포스트시즌 스냅샷 ──
  Widget _buildPostseason() {
    const blocks = [
      (
        '으뜸 4강 (2026.01.25 예정)',
        [
          '세종대 Kings vs 경희대 국제 Lions',
          '연세대 Eagles vs 서울시립대 Falcons',
        ],
        AppTheme.amber400,
      ),
      (
        '버금 4강 (2026.01.24 예정)',
        [
          '한국공학대 Winners vs 한국외대 글로벌 Union',
          '경희대 서울 Braves vs 인하대 Biryong',
        ],
        AppTheme.purple500,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(
            '2026 포스트시즌 스냅샷', Icons.military_tech, AppTheme.purple500),
        const SizedBox(height: 10),
        ...blocks.map((block) {
          final (title, matchups, color) = block;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: color.withValues(alpha: 0.25)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                ...matchups.map((m) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Text('• ',
                              style: TextStyle(color: color, fontSize: 13)),
                          Expanded(
                            child: Text(m,
                                style: const TextStyle(
                                    color: AppTheme.slate300, fontSize: 13)),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ── 참가 팀 ──
  Widget _buildParticipatingTeams() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(
            '참가 팀 (${teamGroups.length}팀)', Icons.groups, AppTheme.blue400),
        const SizedBox(height: 10),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: teamGroups.map((entry) {
            final color =
                groupColors[entry.group] ?? AppTheme.blue400;
            return Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.slate800,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: color.withValues(alpha: 0.25)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(entry.name,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 12)),
                  const SizedBox(width: 4),
                  Text('${entry.group}조',
                      style: TextStyle(
                          color: color,
                          fontSize: 10,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
