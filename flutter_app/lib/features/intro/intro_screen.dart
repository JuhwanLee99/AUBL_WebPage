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
    final heroTitle =
        intro['heroTitle'] as String? ?? 'AUBL 리그 소개';
    final tagline = intro['tagline'] as String? ??
        '1981년 창설, 대학 아마추어 야구의 전통과 미래';

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
              // 메트릭 배지
              Row(
                children: [
                  _heroBadge('Since 1981', AppTheme.amber400),
                  const SizedBox(width: 8),
                  _heroBadge('${teamGroups.length}개 팀', AppTheme.blue400),
                  const SizedBox(width: 8),
                  _heroBadge('${groupLetters.length}개 조', AppTheme.green500),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                heroTitle,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                tagline,
                style: const TextStyle(color: AppTheme.slate400, fontSize: 13),
              ),
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

  // ── 회장 인사말 ──
  Widget _buildChairmanMessage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('회장 인사말', Icons.record_voice_over, AppTheme.blue400),
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
                '"야구를 사랑하는 대학생들이 함께 만들어가는 리그"',
                style: TextStyle(
                    color: AppTheme.blue400,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    fontStyle: FontStyle.italic),
              ),
              SizedBox(height: 10),
              Text(
                'AUBL은 1981년 창설 이래, 대학 아마추어 야구의 발전과 선수들의 '
                '건전한 스포츠 활동을 지원해 왔습니다. 공정한 경쟁과 스포츠맨십을 '
                '바탕으로, 모든 참가 팀과 선수들이 최고의 경험을 할 수 있도록 '
                '노력하겠습니다.',
                style: TextStyle(
                    color: AppTheme.slate300, fontSize: 13, height: 1.6),
              ),
              SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: Text('— AUBL 회장단',
                    style: TextStyle(
                        color: AppTheme.slate500, fontSize: 12)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── 역사와 전통 ──
  Widget _buildHistorySection() {
    const milestones = [
      (
        '1981',
        '리그 창설',
        '대학 아마추어 야구 리그의 시작',
        AppTheme.amber400
      ),
      (
        '1990s–2010s',
        '왕조의 시대',
        '명문 팀들의 치열한 경쟁과 전설적인 경기',
        AppTheme.orange500
      ),
      (
        '2025→2026',
        '새로운 도약',
        '디지털 전환과 확장된 리그 운영',
        AppTheme.blue400
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('역사와 전통', Icons.history_edu, AppTheme.amber400),
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
      (Icons.account_balance, '주최', 'AUBL 운영위원회'),
      (Icons.groups, '회장단', '회장 1인, 부회장 2인'),
      (Icons.gavel, '감사', '감사위원 1인'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('조직 구성', Icons.corporate_fare, AppTheme.indigo500),
        const SizedBox(height: 10),
        Row(
          children: roles.map((r) {
            final (icon, title, desc) = r;
            return Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.slate800,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Icon(icon, color: AppTheme.indigo500, size: 24),
                    const SizedBox(height: 8),
                    Text(title,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(desc,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: AppTheme.slate400, fontSize: 11)),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ── 리그 구조 & 규정 ──
  Widget _buildLeagueStructure() {
    const items = [
      (
        Icons.verified_user,
        '회원 자격',
        '4년제 대학 재학·휴학생으로 구성된 야구 동아리',
        AppTheme.green500,
      ),
      (
        Icons.sports_baseball,
        '경기 운영',
        '조별 리그 → 포스트시즌 (으뜸/버금 4강) 토너먼트',
        AppTheme.blue400,
      ),
      (
        Icons.emoji_events,
        '순위·포스트시즌',
        'Elo 레이팅 기반 순위, 상위 팀 토너먼트 진출',
        AppTheme.amber400,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('리그 구조 & 규정', Icons.menu_book, AppTheme.green500),
        const SizedBox(height: 10),
        ...items.map((item) {
          final (icon, title, desc, color) = item;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: color, size: 20),
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

  // ── 포스트시즌 ──
  Widget _buildPostseason() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('포스트시즌', Icons.military_tech, AppTheme.orange500),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppTheme.amber400.withValues(alpha: 0.12),
                      AppTheme.slate800,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: AppTheme.amber400.withValues(alpha: 0.25)),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.emoji_events,
                        color: AppTheme.amber400, size: 28),
                    SizedBox(height: 8),
                    Text('으뜸 4강',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    SizedBox(height: 4),
                    Text('상위권 팀 토너먼트',
                        style: TextStyle(
                            color: AppTheme.slate400, fontSize: 12)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppTheme.blue400.withValues(alpha: 0.10),
                      AppTheme.slate800,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: AppTheme.blue400.withValues(alpha: 0.2)),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.workspace_premium,
                        color: AppTheme.blue400, size: 28),
                    SizedBox(height: 8),
                    Text('버금 4강',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    SizedBox(height: 4),
                    Text('하위권 팀 토너먼트',
                        style: TextStyle(
                            color: AppTheme.slate400, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ],
        ),
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
