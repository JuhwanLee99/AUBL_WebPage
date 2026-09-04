import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  static const double _sectionSpacing = 18;
  static const double _cardRadius = 4;

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
      appBar: AppBar(title: const Text('리그 소개')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _buildContent(),
    );
  }

  Widget _buildContent() {
    final intro = _content?['intro'] as Map<String, dynamic>? ?? {};
    final sections = intro['sections'] as List<dynamic>? ?? [];
    final contentSections = <Widget>[
      _buildChairmanMessage(),
      _buildHistorySection(),
      _buildOrganizationSection(),
      _buildLeagueStructure(),
      _buildPostseason(),
      _buildParticipatingTeams(),
    ];
    if (sections.isNotEmpty) {
      contentSections.add(_buildAdditionalSections(sections));
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final horizontal = constraints.maxWidth < 520 ? 12.0 : 24.0;
        return ListView(
          padding: EdgeInsets.fromLTRB(horizontal, 8, horizontal, 32),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1180),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHero(intro),
                    const SizedBox(height: 18),
                    for (var i = 0; i < contentSections.length; i++) ...[
                      if (i > 0) const SizedBox(height: _sectionSpacing),
                      contentSections[i],
                    ],
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildAdditionalSections(List<dynamic> sections) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('추가 정보', Icons.article, context.aublColors.ink),
        const SizedBox(height: 10),
        ...sections.map((section) {
          final sec = section as Map<String, dynamic>;
          final title = sec['title'] as String? ?? '';
          final body = sec['body'] as String? ?? '';
          final items = sec['items'] as List<dynamic>? ?? [];

          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildSurfaceCard(
              child: Theme(
                data: Theme.of(context).copyWith(
                  dividerColor: Colors.transparent,
                  splashColor: Colors.transparent,
                  highlightColor: Colors.transparent,
                ),
                child: ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 2),
                  childrenPadding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
                  title: Text(
                    title,
                    style: TextStyle(
                      color: context.aublColors.ink,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  children: [
                    if (body.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          body,
                          style: TextStyle(
                            color: context.aublColors.ink,
                            fontSize: 13,
                            height: 1.55,
                          ),
                        ),
                      ),
                    ...items.whereType<String>().map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: _buildBulletText(item),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  // ── 히어로 ──
  Widget _buildHero(Map<String, dynamic> intro) {
    final heroTagline = intro['tagline'] as String? ?? 'AUBL · LEAGUE INTRO';
    final heroSubtitle = _normalizeSeasonCopy(
      intro['heroSubtitle'] as String? ?? '46TH AUBL · 2026 연합회교 중앙대학교(서울)',
    );
    final heroTitle = _normalizeSeasonCopy(
      intro['heroTitle'] as String? ??
          '순수 아마추어 대학 야구의 46년 — 2026년, 중앙대학교(서울)와 함께 새로운 도약을 준비합니다.',
    );
    final heroDescription = _normalizeSeasonCopy(
      intro['heroDescription'] as String? ??
          '1981년 출범한 전국대학아마추어야구연합회(AUBL)는 일반 대학생들의 땀방울로 성장했습니다. '
              '2026 시즌 연합회교 중앙대학교(서울)와 함께 조별 예선과 으뜸·버금 토너먼트를 운영합니다.',
    );

    final heroMetrics = [
      ('2026 연합회교', '중앙대학교(서울)', '제46회 AUBL 운영'),
      ('참가 규모', '약 40개 대학', 'A~H조 조별 예선 후 으뜸·버금'),
      ('핵심 가치', '실시간 기록 · 중계 · 디지털화', '모바일 친화 기록/중계로 정보 접근성 강화'),
    ];

    return SeasonPageHero(
      eyebrow: heroTagline,
      title: Text(heroTitle),
      description: heroDescription,
      footer: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.only(left: 10),
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(color: context.aublColors.cobalt, width: 3),
              ),
            ),
            child: Text(
              heroSubtitle,
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: context.aublColors.navy),
            ),
          ),
          const SizedBox(height: 18),
          LayoutBuilder(
            builder: (context, constraints) {
              final textScale = MediaQuery.textScalerOf(context).scale(1);
              final columns = constraints.maxWidth >= 760 && textScale < 1.6
                  ? 3
                  : constraints.maxWidth >= 520 && textScale < 1.3
                  ? 2
                  : 1;
              const gap = 10.0;
              final cardWidth =
                  (constraints.maxWidth - ((columns - 1) * gap)) / columns;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: heroMetrics.map((metric) {
                  final (label, value, note) = metric;
                  return SizedBox(
                    width: cardWidth,
                    child: _buildHeroMetricCard(
                      label: label,
                      value: value,
                      note: note,
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildHeroMetricCard({
    required String label,
    required String value,
    required String note,
  }) {
    return _buildSurfaceCard(
      borderColor: context.aublColors.lineStrong,
      borderOpacity: 0.4,
      backgroundColor: context.aublColors.surfaceMuted,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.aublColors.muted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: context.aublColors.ink,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            note,
            style: TextStyle(
              color: context.aublColors.ink,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Color _mutedAccent(Color _, [double __ = 0.35]) {
    return context.aublColors.cobalt;
  }

  String _normalizeSeasonCopy(String value) {
    return value
        .replaceAll(RegExp(r'HOSTED BY', caseSensitive: false), '2026 연합회교')
        .replaceAll(RegExp(r'HOST UNIVERSITY', caseSensitive: false), '연합회교')
        .replaceAll('호스트 대학', '연합회교')
        .replaceAll('호스트', '연합회교');
  }

  Widget _buildSurfaceCard({
    required Widget child,
    Color? borderColor,
    Color? backgroundColor,
    double borderOpacity = 0.45,
    EdgeInsetsGeometry padding = const EdgeInsets.all(14),
  }) {
    final resolvedBorderColor = borderColor ?? context.aublColors.line;
    final resolvedBackgroundColor =
        backgroundColor ?? context.aublColors.surface;

    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: resolvedBackgroundColor,
        borderRadius: BorderRadius.circular(_cardRadius),
        border: Border.all(
          color: resolvedBorderColor.withValues(alpha: borderOpacity),
        ),
      ),
      child: child,
    );
  }

  Widget _buildBulletText(String text, {Color? bulletColor}) {
    final resolvedBulletColor = bulletColor ?? context.aublColors.muted;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('• ', style: TextStyle(color: resolvedBulletColor, fontSize: 13)),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: context.aublColors.ink,
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }

  Widget _sectionTitle(String title, IconData icon, Color _) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: context.aublColors.navy, width: 2),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: context.aublColors.surfaceMuted,
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: context.aublColors.line),
            ),
            child: Icon(icon, size: 16, color: context.aublColors.cobalt),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: context.aublColors.navyStrong,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── 회장단 인사말 ──
  Widget _buildChairmanMessage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(
          '회장단 인사말',
          Icons.record_voice_over,
          context.aublColors.warning,
        ),
        const SizedBox(height: 10),
        _buildSurfaceCard(
          padding: const EdgeInsets.all(16),
          borderColor: context.aublColors.lineStrong,
          borderOpacity: 0.52,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '"변화와 혁신, 그리고 변하지 않는 열정으로"',
                style: TextStyle(
                  color: context.aublColors.ink,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  fontStyle: FontStyle.italic,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '존경하는 야구 가족 여러분, 안녕하십니까. 2026년 제46대 '
                '전국대학아마추어야구연합회(AUBL) 회장을 맡게 된 '
                '정흥영(중앙대학교 서울)입니다. 1981년 시작된 AUBL은 '
                '46년 동안 대한민국 대학 스포츠를 대표하는 커뮤니티로 '
                '성장했습니다. 올해 저희 연합회는 "소통하는 리그, 공정한 리그, '
                '안전한 리그"를 목표로, 경기는 치열하게 그러나 끝나면 서로의 '
                '어깨를 두드려주는 대학 야구의 낭만을 지켜가겠습니다.',
                style: TextStyle(
                  color: context.aublColors.ink,
                  fontSize: 13,
                  height: 1.62,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '2026 시즌은 웹 플랫폼 고도화의 해입니다. 선수들이 자신의 기록과 '
                '일정을 언제 어디서나 확인할 수 있도록 실시간 기록과 중계를 '
                '강화하고, 모든 운영진이 여러분의 땀방울이 헛되지 않도록 최선을 '
                '다하겠습니다. 부상 없는 즐거운 시즌이 되길 바랍니다.',
                style: TextStyle(
                  color: context.aublColors.ink,
                  fontSize: 13,
                  height: 1.62,
                ),
              ),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '제46대 전국대학아마추어야구연합회장 정흥영',
                  style: TextStyle(
                    color: context.aublColors.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── 역사와 유산 ──
  Widget _buildHistorySection() {
    final milestones = [
      (
        '1981',
        'Since 1981',
        '1981년 대학생들의 작은 교류전으로 출발해 45년을 이어온 '
            '국내 유일 순수 대학 아마추어 야구 리그.',
        context.aublColors.cobalt,
      ),
      (
        'Dynasties',
        'Dynasties',
        '한국외국어대학교(서울)와 동국대학교(L.A.E)가 각각 통산 8회 '
            '우승으로 최다 우승 기록을 보유하며 리그의 역사를 이끌어왔습니다.',
        context.aublColors.cobalt,
      ),
      (
        '2025-2026',
        '2025 → 2026',
        '2025년 아주대학교 연합회교 시즌을 지나 2026년에는 중앙대학교(서울)가 '
            '연합회교로서 8개 조 예선과 으뜸·버금 토너먼트로 리그를 운영합니다.',
        context.aublColors.success,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('역사와 유산', Icons.history_edu, context.aublColors.cobalt),
        const SizedBox(height: 10),
        ...milestones.map((m) {
          final (year, title, desc, color) = m;
          final accent = _mutedAccent(color, 0.3);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildSurfaceCard(
              borderColor: context.aublColors.lineStrong,
              borderOpacity: 0.55,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text(
                      year,
                      style: TextStyle(
                        color: accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    title,
                    style: TextStyle(
                      color: context.aublColors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    desc,
                    style: TextStyle(
                      color: context.aublColors.muted,
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  // ── 조직 구성 ──
  Widget _buildOrganizationSection() {
    final roles = [
      ('연합회교 (2026)', '중앙대학교(서울)', '46주년 시즌 운영을 맡은 연합회교'),
      ('회장단', '회장 정흥영 · 기록부장 이주환', '실시간 기록 · 중계 · 디지털화, 웹 개발을 기록부가 주도'),
      ('감사', '연 2회 회계 감사', '주최 외 제3의 대학(차기 주최 등)이 상·하반기 2회 진행'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(
          '조직 구성',
          Icons.corporate_fare,
          context.aublColors.success,
        ),
        const SizedBox(height: 10),
        ...roles.map((r) {
          final (label, value, detail) = r;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildSurfaceCard(
              borderColor: context.aublColors.lineStrong,
              borderOpacity: 0.55,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: _mutedAccent(context.aublColors.success, 0.35),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    value,
                    style: TextStyle(
                      color: context.aublColors.ink,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    detail,
                    style: TextStyle(
                      color: context.aublColors.muted,
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  // ── 리그 구조 · 규정 요약 ──
  Widget _buildLeagueStructure() {
    final cards = [
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
        _sectionTitle(
          '리그 구조 · 규정 요약',
          Icons.menu_book,
          context.aublColors.warning,
        ),
        const SizedBox(height: 10),
        ...cards.map((card) {
          final (title, points) = card;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildSurfaceCard(
              borderColor: context.aublColors.lineStrong,
              borderOpacity: 0.55,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.aublColors.ink,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...points.map(
                    (p) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: _buildBulletText(
                        p,
                        bulletColor: _mutedAccent(
                          context.aublColors.warning,
                          0.28,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  // ── 2026 포스트시즌 스냅샷 ──
  Widget _buildPostseason() {
    final blocks = [
      (
        '으뜸 4강',
        '2026.01.25 예정',
        ['세종대 Kings vs 경희대 국제 Lions', '연세대 Eagles vs 서울시립대 Falcons'],
        AppTheme.amber400,
      ),
      (
        '버금 4강',
        '2026.01.24 예정',
        ['한국공학대 Winners vs 한국외대 글로벌 Union', '경희대 서울 Braves vs 인하대 Biryong'],
        context.aublColors.cobalt,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(
          '2026 포스트시즌 스냅샷',
          Icons.military_tech,
          context.aublColors.cobalt,
        ),
        const SizedBox(height: 10),
        ...blocks.map((block) {
          final (title, date, matchups, color) = block;
          final accent = _mutedAccent(color, 0.28);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _buildSurfaceCard(
              padding: const EdgeInsets.all(16),
              borderColor: context.aublColors.lineStrong,
              borderOpacity: 0.55,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.aublColors.ink,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    date,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...matchups.map(
                    (m) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: _buildBulletText(m, bulletColor: accent),
                    ),
                  ),
                ],
              ),
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
          '참가 팀 (${teamGroups.length}팀)',
          Icons.groups,
          context.aublColors.cobalt,
        ),
        const SizedBox(height: 10),
        _buildSurfaceCard(
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: teamGroups.map((entry) {
              final color =
                  groupColors[entry.group] ?? context.aublColors.cobalt;
              final accent = _mutedAccent(color, 0.25);
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: context.aublColors.line.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: context.aublColors.muted.withValues(alpha: 0.24),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      entry.name,
                      style: TextStyle(
                        color: context.aublColors.ink,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      '${entry.group}조',
                      style: TextStyle(
                        color: context.aublColors.muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
